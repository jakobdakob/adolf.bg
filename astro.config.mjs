import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import tailwind from "@astrojs/tailwind";

// Use the `/adolf.bg` base when serving on the github.io fallback URL,
// and an empty base when the custom domain `adolf.bg` is wired up.
// Override via env: PAGES_BASE=/adolf.bg (default) or PAGES_BASE=""
const base = process.env.PAGES_BASE ?? "/adolf.bg";
const site = base ? "https://jakobdakob.github.io" : "https://adolf.bg";

export default defineConfig({
  site,
  base,
  trailingSlash: "ignore",
  integrations: [mdx(), tailwind()],
  build: {
    format: "directory",
  },
  vite: {
    build: {
      cssCodeSplit: false,
    },
  },
});
