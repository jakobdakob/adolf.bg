import { getCollection, type CollectionEntry } from "astro:content";
import type { Lang } from "../i18n/ui";

export type TopicEntry = CollectionEntry<"topics">;

/** Slug local to a language, e.g. "ortho-1", "trauma-32", "preface". */
export function localSlug(entry: TopicEntry): string {
  // entry.slug is derived from file path: "en/ortho-1" etc.
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
  if (entry.data.kind === "preface") return `/${lang}/preface`;
  return `/${lang}/${entry.data.section}/${entry.data.topicNumber}`;
}

export function groupTopics(entries: TopicEntry[]) {
  const preface = entries.find((e) => e.data.kind === "preface");
  const ortho = entries.filter((e) => e.data.section === "ortho");
  const trauma = entries.filter((e) => e.data.section === "trauma");
  return { preface, ortho, trauma };
}
