import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ast: {
          bg: "#0a0a0f",
          surface: "#1e1e1e",
          border: "#2a2a2a",
          text: "#d4d4d4",
          muted: "#888888",
          accent: "#77c4d9",
          pink: "#dd72dd",
          mint: "#6decb9",
          gold: "#f2cb05",
          pale: "#f3ece9",
          tag: "#1a1a2e",
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
