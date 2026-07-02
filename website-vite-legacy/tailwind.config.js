/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        text: {
          DEFAULT: "#0f172a",
          muted: "#64748b",
          subtle: "#94a3b8",
        },
        surface: {
          DEFAULT: "#e2eef8",
          elevated: "#ffffff",
        },
        border: "#e2e8f0",
        primary: {
          DEFAULT: "#0284c7",
          hover: "#0369a1",
          light: "#0ea5e9",
        },
        success: "#15803d",
        error: "#b91c1c",
      },
      fontFamily: {
        sans: [
          "Inter",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Arial",
          "sans-serif",
        ],
      },
      borderRadius: {
        btn: "0.625rem",
        card: "1rem",
      },
      boxShadow: {
        card: "0 1px 3px rgba(0,0,0,0.08), 0 4px 12px rgba(0,0,0,0.04)",
        "card-hover":
          "0 4px 12px rgba(0,0,0,0.08), 0 8px 24px rgba(0,0,0,0.06)",
      },
      backgroundImage: {
        hero: "linear-gradient(160deg, #0ea5e9 0%, #0284c7 50%, #0369a1 100%)",
      },
    },
  },
  plugins: [],
};
