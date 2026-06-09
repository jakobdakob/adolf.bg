/**
 * Showcase topics — free for all readers, no paywall.
 *
 * Pass A note: these are the same four topics already linked from the
 * homepage as the BG/EN "previews". They remain fully unlocked, while
 * every other topic gets the locked variant in Pass B. For Pass A the
 * lock variant is only visible via the `?preview=locked` query flag
 * (see TopicLayout.astro inline script) so Jakob can QA the UX without
 * affecting real visitors.
 */
export const SHOWCASE_TOPICS = new Set([
  "ortho/22",
  "trauma/1",
  "anatomy/8",
  "ortho/11",
]);

export function isShowcase(section: string, n: number | string): boolean {
  return SHOWCASE_TOPICS.has(`${section}/${n}`);
}
