/**
 * Pure entity-alias matching (no DB / no Supabase).
 *
 * Given a set of alias rows and a piece of text, decide which entities are
 * mentioned. Extracted from entity-resolver.ts so the matching rules can be
 * unit-tested without a live database.
 *
 * Matching rules:
 *  - Case-insensitive, word-boundary matched (`\b`), so "Niantic" does not
 *    match inside "Nianticx" and "Niantic's" does match.
 *  - Longest-match-wins: a longer alias that covers a span consumes it, so
 *    "Niantic Spatial" is resolved to the Niantic Spatial entity and the
 *    shorter, overlapping "Niantic" alias (now a former_name of Scopely
 *    Explore) does NOT also fire on the same span.
 *  - When two matches have the same length and overlap, the one with the
 *    higher alias_type weight wins (canonical > common > former_name > other).
 *  - Each entity is returned at most once.
 */

export interface AliasCandidate {
  alias: string;
  entity_id: string;
  canonical_name: string;
  entity_type: string;
  alias_type: string | null;
}

export interface EntityMatch {
  entity_id: string;
  canonical_name: string;
  entity_type: string;
}

interface SpanMatch {
  start: number;
  end: number;
  length: number;
  weight: number;
  candidate: AliasCandidate;
}

/**
 * Alias-type priority used only to break a tie between two overlaps of equal
 * length. Canonical names outrank nicknames; a stale former_name should never
 * win a tie against a live name.
 */
const ALIAS_TYPE_WEIGHT: Record<string, number> = {
  canonical: 100,
  common: 80,
  product: 70,
  game_title: 65,
  abbreviation: 60,
  former_name: 40,
  ticker: 30,
};

const DEFAULT_ALIAS_TYPE_WEIGHT = 50;

function aliasTypeWeight(aliasType: string | null): number {
  if (!aliasType) return DEFAULT_ALIAS_TYPE_WEIGHT;
  return ALIAS_TYPE_WEIGHT[aliasType] ?? DEFAULT_ALIAS_TYPE_WEIGHT;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** All word-boundary, case-insensitive start offsets of `alias` in `text`. */
function findOccurrences(text: string, alias: string): Array<{ start: number; end: number }> {
  const trimmed = alias.trim();
  if (!trimmed) return [];

  // Global + case-insensitive; keep \b so partial-word hits are rejected.
  const re = new RegExp(`\\b${escapeRegExp(trimmed)}\\b`, "gi");
  const found: Array<{ start: number; end: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    found.push({ start: m.index, end: m.index + m[0].length });
    // Guard against zero-length matches looping forever.
    if (m.index === re.lastIndex) re.lastIndex++;
  }
  return found;
}

function overlaps(a: SpanMatch, b: SpanMatch): boolean {
  return a.start < b.end && b.start < a.end;
}

/**
 * Resolve entities mentioned in `text`.
 *
 * Longest-match-wins: candidates are ranked by matched span length first, then
 * by alias_type weight, then by earliest start. A candidate whose span overlaps
 * an already-accepted (longer / higher-priority) span is discarded.
 */
export function resolveAliasMatches(
  text: string,
  aliases: AliasCandidate[]
): EntityMatch[] {
  if (!text || aliases.length === 0) return [];

  const matches: SpanMatch[] = [];
  for (const candidate of aliases) {
    for (const { start, end } of findOccurrences(text, candidate.alias)) {
      matches.push({
        start,
        end,
        length: end - start,
        weight: aliasTypeWeight(candidate.alias_type),
        candidate,
      });
    }
  }

  matches.sort((a, b) => {
    if (b.length !== a.length) return b.length - a.length; // longest first
    if (b.weight !== a.weight) return b.weight - a.weight; // canonical > former_name
    return a.start - b.start; // stable, deterministic
  });

  const accepted: SpanMatch[] = [];
  const seenEntityIds = new Set<string>();
  const results: EntityMatch[] = [];

  for (const match of matches) {
    if (accepted.some((a) => overlaps(a, match))) continue; // span consumed
    accepted.push(match);

    if (!seenEntityIds.has(match.candidate.entity_id)) {
      seenEntityIds.add(match.candidate.entity_id);
      results.push({
        entity_id: match.candidate.entity_id,
        canonical_name: match.candidate.canonical_name,
        entity_type: match.candidate.entity_type,
      });
    }
  }

  return results;
}
