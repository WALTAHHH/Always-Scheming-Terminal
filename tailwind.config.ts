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
          surface: "#12121a",
          border: "#1e1e2e",
          text: "#e0e0e0",
          muted: "#888888",
          accent: "#77c4d9",
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
