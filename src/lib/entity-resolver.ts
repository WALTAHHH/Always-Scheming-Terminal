/**
 * Entity resolution layer
 * Replaces hardcoded COMPANY_LIST with DB-backed entity resolution
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient<Database>(supabaseUrl, supabaseKey);

interface EntityMatch {
  entity_id: string;
  canonical_name: string;
  entity_type: string;
}

interface AliasRow {
  alias: string;
  entity_id: string;
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

    aliasCache = (data || []) as AliasRow[];
    cacheLoadedAt = Date.now();
  }

  return aliasCache;
}

/**
 * Resolve company/entity names from text to canonical entities.
 * Uses cached entity_aliases to avoid per-item DB queries.
 * Returns array of resolved entities with their IDs.
 */
export async function resolveEntitiesFromText(text: string): Promise<EntityMatch[]> {
  // Get cached aliases (refreshes if stale)
  const aliases = await getAliases();

  // Match aliases against text using word boundaries
  const matched = new Set<string>();
  const results: EntityMatch[] = [];

  for (const row of aliases) {
    const alias = row.alias.toLowerCase();
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`\\b${escaped}\\b`, "i");
    
    if (re.test(text) && !matched.has(row.entity_id)) {
      matched.add(row.entity_id);
      results.push({
        entity_id: row.entity_id,
        canonical_name: row.entities.canonical_name,
        entity_type: row.entities.entity_type,
      });
    }
  }

  return results;
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
