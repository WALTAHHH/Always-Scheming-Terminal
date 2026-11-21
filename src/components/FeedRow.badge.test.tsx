/// <reference types="vitest" />
/// @vitest-environment node

import { describe, it, expect } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { readFileSync } from "node:fs";
import { FeedRow } from "./FeedRow";
import type { FeedItem } from "@/lib/database.types";

// Guards the fix for the feed-row overlap bug: the cluster importance badge
// ('● HIGH' / '● HOT') used to be absolutely positioned over the row
// (`absolute top-3 right-3`), so it sat on top of the muted external-link icon
// in the same corner of FeedRow. The badge is now passed into FeedRow as a
// slot and rendered in the row's right gutter, stacked above the link icon.

const clusterRowSource = readFileSync(
  new URL("./ClusterRow.tsx", import.meta.url),
  "utf8",
);
const feedRowSource = readFileSync(
  new URL("./FeedRow.tsx", import.meta.url),
  "utf8",
);

const item = {
  id: "1",
  title: "Acme raises $50M Series B",
  url: "https://example.com/acme",
  body: "Short body.",
  published_at: new Date().toISOString(),
  author: "Jane Doe",
  tags: null,
  sources: { name: "TechCrunch", url: undefined, source_type: "news" },
} as unknown as FeedItem;

describe("ClusterRow importance badge", () => {
  it("no longer absolutely positions the badge over the row content", () => {
    expect(clusterRowSource).not.toContain("absolute top-3 right-3");
    expect(clusterRowSource).not.toMatch(/absolute\s+top-3\s+right-3/);
  });

  it("passes the badge into FeedRow instead of overlaying it", () => {
    expect(clusterRowSource).toContain("importanceBadge={importanceBadge}");
    expect(clusterRowSource).not.toMatch(/<FeedRow[^>]*\/>\s*\{importanceBadge\}/);
  });
});

describe("FeedRow right gutter", () => {
  it("renders the badge prop and the link icon together in one flex column", () => {
    expect(feedRowSource).toContain("importanceBadge?: ReactNode");
    expect(feedRowSource).toContain("flex flex-col items-end gap-1");
  });

  it("stacks the badge above the external-link icon in DOM order", () => {
    const html = renderToString(
      <FeedRow
        item={item}
        importanceBadge={<span data-testid="importance-badge">HIGH</span>}
      />,
    );

    const gutterStart = html.indexOf("flex flex-col items-end gap-1");
    expect(gutterStart).toBeGreaterThan(-1);

    // Scope to the gutter subtree (up to the two closing divs that end it) so
    // unrelated SVGs elsewhere in the row cannot satisfy the assertion.
    const gutter = html.slice(gutterStart);
    const badgeIdx = gutter.indexOf('data-testid="importance-badge"');
    const iconIdx = gutter.indexOf("<svg");
    expect(badgeIdx).toBeGreaterThan(-1);
    expect(iconIdx).toBeGreaterThan(-1);
    expect(badgeIdx).toBeLessThan(iconIdx);
  });

  it("renders no badge column content when the slot is omitted", () => {
    const html = renderToString(<FeedRow item={item} />);
    expect(html).not.toContain('data-testid="importance-badge"');
    // The link icon is still rendered.
    expect(html).toContain("flex flex-col items-end gap-1");
    expect(html).toContain("<svg");
  });
});
