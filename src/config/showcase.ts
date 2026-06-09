/**
 * Showcase topics — accessible without a subscription. Single source of
 * truth on the Astro side; the Worker reads `SHOWCASE_PATHS` from
 * `workers/gate/wrangler.toml` (kept in sync). Per Pass B reshuffle:
 * three intuitive entry points — the first topic of each section.
 */

const PATHS = [
  "ortho/1",
  "trauma/1",
  "anatomy/1",
] as const;

/** Backwards-compatible Set form (used by Pass A's PaywallCard.astro). */
export const SHOWCASE_TOPICS = new Set<string>(PATHS);

/** Array form. */
export const SHOWCASE_PATHS = PATHS;

export type ShowcasePath = typeof PATHS[number];

export function isShowcase(section: string, n: number | string): boolean {
  return SHOWCASE_TOPICS.has(`${section}/${n}`);
}
