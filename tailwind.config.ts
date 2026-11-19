import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    // Literal class maps live here (e.g. src/lib/chip-styles.ts); Tailwind
    // scans file content, not import graphs, so this dir must be included or
    // those classes are never emitted.
    "./src/lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Values resolve through the RGB channel triplets defined in
        // src/app/globals.css so Tailwind can emit opacity modifiers
        // (bg-ast-bg/95, hover:bg-ast-mint/5, ...). Solid utilities get
        // `<alpha-value>` = 1 and render the identical colour.
        ast: {
          bg: "rgb(var(--ast-bg-rgb) / <alpha-value>)",
          surface: "rgb(var(--ast-surface-rgb) / <alpha-value>)",
          border: "rgb(var(--ast-border-rgb) / <alpha-value>)",
          text: "rgb(var(--ast-text-rgb) / <alpha-value>)",
          muted: "rgb(var(--ast-muted-rgb) / <alpha-value>)",
          accent: "rgb(var(--ast-accent-rgb) / <alpha-value>)",
          pink: "rgb(var(--ast-pink-rgb) / <alpha-value>)",
          mint: "rgb(var(--ast-mint-rgb) / <alpha-value>)",
          gold: "rgb(var(--ast-gold-rgb) / <alpha-value>)",
          pale: "rgb(var(--ast-pale-rgb) / <alpha-value>)",
          tag: "rgb(var(--ast-tag-rgb) / <alpha-value>)",
        },
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', "Fira Code", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
