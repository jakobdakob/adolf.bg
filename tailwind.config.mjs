/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{astro,html,js,jsx,md,mdx,ts,tsx}"],
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: "#FAF9F7",
          dark: "#15141A",
        },
        ink: {
          DEFAULT: "#1d1d1f",
          muted: "#5C5B61",
          dark: "#EDECE6",
          mutedDark: "#9D9CA3",
        },
        accent: {
          DEFAULT: "#0F8C7A",
          soft: "#E6F2F0",
          softDark: "#142A28",
        },
        rule: {
          DEFAULT: "#EAE7E0",
          dark: "#272631",
        },
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "Inter",
          "SF Pro Text",
          "Segoe UI",
          "Roboto",
          "system-ui",
          "sans-serif",
        ],
        serif: [
          "ui-serif",
          "Georgia",
          "Cambria",
          "Times New Roman",
          "serif",
        ],
      },
      maxWidth: {
        prose: "70ch",
      },
      typography: () => ({}),
    },
  },
  plugins: [],
};
