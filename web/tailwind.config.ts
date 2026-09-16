import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        cobalt: "#0047FF",
        "cobalt-soft": "#3D6BFF",
        "cobalt-dark": "#0033B8",
        steel: "#8A8F98",
        "verified-green": "#00C48C",
        ink: "#0A0E1A",
        "ink-deep": "#050710",
        "ink-soft": "#161B26",
      },
    },
  },
  plugins: [],
};

export default config;
