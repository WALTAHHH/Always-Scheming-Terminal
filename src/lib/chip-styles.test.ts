/// <reference types="vitest" />
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  SIGNAL_CHIP_BASE,
  SIGNAL_CHIP_STYLES,
  SIGNAL_CHIP_FALLBACK,
  getSignalChip,
  getSignalStripeClass,
} from "./chip-styles";

// Taxonomy emitted by the extractor (see SIGNAL_EXTRACTION_PROMPT in
// src/lib/signal-extractor.ts).
const SIGNAL_TYPES = [
  "acquisition",
  "fundraising",
  "earnings",
  "layoffs",
  "leadership",
  "product_launch",
  "regulatory",
  "platform_change",
  "macro",
];

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(path.resolve(here, rel), "utf8");

describe("signal chip class map", () => {
  it("has an entry for every signal type", () => {
    for (const type of SIGNAL_TYPES) {
      expect(SIGNAL_CHIP_STYLES[type], `missing entry for ${type}`).toBeDefined();
    }
    // No extras beyond the taxonomy (the unknown-type case uses the fallback).
    expect(Object.keys(SIGNAL_CHIP_STYLES).sort()).toEqual([...SIGNAL_TYPES].sort());
  });

  it("uses literal, statically-analysable class strings", () => {
    const entries = [...Object.values(SIGNAL_CHIP_STYLES), SIGNAL_CHIP_FALLBACK];
    for (const style of entries) {
      expect(style.bg).toMatch(/^bg-ast-(mint|gold|pink|accent|muted)\/\d+$/);
      expect(style.text).toBe("text-ast-text");
      expect(style.border).toMatch(/^border-l-ast-(mint|gold|pink|accent|muted)$/);
      for (const cls of [style.bg, style.text, style.border]) {
        // No template interpolation inside the class values.
        expect(cls).not.toContain("$");
        expect(cls).not.toContain("{");
      }
    }
  });

  it("keeps every chip at the 10px floor with the shared recipe", () => {
    expect(SIGNAL_CHIP_BASE).toContain("text-[10px]");
    expect(SIGNAL_CHIP_BASE).toContain("rounded-sm");
    expect(SIGNAL_CHIP_BASE).toContain("px-1.5");
    expect(SIGNAL_CHIP_BASE).toContain("py-0.5");
    expect(SIGNAL_CHIP_BASE).toContain("uppercase");
    expect(SIGNAL_CHIP_BASE).not.toContain("text-[9px]");
  });

  it("resolves a chip for a known type", () => {
    const chip = getSignalChip("acquisition");
    expect(chip.label).toBe("ACQ");
    expect(chip.className).toContain(SIGNAL_CHIP_BASE);
    expect(chip.className).toContain("bg-ast-mint/20");
    expect(chip.className).toContain("text-ast-text");
  });

  it("falls back to a neutral chip for unknown types", () => {
    const chip = getSignalChip("mystery");
    expect(chip.label).toBe("MYSTER");
    expect(chip.className).toContain("bg-ast-muted/20");
    expect(getSignalStripeClass("mystery")).toBe("border-l-ast-accent");
  });

  it("keeps list and Deals on the same colour map (ACQ is mint, not pink)", () => {
    // Regression: Deals used to render ACQ as bg-ast-pink/20 (labelled M&A).
    expect(SIGNAL_CHIP_STYLES.acquisition.bg).toBe("bg-ast-mint/20");
    expect(SIGNAL_CHIP_STYLES.fundraising.bg).toBe("bg-ast-gold/20");
    expect(SIGNAL_CHIP_STYLES.earnings.bg).toBe("bg-ast-gold/20");
  });
});

describe("no dynamic Tailwind class construction", () => {
  // e.g. `bg-${color}/20` — invisible to Tailwind's content scanner.
  const dynamic = /(?:bg|text|border|border-l)-\$\{/;

  it("chip-styles.ts builds no colour class by interpolation", () => {
    expect(read("chip-styles.ts")).not.toMatch(dynamic);
  });

  it("SignalPanel.tsx builds no colour class by interpolation", () => {
    const src = read("../components/SignalPanel.tsx");
    expect(src).not.toMatch(dynamic);
    // 10px floor: no 9px text left in the panel.
    expect(src).not.toContain("text-[9px]");
  });
});
