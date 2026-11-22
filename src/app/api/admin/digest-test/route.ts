import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/admin-auth";
import { rateLimit } from "@/lib/rate-limit";
import { buildDigestAlerts, type PendingAlertRow } from "@/lib/alerts";
import {
  buildDigestUnsubHeaders,
  buildDigestUnsubUrl,
  buildSampleDigestAlerts,
  clampStoryCount,
  describeDigestTestConfig,
  generateDigestUnsubToken,
  getDigestFooterAddress,
  maskEmail,
  renderDigestHtml,
  renderDigestSubject,
  renderDigestText,
  sendEmail,
  DIGEST_TEST_LOOKBACK_DAYS,
  DIGEST_TEST_MAX_ALERTS,
  DIGEST_TEST_RATE_LIMIT,
  type DigestAlert,
} from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

interface DigestTestParams {
  /** Clamped 1..40 story count (default 3). */
  stories: number;
  /** Whether the caller supplied `stories` (forces the SAMPLE set). */
  storiesProvided: boolean;
  /** Whether this is a read-only HTML preview rather than a send. */
  preview: boolean;
}

/** Query params from the request URL; empty on a malformed URL. */
function parseQuery(req: NextRequest): URLSearchParams {
  try {
    return new URL(req.url).searchParams;
  } catch {
    return new URLSearchParams();
  }
}

/** Parse a JSON body into a plain object; `{}` for an empty/malformed body. */
async function readJsonBody(req: NextRequest): Promise<Record<string, unknown>> {
  try {
    const text = await req.text();
    if (!text) return {};
    const parsed: unknown = JSON.parse(text);
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/**
 * Resolve `stories` / `preview` from the query string and/or JSON body.
 * The query string wins when it carries the key, so a plain link
 * (`?preview=1&stories=25`) behaves as written without needing a body.
 */
function parseDigestTestParams(
  req: NextRequest,
  body: Record<string, unknown>,
): DigestTestParams {
  const q = parseQuery(req);
  const rawStories = q.has("stories") ? q.get("stories") : body.stories;
  const storiesProvided =
    rawStories !== undefined && rawStories !== null && rawStories !== "";
  const rawPreview = q.has("preview") ? q.get("preview") : body.preview;
  const preview =
    rawPreview === true ||
    rawPreview === 1 ||
    rawPreview === "1" ||
    rawPreview === "true";
  return {
    stories: clampStoryCount(rawStories),
    storiesProvided,
    preview,
  };
}

/**
 * Render the real digest template with the deterministic SAMPLE set at the
 * requested size and return it as `text/html`. **No email is sent, no Resend
 * call is made, no rate-limit budget is spent and nothing is written** — the
 * token in the preview's unsubscribe link is derived (never persisted) purely
 * so the footer link renders in production shape.
 */
function renderPreview(req: NextRequest, userId: string, stories: number): NextResponse {
  void req;
  const config = describeDigestTestConfig();
  const siteUrl = config.siteUrl;
  const footerAddress = getDigestFooterAddress();
  const alerts = buildSampleDigestAlerts(siteUrl, stories);
  const token = generateDigestUnsubToken(userId);
  const html = renderDigestHtml({
    alerts,
    unsubscribeUrl: buildDigestUnsubUrl(token, siteUrl),
    footerAddress,
    siteUrl,
  });
  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Digest-Preview": "1",
      "X-Digest-Stories": String(alerts.length),
    },
  });
}

/**
 * `GET /api/admin/digest-test?stories=25`
 *
 * Admin-only, **read-only** HTML preview of the real digest template rendered
 * with the deterministic SAMPLE set (so it works with no alerts, no email
 * config and no database rows). Returns `Content-Type: text/html` so the digest
 * can be opened directly in a browser tab at any size. Sends nothing.
 *
 *   401/403  from `requireAdmin`
 *   200      the rendered digest HTML
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const params = parseDigestTestParams(req, {});
  return renderPreview(req, auth.userId, params.stories);
}

/**
 * `POST /api/admin/digest-test`
 *
 * Sends ONE digest email to the calling admin only, so the production digest
 * template, unsubscribe link/headers and CAN-SPAM footer can be verified
 * without waiting for the Monday-only `sendWeeklyDigests()` pass.
 *
 * Request body (optional JSON): `{ "stories": <1..40>, "preview": true }`.
 * `stories` may also be a query param. Passing `stories` forces the
 * deterministic SAMPLE set at that size (so the template can be exercised at
 * realistic sizes regardless of pending alerts); omitting it keeps the original
 * behaviour — the admin's own unsent alerts when any exist, else 3 samples.
 *
 * With `preview: true` (body flag, `?preview=1`, or a plain GET) the endpoint
 * returns the rendered HTML (see {@link GET}) and **sends nothing** — no Resend
 * call, no rate-limit cost, no side effects.
 *
 * **No side effects, with one deliberate exception.** The send path never
 * stamps `alert_events.email_sent_at`, never touches
 * `user_preferences.last_digest_sent_at` (cadence) and never flips anyone's
 * opt-in, so it has no effect on which users the real weekly digest reaches. It
 * *does* ensure the calling admin has a stored unsubscribe token: it reuses an
 * already-stored one when present and, when none exists, mints a fresh token
 * with the same generator the weekly digest uses and upserts it onto the
 * calling admin's `user_preferences` row — and only that row, and only the
 * `digest_unsub_token` column. Persisting it is what makes the test email's
 * unsubscribe link a REAL, working link: the public `/unsubscribe` route
 * resolves tokens from `user_preferences`, so a token that is never stored
 * would render as an unrecognised link (see the note on `token` below). The
 * preview path performs none of this — it never writes.
 *
 * Status contract:
 *   401  not authenticated            (from `requireAdmin`)
 *   403  authenticated but not admin  (from `requireAdmin`)
 *   429  more than 5 requests/hour for this admin (preview is never counted)
 *   200  ran — body reports `sent:true`, or `sent:false` with a `reason`
 *        (e.g. `email_not_configured`) plus `config` diagnostics
 *   502  Resend accepted the request but rejected the send; body carries the
 *        Resend HTTP status and error message (never the API key)
 *   500  the admin's unsubscribe token could not be persisted; no email is
 *        sent, so the test never mails a dead unsubscribe link
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const body = await readJsonBody(req);
  const params = parseDigestTestParams(req, body);

  // Preview short-circuits before the rate limiter: reading the template is
  // free and must never consume an admin's 5/hour send budget.
  if (params.preview) return renderPreview(req, userId, params.stories);

  const limit = rateLimit(`digest-test:${userId}`, DIGEST_TEST_RATE_LIMIT);
  if (!limit.success) {
    return NextResponse.json(
      {
        sent: false,
        error: "rate_limited",
        message: `Rate limit exceeded — max ${DIGEST_TEST_RATE_LIMIT.maxRequests} test digests per hour`,
        retry_after_seconds: Math.max(0, Math.ceil((limit.resetTime - Date.now()) / 1000)),
      },
      { status: 429 },
    );
  }

  const config = describeDigestTestConfig();
  const footerAddress = getDigestFooterAddress();
  const siteUrl = config.siteUrl;
  const fromAddress = process.env.DIGEST_FROM?.trim() || null;

  const base = {
    to: null as string | null,
    from: fromAddress,
    resend_id: null as string | null,
    config,
  };

  // Short-circuit on an unconfigured mail transport: report the diagnostics and
  // `sent:false` without touching Supabase or throwing. This is the primary
  // "why didn't it send?" answer, so it must not depend on other env being set.
  if (config.apiKey === "missing" || config.from === "missing") {
    return NextResponse.json({
      ...base,
      sent: false,
      sample: false,
      alert_count: 0,
      error: "email_not_configured",
      message:
        "RESEND_API_KEY and/or DIGEST_FROM are unset — no email was sent. See `config`.",
    });
  }

  const supabase = createServiceClient();
  if (!supabase) {
    return NextResponse.json({
      ...base,
      sent: false,
      sample: false,
      alert_count: 0,
      error: "supabase_not_configured",
      message: "NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are unset — cannot read alerts or resolve the recipient.",
    });
  }

  // Recipient = the calling admin only. The weekly opt-in gate is intentionally
  // skipped here because the admin explicitly asked for a test to their own
  // address; nobody else's opt-in is read or written.
  let email: string | undefined;
  try {
    const { data: userData, error: userError } = await supabase.auth.admin.getUserById(userId);
    if (userError) {
      console.error(`[digest-test] admin lookup failed for ${userId}:`, userError.message);
    }
    email = userData?.user?.email ?? undefined;
  } catch (err) {
    console.error("[digest-test] admin lookup threw:", err);
  }

  if (!email) {
    return NextResponse.json({
      ...base,
      sent: false,
      sample: false,
      alert_count: 0,
      error: "no_recipient",
      message: "The calling admin account has no email address.",
    });
  }
  base.to = maskEmail(email);

  let digestAlerts: DigestAlert[] = [];

  // When `stories` is supplied the deterministic SAMPLE set is used at that
  // size, so the template can be exercised at realistic sizes regardless of the
  // admin's pending alerts. Otherwise keep the original behaviour: the admin's
  // own real unsent alerts, falling back to 3 samples when there are none.
  if (!params.storiesProvided) {
    const lookbackIso = new Date(
      Date.now() - DIGEST_TEST_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();

    // Real unsent alerts for this admin only. Read-only — nothing is stamped.
    const { data: pendingData, error: pendingError } = await supabase
      .from("alert_events")
      .select("id, user_id, signal_id, entity_id, signal_type, score, created_at")
      .eq("user_id", userId)
      .is("email_sent_at", null)
      .gte("created_at", lookbackIso)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(DIGEST_TEST_MAX_ALERTS);

    if (pendingError) {
      console.error("[digest-test] pending alert lookup failed:", pendingError.message);
      return NextResponse.json(
        {
          ...base,
          sent: false,
          sample: false,
          alert_count: 0,
          error: "alert_lookup_failed",
          message: pendingError.message,
        },
        { status: 500 },
      );
    }

    const pending = (pendingData ?? []) as PendingAlertRow[];

    if (pending.length > 0) {
      const entityIds = Array.from(
        new Set(pending.map((a) => a.entity_id).filter((id): id is string => !!id)),
      );
      const signalIds = Array.from(new Set(pending.map((a) => a.signal_id)));

      const [entityRes, signalRes] = await Promise.all([
        entityIds.length
          ? supabase
              .from("entities")
              .select("id, canonical_name, ticker, is_public")
              .in("id", entityIds)
          : Promise.resolve({ data: [], error: null }),
        signalIds.length
          ? supabase.from("signals").select("id, summary, content_id").in("id", signalIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

      const entities = (entityRes.data ?? []) as {
        id: string;
        canonical_name: string;
        ticker: string | null;
        is_public: boolean | null;
      }[];
      const signals = (signalRes.data ?? []) as {
        id: string;
        summary: string;
        content_id: string;
      }[];

      const contentIds = Array.from(new Set(signals.map((s) => s.content_id)));
      const { data: contentData } = contentIds.length
        ? await supabase
            .from("content")
            .select("id, url, title, published_at, source_id")
            .in("id", contentIds)
        : {
            data: [] as {
              id: string;
              url: string;
              title: string | null;
              published_at: string | null;
              source_id: string | null;
            }[],
          };
      const contentRows = (contentData ?? []) as {
        id: string;
        url: string;
        title: string | null;
        published_at: string | null;
        source_id: string | null;
      }[];

      // Resolve publication names so the test email's real-alert path renders the
      // same "source · date" meta line as the sample path (and production).
      const sourceIds = Array.from(
        new Set(contentRows.map((c) => c.source_id).filter((id): id is string => !!id)),
      );
      const { data: sourceData } = sourceIds.length
        ? await supabase.from("sources").select("id, name").in("id", sourceIds)
        : { data: [] as { id: string; name: string }[] };
      const sourceNameById = new Map(
        ((sourceData ?? []) as { id: string; name: string }[]).map((s) => [s.id, s.name]),
      );
      const content = contentRows.map((c) => ({
        id: c.id,
        url: c.url,
        title: c.title,
        published_at: c.published_at,
        source_name: (c.source_id && sourceNameById.get(c.source_id)) || null,
      }));

      digestAlerts = buildDigestAlerts(pending, entities, signals, content);
    }
  }

  let sample: boolean;
  if (params.storiesProvided) {
    sample = true;
    digestAlerts = buildSampleDigestAlerts(siteUrl, params.stories);
  } else {
    sample = digestAlerts.length === 0;
    if (sample) digestAlerts = buildSampleDigestAlerts(siteUrl);
  }

  // Reuse the admin's stored unsubscribe token when present so the link is
  // genuinely theirs. When none is stored we mint one with the same generator
  // the weekly digest uses and persist it to the calling admin's
  // `user_preferences` row, because the public /unsubscribe route looks the
  // token up there — a token that is never stored renders as an unrecognised
  // link. This is the endpoint's ONLY write: the upsert carries `user_id` and
  // `digest_unsub_token` alone, so it never touches `watchlist_email`,
  // `last_digest_sent_at`, `alert_events` or any other column/row.
  const { data: prefRow } = await supabase
    .from("user_preferences")
    .select("digest_unsub_token")
    .eq("user_id", userId)
    .maybeSingle();
  const storedToken =
    (prefRow as { digest_unsub_token?: string | null } | null)?.digest_unsub_token ?? null;

  let token = storedToken;
  if (!token) {
    token = generateDigestUnsubToken(userId);
    const { error: tokenError } = await supabase
      .from("user_preferences")
      .upsert(
        { user_id: userId, digest_unsub_token: token },
        { onConflict: "user_id" },
      );
    if (tokenError) {
      // The public route resolves the token from `user_preferences`, so a link
      // whose token was never stored would show "link not recognised". Fail the
      // test send rather than mail a broken unsubscribe link (mirrors the
      // weekly digest's own fail-closed behaviour).
      console.error(
        `[digest-test] token persist failed for ${userId}:`,
        tokenError.message,
      );
      return NextResponse.json(
        {
          ...base,
          sent: false,
          sample,
          alert_count: digestAlerts.length,
          error: "token_persist_failed",
          message:
            "Could not persist an unsubscribe token, so no test email was sent (its unsubscribe link would not work).",
        },
        { status: 500 },
      );
    }
  }

  const unsubscribeUrl = buildDigestUnsubUrl(token, siteUrl);
  const renderInput = { alerts: digestAlerts, unsubscribeUrl, footerAddress, siteUrl };
  const subject = `[TEST] ${renderDigestSubject(digestAlerts.length)}${sample ? " (sample)" : ""}`;

  const sendResult = await sendEmail({
    to: email,
    subject,
    html: renderDigestHtml(renderInput),
    text: renderDigestText(renderInput),
    headers: buildDigestUnsubHeaders(token, siteUrl),
  });

  const withContent = {
    ...base,
    sample,
    alert_count: digestAlerts.length,
    stories: digestAlerts.length,
    unsubscribe_token_reused: Boolean(storedToken),
    subject,
  };

  if (sendResult.skipped) {
    return NextResponse.json({
      ...withContent,
      sent: false,
      error: "email_not_configured",
      message: "Resend reported the send was skipped (transport not configured).",
    });
  }

  if (!sendResult.ok) {
    return NextResponse.json(
      {
        ...withContent,
        sent: false,
        error: sendResult.error ?? "send_failed",
        resend_status: sendResult.status ?? null,
        resend_error: sendResult.detail ?? null,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ...withContent,
    sent: true,
    resend_id: sendResult.id ?? null,
  });
}
