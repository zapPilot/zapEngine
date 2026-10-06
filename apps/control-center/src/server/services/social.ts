import type {
  SocialEpisodeSummary,
  SocialMetricWindow,
  SocialPerformanceResponse,
  SocialPlatformPerformance,
} from '../../shared/types.js';
import type { ControlCenterConfig } from '../config/env.js';
import { createServiceRoleClient } from './supabase.js';
import { sumKnown } from './numbers.js';

type SocialWindow = SocialPerformanceResponse['window'];

interface SocialPostRow {
  id: string;
  episode_id: string;
  platform: string;
  language_code: string | null;
  post_url: string | null;
  published_at: string;
  published_title: string | null;
  published_body: string;
  review_status: string | null;
}

interface SocialMetricRow extends Pick<
  SocialPlatformPerformance,
  'views' | 'likes' | 'comments' | 'shares' | 'saves'
> {
  social_post_id: string;
  captured_at: string;
  age_hours: number;
  measurement_window: string | null;
  collection_status?: string | null;
  impressions: number | null;
  followers_gained: number | null;
  details: {
    averageViewDurationSec?: number;
    averageViewPercentage?: number;
  } | null;
}

interface AccountRow {
  platform: string;
  followers: number | null;
  captured_at: string;
}

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
    const client = createServiceRoleClient(
      url,
      key,
      input.config.SUPABASE_DB_SCHEMA,
    );
    const since = new Date(
      now.getTime() - 60 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const [postResult, metricResult, accountResult] = await Promise.all([
      client
        .from('social_posts')
        .select(
          'id,episode_id,platform,language_code,post_url,published_at,published_title,published_body,review_status',
        )
        .gte('published_at', since)
        .order('published_at', { ascending: false })
        .limit(300),
      client
        .from('social_post_metrics')
        .select(
          'social_post_id,captured_at,age_hours,measurement_window,collection_status,views,impressions,likes,comments,shares,saves,followers_gained,details',
        )
        .gte('captured_at', since)
        .not('measurement_window', 'is', null)
        .order('captured_at', { ascending: false })
        .limit(3_000),
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

    const posts = (postResult.data ?? []) as SocialPostRow[];
    const metrics = (metricResult.data ?? []) as SocialMetricRow[];

    return {
      status: 'ok',
      message: null,
      window,
      generatedAt: now.toISOString(),
      accounts: latestAccounts((accountResult.data ?? []) as AccountRow[]),
      episodes: buildEpisodes(posts, metrics, window, now),
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

export function buildEpisodes(
  posts: SocialPostRow[],
  metrics: SocialMetricRow[],
  window: SocialWindow,
  now: Date,
): SocialEpisodeSummary[] {
  const filteredMetrics = metrics.filter(
    (metric) => (metric.collection_status ?? 'collected') !== 'unavailable',
  );
  const metricsByPost = groupMetrics(filteredMetrics);
  const episodes = new Map<
    string,
    {
      title: string;
      titleLanguage: string | null;
      publishedAt: string;
      platforms: SocialPlatformPerformance[];
    }
  >();

  for (const post of posts) {
    const metric = selectMetric(metricsByPost.get(post.id) ?? [], window);
    const existing = episodes.get(post.episode_id) ?? {
      title: postTitle(post),
      titleLanguage: post.language_code,
      publishedAt: post.published_at,
      platforms: [],
    };
    if (
      post.language_code === 'zh-Hant' &&
      existing.titleLanguage !== 'zh-Hant'
    ) {
      existing.title = postTitle(post);
      existing.titleLanguage = 'zh-Hant';
    }
    if (Date.parse(post.published_at) > Date.parse(existing.publishedAt)) {
      existing.publishedAt = post.published_at;
    }
    existing.platforms.push(toPerformance(post, metric));
    episodes.set(post.episode_id, existing);
  }

  return [...episodes.entries()]
    .map(([episodeId, episode]) => ({
      publishedAt: episode.publishedAt,
      summary: {
        episodeId,
        publishedAt: episode.publishedAt,
        // Mirrors daemon METRIC_WINDOWS plus one hour of collection grace.
        windowReached:
          window === 'latest' ||
          now.getTime() - Date.parse(episode.publishedAt) >=
            (METRIC_WINDOW_HOURS[window] + 1) * 3_600_000,
        title: episode.title,
        platforms: episode.platforms,
      },
    }))
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
    .map((entry) => entry.summary);
}

function groupMetrics(metrics: SocialMetricRow[]) {
  const grouped = new Map<string, SocialMetricRow[]>();
  for (const metric of metrics) {
    const entries = grouped.get(metric.social_post_id) ?? [];
    entries.push(metric);
    grouped.set(metric.social_post_id, entries);
  }
  return grouped;
}

function selectMetric(rows: SocialMetricRow[], window: SocialWindow) {
  return (
    rows
      .filter(
        (row) =>
          row.measurement_window !== null &&
          (window === 'latest' || row.measurement_window === window),
      )
      .sort(
        (a, b) => Date.parse(b.captured_at) - Date.parse(a.captured_at),
      )[0] ?? null
  );
}

function toPerformance(
  post: SocialPostRow,
  metric: SocialMetricRow | null,
): SocialPlatformPerformance {
  if (!metric) {
    return {
      platform: post.platform,
      postUrl: post.post_url,
      measurementWindow: null,
      ageHours: null,
      views: null,
      engagementRate: null,
      likes: null,
      comments: null,
      shares: null,
      saves: null,
      followersGained: null,
      averageViewDurationSec: null,
      averageViewPercentage: null,
    };
  }
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
    measurementWindow: isSocialMetricWindow(metric.measurement_window)
      ? metric.measurement_window
      : null,
    ageHours: metric.age_hours,
    views: metric.views,
    engagementRate:
      engagements !== null && denominator !== null && denominator > 0
        ? engagements / denominator
        : null,
    likes: metric.likes,
    comments: metric.comments,
    shares: metric.shares,
    saves: metric.saves,
    followersGained: metric.followers_gained,
    averageViewDurationSec: metric.details?.averageViewDurationSec ?? null,
    averageViewPercentage: metric.details?.averageViewPercentage ?? null,
  };
}

export function postTitle(
  post: Pick<SocialPostRow, 'published_title' | 'published_body'>,
): string {
  return (
    post.published_title?.trim() ||
    post.published_body.split('\n')[0]?.slice(0, 80) ||
    'Untitled episode'
  );
}

const METRIC_WINDOW_HOURS: Record<SocialMetricWindow, number> = {
  '1h': 1,
  '6h': 6,
  '24h': 24,
  '72h': 72,
  '7d': 168,
};
function isSocialMetricWindow(
  value: string | null,
): value is SocialMetricWindow {
  return value !== null && Object.hasOwn(METRIC_WINDOW_HOURS, value);
}
