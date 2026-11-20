/**
 * Same-origin redirect guard for untrusted `?next=` values.
 *
 * Used by both ends of the login hand-off so they agree on exactly what an
 * acceptable post-auth redirect target is:
 *   - the middleware (`src/middleware.ts`), server-side, when it bounces a
 *     logged-out deep link to `/auth/login?next=…`; and
 *   - the login page (`src/app/auth/login/page.tsx`), client-side, when it
 *     navigates after a successful sign-in.
 *
 * Threat model: an attacker crafts a link to `/auth/login?next=<payload>` that,
 * right after a *legitimate* sign-in, sends the freshly-authenticated user to an
 * attacker-controlled origin (open redirect → phishing / token theft). Browsers
 * strip ASCII tab/LF/CR *anywhere* inside a URL and trim leading/trailing C0
 * controls, so `"/\t/evil.com"` (received as `/%09/evil.com`) is parsed as
 * `//evil.com` → a protocol-relative cross-origin navigation. The guard below:
 *
 *   1. rejects non-strings, empty values and leading/trailing whitespace;
 *   2. rejects any C0 control character (U+0000–U+001F) or DEL (U+007F) in the
 *      raw value *and* after decoding percent-escapes exactly once (so `%09`,
 *      `%0a`, `%0d`, `%00` are seen for what they are);
 *   3. requires a single leading `/` — rejecting scheme URLs (`https://…`,
 *      `javascript:…`), protocol-relative (`//evil.com`) and backslash-relative
 *      (`/\evil.com`) values;
 *   4. rejects a backslash anywhere in the raw or decoded value, because some
 *      browsers normalise `\` to `/` (`/%5cevil.com` must not survive);
 *   5. as the *authoritative* check, resolves the value against the trusted
 *      origin with `new URL()` and requires the resulting `origin` to match,
 *      then — crucially — validates the **post-normalisation** result, not the
 *      input. URL parsing collapses dot segments (`/.//evil.com`,
 *      `/a/..//evil.com`, `/%2e//evil.com`, `/./\evil.com`, …) into a pathname
 *      that starts with `//`, which `router.push()`/`redirect()` treats as a
 *      protocol-relative URL. So the guard rejects any resolved pathname that
 *      is not exactly one leading `/` (i.e. starts with `//` or `/\`), and
 *      returns the parsed `pathname + search + hash` — never the raw string.
 *   6. runs the resolution to a fixed point: the output is re-validated once
 *      more, so a value that only becomes unsafe after one normalisation pass
 *      can never be returned.
 *
 * Interior spaces are deliberately allowed: the digest's deep links carry
 * percent-encoded query data (`/?company=Acme%20Games`) that decodes to a space,
 * and a space cannot produce a cross-origin navigation once (3), (5) and (6)
 * hold.
 *
 * @param next   the untrusted `next` query value (already URL-decoded by the
 *               caller's `URLSearchParams`/`nextUrl` in the common case).
 * @param origin the trusted origin to compare against. Defaults to
 *               `window.location.origin` in the browser; pass it explicitly on
 *               the server (middleware), where `window` does not exist.
 * @returns a safe same-origin absolute path, or `/` when the value is unsafe.
 */

const FALLBACK = "/";

/**
 * A navigable target must be an absolute path with exactly one leading slash.
 * `//host` and `/\host` are protocol-relative/backslash-relative to browsers,
 * so both are rejected after normalisation.
 */
function isUnsafePath(target: string): boolean {
  return (
    !target.startsWith("/") ||
    target.startsWith("//") ||
    target.startsWith("/\\")
  );
}

/**
 * Resolve `value` against `origin` and return the normalised same-origin
 * `pathname + search + hash`, or `null` when the result leaves the origin or
 * normalises to a protocol-relative path.
 */
function resolveOnce(value: string, origin: string): string | null {
  let url: URL;
  try {
    url = new URL(value, origin);
  } catch {
    return null;
  }
  if (url.origin !== origin) return null;

  const target = `${url.pathname}${url.search}${url.hash}`;
  return isUnsafePath(target) ? null : target;
}

export function safeRedirectTarget(
  next: string | null | undefined,
  origin?: string
): string {
  // (1) must be a non-empty string with no leading/trailing whitespace.
  if (typeof next !== "string") return FALLBACK;
  if (next !== next.trim()) return FALLBACK;

  // (2) no C0 controls / DEL in the raw value.
  if (/[\u0000-\u001f\u007f]/.test(next)) return FALLBACK;

  // Decode percent-escapes exactly once so `%09` etc. cannot hide a control
  // character. A malformed escape is rejected outright.
  let decoded: string;
  try {
    decoded = decodeURIComponent(next);
  } catch {
    return FALLBACK;
  }

  // (2 again) no C0 controls / DEL after decoding.
  if (/[\u0000-\u001f\u007f]/.test(decoded)) return FALLBACK;

  // (3) single leading slash, not protocol-relative or backslash-relative.
  if (!decoded.startsWith("/")) return FALLBACK;
  if (decoded.startsWith("//") || decoded.startsWith("/\\")) return FALLBACK;

  // (4) no backslash anywhere.
  if (next.includes("\\") || decoded.includes("\\")) return FALLBACK;

  // (5) authoritative origin check against the trusted base. Normalise the
  // base to a bare origin first so a trailing slash in `origin` cannot make a
  // valid target look cross-origin.
  const rawBase =
    origin ?? (typeof window !== "undefined" ? window.location.origin : undefined);
  if (!rawBase) return FALLBACK;

  let base: string;
  try {
    base = new URL(rawBase).origin;
  } catch {
    return FALLBACK;
  }

  // Validate the POST-normalisation result (dot segments, encoded dots and
  // backslashes all collapse during parsing), then re-validate the output to a
  // fixed point so nothing unsafe can survive a second pass.
  const first = resolveOnce(decoded, base);
  if (first === null) return FALLBACK;

  const second = resolveOnce(first, base);
  if (second === null) return FALLBACK;

  return second || FALLBACK;
}
