import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import tailwind from "@astrojs/tailwind";
import sitemap from "@astrojs/sitemap";

// Custom domain `adolf.bg` is live → serve at root, no base prefix.
// Set PAGES_BASE=/adolf.bg to build for the github.io fallback URL instead.
const base = process.env.PAGES_BASE ?? "";
const site = base ? "https://jakobdakob.github.io" : "https://adolf.bg";

export default defineConfig({
  site,
  base,
  trailingSlash: "always",
  integrations: [
    mdx(),
    tailwind(),
    sitemap({
      i18n: {
        defaultLocale: "bg",
        locales: { bg: "bg-BG", en: "en-US" },
      },
    }),
  ],
  build: {
    format: "directory",
  },
  vite: {
    build: {
      cssCodeSplit: false,
    },
  },
});
