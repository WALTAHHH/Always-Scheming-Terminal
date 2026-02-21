import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ast: {
          bg: "var(--ast-bg)",
          surface: "var(--ast-surface)",
          border: "var(--ast-border)",
          text: "var(--ast-text)",
          muted: "var(--ast-muted)",
          accent: "var(--ast-accent)",
          pink: "var(--ast-pink)",
          mint: "var(--ast-mint)",
          gold: "var(--ast-gold)",
          pale: "var(--ast-pale)",
          tag: "var(--ast-tag)",
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
