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
