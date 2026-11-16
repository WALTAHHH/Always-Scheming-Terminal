/**
 * Watchlist alert fan-out (spec `docs/specs/watchlists-alerts.md` §3).
 *
 * When the extract-signals cron inserts new `signals` rows, every user whose
 * watchlist covers an entity linked to that signal — and whose per-user
 * `watchlist_min_score` threshold the signal clears — gets one `alert_events`
 * row. That row is the in-app unread badge source and the input to the weekly
 * email digest.
 *
 * Idempotency / dedup is deliberately layered:
 *
 *   1. In-memory (`buildAlertCandidates`): one alert per `(user_id, signal_id)`
 *      even if a user watches two entities named in the same article. This is
 *      the TypeScript equivalent of the spec's `SELECT DISTINCT ON (user_id, id)`.
 *   2. Database (`fanOutAlerts` → `ON CONFLICT (user_id, signal_id) DO NOTHING`):
 *      the `alert_events` UNIQUE constraint makes re-runs (the cron self-chains)
 *      safe no-ops.
 *
 * The alert score source is `signals.investment_relevance_score` (Matt's
 * decision Q1); the default threshold is {@link DEFAULT_WATCHLIST_MIN_SCORE}
 * (Matt's decision Q2: 0.75, not the spec's 0.65).
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import {
  buildDigestUnsubHeaders,
  buildDigestUnsubUrl,
  generateDigestUnsubToken,
  getDigestFooterAddress,
  getEmailConfig,
  getSiteUrl,
  renderDigestHtml,
  renderDigestSubject,
  renderDigestText,
  sendEmail,
  type DigestAlert,
} from "./email";

/** Default `user_preferences.watchlist_min_score` when a user has no prefs row. */
export const DEFAULT_WATCHLIST_MIN_SCORE = 0.75;

export type AlertsClient = SupabaseClient<Database>;

/** Minimal projections of the rows the fan-out reads. */
export interface SignalRow {
  id: string;
  content_id: string;
  signal_type: string;
  investment_relevance_score: number | null;
}

export interface ContentTagRow {
  content_id: string;
  entity_id: string | null;
}

export interface WatchlistRow {
  id: string;
  user_id: string;
  entity_id: string;
}

export interface PrefRow {
  user_id: string;
  watchlist_min_score: number | null;
}

/** A row destined for `alert_events`. */
export interface AlertCandidate {
  user_id: string;
  signal_id: string;
  watchlist_id: string;
  entity_id: string;
  signal_type: string;
  score: number;
}

export interface FanOutResult {
  /** Alerts that qualified (after in-memory dedup + threshold). */
  candidates: number;
  /** Rows actually inserted (conflicts on re-runs are excluded). */
  created: number;
}

/**
 * Pure fan-out logic: given the signal rows inserted in this run and the
 * supporting tables, return the `alert_events` rows that should exist.
 *
 * - Threshold: `watchlist_min_score` per user, falling back to
 *   {@link DEFAULT_WATCHLIST_MIN_SCORE} when the user has no preference row.
 * - Dedup: at most one candidate per `(user_id, signal_id)`; when a user watches
 *   several entities linked to the same signal the lowest `watchlist_id` wins,
 *   so the result is deterministic.
 *
 * Exported separately from {@link fanOutAlerts} so it can be unit-tested with
 * plain arrays (no Supabase client).
 */
export function buildAlertCandidates(
  signals: SignalRow[],
  contentTags: ContentTagRow[],
  watchlists: WatchlistRow[],
  prefs: PrefRow[],
): AlertCandidate[] {
  // user_id -> threshold
  const thresholdByUser = new Map<string, number>();
  for (const p of prefs) {
    if (typeof p.watchlist_min_score === "number" && !Number.isNaN(p.watchlist_min_score)) {
      thresholdByUser.set(p.user_id, p.watchlist_min_score);
    }
  }

  // entity_id -> watchers
  const watchersByEntity = new Map<string, WatchlistRow[]>();
  for (const w of watchlists) {
    if (!w?.entity_id || !w.user_id) continue;
    const list = watchersByEntity.get(w.entity_id);
    if (list) list.push(w);
    else watchersByEntity.set(w.entity_id, [w]);
  }

  // content_id -> distinct entity_ids
  const entitiesByContent = new Map<string, string[]>();
  for (const t of contentTags) {
    if (!t?.entity_id || !t.content_id) continue;
    const list = entitiesByContent.get(t.content_id);
    if (list) {
      if (!list.includes(t.entity_id)) list.push(t.entity_id);
    } else {
      entitiesByContent.set(t.content_id, [t.entity_id]);
    }
  }

  const picked = new Map<string, AlertCandidate>();
  const seenSignal = new Set<string>();

  for (const s of signals) {
    if (!s?.id || seenSignal.has(s.id)) continue;
    seenSignal.add(s.id);

    const score =
      typeof s.investment_relevance_score === "number" ? s.investment_relevance_score : 0;
    const entities = entitiesByContent.get(s.content_id) ?? [];

    for (const entityId of entities) {
      const watchers = watchersByEntity.get(entityId) ?? [];
      for (const w of watchers) {
        const threshold = thresholdByUser.get(w.user_id) ?? DEFAULT_WATCHLIST_MIN_SCORE;
        if (score < threshold) continue;

        const key = `${w.user_id}\u0000${s.id}`;
        const existing = picked.get(key);
        // Deterministic tiebreak: keep the lowest watchlist id for this pair.
        if (!existing || w.id < existing.watchlist_id) {
          picked.set(key, {
            user_id: w.user_id,
            signal_id: s.id,
            watchlist_id: w.id,
            entity_id: entityId,
            signal_type: s.signal_type,
            score,
          });
        }
      }
    }
  }

  return Array.from(picked.values()).sort((a, b) => {
    if (a.user_id !== b.user_id) return a.user_id < b.user_id ? -1 : 1;
    if (a.signal_id !== b.signal_id) return a.signal_id < b.signal_id ? -1 : 1;
    return 0;
  });
}

/**
 * Fan out alerts for a batch of freshly-inserted signal ids.
 *
 * Reads the signal → entity link from `content_tags` (dimension `company`),
 * matches it against `watchlists`, applies the per-user threshold, then inserts
 * the survivors into `alert_events` with `ON CONFLICT DO NOTHING` so retries and
 * the cron's self-chaining invocations never double-alert.
 *
 * Degrades gracefully (logs and returns zeros) when Supabase credentials are
 * unset and no client was injected.
 *
 * @param signalIds ids of signals inserted by this cron invocation
 * @param opts.supabase optional client (service role) — injected in tests
 */
export async function fanOutAlerts(
  signalIds: string[],
  opts: { supabase?: AlertsClient } = {},
): Promise<FanOutResult> {
  const ids = Array.from(new Set((signalIds ?? []).filter((id): id is string => !!id)));
  if (ids.length === 0) return { candidates: 0, created: 0 };

  let supabase = opts.supabase;
  if (!supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      console.warn("[alerts] Supabase service credentials unset — skipping alert fan-out");
      return { candidates: 0, created: 0 };
    }
    supabase = createClient<Database>(url, key, { auth: { persistSession: false } });
  }

  // 1. Signals inserted in this run.
  const { data: signals, error: signalError } = await supabase
    .from("signals")
    .select("id, content_id, signal_type, investment_relevance_score")
    .in("id", ids);

  if (signalError) {
    console.error("[alerts] signal lookup failed:", signalError.message);
    return { candidates: 0, created: 0 };
  }
  if (!signals || signals.length === 0) return { candidates: 0, created: 0 };

  const contentIds = Array.from(new Set(signals.map((s) => s.content_id)));

  // 2. Company → entity link for those content rows.
  const { data: contentTags, error: tagError } = await supabase
    .from("content_tags")
    .select("content_id, entity_id")
    .in("content_id", contentIds)
    .eq("dimension", "company")
    .not("entity_id", "is", null);

  if (tagError) {
    console.error("[alerts] content_tags lookup failed:", tagError.message);
    return { candidates: 0, created: 0 };
  }

  const entityIds = Array.from(
    new Set((contentTags ?? []).map((t) => t.entity_id).filter((id): id is string => !!id)),
  );
  if (entityIds.length === 0) return { candidates: 0, created: 0 };

  // 3. Who watches those entities.
  const { data: watchlists, error: watchError } = await supabase
    .from("watchlists")
    .select("id, user_id, entity_id")
    .in("entity_id", entityIds);

  if (watchError) {
    console.error("[alerts] watchlists lookup failed:", watchError.message);
    return { candidates: 0, created: 0 };
  }
  if (!watchlists || watchlists.length === 0) return { candidates: 0, created: 0 };

  const userIds = Array.from(new Set(watchlists.map((w) => w.user_id)));

  // 4. Per-user thresholds.
  const { data: prefs, error: prefError } = await supabase
    .from("user_preferences")
    .select("user_id, watchlist_min_score")
    .in("user_id", userIds);

  if (prefError) {
    console.error("[alerts] user_preferences lookup failed:", prefError.message);
    return { candidates: 0, created: 0 };
  }

  // 5. Pure dedup + threshold.
  const candidates = buildAlertCandidates(
    signals as SignalRow[],
    (contentTags ?? []) as ContentTagRow[],
    watchlists as WatchlistRow[],
    (prefs ?? []) as PrefRow[],
  );
  if (candidates.length === 0) return { candidates: 0, created: 0 };

  // 6. Layer-1 dedup at the DB: UNIQUE(user_id, signal_id) + DO NOTHING.
  try {
    const { data: inserted, error: insertError } = await supabase
      .from("alert_events")
      .upsert(candidates, { onConflict: "user_id,signal_id", ignoreDuplicates: true })
      .select("id");

    if (insertError) {
      console.error("[alerts] alert_events insert failed:", insertError.message);
      return { candidates: candidates.length, created: 0 };
    }
    return { candidates: candidates.length, created: inserted?.length ?? 0 };
  } catch (err) {
    console.error("[alerts] alert_events insert threw:", err);
    return { candidates: candidates.length, created: 0 };
  }
}

// ── weekly email digest (card W8) ──────────────────────────────────────────
//
// The digest rides on the tail of the extract-signals cron (no new cron slot —
// Hobby caps crons at 2/day) and is gated so it is idempotent on retries:
//
//   1. It only runs on **Monday UTC**. Any other weekday is a hard no-op, so
//      the cron's self-chaining invocations the rest of the week never send.
//   2. Per user, it requires `user_preferences.last_digest_sent_at` to be
//      absent or at least DIGEST_MIN_INTERVAL_DAYS (6) days old.
//   3. `alert_events.email_sent_at` is stamped only *after* a successful send,
//      and the digest only contains rows where it is still NULL — so a re-run
//      (or a same-day second invocation) finds nothing left to send.
//   4. The pass is capped at DEFAULT_DIGEST_MAX_USERS users, taken in `user_id`
//      ascending order, so the cron tail can't run past `maxDuration`. Users
//      past the cap are simply served on the next Monday (nothing is stamped
//      for them, so no digest is lost).
//
// Digest content = unsent `alert_events` from the past DIGEST_LOOKBACK_DAYS (7)
// days, grouped by entity. Every digest carries the one-click unsubscribe link
// (W9 route `/unsubscribe?token=…`) and the physical-address footer line from
// `DIGEST_FOOTER_ADDRESS`. When Resend is unconfigured the whole pass is a
// logged no-op and *nothing* is stamped (so the next configured run sends).

/** Minimum days between two digests for one user. */
export const DIGEST_MIN_INTERVAL_DAYS = 6;
/** How far back the digest looks for unsent alerts. */
export const DIGEST_LOOKBACK_DAYS = 7;
/**
 * Maximum number of users one digest pass will process. The digest rides on
 * the tail of the extract-signals cron (which already spends most of its
 * `maxDuration=300` on LLM work), so an unbounded sequential loop over every
 * user with pending alerts risks timing out mid-pass and silently starving
 * later users until the following Monday. Capping bounds the tail; the users
 * left over are simply picked up on the next eligible Monday (their
 * `alert_events.email_sent_at` stays NULL, so nothing is lost).
 */
export const DEFAULT_DIGEST_MAX_USERS = 200;

/** `true` when `now` is a Monday in UTC — the single allowed digest weekday. */
export function isMondayUtc(now: Date): boolean {
  return now.getUTCDay() === 1;
}

/**
 * Cadence gate: a digest is due when the user has never had one, or the last
 * one is at least `minDays` days old. An unparseable timestamp is treated as
 * "never" so a corrupt value can't wedge a user out of the digest forever.
 */
export function isDigestDue(
  lastSentAt: string | null | undefined,
  now: Date,
  minDays: number = DIGEST_MIN_INTERVAL_DAYS,
): boolean {
  if (!lastSentAt) return true;
  const last = new Date(lastSentAt).getTime();
  if (Number.isNaN(last)) return true;
  return now.getTime() - last >= minDays * 24 * 60 * 60 * 1000;
}

/**
 * Email-channel gate. `notification_prefs.watchlist_email === false` is the
 * opt-out (the one-click unsubscribe route writes exactly this); any other
 * value — `true`, a missing key, or a missing prefs blob — counts as enabled
 * so the digest is on by default and only the explicit toggle/unsubscribe
 * turns it off.
 */
export function isDigestEnabled(prefs: unknown): boolean {
  if (!prefs || typeof prefs !== "object") return true;
  const p = prefs as Record<string, unknown>;
  if (!("watchlist_email" in p)) return true;
  return p.watchlist_email !== false;
}

/** `alert_events` row shape read by the digest pass. */
export interface PendingAlertRow {
  id: string;
  user_id: string;
  signal_id: string;
  entity_id: string | null;
  signal_type: string;
  score: number;
  created_at: string | null;
}

export interface DigestPrefRow {
  user_id: string;
  notification_prefs: unknown;
  last_digest_sent_at: string | null;
  digest_unsub_token: string | null;
}

export type WeeklyDigestSkip = "not_monday" | "unconfigured" | "no_client" | null;

export interface WeeklyDigestResult {
  /** Why the pass did nothing, or `null` when it actually ran. */
  skipped: WeeklyDigestSkip;
  /** Users with an unsent alert considered in this pass. */
  usersConsidered: number;
  /** Digests handed to Resend successfully. */
  sent: number;
  /** Per-user send failures (left unsent for the next Monday). */
  failed: number;
  /** `alert_events` rows stamped `email_sent_at` in this pass. */
  alertsEmailed: number;
  /** Users deferred to the next Monday because the per-pass cap was hit. */
  skippedByCap: number;
}

export interface SendWeeklyDigestsOptions {
  /** Service-role client; built from env when omitted. */
  supabase?: AlertsClient;
  /** Clock injection for tests (defaults to `new Date()`). */
  now?: Date;
  /** Transport injection for tests (defaults to the real Resend sender). */
  sendEmailImpl?: typeof sendEmail;
  /** Override the CAN-SPAM footer line (defaults to `DIGEST_FOOTER_ADDRESS`). */
  footerAddress?: string;
  /** Override the public origin used for links (defaults to `NEXT_PUBLIC_SITE_URL`). */
  siteUrl?: string;
  /**
   * Maximum users to process this pass (defaults to
   * {@link DEFAULT_DIGEST_MAX_USERS}). Pass `0` (or any non-positive value)
   * for an uncapped pass. Users beyond the cap are deferred to the next Monday.
   */
  maxUsers?: number;
}

/**
 * Build the digest's `DigestAlert[]` for one user from raw rows, resolving the
 * entity display name and the article URL. Pure so it can be unit-tested.
 */
export function buildDigestAlerts(
  alerts: PendingAlertRow[],
  entities: { id: string; canonical_name: string }[],
  signals: { id: string; summary: string; content_id: string }[],
  content: { id: string; url: string }[],
): DigestAlert[] {
  const entityName = new Map(entities.map((e) => [e.id, e.canonical_name]));
  const signalById = new Map(signals.map((s) => [s.id, s]));
  const urlByContent = new Map(content.map((c) => [c.id, c.url]));

  const out: DigestAlert[] = [];
  for (const a of alerts) {
    const signal = signalById.get(a.signal_id);
    out.push({
      entityName: (a.entity_id && entityName.get(a.entity_id)) || "Unknown company",
      signalType: a.signal_type,
      summary: signal?.summary ?? "Signal details unavailable",
      score: typeof a.score === "number" ? a.score : 0,
      url: (signal && urlByContent.get(signal.content_id)) || "",
      createdAt: a.created_at,
    });
  }
  return out;
}

/**
 * Weekly digest send pass. See the block comment above for the gates.
 *
 * Bounded: at most {@link DEFAULT_DIGEST_MAX_USERS} users are processed per
 * pass (override with `opts.maxUsers`; `0` = uncapped), taken in `user_id`
 * ascending order so a capped run always serves the same users first. Anyone
 * beyond the cap keeps their unsent alerts and is served next Monday.
 *
 * Degrades gracefully: returns `{ skipped: "unconfigured" }` (after a log line)
 * when `RESEND_API_KEY`/`DIGEST_FROM` are unset and `{ skipped: "no_client" }`
 * when Supabase service credentials are missing. Neither stamps any state, so
 * a later configured run sends the same alerts.
 */
export async function sendWeeklyDigests(
  opts: SendWeeklyDigestsOptions = {},
): Promise<WeeklyDigestResult> {
  const empty: WeeklyDigestResult = {
    skipped: null,
    usersConsidered: 0,
    sent: 0,
    failed: 0,
    alertsEmailed: 0,
    skippedByCap: 0,
  };

  const now = opts.now ?? new Date();

  // Gate 0: Monday UTC only.
  if (!isMondayUtc(now)) return { ...empty, skipped: "not_monday" };

  // Gate 1: Resend must be configured (unless the transport is injected).
  if (!opts.sendEmailImpl && getEmailConfig() === null) {
    console.warn("[alerts] digest skipped: RESEND_API_KEY/DIGEST_FROM unset");
    return { ...empty, skipped: "unconfigured" };
  }

  let supabase = opts.supabase;
  if (!supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      console.warn("[alerts] digest skipped: Supabase service credentials unset");
      return { ...empty, skipped: "no_client" };
    }
    supabase = createClient<Database>(url, key, { auth: { persistSession: false } });
  }

  const nowIso = now.toISOString();
  const lookbackIso = new Date(
    now.getTime() - DIGEST_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  // 1. Unsent alerts from the last 7 days.
  const { data: pendingData, error: pendingError } = await supabase
    .from("alert_events")
    .select("id, user_id, signal_id, entity_id, signal_type, score, created_at")
    .is("email_sent_at", null)
    .gte("created_at", lookbackIso)
    .order("created_at", { ascending: true });

  if (pendingError) {
    console.error("[alerts] digest pending-alert lookup failed:", pendingError.message);
    return empty;
  }
  const pending = (pendingData ?? []) as PendingAlertRow[];
  if (pending.length === 0) return empty;

  const byUser = new Map<string, PendingAlertRow[]>();
  for (const row of pending) {
    const list = byUser.get(row.user_id);
    if (list) list.push(row);
    else byUser.set(row.user_id, [row]);
  }
  // Deterministic order: `user_id` ascending. A capped pass therefore always
  // processes the same users in the same order, so a partial run never
  // reshuffles who gets the digest.
  const userIds = Array.from(byUser.keys()).sort();

  // Cap the pass. Users beyond the cap keep their unsent alerts (nothing is
  // stamped for them) and are picked up on the next eligible Monday.
  const maxUsers = opts.maxUsers ?? DEFAULT_DIGEST_MAX_USERS;
  const capped = Number.isFinite(maxUsers) && maxUsers > 0;
  const processUsers = capped ? userIds.slice(0, maxUsers) : userIds;
  const skippedByCap = userIds.length - processUsers.length;
  if (skippedByCap > 0) {
    console.warn(
      `[alerts] digest: stopping early — processing ${processUsers.length} of ${userIds.length} users this pass (cap=${maxUsers}); ${skippedByCap} deferred to the next Monday`,
    );
  }

  // 2. Per-user digest preferences (cadence + token + channel toggle).
  const { data: prefData, error: prefError } = await supabase
    .from("user_preferences")
    .select("user_id, notification_prefs, last_digest_sent_at, digest_unsub_token")
    .in("user_id", processUsers);

  if (prefError) {
    console.error("[alerts] digest user_preferences lookup failed:", prefError.message);
    return empty;
  }
  const prefByUser = new Map(
    ((prefData ?? []) as DigestPrefRow[]).map((p) => [p.user_id, p]),
  );

  // 3. Bulk-resolve display data for everything the digest will render.
  // Only the processed users' alerts are resolved — the capped-out tail is
  // left untouched (its `.in()` lists would otherwise grow without bound).
  const processSet = new Set(processUsers);
  const alertRows = pending.filter((a) => processSet.has(a.user_id));
  const entityIds = Array.from(
    new Set(alertRows.map((a) => a.entity_id).filter((id): id is string => !!id)),
  );
  const signalIds = Array.from(new Set(alertRows.map((a) => a.signal_id)));

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

  const send = opts.sendEmailImpl ?? sendEmail;
  const footerAddress = opts.footerAddress ?? getDigestFooterAddress();
  const siteUrl = opts.siteUrl ?? getSiteUrl();

  const result: WeeklyDigestResult = { ...empty };
  result.usersConsidered = userIds.length;
  result.skippedByCap = skippedByCap;
  let newAlertsEmailed = 0;

  for (const userId of processUsers) {
    const alerts = byUser.get(userId) ?? [];
    if (alerts.length === 0) continue;

    const pref = prefByUser.get(userId);
    // No prefs row → can't record cadence or the unsub token; skip rather than
    // risk mailing the same person on every cron tick.
    if (!pref) continue;
    // Channel opt-out (one-click unsubscribe writes watchlist_email=false).
    if (!isDigestEnabled(pref.notification_prefs)) continue;
    // Cadence: at most one digest every DIGEST_MIN_INTERVAL_DAYS days.
    if (!isDigestDue(pref.last_digest_sent_at, now)) continue;

    // Recipient address comes from auth (service role only).
    let email: string | undefined;
    try {
      const { data: userData, error: userError } = await supabase.auth.admin.getUserById(userId);
      if (userError) {
        console.error(`[alerts] digest user lookup failed for ${userId}:`, userError.message);
      }
      email = userData?.user?.email ?? undefined;
    } catch (err) {
      console.error("[alerts] digest user lookup threw:", err);
    }
    if (!email) {
      console.warn(`[alerts] digest skipped for ${userId}: no email address`);
      continue;
    }

    // The W9 route looks the token up on `user_preferences`, so persist a fresh
    // one before linking to it. A previously stored token is reused as-is.
    let token = pref.digest_unsub_token;
    if (!token) {
      token = generateDigestUnsubToken(userId);
      const { error: tokenError } = await supabase
        .from("user_preferences")
        .update({ digest_unsub_token: token })
        .eq("user_id", userId);
      if (tokenError) {
        console.error(
          `[alerts] digest token persist failed for ${userId}:`,
          tokenError.message,
        );
      }
    }

    const unsubscribeUrl = buildDigestUnsubUrl(token, siteUrl);
    const digestAlerts = buildDigestAlerts(alerts, entities, signals, content);
    const renderInput = { alerts: digestAlerts, unsubscribeUrl, footerAddress, siteUrl };

    const sendResult = await send({
      to: email,
      subject: renderDigestSubject(digestAlerts.length),
      html: renderDigestHtml(renderInput),
      text: renderDigestText(renderInput),
      headers: buildDigestUnsubHeaders(token, siteUrl),
    });

    if (!sendResult.ok) {
      result.failed += 1;
      continue;
    }

    // Stamp the ledger only after the send succeeded (idempotency on retries).
    const ids = alerts.map((a) => a.id);
    const { error: markError } = await supabase
      .from("alert_events")
      .update({ email_sent_at: nowIso })
      .in("id", ids);
    if (markError) {
      console.error(
        `[alerts] digest email_sent_at stamp failed for ${userId}:`,
        markError.message,
      );
      result.failed += 1;
      continue;
    }

    const { error: cadenceError } = await supabase
      .from("user_preferences")
      .update({ last_digest_sent_at: nowIso })
      .eq("user_id", userId);
    if (cadenceError) {
      console.error(
        `[alerts] digest last_digest_sent_at update failed for ${userId}:`,
        cadenceError.message,
      );
    }

    result.sent += 1;
    newAlertsEmailed += ids.length;
  }

  result.alertsEmailed = newAlertsEmailed;

  if (result.usersConsidered > 0) {
    console.log(
      `[alerts] weekly digest pass: ${result.usersConsidered} users considered, ${result.sent} sent, ${result.failed} failed, ${result.skippedByCap} skipped by cap, ${result.alertsEmailed} alerts emailed`,
    );
  }

  return result;
}
