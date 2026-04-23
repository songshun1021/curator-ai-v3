import type { Config } from "tailwindcss";

/**
 * Curator AI · Tailwind config
 * Source of truth for design language: docs/DESIGN.md (v2.0 Liquid Glass).
 * Tokens live in src/app/globals.css :root and are exposed here via var() so
 * arbitrary utilities stay in one place.
 */
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
        canvas: "var(--bg-canvas)",
        "canvas-deep": "var(--bg-canvas-deep)",
        primary: {
          DEFAULT: "var(--color-primary)",
          hover: "var(--color-primary-hover)",
          press: "var(--color-primary-press)",
          tint: "var(--color-primary-tint)",
          glow: "var(--color-primary-glow)",
          foreground: "var(--text-on-primary)",
        },
        danger: {
          DEFAULT: "var(--color-danger)",
          hover: "var(--color-danger-hover)",
          tint: "var(--color-danger-tint)",
          foreground: "var(--text-on-danger)",
        },
        text: {
          title: "var(--text-title)",
          body: "var(--text-body)",
          muted: "var(--text-muted)",
          subtle: "var(--text-subtle)",
        },
        line: {
          hair: "var(--line-hair)",
          strong: "var(--line-strong)",
        },
      },
      borderRadius: {
        panel: "var(--radius-panel)",
        subpanel: "var(--radius-subpanel)",
        card: "var(--radius-card)",
        control: "var(--radius-control)",
        pill: "var(--radius-pill)",
      },
      boxShadow: {
        "lens-contact": "var(--lensing-contact)",
        "lens-drop": "var(--lensing-drop)",
        "lens-drop-hover": "var(--lensing-drop-hover)",
        "lens-drop-active": "var(--lensing-drop-active)",
      },
      transitionTimingFunction: {
        glass: "var(--ease-glass)",
        morph: "var(--ease-morph)",
      },
      transitionDuration: {
        fast: "var(--dur-fast)",
        base: "var(--dur-base)",
        morph: "var(--dur-morph)",
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic":
          "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
      },
      backdropBlur: {
        panel: "var(--glass-panel-blur)",
        subpanel: "var(--glass-subpanel-blur)",
        soft: "var(--glass-soft-blur)",
        inline: "var(--glass-inline-blur)",
      },
      keyframes: {
        morphIn: {
          from: { opacity: "0", transform: "scale(0.96)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        morphOut: {
          from: { opacity: "1", transform: "scale(1)" },
          to: { opacity: "0", transform: "scale(0.98)" },
        },
      },
      animation: {
        "morph-in": "morphIn var(--dur-morph) var(--ease-morph) both",
        "morph-out": "morphOut var(--dur-base) var(--ease-morph) both",
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
};
export default config;
