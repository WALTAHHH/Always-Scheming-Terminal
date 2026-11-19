/// <reference types="vitest" />
/// @vitest-environment node

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

// Source-assertion pattern only (no jsdom/RTL) per repo convention. The empty
// feed used to render a bare empty-state with no LiveFeed, so the digest's
// `/?company=<name>` deep link had no drawer to open; the portal must be
// mounted independently of the feed in that branch.
const source = readFileSync("src/app/page.tsx", "utf-8");

describe("home page mounts the company-drawer portal for digest deep links", () => {
  it("imports CompanyDrawerPortal", () => {
    expect(source).toContain(
      'import { CompanyDrawerPortal } from "@/components/CompanyDrawer";',
    );
  });

  it("renders CompanyDrawerPortal in the empty-feed state", () => {
    expect(source).toContain("{items.length === 0 && <CompanyDrawerPortal />}");
  });
});
