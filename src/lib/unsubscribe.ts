import { randomBytes } from "crypto";

/**
 * One-click unsubscribe helpers for the weekly watchlist email digest.
 *
 * The token is a 256-bit cryptographically-random hex string stored on
 * `user_preferences.digest_unsub_token` (added in migration 018). It is not
 * guessable, contains no user data, and — because it is random rather than a
 * signed payload — reveals nothing about the account it belongs to.
 *
 * These helpers live in their own module (not `src/lib/email.ts`, which is
 * owned by the W8 digest card) so the two cards do not collide on one file.
 */

/** Random entropy per token: 32 bytes = 256 bits, rendered as 64 hex chars. */
export const UNSUB_TOKEN_BYTES = 32;
const UNSUB_TOKEN_RE = /^[a-f0-9]{64}$/;

/**
 * Generate a fresh unsubscribe token. 32 random bytes (256 bits) as lowercase
 * hex — wide enough that brute-forcing a live token is infeasible.
 */
export function generateUnsubscribeToken(): string {
  return randomBytes(UNSUB_TOKEN_BYTES).toString("hex");
}

/**
 * Validate the *shape* of a token before it ever reaches the database, so
 * arbitrary/oversized input cannot be used as a query probe. Returns a type
 * guard so callers narrow to `string` in the safe branch.
 */
export function isValidUnsubscribeTokenShape(token: unknown): token is string {
  return typeof token === "string" && UNSUB_TOKEN_RE.test(token);
}

/**
 * Public site origin used to build the unsubscribe URL that goes in the email
 * footer and the `List-Unsubscribe` header.
 */
export function getUnsubscribeBaseUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL || "https://terminal.always-scheming.com";
  return raw.replace(/\/+$/, "");
}

/** Build the absolute one-click unsubscribe URL for a token. */
export function buildUnsubscribeUrl(token: string, baseUrl?: string): string {
  const base = (baseUrl ?? getUnsubscribeBaseUrl()).replace(/\/+$/, "");
  return `${base}/unsubscribe?token=${encodeURIComponent(token)}`;
}

/**
 * RFC 8058 `List-Unsubscribe` / `List-Unsubscribe-Post` headers. Include a
 * `mailto` address to also offer the non-HTTP path. Mail clients that support
 * one-click will POST to the https URL with body `List-Unsubscribe=One-Click`.
 */
export function buildListUnsubscribeHeaders(
  token: string,
  opts: { baseUrl?: string; mailto?: string } = {}
): { "List-Unsubscribe": string; "List-Unsubscribe-Post": string } {
  const url = buildUnsubscribeUrl(token, opts.baseUrl);
  const parts = opts.mailto ? [`<mailto:${opts.mailto}>`, `<${url}>`] : [`<${url}>`];
  return {
    "List-Unsubscribe": parts.join(", "),
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

type PrefsRow = {
  user_id: string;
  notification_prefs: unknown;
};

export type UnsubscribeResult =
  | { ok: true; changed: boolean }
  | { ok: false; reason: "invalid_token" | "not_found" | "error" };

// The service-role client (bypasses RLS for this public route). Typed loosely
// because the generated `database.types.ts` on this branch predates the W1
// `digest_unsub_token` column.
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Read-only existence check for a token — used by the GET confirmation page
 * so a stale/expired link shows an immediate message without mutating anything.
 * Never returns or logs the owning user.
 */
export async function unsubscribeTokenExists(
  supabase: any,
  token: string
): Promise<boolean> {
  if (!isValidUnsubscribeTokenShape(token)) return false;
  const { data, error } = await supabase
    .from("user_preferences")
    .select("user_id")
    .eq("digest_unsub_token", token)
    .maybeSingle();
  if (error) {
    console.error("[unsubscribe] token lookup failed:", error.message ?? error);
    return false;
  }
  return Boolean(data);
}

/**
 * Set `notification_prefs.watchlist_email = false` for the owner of `token`,
 * with no login. Idempotent: replaying a valid token is a no-op that still
 * reports success. The token is intentionally *not* consumed, so a user who
 * later re-enables email can use the same link again.
 */
export async function unsubscribeByToken(
  supabase: any,
  token: string
): Promise<UnsubscribeResult> {
  if (!isValidUnsubscribeTokenShape(token)) {
    return { ok: false, reason: "invalid_token" };
  }

  const { data, error } = await supabase
    .from("user_preferences")
    .select("user_id, notification_prefs")
    .eq("digest_unsub_token", token)
    .maybeSingle();

  if (error) {
    console.error("[unsubscribe] prefs lookup failed:", error.message ?? error);
    return { ok: false, reason: "error" };
  }
  if (!data) return { ok: false, reason: "not_found" };

  const row = data as PrefsRow;
  const current =
    row.notification_prefs && typeof row.notification_prefs === "object"
      ? (row.notification_prefs as Record<string, unknown>)
      : {};

  // Already unsubscribed — idempotent success, skip the write.
  if (current.watchlist_email === false) return { ok: true, changed: false };

  const { error: updateError } = await supabase
    .from("user_preferences")
    .update({
      notification_prefs: { ...current, watchlist_email: false },
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", row.user_id);

  if (updateError) {
    console.error(
      "[unsubscribe] prefs update failed:",
      updateError.message ?? updateError
    );
    return { ok: false, reason: "error" };
  }

  return { ok: true, changed: true };
}
/* eslint-enable @typescript-eslint/no-explicit-any */
