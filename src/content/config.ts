import { defineCollection, z } from "astro:content";

const topics = defineCollection({
  type: "content",
  schema: z.object({
    title: z.string(),
    lang: z.enum(["en", "bg"]),
    kind: z.enum(["topic", "preface"]),
    section: z.enum(["ortho", "trauma", "anatomy"]).optional(),
    topicNumber: z.number().int().optional(),
    order: z.number().int(),
  }),
});

export const collections = { topics };
