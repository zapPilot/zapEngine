import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import {
  GROWTH_LANE_CAP,
  type GrowthLaneFunnel,
} from '../../../shared/growth.js';
import type { SocialWaitlistSummary } from '../../../shared/waitlist-growth.js';
import type { ControlCenterConfig } from '../../config/env.js';
import { postTitle } from '../social.js';
import type { PosthogLaneReading } from './posthog.js';

const postSchema = z.object({
  episode_id: z.string(),
  platform: z.string(),
  language_code: z.string().nullable(),
  published_at: z.string(),
  post_url: z.string().nullable(),
  published_title: z.string().nullable(),
  published_body: z.string(),
});
type GrowthPost = z.infer<typeof postSchema>;

export async function readRecentSocialPosts(input: {
  config: ControlCenterConfig;
  now: Date;
  createSupabaseClient?: typeof createClient;
}): Promise<GrowthPost[]> {
  const { SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key } = input.config;
  if (!url || !key) {
    throw new Error('Supabase is not connected');
  }
  const client = (input.createSupabaseClient ?? createClient)(url, key, {
    db: { schema: input.config.SUPABASE_DB_SCHEMA },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const result = await client
    .from('social_posts')
    .select(
      'episode_id,platform,language_code,published_at,post_url,published_title,published_body',
    )
    .gte(
      'published_at',
      new Date(input.now.getTime() - 30 * 86_400_000).toISOString(),
    )
    .order('published_at', { ascending: false })
    .limit(500);
  if (result.error) {
    throw result.error;
  }
  return z.array(postSchema).parse(result.data ?? []);
}

/** Missing providers yield null, while a successfully read provider with no row yields zero. */
export function composeGrowthLanes(input: {
  posthog: PosthogLaneReading[] | null;
  posts: GrowthPost[] | null;
  waitlist: SocialWaitlistSummary;
}): GrowthLaneFunnel[] {
  const lanes = new Map<string, GrowthLaneFunnel>();
  function lane(
    episodeId: string,
    rawPlatform: string,
    rawLanguage: string | null,
  ) {
    const platform = rawPlatform.trim().toLowerCase() || 'unknown';
    const languageCode = rawLanguage?.trim() || 'unknown';
    // Rednote publishes no outbound links and cannot contribute a social acquisition lane.
    if (platform === 'rednote') {
      return null;
    }
    const key = JSON.stringify([episodeId, platform, languageCode]);
    let row = lanes.get(key);
    if (!row) {
      row = {
        episodeId,
        platform,
        languageCode,
        title: null,
        publishedAt: null,
        postUrl: null,
        landingVisitors30d: input.posthog === null ? null : 0,
        ctaUsers30d: input.posthog === null ? null : 0,
        discordCtaUsers30d: input.posthog === null ? null : 0,
        waitlistSignups: input.waitlist.status === 'ok' ? 0 : null,
      };
      lanes.set(key, row);
    }
    return row;
  }
  for (const reading of input.posthog ?? []) {
    const row = lane(reading.episodeId, reading.platform, reading.languageCode);
    if (row) {
      row.landingVisitors30d =
        (row.landingVisitors30d ?? 0) + reading.landingVisitors30d;
      row.ctaUsers30d = (row.ctaUsers30d ?? 0) + reading.ctaUsers30d;
      row.discordCtaUsers30d =
        (row.discordCtaUsers30d ?? 0) + reading.discordCtaUsers30d;
    }
  }
  for (const post of input.posts ?? []) {
    const row = lane(post.episode_id, post.platform, post.language_code);
    if (
      row &&
      (row.publishedAt === null || post.published_at > row.publishedAt)
    ) {
      row.title = postTitle(post);
      row.publishedAt = post.published_at;
      row.postUrl = post.post_url;
    }
  }
  for (const conversion of input.waitlist.conversions) {
    const row = lane(
      conversion.episodeId,
      conversion.platform,
      conversion.languageCode,
    );
    if (row) {
      row.waitlistSignups = (row.waitlistSignups ?? 0) + conversion.signups;
    }
  }
  return [...lanes.values()]
    .sort(
      (a, b) =>
        (b.publishedAt ?? '').localeCompare(a.publishedAt ?? '') ||
        a.platform.localeCompare(b.platform) ||
        a.languageCode.localeCompare(b.languageCode) ||
        a.episodeId.localeCompare(b.episodeId),
    )
    .slice(0, GROWTH_LANE_CAP);
}
