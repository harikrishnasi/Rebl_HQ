import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const archive = defineCollection({
  // one Astro collection across all seven section folders;
  // Decap registers each folder as its own collection for editing.
  loader: glob({ pattern: ['**/*.md', '!**/_*.md'], base: './src/content/archive' }),
  schema: z.object({
    title: z.string(),
    version: z.string(),
    status: z.enum(['draft', 'locked', 'superseded']),
    section: z.enum(['now', 'strategy', 'gtm', 'product', 'brand', 'research', 'company']),
    canonical: z.enum(['repo', 'notion', 'archive']).default('archive'),
    date: z.coerce.date(),
    summary: z.string(),
    supersedes: z.string().optional(),
  }),
});

export const collections = { archive };
