// Showcase topics — accessible without a subscription.
//
// Single source of truth on the Astro side. Keep in sync with the Worker's
// SHOWCASE_PATHS env var in workers/gate/wrangler.toml. The Worker uses
// SHOWCASE_PATHS as the authoritative gate; this file is for the Astro
// site to know which topics to label as free (e.g. for the test-yourself
// CTA wiring on TopicLayout, or any future UI affordances).
//
// Format: `<section>/<n>` — section in {ortho, trauma, anatomy}, n is the
// topic number (1-indexed). Three entries: the first topic of each
// section, chosen as intuitive entry points.

export const SHOWCASE_PATHS = [
  "ortho/1",
  "trauma/1",
  "anatomy/1",
] as const;

export type ShowcasePath = typeof SHOWCASE_PATHS[number];

export function isShowcase(section: string, n: number | string): boolean {
  const key = `${section}/${n}`;
  return (SHOWCASE_PATHS as readonly string[]).includes(key);
}
