// Accent rule: gold marks current location and primary action ONLY —
// active module, active tab edge, palette selection, focused primary button,
// fuzzy-match characters. Never decorative.

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        adaka: {
          bg: "#16130F",
          chrome: "#1C1814",
          border: "#2A241D",
          "border-strong": "#3A332A",
          text: "#E8E2D9",
          muted: "#8A8178",
          faint: "#6B6258",
          gold: "#D4A24E",
          "on-gold": "#241A08",
          success: "#7BA05B",
          error: "#C25B4E",
          warn: "#E8A23D",
        },
      },
    },
  },
  plugins: [],
};
