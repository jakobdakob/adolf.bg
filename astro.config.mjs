import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import tailwind from "@astrojs/tailwind";

export default defineConfig({
  site: "https://adolf.bg",
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
