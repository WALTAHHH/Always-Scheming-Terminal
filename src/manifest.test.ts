import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Shape/spec test for the PWA web app manifest.
 *
 * The manifest is served from /public as a static asset. It is fetched
 * anonymously by the browser (no session cookie), so it must remain valid JSON
 * and keep the fields the link-capture / single-window behaviour depends on.
 * See the compatibility table in the PR body: only Chromium honours
 * `launch_handler`; `handle_links` is accepted-but-inert everywhere today.
 */
const manifestPath = fileURLToPath(
  new URL("../public/manifest.json", import.meta.url)
);

function loadManifest(): Record<string, unknown> {
  return JSON.parse(readFileSync(manifestPath, "utf8"));
}

describe("PWA manifest shape", () => {
  it("is valid JSON", () => {
    expect(() => loadManifest()).not.toThrow();
  });

  it("declares stable app identity: id + scope rooted at /", () => {
    const m = loadManifest();
    expect(m.id).toBe("/");
    expect(m.scope).toBe("/");
  });

  it("starts at a same-origin path and is installable (name + display + icons)", () => {
    const m = loadManifest();
    expect(typeof m.name).toBe("string");
    expect(String(m.start_url)).toMatch(/^\//);
    expect(m.display).toBe("standalone");
    const icons = m.icons as Array<Record<string, unknown>>;
    expect(Array.isArray(icons)).toBe(true);
    expect(icons.length).toBeGreaterThan(0);
    // Every icon must be a same-origin path so it resolves without auth.
    for (const icon of icons) {
      expect(String(icon.src)).toMatch(/^\//);
      expect(typeof icon.sizes).toBe("string");
      expect(typeof icon.type).toBe("string");
    }
    // A 512px+ icon is required for Android WebAPK / maskable install.
    expect(icons.some((i) => String(i.sizes).includes("512"))).toBe(true);
  });

  it("declares display_override for graceful degradation", () => {
    const m = loadManifest();
    const override = m.display_override as unknown[];
    expect(Array.isArray(override)).toBe(true);
    expect(override).toContain("standalone");
  });

  it("requests single-window link handling via launch_handler", () => {
    const m = loadManifest();
    const lh = m.launch_handler as { client_mode?: unknown };
    expect(lh).toBeTruthy();
    // Chromium 110+: navigate-existing reuses an open window; auto is the
    // fallback for launch sources that cannot navigate the existing client.
    expect(lh.client_mode).toEqual(["navigate-existing", "auto"]);
  });

  it("sets handle_links to a spec-allowed value (preferred)", () => {
    const m = loadManifest();
    expect(["preferred", "not-preferred", "unspecified"]).toContain(
      m.handle_links
    );
  });

  it("keeps start_url deep-link friendly (query params allowed, no fragment)", () => {
    const m = loadManifest();
    const startUrl = String(m.start_url);
    // No fragment: the manifest parser rejects the whole manifest if start_url
    // contains a `#`. Query params (utm tags) are fine.
    expect(startUrl).not.toContain("#");
    const url = new URL(startUrl, "https://terminal.always-scheming.com");
    expect(url.pathname).toBe("/");
  });
});
