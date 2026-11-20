/**
 * Entity resolution layer
 * Replaces hardcoded COMPANY_LIST with DB-backed entity resolution
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import {
  resolveAliasMatches,
  type AliasCandidate,
  type EntityMatch,
} from "./entity-alias-match";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient<Database>(supabaseUrl, supabaseKey);

interface AliasRow {
  alias: string;
  entity_id: string;
  alias_type: string | null;
  entities: {
    canonical_name: string;
    entity_type: string;
  };
}

// ── In-process cache to avoid full table scan on every article ──
let aliasCache: AliasRow[] = [];
let cacheLoadedAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Get entity aliases with in-process caching.
 * Refreshes from DB if cache is stale (5-min TTL).
 * Avoids full table scan on every article during ingest.
 */
async function getAliases(): Promise<AliasRow[]> {
  if (Date.now() - cacheLoadedAt > CACHE_TTL_MS) {
    const { data, error } = await supabase
      .from("entity_aliases")
      .select(`
        alias,
        entity_id,
        alias_type,
        entities!inner (
          canonical_name,
          entity_type
        )
      `)
      .limit(1000);

    if (error) {
      console.error("Failed to load entity aliases cache:", error);
      return aliasCache; // Return stale cache on error
    }

    aliasCache = (data || []) as unknown as AliasRow[];
    cacheLoadedAt = Date.now();
  }

  return aliasCache;
}

/**
 * Resolve company/entity names from text to canonical entities.
 * Uses cached entity_aliases to avoid per-item DB queries.
 * Returns array of resolved entities with their IDs.
 *
 * Matching is longest-match-wins with word boundaries (see entity-alias-match):
 * a longer alias consumes its span, so a shorter overlapping alias (e.g. a
 * former_name like "Niantic" vs "Niantic Spatial") cannot also fire on it.
 */
export async function resolveEntitiesFromText(text: string): Promise<EntityMatch[]> {
  // Get cached aliases (refreshes if stale)
  const aliases = await getAliases();

  const candidates: AliasCandidate[] = aliases.map((row) => ({
    alias: row.alias,
    entity_id: row.entity_id,
    canonical_name: row.entities.canonical_name,
    entity_type: row.entities.entity_type,
    alias_type: row.alias_type ?? null,
  }));

  return resolveAliasMatches(text, candidates);
}

/**
 * Given an array of company names (from legacy tagger), resolve them to entity IDs.
 * This is used during the transition period to map old company tags to new entities.
 * Uses cached aliases to avoid DB queries.
 */
export async function resolveCompanyNamesToEntityIds(companyNames: string[]): Promise<Map<string, string>> {
  if (companyNames.length === 0) {
    return new Map();
  }

  const aliases = await getAliases();
  const map = new Map<string, string>();

  for (const name of companyNames) {
    const normalized = name.toLowerCase();
    const match = aliases.find(a => a.alias.toLowerCase() === normalized);
    if (match) {
      map.set(name, match.entity_id);
    }
  }

  return map;
}
