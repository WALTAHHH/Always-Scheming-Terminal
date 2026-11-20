/**
 * Pure helpers for the Signals-tab collapsed/expanded section behaviour.
 *
 * Each section (Signals, Deals) shows the top `SIGNALS_COLLAPSED_COUNT` items
 * by default and offers an inline "Show N more" / "Show less" toggle. The
 * expanded/collapsed choice is remembered per section in sessionStorage so it
 * survives in-session navigation without a server round trip.
 *
 * Everything here is pure (no React, no DOM) so the toggle logic can be unit
 * tested in the node test environment used by the rest of the suite.
 */

/** Number of items shown per section while collapsed. */
export const SIGNALS_COLLAPSED_COUNT = 6;

/** sessionStorage key holding the per-section expansion map. */
export const EXPANSION_STORAGE_KEY = "ast.signals.expanded";

export type SectionId = "signals" | "deals";

export type ExpansionState = Record<SectionId, boolean>;

export const DEFAULT_EXPANSION: ExpansionState = {
  signals: false,
  deals: false,
};

/** Toggle one section without mutating the input state. */
export function toggleSection(
  state: ExpansionState,
  section: SectionId
): ExpansionState {
  return { ...state, [section]: !state[section] };
}

/** How many items to actually render for a section. */
export function getVisibleCount(
  total: number,
  expanded: boolean,
  collapsedCount: number = SIGNALS_COLLAPSED_COUNT
): number {
  if (expanded) return total;
  return Math.min(total, collapsedCount);
}

/**
 * How many items remain hidden behind the "Show N more" toggle. Zero while
 * expanded (so the label flips to "Show less") and zero when the section is
 * short enough to fit inside the collapsed cap.
 */
export function getHiddenCount(
  total: number,
  expanded: boolean,
  collapsedCount: number = SIGNALS_COLLAPSED_COUNT
): number {
  return Math.max(0, total - getVisibleCount(total, expanded, collapsedCount));
}

/** The slice of items to render for a section. */
export function sliceVisible<T>(
  items: readonly T[],
  expanded: boolean,
  collapsedCount: number = SIGNALS_COLLAPSED_COUNT
): T[] {
  return items.slice(0, getVisibleCount(items.length, expanded, collapsedCount));
}

/** Parse a raw sessionStorage value into an ExpansionState (never throws). */
export function parseExpansion(raw: string | null | undefined): ExpansionState {
  if (!raw) return { ...DEFAULT_EXPANSION };
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return {
        signals: parsed.signals === true,
        deals: parsed.deals === true,
      };
    }
  } catch {
    // fall through to defaults on malformed JSON
  }
  return { ...DEFAULT_EXPANSION };
}

export function serializeExpansion(state: ExpansionState): string {
  return JSON.stringify({ signals: !!state.signals, deals: !!state.deals });
}

/** Minimal Storage surface so callers can pass sessionStorage or a test stub. */
export interface ReadableStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Read (and validate) the persisted expansion state, tolerating failures. */
export function readExpansion(
  storage: ReadableStorage | null | undefined,
  key: string = EXPANSION_STORAGE_KEY
): ExpansionState {
  if (!storage) return { ...DEFAULT_EXPANSION };
  try {
    return parseExpansion(storage.getItem(key));
  } catch {
    return { ...DEFAULT_EXPANSION };
  }
}

/** Persist the expansion state, tolerating unavailable/quota-exceeded storage. */
export function writeExpansion(
  storage: ReadableStorage | null | undefined,
  state: ExpansionState,
  key: string = EXPANSION_STORAGE_KEY
): void {
  if (!storage) return;
  try {
    storage.setItem(key, serializeExpansion(state));
  } catch {
    // sessionStorage can be unavailable (private mode / quota) — ignore.
  }
}
