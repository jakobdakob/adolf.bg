import { defineCollection, z } from "astro:content";

const topics = defineCollection({
  type: "content",
  schema: z.object({
    title: z.string(),
    section: z.enum(["orthopaedics", "traumatology", "anatomy"]),
    order: z.number().int(),
    status: z.enum(["coming-soon", "draft", "published"]).default("coming-soon"),
  }),
});

export const collections = { topics };
