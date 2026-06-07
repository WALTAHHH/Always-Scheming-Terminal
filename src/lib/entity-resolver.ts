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

/**
 * Resolve company/entity names from text to canonical entities.
 * Queries entity_aliases table for matches.
 * Returns array of resolved entities with their IDs.
 */
export async function resolveEntitiesFromText(text: string): Promise<EntityMatch[]> {
  // Extract potential entity mentions using basic text tokenization
  // This is a simple word-based approach; could be enhanced with NER
  const words = text.toLowerCase().split(/\s+/);
  
  // Query all entity aliases in one go (fuzzy matching via ilike)
  const { data: aliases, error } = await supabase
    .from("entity_aliases")
    .select(`
      entity_id,
      alias,
      entities!inner (
        canonical_name,
        entity_type
      )
    `)
    .limit(1000);

  if (error || !aliases) {
    console.error("Entity resolution error:", error);
    return [];
  }

  // Match aliases against text using word boundaries
  const matched = new Set<string>();
  const results: EntityMatch[] = [];

  for (const row of aliases as any) {
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
 */
export async function resolveCompanyNamesToEntityIds(companyNames: string[]): Promise<Map<string, string>> {
  if (companyNames.length === 0) {
    return new Map();
  }

  const { data: aliases, error } = await supabase
    .from("entity_aliases")
    .select("alias, entity_id")
    .in("alias", companyNames);

  if (error || !aliases) {
    console.error("Company name resolution error:", error);
    return new Map();
  }

  const map = new Map<string, string>();
  for (const row of aliases as any) {
    map.set(row.alias, row.entity_id);
  }

  return map;
}
