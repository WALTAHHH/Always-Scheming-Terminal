/**
 * Client-side entity data type — mirrors what /api/v1/entities returns.
 * Replaces the static CompanyData from companies.ts.
 */

export interface EntityAlias {
  alias: string;
  alias_type: string;
}

export interface EntityData {
  id: string;
  canonical_name: string;
  entity_type: "company" | "person" | "game" | "event" | "org";
  ticker: string | null;
  exchange: string | null;
  is_public: boolean;
  parent_id: string | null;
  description: string | null;
  ir_url: string | null;
  sec_url: string | null;
  segment: string | null;
  market_cap_b: number | null;
  entity_aliases: EntityAlias[];
}

/** Fetch a single entity by canonical name or alias. Returns null if not found. */
export async function fetchEntityByAlias(name: string): Promise<EntityData | null> {
  try {
    const res = await fetch(`/api/v1/entities?alias=${encodeURIComponent(name)}`);
    if (!res.ok) return null;
    const json = await res.json();
    return json.data ?? null;
  } catch {
    return null;
  }
}

/** True if the entity has a valid public ticker. */
export function isPublicEntity(entity: EntityData | null): boolean {
  return !!(entity?.is_public && entity.ticker);
}
