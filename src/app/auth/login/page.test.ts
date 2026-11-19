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

  it("delegates open-redirect validation to the shared safe-redirect guard", () => {
    // The guard itself is unit-tested in src/lib/safe-redirect.test.ts; here we
    // just pin that the login page routes `next` through it rather than trusting
    // the raw value.
    expect(source).toContain(
      'import { safeRedirectTarget } from "@/lib/safe-redirect"'
    );
    expect(source).toContain("return safeRedirectTarget(next);");
  });
});
