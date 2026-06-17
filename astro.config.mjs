import { defineConfig } from "astro/config";

// Custom domain `adolf.bg` is live → serve at root, no base prefix.
// Set PAGES_BASE=/adolf.bg to build for the github.io fallback URL instead.
const base = process.env.PAGES_BASE ?? "";
const site = base ? "https://jakobdakob.github.io" : "https://adolf.bg";

export default defineConfig({
  site,
  base,
  trailingSlash: "always",
  build: {
    format: "directory",
  },
});
