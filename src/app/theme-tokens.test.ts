import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

/**
 * Guards the ast-* colour token wiring.
 *
 * Tailwind's `ast` palette resolves each colour to
 * `rgb(var(--ast-<name>-rgb) / <alpha-value>)` so that opacity modifiers
 * (bg-ast-bg/95, hover:bg-ast-mint/5, ...) are emitted at build time.
 * Those RGB triplets must stay exactly in sync with the hex values that
 * the rest of the app (inline styles, scrollbars, color-mix) still uses.
 */

const ROOT = path.resolve(__dirname, "../..");
const CSS = readFileSync(path.join(ROOT, "src/app/globals.css"), "utf8");
const TAILWIND = readFileSync(path.join(ROOT, "tailwind.config.ts"), "utf8");

const COLOR_NAMES = [
  "bg",
  "surface",
  "border",
  "text",
  "muted",
  "accent",
  "pink",
  "mint",
  "gold",
  "pale",
  "tag",
] as const;

/** Extract the declarations of one CSS rule block, e.g. `.light { ... }`. */
function declarations(selector: string): string[] {
  const start = CSS.indexOf(selector);
  expect(start, `selector ${selector} present in globals.css`).toBeGreaterThan(
    -1,
  );
  const open = CSS.indexOf("{", start);
  const close = CSS.indexOf("}", open);
  expect(close, `block ${selector} is closed`).toBeGreaterThan(open);
  return CSS.slice(open + 1, close)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("--"));
}

function hexToChannels(hex: string): string {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(" ");
}

function tokensFor(selector: string) {
  const decls = declarations(selector);
  const tokens: Record<string, { hex: string; rgb?: string }> = {};
  for (const decl of decls) {
    const match = /^--ast-([a-z]+)(-rgb)?:\s*([^;]+);/.exec(decl);
    if (!match) continue;
    const [, name, isRgb, value] = match;
    tokens[name] = tokens[name] ?? { hex: "" };
    if (isRgb) tokens[name].rgb = value.trim();
    else tokens[name].hex = value.trim();
  }
  return tokens;
}

const THEMES = [
  [":root, .dark", "dark"],
  [".light", "light"],
] as const;

describe("ast-* colour tokens", () => {
  for (const [selector, label] of THEMES) {
    describe(`${label} theme (${selector})`, () => {
      const tokens = tokensFor(selector);

      it.each(COLOR_NAMES)("--ast-%s keeps its hex and gains an RGB triplet", (name) => {
        expect(tokens[name]?.hex, `--ast-${name} hex value`).toMatch(
          /^#[0-9a-f]{6}$/i,
        );
        expect(tokens[name]?.rgb, `--ast-${name}-rgb triplet`).toMatch(
          /^\d{1,3} \d{1,3} \d{1,3}$/,
        );
      });

      it.each(COLOR_NAMES)(
        "--ast-%s-rgb is derived exactly from --ast-%s",
        (name) => {
          expect(tokens[name]?.rgb).toBe(hexToChannels(tokens[name]?.hex ?? ""));
        },
      );
    });
  }

  it("tailwind maps every ast colour through the -rgb triplet + <alpha-value>", () => {
    for (const name of COLOR_NAMES) {
      expect(TAILWIND).toContain(
        `${name}: "rgb(var(--ast-${name}-rgb) / <alpha-value>)"`,
      );
    }
    // No bare `var(--ast-x)` colour mapping may survive: those silently
    // swallow opacity modifiers.
    expect(TAILWIND).not.toMatch(
      /^\s*(?:\/\/.*\n)*\s*(?:bg|surface|border|text|muted|accent|pink|mint|gold|pale|tag):\s*"(?!rgb\()/m,
    );
  });
});

// ── 10px/12px meta-text legibility floor ─────────────────────────────────
//
// PR #142 switched on the ast-*/alpha utilities. Some 10px meta call sites
// used translucent muted classes (text-ast-muted/50, /60) that render at
// 1.9–2.7:1 — well below WCAG AA (4.5:1 for text < 24px). Those sites were
// moved to opaque text-ast-muted, and the mint row-hover tint in FeedRow got
// a one-step-darker meta token while the tint is active.

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [
    number,
    number,
    number,
  ];
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(
  a: [number, number, number],
  b: [number, number, number],
): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

const readSource = (rel: string) =>
  readFileSync(path.join(ROOT, rel), "utf8");

describe("10px meta-text legibility floor (PR #142 follow-up)", () => {
  // Regression guard: the translucent muted utilities must not come back on
  // these specific small-text call sites.
  const FORBIDDEN: Array<[string, string]> = [
    ["src/components/Feed.tsx", "text-ast-muted/50"],
    ["src/app/auth/login/page.tsx", "text-ast-muted/50"],
    ["src/components/ClusterRow.tsx", "text-ast-muted/60"],
    ["src/components/CompanyTray.tsx", "text-ast-muted/60"],
  ];

  it.each(FORBIDDEN)("%s no longer uses %s", (file, cls) => {
    expect(readSource(file)).not.toContain(cls);
  });

  it("FeedRow meta steps darker while the mint hover/expanded tint is active", () => {
    const row = readSource("src/components/FeedRow.tsx");
    expect(row).toContain("group-hover:text-ast-text/80");
    expect(row).toContain('"text-ast-text/80"');
  });

  it.each(THEMES)(
    "opaque text-ast-muted clears WCAG AA (>=4.5) on bg in %s theme",
    (selector) => {
      const tokens = tokensFor(selector);
      const ratio = contrastRatio(
        hexToRgb(tokens.muted.hex),
        hexToRgb(tokens.bg.hex),
      );
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    },
  );
});
