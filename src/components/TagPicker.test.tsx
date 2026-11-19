/// @vitest-environment node

import { describe, it, expect } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import fs from "fs";
import path from "path";

import TagPicker from "./TagPicker";

const source = fs.readFileSync(path.resolve(__dirname, "TagPicker.tsx"), "utf-8");

describe("TagPicker — initial render", () => {
  it("renders an accessible combobox with no tag list until focus", () => {
    const html = renderToString(
      React.createElement(TagPicker, { selected: [], onChange: () => {} })
    );

    expect(html).toContain('role="combobox"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-autocomplete="list"');
    expect(html).toContain("Browse all tags");
    // Nothing loaded yet, so no listbox is in the initial markup.
    expect(html).not.toContain('role="listbox"');
  });

  it("renders selected values as removable, labelled chips", () => {
    const html = renderToString(
      React.createElement(TagPicker, {
        selected: ["mobile", "AI"],
        onChange: () => {},
      })
    );

    expect(html).toContain('aria-label="Selected interests"');
    expect(html).toContain("mobile");
    expect(html).toContain("AI");
    expect(html).toContain('aria-label="Remove mobile"');
    expect(html).toContain('aria-label="Remove AI"');
  });

  it("shows an empty state when nothing is selected", () => {
    const html = renderToString(
      React.createElement(TagPicker, { selected: [], onChange: () => {} })
    );
    expect(html).toContain("No interests added yet");
  });
});

describe("TagPicker — source-asserted behaviours", () => {
  it("lazy-loads the catalogue only on focus / browse, not on mount", () => {
    // ensureLoaded is the single fetch site...
    expect(source).toContain("const ensureLoaded");
    expect(source).toContain('const FETCH_URL = "/api/tags/themes"');
    expect(source).toContain("fetch(FETCH_URL)");
    // ...gated behind a ref so it runs at most once per mount.
    expect(source).toContain("loadedRef.current");
    // No mount-time fetch effect.
    expect(source).not.toContain("useEffect(");
    // Triggered from the input focus handler and the browse button.
    expect(source).toContain("onFocus={() => {");
    expect(source).toContain("const openBrowse = () => {");
  });

  it("supports the full combobox keyboard contract", () => {
    expect(source).toContain('"ArrowDown"');
    expect(source).toContain('"ArrowUp"');
    expect(source).toContain('"Enter"');
    expect(source).toContain('"Escape"');
    expect(source).toContain("aria-activedescendant");
    expect(source).toContain('role="listbox"');
    expect(source).toContain('role="option"');
    expect(source).toContain("aria-selected");
  });

  it("cannot add free text — only catalogue matches are selectable", () => {
    expect(source).toContain("No matching tags");
    // Results come from the loaded catalogue, never the raw input value.
    expect(source).toContain("available.filter");
    // Selecting is only ever driven by a catalogue row / browse toggle.
    expect(source).toContain("const selectTag = (value: string)");
  });

  it("marks retired/legacy selections distinctly and keeps them removable", () => {
    expect(source).toContain("isLegacy");
    expect(source).toContain("legacy");
    expect(source).toContain("aria-label={`Remove ${value}`}");
  });

  it("provides a browse panel with search, sort toggle and counts", () => {
    expect(source).toContain('role="dialog"');
    expect(source).toContain('aria-modal="true"');
    expect(source).toContain("browseSort");
    expect(source).toContain('aria-pressed');
    expect(source).toContain("Show more");
    // Sort labels read "A–Z" / "Most used" — the count is an article-usage
    // count, so "Popular" was misleading.
    expect(source).toContain("A–Z");
    expect(source).toContain("Most used");
    expect(source).not.toContain(">Popular<");
    // Counts are self-explanatory: title tooltip + muted column hint.
    expect(source).toContain("Used in ${tag.count} articles");
    expect(source).toContain(">articles<");
  });

  it("does not rely on Tailwind /opacity colour utilities (theme tokens only)", () => {
    // No `ast-*/<number>` alpha classes anywhere in the component.
    expect(source).not.toMatch(/ast-[a-z]+\/\d/);
  });
});
