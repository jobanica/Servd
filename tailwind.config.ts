import type { Config } from "tailwindcss";

/**
 * Tailwind is wired to CSS variables instead of hard-coded hex values.
 *
 * WHY: the platform (Servd) and each restaurant (white-label) share the same
 * components but need different colors. We define the Servd palette as the
 * DEFAULT values of these variables in globals.css, and on diner-facing pages
 * we override `--brand-*` at runtime with the restaurant's own colors.
 * Same Tailwind classes, different brand — no conditional styling needed.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Servd platform palette (fixed)
        mango: "#FF8A1E",
        guava: "#FF4D6D",
        "plum-ink": "#2B1124",
        cream: "#FFF6EC",
        muted: "#A9959F",
        // Brand-aware tokens (overridable per restaurant via CSS vars)
        brand: {
          primary: "var(--brand-primary)",
          accent: "var(--brand-accent)",
          ink: "var(--brand-ink)",
          surface: "var(--brand-surface)",
        },
      },
      backgroundImage: {
        // The Servd signature gradient. Use sparingly (icon tile, primary CTA).
        "brand-gradient": "var(--brand-gradient)",
      },
      fontFamily: {
        // Outfit = wordmark/headings, Inter = UI/body. Loaded via next/font.
        heading: ["var(--font-outfit)", "system-ui", "sans-serif"],
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        tile: "1.5rem",
      },
    },
  },
  plugins: [],
};

export default config;
