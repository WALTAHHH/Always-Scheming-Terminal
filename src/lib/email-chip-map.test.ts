/// <reference types="vitest" />
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  SIGNAL_CHIP_STYLES,
  SIGNAL_CHIP_FALLBACK,
} from "./chip-styles";
import {
  CHIP_FAMILY_COLORS,
  SIGNAL_EMAIL_CHIP,
  SIGNAL_EMAIL_CHIP_FALLBACK,
  getEmailChip,
  type ChipFamily,
} from "./email-chip-map";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(path.resolve(here, rel), "utf8");

/** The tint family declared by a `bg-ast-<family>/NN` Tailwind class. */
function familyOfBg(bg: string): ChipFamily | null {
  const m = /^bg-ast-(mint|gold|pink|muted)\/\d+$/.exec(bg);
  return (m?.[1] as ChipFamily | undefined) ?? null;
}

const HEX6 = /^#[0-9a-f]{6}$/;

// ── parity with the in-app chip map ───────────────────────────────────────
// These are the tests that make the email map a *mirror* of chip-styles.ts: if
// the in-app map gains/loses a signal_type, changes a label, or moves a type to
// a different tint family, the suite fails and the email map must follow.
describe("email chip map parity with chip-styles.ts", () => {
  it("has exactly the same signal_type keys (no gains, no losses)", () => {
    expect(Object.keys(SIGNAL_EMAIL_CHIP).sort()).toEqual(
      Object.keys(SIGNAL_CHIP_STYLES).sort(),
    );
  });

  it("uses the same label for every signal_type", () => {
    for (const [type, style] of Object.entries(SIGNAL_CHIP_STYLES)) {
      const email = SIGNAL_EMAIL_CHIP[type];
      expect(email, `email map missing ${type}`).toBeDefined();
      expect(email.label, `label mismatch for ${type}`).toBe(style.label);
    }
  });

  it("uses the same tint colour family for every signal_type", () => {
    for (const [type, style] of Object.entries(SIGNAL_CHIP_STYLES)) {
      const want = familyOfBg(style.bg);
      expect(want, `chip-styles ${type} bg is not a known tint family: ${style.bg}`).not.toBeNull();
      expect(SIGNAL_EMAIL_CHIP[type].family, `family mismatch for ${type}`).toBe(want);
    }
  });

  it("keeps the fallback family neutral (muted)", () => {
    expect(SIGNAL_EMAIL_CHIP_FALLBACK.family).toBe("muted");
    expect(familyOfBg(SIGNAL_CHIP_FALLBACK.bg)).toBe("muted");
  });
});

// ── the hex map is email-safe ─────────────────────────────────────────────
describe("email chip fills are precomputed email-safe hex", () => {
  it("declares the canonical fill/text hex per family (dark and light)", () => {
    // Literal table from the spec (§2.2). Anchored so a wrong hex is caught.
    expect(CHIP_FAMILY_COLORS).toEqual({
      mint: { dark: { fill: "#2e473d", text: "#d4d4d4" }, light: { fill: "#cde4dd", text: "#1a1a1a" } },
      gold: { dark: { fill: "#484119", text: "#d4d4d4" }, light: { fill: "#f0ddce", text: "#1a1a1a" } },
      pink: { dark: { fill: "#442f44", text: "#d4d4d4" }, light: { fill: "#ecd2ef", text: "#1a1a1a" } },
      muted: { dark: { fill: "#333333", text: "#d4d4d4" }, light: { fill: "#e1e3e6", text: "#1a1a1a" } },
    });
  });

  it("emits 6-digit hex (never rgba or Tailwind classes) for every resolved chip", () => {
    for (const type of Object.keys(SIGNAL_EMAIL_CHIP)) {
      const chip = getEmailChip(type);
      for (const colors of [chip.dark, chip.light]) {
        expect(colors.fill, `${type} fill`).toMatch(HEX6);
        expect(colors.text, `${type} text`).toMatch(HEX6);
        expect(colors.fill).not.toContain("rgba");
        expect(colors.text).not.toContain("rgba");
        expect(colors.fill, `${type} fill looks like a Tailwind class`).not.toMatch(/^(bg|text|border)-/);
      }
    }
  });

  it("resolves a known type to the family's precomputed colours", () => {
    const acq = getEmailChip("acquisition");
    expect(acq.label).toBe("ACQ");
    expect(acq.family).toBe("mint");
    expect(acq.dark).toEqual(CHIP_FAMILY_COLORS.mint.dark);
    expect(acq.light).toEqual(CHIP_FAMILY_COLORS.mint.light);
  });

  it("falls back to the neutral muted chip for an unknown type", () => {
    const chip = getEmailChip("mystery");
    expect(chip.label).toBe("MYSTER");
    expect(chip.family).toBe("muted");
    expect(chip.dark).toEqual(CHIP_FAMILY_COLORS.muted.dark);
  });

  it("limits the unknown-type fallback label to 6 uppercase chars", () => {
    expect(getEmailChip("hyperlocal_merger").label).toBe("HYPERL");
    expect(getEmailChip("").label).toBe("");
  });

  it("builds no chip colour by string interpolation (module is literal hex)", () => {
    const src = read("email-chip-map.ts");
    expect(src).not.toMatch(/(?:bg|text|border)-\$\{/);
  });
});
