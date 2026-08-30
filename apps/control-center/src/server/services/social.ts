import type {
  SocialDecision,
  SocialEpisodeSummary,
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
  post_url: string | null;
  published_at: string;
  topic: string;
  hook_type: string;
  published_title: string | null;
  published_body: string;
  hashtags: string[];
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

interface StrategyRow {
  platform: string;
  config: {
    preferredHookTypes?: string[];
    preferredHashtags?: string[];
    avoidHashtags?: string[];
    publishSlotsJst?: Array<{ hour: number; minute: number }>;
  } | null;
}

const TARGET_HOURS: Record<Exclude<SocialWindow, 'latest'>, number> = {
  '24h': 24,
  '72h': 72,
  '7d': 168,
};
const PLATFORMS = ['x', 'threads', 'rednote', 'youtube'] as const;
const SUPPRESSED_REDNOTE = new Set(['under_review', 'rejected', 'self_only']);
const MIN_TOPIC_BUCKET_SAMPLES = 3;
const MIN_QUALIFIED_TOPIC_BUCKETS = 2;

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
    const [postResult, metricResult, accountResult, strategyResult] =
      await Promise.all([
        client
          .from('social_posts')
          .select(
            'id,episode_id,platform,post_url,published_at,topic,hook_type,published_title,published_body,hashtags,review_status',
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
          // Rolling attribution rows have no window and would otherwise win a
          // nearest-age lookup while also crowding standard samples out of the
          // bounded payload.
          .not('measurement_window', 'is', null)
          .order('captured_at', { ascending: false })
          .limit(3_000),
        client
          .from('social_account_snapshots')
          .select('platform,followers,captured_at')
          .order('captured_at', { ascending: false })
          .limit(100),
        client
          .from('social_strategy_versions')
          .select('platform,config')
          .eq('active', true),
      ]);
    const error = postResult.error ?? metricResult.error ?? accountResult.error;
    if (error) {
      throw error;
    }

    const posts = (postResult.data ?? []) as SocialPostRow[];
    const metrics = (metricResult.data ?? []) as SocialMetricRow[];
    const strategies = strategyResult.error
      ? []
      : ((strategyResult.data ?? []) as StrategyRow[]);

    return {
      status: 'ok',
      message: null,
      window,
      generatedAt: now.toISOString(),
      accounts: latestAccounts((accountResult.data ?? []) as AccountRow[]),
      decisions: buildDecisions(posts, metrics, strategies),
      episodes: buildEpisodes(posts, metrics, window),
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
    decisions: [],
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
  const filteredMetrics = metrics.filter(
    (metric) => (metric.collection_status ?? 'collected') !== 'unavailable',
  );
  const metricsByPost = groupMetrics(filteredMetrics);
  const episodes = new Map<
    string,
    {
      title: string;
      publishedAt: string;
      impressions: number[];
      platforms: SocialPlatformPerformance[];
    }
  >();

  for (const post of posts) {
    const metric = selectMetric(metricsByPost.get(post.id) ?? [], window);
    if (!metric) {
      continue;
    }
    const existing = episodes.get(post.episode_id) ?? {
      title: postTitle(post),
      publishedAt: post.published_at,
      impressions: [],
      platforms: [],
    };
    existing.platforms.push(toPerformance(post, metric));
    if (metric.impressions !== null) {
      existing.impressions.push(metric.impressions);
    }
    episodes.set(post.episode_id, existing);
  }

  return [...episodes.entries()]
    .map(([episodeId, episode]) => ({
      publishedAt: episode.publishedAt,
      summary: {
        episodeId,
        title: episode.title,
        totalViews: sumKnown(episode.platforms.map((row) => row.views)),
        totalImpressions: sumKnown(episode.impressions),
        platforms: episode.platforms,
      },
    }))
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
    .map((entry) => entry.summary);
}

export function buildDecisions(
  posts: SocialPostRow[],
  metrics: SocialMetricRow[],
  strategies: StrategyRow[],
): SocialDecision[] {
  const postById = new Map(posts.map((post) => [post.id, post]));
  const strategyByPlatform = new Map(
    strategies.map((row) => [row.platform, row]),
  );
  const samples = metrics
    .filter(
      (metric) =>
        metric.measurement_window === '24h' &&
        metric.views !== null &&
        (metric.collection_status ?? 'collected') !== 'unavailable',
    )
    .flatMap((metric) => {
      const post = postById.get(metric.social_post_id);
      if (!post || !isLearnable(post, metric)) {
        return [];
      }
      return [{ post, metric }];
    });

  return PLATFORMS.flatMap((platform) => {
    const platformSamples = samples.filter(
      (sample) => sample.post.platform === platform,
    );
    const strategy = strategyByPlatform.get(platform);
    const evidenceSamples = platformSamples.length;
    if (!strategy && evidenceSamples === 0) {
      return [];
    }
    const topic = bestTopic(platformSamples);
    return [
      {
        platform,
        evidenceSamples,
        confidence: confidence(evidenceSamples),
        preferredHookTypes: strategy?.config?.preferredHookTypes ?? [],
        preferredHashtags: strategy?.config?.preferredHashtags ?? [],
        avoidHashtags: strategy?.config?.avoidHashtags ?? [],
        bestTopic: topic?.topic ?? null,
        bestTopicSamples: topic?.samples ?? null,
        publishSlotsJst: formatPublishSlots(strategy?.config?.publishSlotsJst),
        topExample: topExample(platformSamples),
      },
    ];
  });
}

function isLearnable(post: SocialPostRow, metric: SocialMetricRow): boolean {
  if (post.platform !== 'rednote') {
    return true;
  }
  if (post.review_status && SUPPRESSED_REDNOTE.has(post.review_status)) {
    return false;
  }
  return (metric.views ?? 0) > 1;
}

function topExample(
  samples: Array<{ post: SocialPostRow; metric: SocialMetricRow }>,
): string | null {
  const best = [...samples].sort(
    (a, b) => (b.metric.views ?? 0) - (a.metric.views ?? 0),
  )[0];
  if (!best || best.metric.views === null) {
    return null;
  }
  return `“${postTitle(best.post).slice(0, 68)}” · ${best.metric.views.toLocaleString('en-US')} views`;
}

function bestTopic(
  samples: Array<{ post: SocialPostRow; metric: SocialMetricRow }>,
): { topic: string; samples: number } | null {
  const groups = new Map<string, number[]>();
  for (const sample of samples) {
    const values = groups.get(sample.post.topic) ?? [];
    values.push(sample.metric.views ?? 0);
    groups.set(sample.post.topic, values);
  }
  const candidates = [...groups.entries()]
    .filter(([, values]) => values.length >= MIN_TOPIC_BUCKET_SAMPLES)
    .map(([topic, values]) => ({
      topic,
      samples: values.length,
      score: median(values),
    }))
    .sort((a, b) => b.score - a.score);
  if (candidates.length < MIN_QUALIFIED_TOPIC_BUCKETS) {
    return null;
  }
  const winner = candidates[0]!;
  return { topic: winner.topic, samples: winner.samples };
}

function formatPublishSlots(
  slots: Array<{ hour: number; minute: number }> | undefined,
): string | null {
  if (!slots?.length) {
    return null;
  }
  return [...slots]
    .sort((a, b) => a.hour - b.hour || a.minute - b.minute)
    .map(
      ({ hour, minute }) =>
        `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    )
    .join(' / ');
}

function confidence(samples: number): SocialDecision['confidence'] {
  if (samples >= 25) {
    return 'high';
  }
  if (samples >= 10) {
    return 'medium';
  }
  return 'low';
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

function postTitle(post: SocialPostRow): string {
  return (
    post.published_title?.trim() ||
    post.published_body.split('\n')[0]?.slice(0, 80) ||
    'Untitled episode'
  );
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? (sorted[middle] ?? 0)
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}
