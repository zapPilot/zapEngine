import { z } from 'zod';

import type { Http } from './http.js';

const episodeSchema = z.object({
  id: z.uuid(),
  title: z.string().min(1),
  script: z.string().min(1),
});
export type Episode = z.infer<typeof episodeSchema>;

export function createPodcast(http: Http, baseUrl: string) {
  const base = baseUrl.replace(/\/$/, '');
  return {
    episode: async (id: string): Promise<Episode> =>
      episodeSchema.parse(
        await http.getJson(
          `${base}/episodes/${encodeURIComponent(id)}?language=en`,
        ),
      ),
    smartLink: (id: string) => `${base}/e/${id}?lang=en`,
  };
}
