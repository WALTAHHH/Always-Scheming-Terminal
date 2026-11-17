/// <reference types="vitest" />
/// @vitest-environment node

import { describe, it, expect } from "vitest";
import React from "react";
import { readFileSync } from "fs";
import { renderToString } from "react-dom/server";
import { DrawerContent } from "./CompanyDrawer";
import type { EntityData } from "@/lib/entity-client";

// Source-assertion + renderToString patterns only (no jsdom/RTL) per repo convention.
const source = readFileSync("src/components/CompanyDrawer.tsx", "utf-8");

const entity: EntityData = {
  id: "ent-123",
  canonical_name: "Acme Corp",
  entity_type: "company",
  ticker: null,
  exchange: null,
  is_public: false,
  parent_id: null,
  description: null,
  ir_url: null,
  sec_url: null,
  segment: null,
  market_cap_b: null,
  entity_aliases: [],
};

function render(companyData: EntityData | null) {
  return renderToString(
    <DrawerContent companyName="Acme Corp" companyData={companyData} onClose={() => {}} />
  );
}

describe("CompanyDrawer watch star (spec §5.1)", () => {
  it("renders the watch star in the header when the entity id is known", () => {
    const html = render(entity);
    expect(html).toContain("☆");
    expect(html).toContain("Watch");
    expect(html).toContain('aria-pressed="false"');
  });
  it("shows a disabled 'Sign in to watch' star before auth resolves", () => {
    const html = render(entity);
    // isAuthed starts null → treated as unauthenticated until the session check.
    expect(html).toContain("Sign in to watch");
    expect(html).toContain("disabled");
  });

  it("does not render the star when there is no entity id", () => {
    const html = render(null);
    expect(html).not.toContain("Sign in to watch");
    expect(html).not.toContain("☆");
  });

  it("preserves dialog / focus a11y behaviour", () => {
    const html = render(entity);
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-labelledby="drawer-title"');
    expect(html).toContain("Close drawer");
    // Close button keeps its autoFocus (SSR renders autofocus attr).
    expect(source).toContain('autoFocus aria-label="Close drawer"');
  });

  it("places the star next to (before) the close button", () => {
    const star = source.indexOf("Sign in to watch");
    const close = source.indexOf('aria-label="Close drawer"');
    expect(star).toBeGreaterThan(-1);
    expect(close).toBeGreaterThan(-1);
    expect(star).toBeLessThan(close);
  });

  it("uses the watchlist client helpers for toggle + initial state", () => {
    expect(source).toContain(
      'import { fetchWatchedEntityIds, watchEntity, unwatchEntity } from "@/lib/watchlist"'
    );
    expect(source).toContain("fetchWatchedEntityIds()");
    expect(source).toContain("watchEntity(entityId)");
    expect(source).toContain("unwatchEntity(entityId)");
  });

  it("optimistically updates the star and reverts on failure", () => {
    expect(source).toContain("setIsWatched(next)");
    expect(source).toContain("if (!ok) setIsWatched(!next)");
  });

  it("only renders the star when companyData?.id is present", () => {
    expect(source).toContain("{companyData?.id && (");
  });
});
