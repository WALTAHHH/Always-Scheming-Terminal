import { describe, it, expect } from "vitest";
import { safeRedirectTarget } from "@/lib/safe-redirect";

const ORIGIN = "https://terminal.always-scheming.com";

describe("safeRedirectTarget", () => {
  // Each case is [input, expected]. Anything not a safe same-origin absolute
  // path must fall back to "/".
  const cases: Array<[string | null | undefined, string]> = [
    // --- allowed: same-origin absolute path + query + hash -----------------
    ["/", "/"],
    ["/?company=x", "/?company=x"],
    ["/profile?tab=watchlist", "/profile?tab=watchlist"],
    ["/feed#top", "/feed#top"],
    // Percent-encoded query data that decodes to an interior space stays valid
    // (this is the digest deep link: /?company=Acme%20Games).
    ["/?company=Acme%20Games", "/?company=Acme%20Games"],

    // --- rejected: protocol-relative / backslash-relative ------------------
    ["//evil.com", "/"],
    ["/\\evil.com", "/"],

    // --- rejected: tab / LF / CR that browsers strip (raw form) ------------
    ["/\t/evil.com", "/"],
    ["/\n/evil.com", "/"],
    ["/\r/evil.com", "/"],

    // --- rejected: same, percent-encoded (decode-once catches them) --------
    ["/%09/evil.com", "/"],
    ["/%0a/evil.com", "/"],
    ["/%0d/evil.com", "/"],
    ["/%00/evil.com", "/"],
    ["/%2f/evil.com", "/"],
    ["/%5cevil.com", "/"],

    // --- rejected: absolute / scheme URLs ----------------------------------
    ["https://evil.com", "/"],
    ["http://evil.com/path", "/"],
    ["javascript:alert(1)", "/"],

    // --- rejected: whitespace / empty / nullish ----------------------------
    [" /x", "/"],
    ["/x ", "/"],
    ["", "/"],
    [null, "/"],
    [undefined, "/"],
  ];

  it.each(cases)("maps %j -> %j", (input, expected) => {
    expect(safeRedirectTarget(input, ORIGIN)).toBe(expected);
  });

  it("returns '/' when no origin is available (client fallback outside a browser)", () => {
    // jsdom is not used in this repo; with no `origin` arg and no `window`,
    // there is nothing to compare against, so the guard falls back safely.
    expect(safeRedirectTarget("/?company=x")).toBe("/");
  });

  it("resolves against window.location.origin when one is present", () => {
    const original = (globalThis as { window?: unknown }).window;
    (globalThis as { window?: unknown }).window = { location: { origin: ORIGIN } };
    try {
      expect(safeRedirectTarget("/?company=x")).toBe("/?company=x");
      expect(safeRedirectTarget("//evil.com")).toBe("/");
    } finally {
      (globalThis as { window?: unknown }).window = original;
    }
  });

  it("rejects a target whose decoded form points at another origin", () => {
    // `//evil.com` reaches new URL() as protocol-relative; the guard rejects it
    // at the prefix check, and the origin check is the backstop.
    expect(safeRedirectTarget("//evil.com", ORIGIN)).toBe("/");
  });
});
