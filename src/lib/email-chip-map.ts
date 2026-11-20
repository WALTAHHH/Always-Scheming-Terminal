/**
 * Email-safe signal chip map (digest redesign, card t_1c1842d6).
 *
 * The in-app chip (`src/lib/chip-styles.ts`) is expressed as Tailwind class
 * strings (`bg-ast-mint/20`, `text-ast-text`), which mean nothing inside an
 * email: email clients strip `<style>` blocks, mishandle `rgba()` alpha and
 * cannot resolve Tailwind utilities at all. This module is the *precomputed
 * hex* twin of that map — same labels, same colour family, same tint recipe —
 * so the digest chips read identically to the app's Signals list.
 *
 * Design rules (match `tag-visual-language.md` recipe B and the v2 mockups):
 * - Tint fill only, neutral text (coloured text on a tint fails AA in light
 *   mode; see `chip-styles.ts` — text is always the neutral `ast-text`).
 * - Dark fills are ~20% colour over `#1e1e1e`; light fills are ~20% over
 *   `#ffffff`.
 * - Fills are literal 6-digit hex — NOT `rgba()` and NOT Tailwind classes.
 *   Outlook (Word engine) and some Gmail builds drop alpha fills.
 *
 * PARITY: `email-chip-map.test.ts` fails if `chip-styles.ts` gains or loses a
 * signal_type, changes a label, or moves a type to a different tint family.
 * The values below are deliberately literal (not derived from `chip-styles.ts`)
 * so that a divergence is caught by the test rather than silently followed.
 *
 * This module imports nothing — it is pure data, safe to pull into either the
 * app bundle or the email renderer.
 */

/** The four tint colour families used by the in-app chips. */
export type ChipFamily = "mint" | "gold" | "pink" | "muted";

/** Precomputed hex colours for one chip in one colour scheme. */
export interface EmailChipColors {
  /** Tinted fill (background) hex, e.g. `#2e473d`. */
  fill: string;
  /** Neutral chip text hex that clears AA on the fill. */
  text: string;
}

/** Dark and light hex colours for a tint family. */
export interface EmailChipFamily {
  dark: EmailChipColors;
  light: EmailChipColors;
}

/**
 * Canonical hex fills per colour family, for dark and light. Derived from the
 * v2 mockups (spec §2.2): ~20% colour over the dark card `#1e1e1e`, or over
 * white in light mode. Text is the neutral `ast-text`-equivalent in each
 * scheme (`#d4d4d4` dark ≈ 6.8:1, `#1a1a1a` light ≈ 12.5:1 on the tints).
 */
export const CHIP_FAMILY_COLORS: Record<ChipFamily, EmailChipFamily> = {
  mint: {
    dark: { fill: "#2e473d", text: "#d4d4d4" },
    light: { fill: "#cde4dd", text: "#1a1a1a" },
  },
  gold: {
    dark: { fill: "#484119", text: "#d4d4d4" },
    light: { fill: "#f0ddce", text: "#1a1a1a" },
  },
  pink: {
    dark: { fill: "#442f44", text: "#d4d4d4" },
    light: { fill: "#ecd2ef", text: "#1a1a1a" },
  },
  muted: {
    dark: { fill: "#333333", text: "#d4d4d4" },
    light: { fill: "#e1e3e6", text: "#1a1a1a" },
  },
};

/** One signal_type → its email chip label and tint family. */
export interface EmailChipKind {
  /** Short label shown in the chip — identical to `chip-styles.ts`. */
  label: string;
  /** Tint colour family — identical to the `bg-ast-<family>/20` class there. */
  family: ChipFamily;
}

/**
 * Signal-type taxonomy → email chip (label + tint family). Same keys, labels
 * and families as `SIGNAL_CHIP_STYLES` in `src/lib/chip-styles.ts`:
 *
 *   acquisition    ACQ      mint
 *   fundraising    RAISE    gold
 *   earnings       EARN     gold
 *   layoffs        LAYOFF   pink
 *   leadership     LEAD     muted
 *   product_launch LAUNCH   mint
 *   regulatory     REG      pink
 *   platform_change PLATFORM muted
 *   macro          MACRO    muted
 */
export const SIGNAL_EMAIL_CHIP: Record<string, EmailChipKind> = {
  acquisition: { label: "ACQ", family: "mint" },
  fundraising: { label: "RAISE", family: "gold" },
  earnings: { label: "EARN", family: "gold" },
  layoffs: { label: "LAYOFF", family: "pink" },
  leadership: { label: "LEAD", family: "muted" },
  product_launch: { label: "LAUNCH", family: "mint" },
  regulatory: { label: "REG", family: "pink" },
  platform_change: { label: "PLATFORM", family: "muted" },
  macro: { label: "MACRO", family: "muted" },
};

/** Fallback family for an unknown / future signal type (neutral tint). */
export const SIGNAL_EMAIL_CHIP_FALLBACK: EmailChipKind = {
  label: "",
  family: "muted",
};

/** A signal type resolved to everything an email chip needs. */
export interface ResolvedEmailChip {
  label: string;
  family: ChipFamily;
  dark: EmailChipColors;
  light: EmailChipColors;
}

/**
 * Resolve a signal type to its email chip: label, family and the precomputed
 * dark/light hex fills. Unknown types fall back to the neutral muted chip with
 * an uppercased label derived from the raw type — the same behaviour as
 * `getSignalChip` in `chip-styles.ts`.
 */
export function getEmailChip(signalType: string): ResolvedEmailChip {
  const known = SIGNAL_EMAIL_CHIP[signalType];
  const kind: EmailChipKind = known ?? {
    ...SIGNAL_EMAIL_CHIP_FALLBACK,
    label: signalType.toUpperCase().slice(0, 6),
  };
  const colors = CHIP_FAMILY_COLORS[kind.family];
  return {
    label: kind.label,
    family: kind.family,
    dark: colors.dark,
    light: colors.light,
  };
}
