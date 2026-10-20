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
        brand: {
          50: "#eef2ff",
          100: "#e0e7ff",
          500: "#4f46e5",
          600: "#4338ca",
          700: "#3730a3",
        },
        sidebar: {
          bg: "#ffffff",
          hover: "#f3f4f6",
          active: "#eff6ff",
        }
      },
      boxShadow: {
        soft: "0 4px 24px -2px rgba(16, 24, 40, 0.08)",
        card: "0 2px 12px -1px rgba(0, 0, 0, 0.06)",
        float: "0 20px 40px -10px rgba(0, 0, 0, 0.12)",
      }
    },
  },
  plugins: [],
};
export default config;
