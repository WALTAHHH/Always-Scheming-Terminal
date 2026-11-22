"use client";

import type { Profile } from "@/lib/database.types";

/**
 * P0-1 load states for /profile. Writes are only ever allowed in 'ready'.
 *   'loading' — the preferences GET is in flight.
 *   'ready'   — preferences loaded successfully; controls may write.
 *   'error'   — the GET failed (network throw, non-OK status, or a malformed
 *               body). Controls render read-only so a later edit can never
 *               PATCH empty defaults over the user's real data.
 */
export type LoadState = "loading" | "ready" | "error";

export interface PreferencesPayload {
  preferences: Record<string, unknown>;
  profile?: Profile | null;
}

/**
 * True when a GET /api/user/preferences body is safe to hydrate from and can
 * unlock writes. A legitimately empty object (`preferences: {}`) counts as
 * ready — a new user has no interests/segments and that is not an error. A
 * missing or non-object `preferences` is treated as an error, NOT as empty.
 */
export function isLoadablePreferencesPayload(
  data: unknown
): data is PreferencesPayload {
  if (!data || typeof data !== "object") return false;
  const prefs = (data as { preferences?: unknown }).preferences;
  return !!prefs && typeof prefs === "object" && !Array.isArray(prefs);
}

// Load-error banner copy (P0-1). Single source of truth so tests and UI agree.
export const LOAD_ERROR_MESSAGE =
  "We couldn't load your preferences, so editing is turned off to protect your saved settings.";

/**
 * The initial load state for the profile page. Always 'loading' in production;
 * the indirection exists so the page's error state can be rendered in tests
 * without a live fetch — Next.js forbids passing custom props to a page
 * component, so a prop-based test seam is not available.
 */
export function getInitialLoadState(): LoadState {
  return "loading";
}

/**
 * Inline load-error banner (P0-1). Shown at the top of /profile when the
 * preferences GET failed; every write control is disabled while it is visible.
 * Retry re-runs the load.
 */
export function LoadErrorBanner({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      role="alert"
      data-testid="load-error-banner"
      className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center rounded border border-red-500/40 bg-red-500/10 p-4 text-sm text-ast-text"
    >
      <span className="flex-1">{LOAD_ERROR_MESSAGE}</span>
      <button
        type="button"
        onClick={onRetry}
        className="shrink-0 self-start sm:self-auto px-4 py-2 rounded border border-ast-border text-sm text-ast-text hover:border-ast-accent hover:text-ast-accent transition-colors"
      >
        Retry
      </button>
    </div>
  );
}
