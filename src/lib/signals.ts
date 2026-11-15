/**
 * Pure ordering helpers for signal lists.
 *
 * The signal feed is ordered by **event date** (`published_at` — when the
 * underlying article/event happened), newest first. `created_at` (when the
 * signal was extracted) is only a tiebreak. This keeps the API response and
 * the UI display keyed off the same field, so the rendered timestamps are
 * monotonic.
 */

export interface SortableSignal {
  id: string;
  /** Event date — the article's publish date. Primary sort key. */
  published_at: string | null;
  /** Extraction timestamp. Tiebreak only. */
  created_at?: string | null;
  /** Investment relevance score. Tiebreak only. */
  investment_relevance_score?: number | null;
}

function toTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : t;
}

/**
 * Sort signals newest-first by event date (`published_at`), with deterministic
 * tiebreaks: higher `investment_relevance_score`, then newer `created_at`, then
 * `id`. Signals with a missing/unparseable `published_at` sink to the bottom.
 *
 * Returns a new array — the input is not mutated.
 */
export function sortSignalsByEventDate<T extends SortableSignal>(signals: T[]): T[] {
  return [...signals].sort((a, b) => {
    const ta = toTime(a.published_at);
    const tb = toTime(b.published_at);

    // Missing event date → bottom (but still ordered among themselves by tiebreaks below).
    if (ta === null && tb !== null) return 1;
    if (tb === null && ta !== null) return -1;
    if (ta !== null && tb !== null && ta !== tb) return tb - ta;

    // Tiebreak: higher relevance first.
    const sa = a.investment_relevance_score ?? 0;
    const sb = b.investment_relevance_score ?? 0;
    if (sb !== sa) return sb - sa;

    // Tiebreak: newer extraction first.
    const ca = toTime(a.created_at) ?? 0;
    const cb = toTime(b.created_at) ?? 0;
    if (cb !== ca) return cb - ca;

    // Final deterministic tiebreak.
    if (a.id === b.id) return 0;
    return a.id < b.id ? -1 : 1;
  });
}
