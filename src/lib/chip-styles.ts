/**
 * Shared chip styling for signal types.
 *
 * Single source of truth for the "Signal type" chip (the tinted pill shown in
 * the Signals list AND the Deals section) plus the matching row left-stripe.
 *
 * Design rules (from the tag visual-language consult, card t_e44e4171):
 * - Signal type = tinted pill: `bg-{c}/20` fill, NO outline.
 * - Text is NEUTRAL (`text-ast-text`) so it clears WCAG AA in both themes; the
 *   semantic colour is carried by the tint and the row stripe, not the text.
 * - 10px floor (`text-[10px]`), `rounded-sm`, `px-1.5 py-0.5`.
 *
 * IMPORTANT: every class value below is a LITERAL string. Tailwind's content
 * scanner cannot see classes assembled at runtime from a colour variable (the
 * old `bg-` + colour-name interpolation), which produced dead CSS in
 * production. Do not reintroduce interpolation here — `chip-styles.test.ts`
 * guards against it.
 */

/** Shared chip recipe (size, radius, padding, type, weight, case). */
export const SIGNAL_CHIP_BASE =
  "inline-flex items-center rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap flex-shrink-0";

export interface SignalChipStyle {
  /** Short label shown inside the chip. */
  label: string;
  /** Tinted fill class (literal, e.g. `bg-ast-mint/20`). */
  bg: string;
  /** Neutral chip text colour, AA in both themes. */
  text: string;
  /** Row left-stripe class (literal, e.g. `border-l-ast-pink`). */
  border: string;
}

/**
 * Canonical signal-type taxonomy → chip style.
 *
 * Taxonomy is the set emitted by the extractor
 * (see SIGNAL_EXTRACTION_PROMPT in src/lib/signal-extractor.ts):
 * acquisition, fundraising, earnings, layoffs, leadership, product_launch,
 * regulatory, platform_change, macro.
 *
 * Labels use the list labels everywhere (ACQ, not M&A) so the Signals list and
 * the Deals section read identically.
 */
export const SIGNAL_CHIP_STYLES: Record<string, SignalChipStyle> = {
  acquisition: {
    label: "ACQ",
    bg: "bg-ast-mint/20",
    text: "text-ast-text",
    border: "border-l-ast-pink",
  },
  fundraising: {
    label: "RAISE",
    bg: "bg-ast-gold/20",
    text: "text-ast-text",
    border: "border-l-ast-gold",
  },
  earnings: {
    label: "EARN",
    bg: "bg-ast-gold/20",
    text: "text-ast-text",
    border: "border-l-ast-gold",
  },
  layoffs: {
    label: "LAYOFF",
    bg: "bg-ast-pink/20",
    text: "text-ast-text",
    border: "border-l-ast-pink",
  },
  leadership: {
    label: "LEAD",
    bg: "bg-ast-muted/20",
    text: "text-ast-text",
    border: "border-l-ast-muted",
  },
  product_launch: {
    label: "LAUNCH",
    bg: "bg-ast-mint/20",
    text: "text-ast-text",
    border: "border-l-ast-mint",
  },
  regulatory: {
    label: "REG",
    bg: "bg-ast-pink/20",
    text: "text-ast-text",
    border: "border-l-ast-muted",
  },
  platform_change: {
    label: "PLATFORM",
    bg: "bg-ast-muted/20",
    text: "text-ast-text",
    border: "border-l-ast-accent",
  },
  macro: {
    label: "MACRO",
    bg: "bg-ast-muted/20",
    text: "text-ast-text",
    border: "border-l-ast-accent",
  },
};

/** Style for an unknown / future signal type: neutral fill, muted stripe. */
export const SIGNAL_CHIP_FALLBACK: SignalChipStyle = {
  label: "",
  bg: "bg-ast-muted/20",
  text: "text-ast-text",
  border: "border-l-ast-accent",
};

export interface ResolvedSignalChip {
  label: string;
  /** Full `className` for the chip span (base + tint + text). */
  className: string;
}

/** Resolve a signal type to its chip label + full className. */
export function getSignalChip(signalType: string): ResolvedSignalChip {
  const style =
    SIGNAL_CHIP_STYLES[signalType] ?? {
      ...SIGNAL_CHIP_FALLBACK,
      label: signalType.toUpperCase().slice(0, 6),
    };
  return {
    label: style.label,
    className: `${SIGNAL_CHIP_BASE} ${style.bg} ${style.text}`,
  };
}

/** Row left-stripe class for a signal type. */
export function getSignalStripeClass(signalType: string): string {
  return (SIGNAL_CHIP_STYLES[signalType] ?? SIGNAL_CHIP_FALLBACK).border;
}
