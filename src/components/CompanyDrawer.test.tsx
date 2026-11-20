/// <reference types="vitest" />
/// @vitest-environment node

import { describe, it, expect } from "vitest";
import React from "react";
import { readFileSync } from "fs";
import { renderToString } from "react-dom/server";
import { DrawerContent, parseCompanyDeepLink } from "./CompanyDrawer";
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

  it("uses the watchlist client for the initial star state and a status-aware toggle", () => {
    expect(source).toContain('import { fetchWatchedEntityIds } from "@/lib/watchlist"');
    expect(source).toContain("fetchWatchedEntityIds()");
    // The toggle must not use the boolean-only helpers: they hide the HTTP
    // status, which is what made the star revert silently (AST t_7a718c60).
    expect(source).toContain("toggleWatchlistEntry(entityId, next)");
    expect(source).not.toContain("watchEntity(entityId)");
    expect(source).not.toContain("unwatchEntity(entityId)");
  });

  it("optimistically updates the star, reverts, and reports the failure", () => {
    expect(source).toContain("setIsWatched(next)");
    expect(source).toContain("setIsWatched(!next)");
    expect(source).toContain("setWatchError(watchlistErrorMessage(status))");
    // 401 gets its own path: demote to the 'Sign in to watch' affordance.
    expect(source).toContain("if (status === 401) setIsAuthed(false)");
  });

  it("renders an inline alert (never a silent revert) and maps status → text", () => {
    expect(source).toContain('role="alert"');
    expect(source).toContain("{watchError && (");
    expect(source).toContain('"Sign in to update your watchlist"');
    expect(source).toContain("Couldn't update watchlist");
  });

  it("only renders the star when companyData?.id is present", () => {
    expect(source).toContain("{companyData?.id && (");
  });
});

describe("CompanyDrawer news markers (fixed pixel size)", () => {
  it("sizes the dots in CSS pixels, not viewBox units", () => {
    expect(source).toContain("const NEWS_MARKER_IDLE_PX = 6;");
    expect(source).toContain("const NEWS_MARKER_HOVER_PX = 9;");
    expect(source).toContain("const NEWS_MARKER_HIT_PX = 16;");
  });

  it("renders the markers as HTML overlays positioned from x/y percentages", () => {
    expect(source).toContain("data-news-marker={marker.date}");
    expect(source).toContain("left: `${(marker.x / width) * 100}%`");
    expect(source).toContain("top: `${(marker.y / height) * 100}%`");
    expect(source).toContain("width: NEWS_MARKER_HIT_PX");
    expect(source).toContain("height: NEWS_MARKER_HIT_PX");
  });

  it("gives the dot a 1px dark outline via box-shadow (not a scaled stroke)", () => {
    expect(source).toContain("boxShadow: `0 0 0 1px ${NEWS_MARKER_OUTLINE}`");
  });

  it("no longer draws a stretched SVG circle marker", () => {
    // The chart viewBox is stretched with preserveAspectRatio="none", so any SVG
    // circle would render as an ellipse; the news dots must be HTML overlays.
    expect(source).not.toContain("<circle");
  });

  it("keeps the marker interactive (click + hover handlers)", () => {
    expect(source).toContain("onClick={(e) => handleMarkerClick(marker, e)}");
    expect(source).toContain("onMouseEnter={() => setHoveredMarkerId(marker.item.id)}");
  });
});

describe("CompanyDrawer deep link (?company=)", () => {
  it("parses the entity name out of the query string", () => {
    expect(parseCompanyDeepLink("?company=Acme%20Games")).toBe("Acme Games");
    expect(parseCompanyDeepLink("?foo=1&company=Cobalt%20Studios")).toBe(
      "Cobalt Studios"
    );
    // decoded percent-encoded reserved characters come back intact
    expect(parseCompanyDeepLink("?company=A%20%26%20B")).toBe("A & B");
    // a `+` is a space in a query value, matching what the digest link emits
    expect(parseCompanyDeepLink("?company=Acme+Games")).toBe("Acme Games");
  });

  it("returns null when the param is absent or blank", () => {
    expect(parseCompanyDeepLink("")).toBeNull();
    expect(parseCompanyDeepLink("?company=")).toBeNull();
    expect(parseCompanyDeepLink("?company=%20%20")).toBeNull();
    expect(parseCompanyDeepLink("?other=1")).toBeNull();
  });

  it("opens the drawer from the query param on mount", () => {
    // Source assertion (no jsdom in this repo): the portal reads the deep link
    // once on mount and routes it through the same setter the drawer uses.
    expect(source).toContain("parseCompanyDeepLink(window.location.search)");
    expect(source).toContain("if (name) setSelectedCompany(name)");
  });
});
