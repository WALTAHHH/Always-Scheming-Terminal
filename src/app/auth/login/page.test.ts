/// <reference types="vitest" />
/// @vitest-environment node

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

/**
 * Source-assertion tests (no jsdom/RTL in this repo — see CompanyDrawer.test.tsx)
 * pinning the post-login redirect contract: the login page must honour the
 * middleware's `?next=` deep link (e.g. the weekly digest's `/?company=<name>`)
 * and guard it against open redirection.
 */
const source = readFileSync("src/app/auth/login/page.tsx", "utf-8");

describe("login page redirect-after-login", () => {
  it("navigates to the (validated) next target instead of hard-coding the feed", () => {
    expect(source).toContain("router.push(postLoginRedirect())");
    expect(source).not.toContain('router.push("/")');
  });

  it("reads the next param from the current URL", () => {
    expect(source).toContain('new URLSearchParams(window.location.search).get("next")');
  });

  it("only accepts same-origin absolute paths (open-redirect guards)", () => {
    // Rejects non-absolute, protocol-relative, backslash and scheme paths.
    expect(source).toContain('if (!next || !next.startsWith("/")) return "/"');
    expect(source).toContain('if (next.startsWith("//") || next.startsWith("/\\\\")) return "/"');
    expect(source).toContain('if (next.includes("\\\\")) return "/"');
    expect(source).toMatch(/if \(\/\^\\\/\[a-zA-Z\]\[a-zA-Z0-9\+\.-\]\*:\/\.test\(next\)\) return "\/";/);
  });
});
