import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/admin-auth";
import { rateLimit } from "@/lib/rate-limit";
import { buildDigestAlerts, type PendingAlertRow } from "@/lib/alerts";
import {
  buildDigestUnsubHeaders,
  buildDigestUnsubUrl,
  buildSampleDigestAlerts,
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

/**
 * `POST /api/admin/digest-test`
 *
 * Sends ONE digest email to the calling admin only, so the production digest
 * template, unsubscribe link/headers and CAN-SPAM footer can be verified
 * without waiting for the Monday-only `sendWeeklyDigests()` pass.
 *
 * **Read-only.** The endpoint performs no writes at all: it never stamps
 * `alert_events.email_sent_at`, never touches `user_preferences.last_digest_sent_at`
 * (cadence), never persists an unsubscribe token, and never flips anyone's
 * opt-in. It only reuses an already-stored unsubscribe token when one exists;
 * otherwise it derives a representative token for the link shape (see the note
 * on `token` below). It therefore has no effect on which users the real weekly
 * digest reaches.
 *
 * Status contract:
 *   401  not authenticated            (from `requireAdmin`)
 *   403  authenticated but not admin  (from `requireAdmin`)
 *   429  more than 5 requests/hour for this admin
 *   200  ran — body reports `sent:true`, or `sent:false` with a `reason`
 *        (e.g. `email_not_configured`) plus `config` diagnostics
 *   502  Resend accepted the request but rejected the send; body carries the
 *        Resend HTTP status and error message (never the API key)
 */
export async function POST(_req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

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
  let digestAlerts: DigestAlert[] = [];

  if (pending.length > 0) {
    const entityIds = Array.from(
      new Set(pending.map((a) => a.entity_id).filter((id): id is string => !!id)),
    );
    const signalIds = Array.from(new Set(pending.map((a) => a.signal_id)));

    const [entityRes, signalRes] = await Promise.all([
      entityIds.length
        ? supabase.from("entities").select("id, canonical_name").in("id", entityIds)
        : Promise.resolve({ data: [], error: null }),
      signalIds.length
        ? supabase.from("signals").select("id, summary, content_id").in("id", signalIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    const entities = (entityRes.data ?? []) as { id: string; canonical_name: string }[];
    const signals = (signalRes.data ?? []) as {
      id: string;
      summary: string;
      content_id: string;
    }[];

    const contentIds = Array.from(new Set(signals.map((s) => s.content_id)));
    const { data: contentData } = contentIds.length
      ? await supabase.from("content").select("id, url").in("id", contentIds)
      : { data: [] as { id: string; url: string }[] };
    const content = (contentData ?? []) as { id: string; url: string }[];

    digestAlerts = buildDigestAlerts(pending, entities, signals, content);
  }

  const sample = digestAlerts.length === 0;
  if (sample) digestAlerts = buildSampleDigestAlerts(siteUrl);

  // Reuse the admin's stored unsubscribe token when present so the link is
  // genuinely theirs. When none is stored we derive a representative token
  // *without persisting it* — the endpoint stays write-free; the link shape and
  // headers are identical to production. (A link whose token was never stored
  // resolves as an already-unsubscribed/404 on the W9 route, which is expected
  // for a test.)
  const { data: prefRow } = await supabase
    .from("user_preferences")
    .select("digest_unsub_token")
    .eq("user_id", userId)
    .maybeSingle();
  const storedToken =
    (prefRow as { digest_unsub_token?: string | null } | null)?.digest_unsub_token ?? null;
  const token = storedToken || generateDigestUnsubToken(userId);

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
