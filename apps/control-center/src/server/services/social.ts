import { createClient } from '@supabase/supabase-js';

import type {
  SocialEpisodeSummary,
  SocialPerformanceResponse,
  SocialPlatformPerformance,
} from '../../shared/types.js';
import type { ControlCenterConfig } from '../config/env.js';

type SocialWindow = SocialPerformanceResponse['window'];

interface SocialPostRow {
  id: string;
  episode_id: string;
  platform: string;
  post_url: string | null;
  published_at: string;
  published_title: string | null;
  published_body: string;
  content_features: {
    mediaQuality?: { score?: number };
  } | null;
}

interface SocialMetricRow {
  social_post_id: string;
  captured_at: string;
  age_hours: number;
  views: number | null;
  impressions: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  details: {
    fiveSecondRetentionRate?: number;
    averageViewDurationSec?: number;
    coverCtr?: number;
  } | null;
}

interface AccountRow {
  platform: string;
  followers: number | null;
  captured_at: string;
}

const TARGET_HOURS: Record<Exclude<SocialWindow, 'latest'>, number> = {
  '24h': 24,
  '72h': 72,
  '7d': 168,
};

export async function loadSocialPerformance(input: {
  config: ControlCenterConfig;
  window?: SocialWindow;
  now?: Date;
}): Promise<SocialPerformanceResponse> {
  const now = input.now ?? new Date();
  const window = input.window ?? 'latest';
  const empty = emptyResponse(window, now);
  const { SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key } = input.config;
  if (!url || !key) {
    return empty;
  }

  try {
    const client = createClient(url, key, {
      db: { schema: input.config.SUPABASE_DB_SCHEMA },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const since = new Date(
      now.getTime() - 30 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const [postResult, metricResult, accountResult] = await Promise.all([
      client
        .from('social_posts')
        .select(
          'id,episode_id,platform,post_url,published_at,published_title,published_body,content_features',
        )
        .gte('published_at', since)
        .order('published_at', { ascending: false })
        .limit(100),
      client
        .from('social_post_metrics')
        .select(
          'social_post_id,captured_at,age_hours,views,impressions,likes,comments,shares,saves,details',
        )
        .gte('captured_at', since)
        .order('captured_at', { ascending: false })
        .limit(1_000),
      client
        .from('social_account_snapshots')
        .select('platform,followers,captured_at')
        .order('captured_at', { ascending: false })
        .limit(100),
    ]);
    const error = postResult.error ?? metricResult.error ?? accountResult.error;
    if (error) {
      throw error;
    }

    return {
      status: 'ok',
      message: null,
      window,
      generatedAt: now.toISOString(),
      accounts: latestAccounts((accountResult.data ?? []) as AccountRow[]),
      episodes: buildEpisodes(
        (postResult.data ?? []) as SocialPostRow[],
        (metricResult.data ?? []) as SocialMetricRow[],
        window,
      ),
    };
  } catch {
    return {
      ...empty,
      status: 'error',
      message: 'Social telemetry request failed',
    };
  }
}

function emptyResponse(
  window: SocialWindow,
  now: Date,
): SocialPerformanceResponse {
  return {
    status: 'unconfigured',
    message: 'Supabase social telemetry is not connected',
    window,
    generatedAt: now.toISOString(),
    accounts: [],
    episodes: [],
  };
}

function latestAccounts(rows: AccountRow[]) {
  const seen = new Set<string>();
  return rows
    .filter((row) => {
      if (seen.has(row.platform)) {
        return false;
      }
      seen.add(row.platform);
      return true;
    })
    .map((row) => ({
      platform: row.platform,
      followers: row.followers,
      capturedAt: row.captured_at,
    }));
}

function buildEpisodes(
  posts: SocialPostRow[],
  metrics: SocialMetricRow[],
  window: SocialWindow,
): SocialEpisodeSummary[] {
  const metricsByPost = new Map<string, SocialMetricRow[]>();
  for (const metric of metrics) {
    const entries = metricsByPost.get(metric.social_post_id) ?? [];
    entries.push(metric);
    metricsByPost.set(metric.social_post_id, entries);
  }

  const episodes = new Map<
    string,
    {
      title: string;
      publishedAt: string;
      platforms: SocialPlatformPerformance[];
    }
  >();
  for (const post of posts) {
    const metric = selectMetric(metricsByPost.get(post.id) ?? [], window);
    if (!metric) {
      continue;
    }
    const existing = episodes.get(post.episode_id) ?? {
      title:
        post.published_title?.trim() ||
        post.published_body.split('\n')[0]?.slice(0, 80) ||
        'Untitled episode',
      publishedAt: post.published_at,
      platforms: [],
    };
    existing.platforms.push(toPerformance(post, metric));
    episodes.set(post.episode_id, existing);
  }

  return [...episodes.entries()]
    .map(([episodeId, episode]) => ({
      publishedAt: episode.publishedAt,
      summary: {
        episodeId,
        title: episode.title,
        totalViews: sumKnown(episode.platforms.map((row) => row.views)),
        totalImpressions: sumKnown(
          episode.platforms.map((row) => row.impressions),
        ),
        platforms: episode.platforms,
      },
    }))
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
    .map((entry) => entry.summary);
}

function selectMetric(
  rows: SocialMetricRow[],
  window: SocialWindow,
): SocialMetricRow | null {
  if (rows.length === 0) {
    return null;
  }
  if (window === 'latest') {
    return [...rows].sort(
      (a, b) => Date.parse(b.captured_at) - Date.parse(a.captured_at),
    )[0]!;
  }
  return [...rows].sort(
    (a, b) =>
      Math.abs(a.age_hours - TARGET_HOURS[window]) -
      Math.abs(b.age_hours - TARGET_HOURS[window]),
  )[0]!;
}

function toPerformance(
  post: SocialPostRow,
  metric: SocialMetricRow,
): SocialPlatformPerformance {
  const engagements = sumKnown([
    metric.likes,
    metric.comments,
    metric.shares,
    metric.saves,
  ]);
  const denominator = metric.impressions ?? metric.views;
  return {
    platform: post.platform,
    postUrl: post.post_url,
    views: metric.views,
    impressions: metric.impressions,
    engagementRate:
      engagements !== null && denominator !== null && denominator > 0
        ? engagements / denominator
        : null,
    fiveSecondRetentionRate: metric.details?.fiveSecondRetentionRate ?? null,
    averageViewDurationSec: metric.details?.averageViewDurationSec ?? null,
    coverCtr: metric.details?.coverCtr ?? null,
    technicalQualityScore: post.content_features?.mediaQuality?.score ?? null,
  };
}

function sumKnown(values: Array<number | null>): number | null {
  const known = values.filter((value): value is number => value !== null);
  return known.length ? known.reduce((sum, value) => sum + value, 0) : null;
}
