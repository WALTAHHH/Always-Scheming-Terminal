import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/admin-auth";

export const runtime = "nodejs";

/**
 * Admin → Entities stats.
 *
 * The Tags / Signals columns used to be computed from raw PostgREST selects:
 *   • `signals.entity_id` — a column that does not exist (`signals` has
 *     `content_id` since migration 014), so the query errored and the route
 *     swallowed the error → signal_count was permanently 0.
 *   • `content_tags.entity_id` — only counts tag rows whose entity resolution
 *     already ran. Rows written by AI tagging / older ingestion (and unresolved
 *     rows) have `entity_id IS NULL` while the value still names a known
 *     entity → tag_count was 0 even though the feed (which renders
 *     `content.tags` JSONB) looked tagged.
 *   • Both selected raw rows in one shot, so anything past the PostgREST
 *     1000-row cap was silently dropped.
 *
 * Counting now happens in SQL via `admin_entity_counts()` / `admin_entity_tag_series()`
 * (migration 022). Those aggregate server-side, return one row per entity
 * (bounded, immune to the row cap) and resolve entity links from all three
 * places the pipeline writes them: `content_tags.entity_id`, company tag
 * values matched against `entity_aliases`, and `content.tags->'company'`.
 *
 * If the migration has not run yet (function missing), the route falls back to
 * paged `.range()` scans with the identical aggregation in JS. Every failure is
 * logged and surfaced — no more silent zeros.
 *
 * The response also carries the real per-entity alias list (`aliases: string[]`)
 * alongside a consistent `alias_count`, so the Admin → Entities expanded row can
 * render the actual names as chips. The alias query is `.range()`-paged too, so
 * neither the list nor the count is capped at 1000 rows.
 */

const PAGE_SIZE = 1000;
const SERIES_DAYS = 30;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

function getServiceRoleClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

interface EntityStats {
  /** entity id → number of distinct content items tagged with the entity */
  tagCounts: Map<string, number>;
  /** entity id → number of distinct signals on content tagged with the entity */
  signalCounts: Map<string, number>;
  /** entity id → (ISO date → distinct content count) */
  series: Map<string, Map<string, number>>;
  source: "rpc" | "fallback";
}

/** True when PostgREST reports that the RPC itself is absent (migration not applied). */
function isMissingFunction(error: unknown): boolean {
  const err = error as { code?: string; message?: string } | null;
  const message = String(err?.message ?? "");
  return (
    err?.code === "PGRST202" ||
    err?.code === "42883" ||
    /could not find the function/i.test(message) ||
    /function .* does not exist/i.test(message)
  );
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

/**
 * Page through a PostgREST table in PAGE_SIZE windows.
 *
 * A single unpaginated select is capped at 1000 rows by PostgREST, which is what
 * silently truncated the previous counts. Keep requesting windows until a short
 * page comes back.
 */
async function fetchAllRows<T>(
  label: string,
  makeQuery: (
    from: number,
    to: number
  ) => PromiseLike<{ data: T[] | null; error: unknown }>
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await makeQuery(from, from + PAGE_SIZE - 1);
    if (error) {
      console.error(`[admin/entities] ${label} failed`, error);
      throw error;
    }
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

function addToIndex<T>(index: Map<string, T[]>, key: string, value: T) {
  const existing = index.get(key);
  if (existing) existing.push(value);
  else index.set(key, [value]);
}

type TagRow = {
  content_id: string | null;
  entity_id: string | null;
  dimension: string | null;
  value: string | null;
};

type ContentRow = {
  id: string;
  tags: Record<string, unknown> | null;
  ingested_at: string | null;
};

type SignalRow = { id: string; content_id: string | null };

function emptyStats(source: EntityStats["source"]): EntityStats {
  return { tagCounts: new Map(), signalCounts: new Map(), series: new Map(), source };
}

/**
 * Preferred path: the aggregate RPCs from migration 022.
 * Returns null when the functions are missing so the caller can fall back.
 */
async function loadStatsViaRpc(
  client: AnyClient,
  days = SERIES_DAYS
): Promise<EntityStats | null> {
  const counts = await client.rpc("admin_entity_counts");
  if (counts?.error) {
    if (isMissingFunction(counts.error)) return null;
    console.error("[admin/entities] admin_entity_counts() RPC failed", counts.error);
    throw counts.error;
  }

  const series = await client.rpc("admin_entity_tag_series", { days });
  if (series?.error) {
    if (isMissingFunction(series.error)) return null;
    console.error("[admin/entities] admin_entity_tag_series() RPC failed", series.error);
    throw series.error;
  }

  const stats = emptyStats("rpc");
  for (const row of (counts?.data ?? []) as {
    entity_id: string;
    tag_count: number | string;
    signal_count: number | string;
  }[]) {
    if (!row?.entity_id) continue;
    stats.tagCounts.set(row.entity_id, Number(row.tag_count) || 0);
    stats.signalCounts.set(row.entity_id, Number(row.signal_count) || 0);
  }

  for (const row of (series?.data ?? []) as {
    entity_id: string;
    day: string;
    tag_count: number | string;
  }[]) {
    if (!row?.entity_id || !row?.day) continue;
    const day = String(row.day).split("T")[0];
    let byDay = stats.series.get(row.entity_id);
    if (!byDay) {
      byDay = new Map();
      stats.series.set(row.entity_id, byDay);
    }
    byDay.set(day, (byDay.get(day) ?? 0) + (Number(row.tag_count) || 0));
  }
  return stats;
}

/**
 * Fallback path (migration 022 not applied): the same aggregation in JS, over
 * `.range()`-paged scans so the PostgREST row cap cannot truncate it.
 */
async function loadStatsByScanning(
  client: AnyClient,
  entities: { id: string; canonical_name: string }[],
  aliases: { entity_id: string; alias: string }[],
  days = SERIES_DAYS
): Promise<EntityStats> {
  const stats = emptyStats("fallback");

  // name (lowercased canonical name or alias) → entity ids
  const entitiesByName = new Map<string, string[]>();
  for (const entity of entities) {
    addToIndex(entitiesByName, entity.canonical_name.toLowerCase(), entity.id);
  }
  for (const alias of aliases) {
    if (!alias?.alias || !alias?.entity_id) continue;
    addToIndex(entitiesByName, alias.alias.toLowerCase(), alias.entity_id);
  }

  // entity id → tagged content ids (distinct by construction: it is a Set)
  const taggedContent = new Map<string, Set<string>>();
  const addPair = (entityId: string | null | undefined, contentId: string | null | undefined) => {
    if (!entityId || !contentId) return;
    const existing = taggedContent.get(entityId);
    if (existing) existing.add(contentId);
    else taggedContent.set(entityId, new Set([contentId]));
  };
  const addByName = (name: unknown, contentId: string | null | undefined) => {
    if (typeof name !== "string" || !contentId) return;
    for (const entityId of entitiesByName.get(name.toLowerCase()) ?? []) {
      addPair(entityId, contentId);
    }
  };

  const tagRows = await fetchAllRows<TagRow>("content_tags scan", (from, to) =>
    client
      .from("content_tags")
      .select("content_id, entity_id, dimension, value")
      .order("id", { ascending: true })
      .range(from, to)
  );
  for (const row of tagRows) {
    if (row.entity_id) {
      addPair(row.entity_id, row.content_id);
      continue;
    }
    if (String(row.dimension ?? "").toLowerCase() === "company") {
      addByName(row.value, row.content_id);
    }
  }

  const contentRows = await fetchAllRows<ContentRow>("content scan", (from, to) =>
    client
      .from("content")
      .select("id, tags, ingested_at")
      .order("id", { ascending: true })
      .range(from, to)
  );

  const ingestedAtByContent = new Map<string, string>();
  for (const row of contentRows) {
    if (!row?.id) continue;
    if (row.ingested_at) ingestedAtByContent.set(row.id, row.ingested_at);
    const company = row.tags?.company;
    if (!Array.isArray(company)) continue;
    for (const name of company) addByName(name, row.id);
  }

  for (const [entityId, contentIds] of taggedContent) {
    stats.tagCounts.set(entityId, contentIds.size);
  }

  const signalRows = await fetchAllRows<SignalRow>("signals scan", (from, to) =>
    client
      .from("signals")
      .select("id, content_id")
      .order("id", { ascending: true })
      .range(from, to)
  );

  const entitiesByContent = new Map<string, string[]>();
  for (const [entityId, contentIds] of taggedContent) {
    for (const contentId of contentIds) {
      addToIndex(entitiesByContent, contentId, entityId);
    }
  }

  const signalsByEntity = new Map<string, Set<string>>();
  for (const signal of signalRows) {
    if (!signal?.id || !signal.content_id) continue;
    for (const entityId of entitiesByContent.get(signal.content_id) ?? []) {
      const existing = signalsByEntity.get(entityId);
      if (existing) existing.add(signal.id);
      else signalsByEntity.set(entityId, new Set([signal.id]));
    }
  }
  for (const [entityId, signalIds] of signalsByEntity) {
    stats.signalCounts.set(entityId, signalIds.size);
  }

  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  for (const [entityId, contentIds] of taggedContent) {
    for (const contentId of contentIds) {
      const ingestedAt = ingestedAtByContent.get(contentId);
      if (!ingestedAt) continue;
      const timestamp = new Date(ingestedAt).getTime();
      if (!Number.isFinite(timestamp) || timestamp < cutoff) continue;
      const day = ingestedAt.split("T")[0];
      let byDay = stats.series.get(entityId);
      if (!byDay) {
        byDay = new Map();
        stats.series.set(entityId, byDay);
      }
      byDay.set(day, (byDay.get(day) ?? 0) + 1);
    }
  }

  return stats;
}

export async function GET(_req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const serviceClient = getServiceRoleClient();

  try {
    // 1. All entities.
    const { data: allEntities, error: entitiesError } = await serviceClient
      .from("entities")
      .select("id, canonical_name, entity_type, segment, ticker, is_public")
      .order("canonical_name", { ascending: true });

    if (entitiesError) {
      console.error("[admin/entities] entities fetch failed", entitiesError);
      throw entitiesError;
    }

    if (!allEntities || allEntities.length === 0) {
      return NextResponse.json({ entities: [], tagTimeSeries: [] });
    }

    const entityIds = allEntities
      .map((e) => e.id)
      .filter((id): id is string => !!id);

    // 2. Aliases — the real names (not just counts) so the admin UI can render
    //    the list in the expanded row, scoped to the known entities and paged so
    //    the PostgREST 1000-row cap cannot truncate the list or the count.
    const allAliases = await fetchAllRows<{ entity_id: string; alias: string }>(
      "entity_aliases scan",
      (from, to) =>
        serviceClient
          .from("entity_aliases")
          .select("entity_id, alias")
          .in("entity_id", entityIds)
          .order("id", { ascending: true })
          .range(from, to)
    );

    // Group aliases per entity, sorted case-insensitively for a stable
    // chip-list order in the UI.
    const aliasesByEntity: Record<string, string[]> = {};
    for (const row of allAliases) {
      if (!row?.entity_id || !row.alias) continue;
      (aliasesByEntity[row.entity_id] ||= []).push(row.alias);
    }
    Object.values(aliasesByEntity).forEach((list) =>
      list.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
    );

    // 3. Tag + signal counts (RPC first, paged scan as fallback).
    let stats = await loadStatsViaRpc(serviceClient, SERIES_DAYS);
    if (!stats) {
      console.warn(
        "[admin/entities] admin_entity_counts() RPC missing — falling back to paged scan. " +
          "Apply supabase/migrations/022_admin_entity_counts.sql to use the SQL aggregate."
      );
      stats = await loadStatsByScanning(serviceClient, allEntities, allAliases, SERIES_DAYS);
    }

    // 4. Enrich entities.
    const entities = allEntities.map((entity) => {
      const aliases = aliasesByEntity[entity.id] || [];
      return {
        id: entity.id,
        canonical_name: entity.canonical_name,
        entity_type: entity.entity_type,
        segment: entity.segment,
        ticker: entity.ticker,
        is_public: entity.is_public,
        aliases,
        alias_count: aliases.length,
        tag_count: stats.tagCounts.get(entity.id) ?? 0,
        signal_count: stats.signalCounts.get(entity.id) ?? 0,
      };
    });

    // 5. Time series for the 8 most-tagged entities.
    const topEntities = [...entities]
      .sort((a, b) => b.tag_count - a.tag_count)
      .slice(0, 8);

    const tagTimeSeries = topEntities.map((entity) => {
      const byDay = stats.series.get(entity.id) ?? new Map<string, number>();
      const data = Array.from(byDay.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, count]) => ({ date, count }));
      return { entity: entity.canonical_name, data };
    });

    return NextResponse.json({ entities, tagTimeSeries });
  } catch (error) {
    const msg = describeError(error);
    console.error("[admin/entities] stats failed:", msg, error);
    return NextResponse.json(
      { error: "Failed to fetch entities stats", detail: msg },
      { status: 500 }
    );
  }
}
