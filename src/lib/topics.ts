import { getCollection, type CollectionEntry } from "astro:content";
import type { Lang } from "../i18n/ui";

export type TopicEntry = CollectionEntry<"topics">;

/** Prefix any internal path with Astro's configured base. */
export function url(path: string): string {
  const base = import.meta.env.BASE_URL || "/";
  const a = base.endsWith("/") ? base.slice(0, -1) : base;
  const b = path.startsWith("/") ? path : `/${path}`;
  return `${a}${b}` || "/";
}

/** Slug local to a language, e.g. "ortho-1", "trauma-32", "preface". */
export function localSlug(entry: TopicEntry): string {
  const m = entry.slug.match(/^(?:en|bg)\/(.+)$/);
  return m ? m[1] : entry.slug;
}

export async function getTopicsByLang(lang: Lang): Promise<TopicEntry[]> {
  const all = await getCollection("topics");
  return all
    .filter((e) => e.data.lang === lang)
    .sort((a, b) => a.data.order - b.data.order);
}

export async function getTopicByLocalSlug(
  lang: Lang,
  slug: string,
): Promise<TopicEntry | undefined> {
  const list = await getTopicsByLang(lang);
  return list.find((e) => localSlug(e) === slug);
}

export function topicPath(lang: Lang, entry: TopicEntry): string {
  if (entry.data.kind === "preface") return url(`/${lang}/preface`);
  return url(`/${lang}/${entry.data.section}/${entry.data.topicNumber}`);
}

export function langHome(lang: Lang): string {
  return url(`/${lang}/`);
}

export function otherLangPath(lang: Lang, entry?: TopicEntry): string {
  const other = lang === "bg" ? "en" : "bg";
  if (!entry) return url(`/${other}/`);
  if (entry.data.kind === "preface") return url(`/${other}/preface`);
  return url(`/${other}/${entry.data.section}/${entry.data.topicNumber}`);
}

export function groupTopics(entries: TopicEntry[]) {
  const preface = entries.find((e) => e.data.kind === "preface");
  const ortho = entries.filter((e) => e.data.section === "ortho");
  const trauma = entries.filter((e) => e.data.section === "trauma");
  return { preface, ortho, trauma };
}
