import type { SocialPostMetricRow, SocialPostRow } from '../types.js';
import type { SocialPlatform } from './types.js';

export const SOCIAL_METRIC_WINDOWS = ['latest', '24h', '72h', '7d'] as const;
export type SocialMetricWindow = (typeof SOCIAL_METRIC_WINDOWS)[number];

const WINDOW_TARGET_HOURS: Record<
  Exclude<SocialMetricWindow, 'latest'>,
  number
> = {
  '24h': 24,
  '72h': 72,
  '7d': 168,
};

// jscpd:ignore-start — the camelCase metric totals mirror the snake_case
// `SocialPostMetricRow` columns whose names are identical in both spellings.
// The row type pins the DDL column list in socialPostsMigration.test.ts, while
// this is a derived per-platform performance view; merging the shared field
// names would couple the computed view to the persistence row shape (same
// rationale as the ignore block in ../types.ts).
export interface SocialPostPerformance {
  postId: string;
  episodeId: string;
  platform: SocialPlatform;
  postUrl: string | null;
  publishedAt: string;
  ageHours: number;
  title: string | null;
  views: number | null;
  impressions: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  engagements: number | null;
  engagementRate: number | null;
  engagementRateBasis: 'impressions' | 'views' | null;
  coverCtr: number | null;
  technicalQualityScore: number | null;
  fiveSecondRetentionRate: number | null;
  averageViewDurationSec: number | null;
  averageViewPercentage: number | null;
  audienceDemographics:
    | SocialPostMetricRow['details']['audienceDemographics']
    | null;
}
// jscpd:ignore-end

export interface EpisodeSocialPerformance {
  episodeId: string;
  title: string;
  totalViews: number | null;
  totalImpressions: number | null;
  platforms: SocialPostPerformance[];
}

export function buildSocialPerformance(input: {
  posts: readonly SocialPostRow[];
  metrics: readonly SocialPostMetricRow[];
  window: SocialMetricWindow;
}): EpisodeSocialPerformance[] {
  const metricsByPost = new Map<string, SocialPostMetricRow[]>();
  for (const metric of input.metrics) {
    const rows = metricsByPost.get(metric.social_post_id) ?? [];
    rows.push(metric);
    metricsByPost.set(metric.social_post_id, rows);
  }

  const byEpisode = new Map<string, SocialPostPerformance[]>();
  const sourcePostsByEpisode = new Map<string, SocialPostRow[]>();
  for (const post of input.posts) {
    const metric = selectMetricSnapshot(
      metricsByPost.get(post.id) ?? [],
      input.window,
    );
    if (!metric) continue;
    const performance = toPostPerformance(post, metric);
    const rows = byEpisode.get(post.episode_id) ?? [];
    rows.push(performance);
    byEpisode.set(post.episode_id, rows);
    const sourcePosts = sourcePostsByEpisode.get(post.episode_id) ?? [];
    sourcePosts.push(post);
    sourcePostsByEpisode.set(post.episode_id, sourcePosts);
  }

  return [...byEpisode.entries()]
    .map(([episodeId, platforms]) => {
      const sortedPlatforms = [...platforms].sort(
        (a, b) => b.ageHours - a.ageHours,
      );
      return {
        episodeId,
        title: episodeTitle(sourcePostsByEpisode.get(episodeId) ?? []),
        totalViews: sumKnown(platforms.map((row) => row.views)),
        totalImpressions: sumKnown(platforms.map((row) => row.impressions)),
        platforms: sortedPlatforms,
      };
    })
    .sort((a, b) => (b.totalViews ?? -1) - (a.totalViews ?? -1));
}

export function selectMetricSnapshot(
  metrics: readonly SocialPostMetricRow[],
  window: SocialMetricWindow,
): SocialPostMetricRow | null {
  if (metrics.length === 0) return null;
  if (window === 'latest') {
    return [...metrics].sort(
      (a, b) => Date.parse(b.captured_at) - Date.parse(a.captured_at),
    )[0]!;
  }
  const target = WINDOW_TARGET_HOURS[window];
  return [...metrics].sort(
    (a, b) => Math.abs(a.age_hours - target) - Math.abs(b.age_hours - target),
  )[0]!;
}

function toPostPerformance(
  post: SocialPostRow,
  metric: SocialPostMetricRow,
): SocialPostPerformance {
  const engagementValues = [
    metric.likes,
    metric.comments,
    metric.shares,
    metric.saves,
  ];
  const engagements = sumKnown(engagementValues);
  const denominator = metric.impressions ?? metric.views;
  let engagementRateBasis: 'impressions' | 'views' | null = null;
  if (metric.impressions !== null) {
    engagementRateBasis = 'impressions';
  } else if (metric.views !== null) {
    engagementRateBasis = 'views';
  }

  // Historical rows captured before migration 028 do not have the details
  // JSONB column. Keep their common counters usable in the dashboard.
  const details = metric.details ?? {};

  return {
    postId: post.id,
    episodeId: post.episode_id,
    platform: post.platform,
    postUrl: post.post_url,
    publishedAt: post.published_at,
    ageHours: metric.age_hours,
    title: post.published_title,
    views: metric.views,
    impressions: metric.impressions,
    likes: metric.likes,
    comments: metric.comments,
    shares: metric.shares,
    saves: metric.saves,
    engagements,
    engagementRate:
      engagements !== null && denominator !== null && denominator > 0
        ? engagements / denominator
        : null,
    engagementRateBasis,
    coverCtr: details.coverCtr ?? null,
    technicalQualityScore: post.content_features.mediaQuality?.score ?? null,
    fiveSecondRetentionRate: details.fiveSecondRetentionRate ?? null,
    averageViewDurationSec: details.averageViewDurationSec ?? null,
    averageViewPercentage: details.averageViewPercentage ?? null,
    audienceDemographics: details.audienceDemographics ?? null,
  };
}

function episodeTitle(posts: readonly SocialPostRow[]): string {
  const titled = posts.find((post) => post.published_title?.trim());
  if (titled?.published_title) return titled.published_title;
  const body = posts[0]?.published_body.trim();
  return body ? body.split('\n')[0]!.slice(0, 80) : 'Untitled episode';
}

function sumKnown(values: readonly (number | null)[]): number | null {
  const known = values.filter((value): value is number => value !== null);
  return known.length ? known.reduce((sum, value) => sum + value, 0) : null;
}
