import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        panel: "#11151c",
        panelLight: "#1a2029",
        accent: "#6c8cd5",
      },
    },
  },
  plugins: [],
};

export default config;
