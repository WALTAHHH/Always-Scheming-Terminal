/**
 * Client-side watchlist helpers (spec §5.1).
 *
 * Thin, typed wrappers over /api/v1/watchlist for use in client components
 * (CompanyDrawer star toggle, /profile "Following" list). Each helper returns a
 * plain value and never throws on a failed request — callers get `null`/`false`
 * so an optimistic UI can simply revert on error.
 */

export interface WatchedEntity {
  id: string;
  canonical_name: string;
  ticker: string | null;
  exchange: string | null;
  entity_type: string;
}

export interface WatchlistEntry {
  /** watchlists row id */
  id: string;
  entity_id: string;
  created_at: string | null;
  entity: WatchedEntity | null;
}

export interface WatchlistResponse {
  data: WatchlistEntry[];
  entity_ids: string[];
  count: number;
}

/** Fetch the current user's watchlist. Returns an empty list on any failure. */
export async function fetchWatchlist(): Promise<WatchlistResponse> {
  const empty: WatchlistResponse = { data: [], entity_ids: [], count: 0 };
  try {
    const res = await fetch("/api/v1/watchlist", { cache: "no-store" });
    if (!res.ok) return empty;
    const json = (await res.json()) as Partial<WatchlistResponse>;
    return {
      data: json.data ?? [],
      entity_ids: json.entity_ids ?? [],
      count: json.count ?? json.data?.length ?? 0,
    };
  } catch {
    return empty;
  }
}

/** The set of entity ids the user currently watches (drawer star state). */
export async function fetchWatchedEntityIds(): Promise<Set<string>> {
  const { entity_ids } = await fetchWatchlist();
  return new Set(entity_ids);
}

/** Follow an entity. Returns true on success (idempotent on the server). */
export async function watchEntity(entityId: string): Promise<boolean> {
  try {
    const res = await fetch("/api/v1/watchlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entity_id: entityId }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Unfollow an entity. Returns true on success (idempotent on the server). */
export async function unwatchEntity(entityId: string): Promise<boolean> {
  try {
    const res = await fetch(
      `/api/v1/watchlist?entity_id=${encodeURIComponent(entityId)}`,
      { method: "DELETE" }
    );
    return res.ok;
  } catch {
    return false;
  }
}
