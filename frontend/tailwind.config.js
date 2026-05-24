/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bb: {
          bg: "#000000",
          panel: "#0b0b0b",
          header: "#111111",
          sidebar: "#080808",
          border: "#1e1e1e",
          divider: "#141414",
          text: "#e0e0e0",
          muted: "#666666",
          dim: "#383838",
          amber: "#ff8c00",
          "amber-dim": "#7a4300",
          green: "#00d04a",
          "green-dim": "#006626",
          red: "#ff3333",
          "red-dim": "#661414",
          cyan: "#22d3ee",
          orange: "#ff6600",
          blue: "#4da6ff",
          yellow: "#ffd700",
        },
      },
      fontFamily: {
        mono: [
          "JetBrains Mono",
          "Fira Code",
          "Consolas",
          "ui-monospace",
          "SFMono-Regular",
          "monospace",
        ],
      },
    },
  },
  plugins: [],
};
