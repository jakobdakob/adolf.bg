import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import tailwind from "@astrojs/tailwind";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: "https://adolf.bg",
  trailingSlash: "ignore",
  integrations: [mdx(), tailwind(), sitemap()],
  build: {
    format: "directory",
  },
  vite: {
    build: {
      cssCodeSplit: false,
    },
  },
});
