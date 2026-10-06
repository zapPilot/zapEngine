import type { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { ControlCenterConfig } from '../../config/env.js';
import { requireServiceRoleClient } from '../supabase.js';
import { readAllPages, readInChunks } from '../supabase-reads.js';

const postSchema = z.object({
  id: z.string(),
  episode_id: z.string(),
  platform: z.string(),
  language_code: z.string().nullable(),
  published_at: z.string().datetime({ offset: true }),
  published_title: z.string().nullable(),
  review_status: z.string().nullable(),
});
const metricSchema = z.object({
  social_post_id: z.string(),
  collection_status: z.string().nullable(),
  views: z.number().nonnegative().nullable(),
  likes: z.number().nonnegative().nullable(),
  comments: z.number().nonnegative().nullable(),
  shares: z.number().nonnegative().nullable(),
  saves: z.number().nonnegative().nullable(),
});
const localizationSchema = z.object({
  id: z.string(),
  episode_id: z.string(),
  title: z.string().nullable(),
});
const videoSchema = z.object({
  episode_localization_id: z.string(),
  episode_id: z.string(),
  status: z.string(),
  thumbnail_url: z.string().nullable(),
  completed_at: z.string().datetime({ offset: true }).nullable(),
  coverPhoto: z
    .object({
      sha256: z.string().nullable().optional(),
      status: z.string().nullable().optional(),
      sourceImageUrl: z.string().nullable().optional(),
      fallbackReason: z.string().nullable().optional(),
    })
    .nullable(),
});
export interface ContentPackagingEvidence {
  posts: z.infer<typeof postSchema>[];
  metrics: z.infer<typeof metricSchema>[];
  localizations: z.infer<typeof localizationSchema>[];
  videos: z.infer<typeof videoSchema>[];
}
export async function readContentPackagingEvidence(input: {
  config: ControlCenterConfig;
  now: Date;
  createSupabaseClient?: typeof createClient;
}): Promise<ContentPackagingEvidence> {
  const client = requireServiceRoleClient(
    input.config,
    input.createSupabaseClient,
  );
  const posts = z.array(postSchema).parse(
    await readAllPages(() =>
      client
        .from('social_posts')
        .select(
          'id,episode_id,platform,language_code,published_at,published_title,review_status',
        )
        .gte(
          'published_at',
          new Date(input.now.getTime() - 60 * 86_400_000).toISOString(),
        ),
    ),
  );
  const episodeIds = posts.map((post) => post.episode_id);
  const [metrics, localizations, videos] = await Promise.all([
    readInChunks(
      posts.map((post) => post.id),
      (ids) =>
        client
          .from('social_post_metrics')
          .select(
            'social_post_id,collection_status,views,likes,comments,shares,saves',
          )
          .eq('measurement_window', '24h')
          .in('social_post_id', ids),
    ),
    readInChunks(episodeIds, (ids) =>
      client
        .from('episode_localizations')
        .select('id,episode_id,title')
        .eq('language_code', 'zh-Hant')
        .in('episode_id', ids),
    ),
    readInChunks(episodeIds, (ids) =>
      client
        .from('episode_videos')
        .select(
          'episode_localization_id,episode_id,status,thumbnail_url,completed_at,coverPhoto:manifest->coverPhoto',
        )
        .in('episode_id', ids),
    ),
  ]);
  return {
    posts,
    metrics: z.array(metricSchema).parse(metrics),
    localizations: z.array(localizationSchema).parse(localizations),
    videos: z.array(videoSchema).parse(videos),
  };
}
