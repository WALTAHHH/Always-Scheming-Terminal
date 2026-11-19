import { describe, it, expect } from "vitest";
import { resolveAliasMatches, type AliasCandidate } from "./entity-alias-match";

/**
 * Fixtures mirror the shape of prod `entity_aliases` after Matt's rename:
 *  - "Scopely Explore" (formerly Niantic) carries the former_name alias
 *    "Niantic" — so bare "Niantic" must resolve to Scopely Explore.
 *  - "Niantic Spatial" is a distinct entity with a canonical alias that
 *    contains the token "Niantic".
 */
const SCOPELY_EXPLORE: AliasCandidate = {
  alias: "Scopely Explore",
  entity_id: "ent-scopely-explore",
  canonical_name: "Scopely Explore",
  entity_type: "company",
  alias_type: "canonical",
};
const SCOPELY_EXPLORE_FORMER_NIANTIC: AliasCandidate = {
  alias: "Niantic",
  entity_id: "ent-scopely-explore",
  canonical_name: "Scopely Explore",
  entity_type: "company",
  alias_type: "former_name",
};
const NIANTIC_SPATIAL: AliasCandidate = {
  alias: "Niantic Spatial",
  entity_id: "ent-niantic-spatial",
  canonical_name: "Niantic Spatial",
  entity_type: "company",
  alias_type: "canonical",
};
const SCOPELY: AliasCandidate = {
  alias: "Scopely",
  entity_id: "ent-scopely",
  canonical_name: "Scopely",
  entity_type: "company",
  alias_type: "canonical",
};

// Prefix-overlapping aliases already present in the seed data.
const EPIC_GAMES: AliasCandidate = {
  alias: "Epic Games",
  entity_id: "ent-epic-games",
  canonical_name: "Epic Games",
  entity_type: "company",
  alias_type: "canonical",
};
const EPIC: AliasCandidate = {
  alias: "Epic",
  entity_id: "ent-epic-games",
  canonical_name: "Epic Games",
  entity_type: "company",
  alias_type: "common",
};
const TAKE_TWO_INTERACTIVE: AliasCandidate = {
  alias: "Take-Two Interactive",
  entity_id: "ent-take-two",
  canonical_name: "Take-Two Interactive",
  entity_type: "company",
  alias_type: "canonical",
};
const TAKE_TWO: AliasCandidate = {
  alias: "Take-Two",
  entity_id: "ent-take-two",
  canonical_name: "Take-Two Interactive",
  entity_type: "company",
  alias_type: "common",
};
const SQUARE_ENIX: AliasCandidate = {
  alias: "Square Enix",
  entity_id: "ent-square-enix",
  canonical_name: "Square Enix",
  entity_type: "company",
  alias_type: "canonical",
};

const FIXTURE: AliasCandidate[] = [
  SCOPELY_EXPLORE,
  SCOPELY_EXPLORE_FORMER_NIANTIC,
  NIANTIC_SPATIAL,
  SCOPELY,
  EPIC_GAMES,
  EPIC,
  TAKE_TWO_INTERACTIVE,
  TAKE_TWO,
  SQUARE_ENIX,
];

const ids = (text: string, aliases: AliasCandidate[] = FIXTURE) =>
  resolveAliasMatches(text, aliases).map((m) => m.canonical_name);

describe("resolveAliasMatches — Niantic / Scopely Explore regression", () => {
  it("'Niantic Spatial launches new VPS' resolves to Niantic Spatial ONLY", () => {
    expect(ids("Niantic Spatial launches new VPS")).toEqual(["Niantic Spatial"]);
  });

  it("'Niantic Spatial raises funding' resolves to Niantic Spatial ONLY", () => {
    expect(ids("Niantic Spatial raises funding")).toEqual(["Niantic Spatial"]);
  });

  it("bare 'Niantic' in a games context resolves to Scopely Explore", () => {
    expect(ids("Niantic's Pokémon GO hits a new revenue record")).toEqual([
      "Scopely Explore",
    ]);
  });

  it("'Niantic layoffs' resolves to Scopely Explore (former_name alias)", () => {
    expect(ids("Niantic layoffs hit the AR team")).toEqual(["Scopely Explore"]);
  });

  it("'Scopely Explore announces ...' prefers the longer alias, not bare Scopely", () => {
    expect(ids("Scopely Explore announces a new title")).toEqual([
      "Scopely Explore",
    ]);
  });

  it("'Scopely acquires ...' resolves to Scopely only", () => {
    expect(ids("Scopely acquires a new studio")).toEqual(["Scopely"]);
  });

  it("never returns both Scopely Explore and Niantic Spatial for one span", () => {
    const matches = resolveAliasMatches("Niantic Spatial raises funding", FIXTURE);
    expect(matches).toHaveLength(1);
    expect(matches[0].entity_id).toBe("ent-niantic-spatial");
  });

  it("still matches multiple distinct entities when both are truly present", () => {
    expect(
      ids("Niantic Spatial partners with Epic Games")
    ).toEqual(["Niantic Spatial", "Epic Games"]);
  });
});

describe("resolveAliasMatches — prefix-overlapping aliases", () => {
  it("'Epic Games Store' keeps the full Epic Games alias", () => {
    expect(ids("Epic Games Store update ships")).toEqual(["Epic Games"]);
  });

  it("bare 'Epic' still resolves to Epic Games (same entity, deduped)", () => {
    expect(ids("Epic wins its lawsuit")).toEqual(["Epic Games"]);
  });

  it("'Take-Two Interactive' prefers the long alias", () => {
    expect(ids("Take-Two Interactive reports earnings")).toEqual([
      "Take-Two Interactive",
    ]);
  });

  it("bare 'Take-Two' resolves to Take-Two Interactive", () => {
    expect(ids("Take-Two delays GTA 6")).toEqual(["Take-Two Interactive"]);
  });

  it("'Square Enix' remains a single resolved entity", () => {
    expect(ids("Square Enix teases Final Fantasy")).toEqual(["Square Enix"]);
  });
});

describe("resolveAliasMatches — matching rules", () => {
  it("is case-insensitive", () => {
    expect(ids("NIANTIC SPATIAL RAISES FUNDING")).toEqual(["Niantic Spatial"]);
    expect(ids("niantic spatial raises funding")).toEqual(["Niantic Spatial"]);
  });

  it("respects word boundaries (no substring hits)", () => {
    expect(ids("The Nianticx quarterly report")).toEqual([]);
    expect(ids("The Epilogue of the saga")).toEqual([]);
  });

  it("matches a word-boundary hit against a possessive apostrophe", () => {
    expect(ids("Scopely's next move")).toEqual(["Scopely"]);
  });

  it("longest match wins even when the longer alias has lower alias_type weight", () => {
    // A long former_name alias must still consume the span before a short
    // canonical alias of a different entity that overlaps it.
    const longFormerName: AliasCandidate = {
      alias: "Old Niantic Labs",
      entity_id: "ent-old-niantic",
      canonical_name: "Old Niantic Labs",
      entity_type: "company",
      alias_type: "former_name",
    };
    const shortCanonical: AliasCandidate = {
      alias: "Old",
      entity_id: "ent-other-old",
      canonical_name: "Other Old Co",
      entity_type: "company",
      alias_type: "canonical",
    };
    expect(ids("Old Niantic Labs expands", [longFormerName, shortCanonical])).toEqual([
      "Old Niantic Labs",
    ]);
  });

  it("breaks ties deterministically (weight then start) when spans overlap", () => {
    // Word-boundary matching makes exact equal-length ties between distinct
    // strings unreachable in practice; this asserts the tie-break ordering is
    // stable and prefers the higher alias_type weight if it ever occurs.
    const a: AliasCandidate = {
      alias: "Riot",
      entity_id: "ent-riot-a",
      canonical_name: "Riot Co",
      entity_type: "company",
      alias_type: "former_name",
    };
    const b: AliasCandidate = {
      alias: "riot",
      entity_id: "ent-riot-b",
      canonical_name: "RIOT Co",
      entity_type: "company",
      alias_type: "canonical",
    };
    expect(ids("Riot games today", [a, b])).toEqual(["RIOT Co"]);
  });

  it("returns nothing for empty text or no aliases", () => {
    expect(resolveAliasMatches("", FIXTURE)).toEqual([]);
    expect(resolveAliasMatches("Niantic Spatial", [])).toEqual([]);
  });
});
