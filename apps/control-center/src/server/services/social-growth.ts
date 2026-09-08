import { createClient } from '@supabase/supabase-js';

import type {
  SocialGrowthWithWaitlistResponse,
  SocialWaitlistSummary,
} from '../../shared/waitlist-growth.js';
import type {
  SocialExperimentArm,
  SocialExperimentStatus,
  SocialExperimentSummary,
  SocialGrowthLane,
  SocialGrowthPlatform,
  SocialGrowthResponse,
} from '../../shared/types.js';
import type { ControlCenterConfig } from '../config/env.js';
import { createAsyncCache } from './cache.js';
import {
  buildFollowerAttribution,
  exactYoutubeFollowersByPost,
  type AttributionObservation,
  type AttributionPost,
  type AttributionSnapshot,
} from './social-attribution.js';

export const ATTRIBUTION_HORIZON_DAYS = 14;
export const EXPERIMENT_HORIZON_DAYS = 60;
export const DELTA_BASELINE_TOLERANCE_MS = 12 * 60 * 60_000;
export const RECENT_INTERVALS_PER_PLATFORM = 10;
const DAY_MS = 86_400_000;
const PLATFORMS = ['x', 'threads', 'rednote', 'youtube'] as const;

interface GrowthPost extends AttributionPost {
  episode_id: string;
  language_code: string | null;
  experiment_key: string | null;
  experiment_variant: string | null;
  content_features: unknown;
}

interface WaitlistSignupRow {
  id: string;
  created_at: string;
  social_publish_job_id: string | null;
}

interface WaitlistPublishJobRow {
  id: string;
  episode_id: string;
  platform: string;
  language_code: string | null;
  social_post_id: string | null;
}

type ClientFactory = typeof createClient;

export function createSocialGrowthService(input: {
  config: ControlCenterConfig;
  now?: () => Date;
  createSupabaseClient?: ClientFactory;
}) {
  const cache = createAsyncCache({
    ttlMs: input.config.CONTROL_CENTER_CACHE_TTL_MS,
    load: () =>
      loadSocialGrowth({
        config: input.config,
        now: input.now?.() ?? new Date(),
        ...(input.createSupabaseClient
          ? { createSupabaseClient: input.createSupabaseClient }
          : {}),
      }),
  });
  return { getSocialGrowth: (force = false) => cache.get(force) };
}

export async function loadSocialGrowth(input: {
  config: ControlCenterConfig;
  now: Date;
  createSupabaseClient?: ClientFactory;
}): Promise<SocialGrowthWithWaitlistResponse> {
  const generatedAt = input.now.toISOString();
  const empty = (status: 'unconfigured' | 'error', message: string) =>
    ({
      status,
      message,
      generatedAt,
      platforms: [],
      experiments: [],
      attribution: [],
      waitlist: unavailableWaitlist(message),
    }) satisfies SocialGrowthWithWaitlistResponse;
  const { SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key } = input.config;
  if (!url || !key) {
    return empty('unconfigured', 'Supabase is not connected');
  }

  try {
    const create = input.createSupabaseClient ?? createClient;
    const client = create(url, key, {
      db: { schema: input.config.SUPABASE_DB_SCHEMA },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const attributionSince = new Date(
      input.now.getTime() - (ATTRIBUTION_HORIZON_DAYS + 1) * DAY_MS,
    ).toISOString();
    const experimentSince = new Date(
      input.now.getTime() - EXPERIMENT_HORIZON_DAYS * DAY_MS,
    ).toISOString();
    const metricSince = new Date(
      input.now.getTime() - (EXPERIMENT_HORIZON_DAYS + 1) * DAY_MS,
    ).toISOString();
    const [
      snapshotsResult,
      postsResult,
      standardizedResult,
      observationsResult,
    ] = await Promise.all([
      client
        .from('social_account_snapshots')
        .select('platform,captured_at,followers')
        .gte('captured_at', attributionSince)
        .order('captured_at', { ascending: true })
        .limit(1_500),
      client
        .from('social_posts')
        .select(
          'id,episode_id,platform,language_code,published_at,content_features,experiment_key,experiment_variant',
        )
        .gte('published_at', experimentSince)
        .order('published_at', { ascending: false })
        .limit(500),
      client
        .from('social_post_metrics')
        .select(
          'social_post_id,captured_at,age_hours,measurement_window,collection_status,views,impressions,likes,comments,shares,saves,profile_visits,followers_gained',
        )
        .gte('captured_at', metricSince)
        .not('measurement_window', 'is', null)
        .order('captured_at', { ascending: true })
        .limit(3_000),
      client
        .from('social_post_metrics')
        .select(
          'social_post_id,captured_at,age_hours,measurement_window,collection_status,views,impressions,likes,comments,shares,saves,profile_visits,followers_gained',
        )
        .gte('captured_at', attributionSince)
        .eq('collection_status', 'collected')
        .order('captured_at', { ascending: true })
        .limit(4_000),
    ]);
    const error =
      snapshotsResult.error ??
      postsResult.error ??
      standardizedResult.error ??
      observationsResult.error;
    if (error) {
      throw error;
    }

    const snapshots = (snapshotsResult.data ?? []) as AttributionSnapshot[];
    const posts = (postsResult.data ?? []) as GrowthPost[];
    const standardized = (standardizedResult.data ??
      []) as AttributionObservation[];
    const observations = (observationsResult.data ??
      []) as AttributionObservation[];
    const attribution = buildFollowerAttribution({
      snapshots,
      posts,
      observations,
    });
    const exact = exactYoutubeFollowersByPost(posts, standardized);
    const waitlist = await loadWaitlistGrowth({
      create,
      url,
      key,
      pipelineClient: client,
      standardized,
      now: input.now,
    });
    return {
      status: 'ok',
      message: null,
      generatedAt,
      platforms: buildPlatforms({
        snapshots,
        posts,
        standardized,
        attribution,
        exact,
        now: input.now,
      }),
      experiments: buildExperiments({
        posts,
        standardized,
        attribution,
        exact,
      }),
      attribution: recentIntervals(attribution),
      waitlist,
    };
  } catch (error) {
    return empty(
      'error',
      error instanceof Error ? error.message : 'Social growth query failed',
    );
  }
}

async function loadWaitlistGrowth(input: {
  create: ClientFactory;
  url: string;
  key: string;
  pipelineClient: ReturnType<ClientFactory>;
  standardized: AttributionObservation[];
  now: Date;
}): Promise<SocialWaitlistSummary> {
  try {
    const publicClient = input.create(input.url, input.key, {
      db: { schema: 'public' },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const signupsResult = await publicClient
      .from('waitlist_signups')
      .select('id,created_at,social_publish_job_id', { count: 'exact' })
      .order('created_at', { ascending: false })
      .limit(2_000);
    if (signupsResult.error) throw signupsResult.error;

    const signups = (signupsResult.data ?? []) as WaitlistSignupRow[];
    const jobIds = [
      ...new Set(
        signups.flatMap((row) =>
          row.social_publish_job_id ? [row.social_publish_job_id] : [],
        ),
      ),
    ];
    let jobs: WaitlistPublishJobRow[] = [];
    if (jobIds.length > 0) {
      const jobsResult = await input.pipelineClient
        .from('social_publish_jobs')
        .select('id,episode_id,platform,language_code,social_post_id')
        .in('id', jobIds)
        .limit(2_000);
      if (jobsResult.error) throw jobsResult.error;
      jobs = (jobsResult.data ?? []) as WaitlistPublishJobRow[];
    }

    return buildWaitlistSummary({
      signups,
      jobs,
      standardized: input.standardized,
      total: signupsResult.count ?? signups.length,
      now: input.now,
    });
  } catch (error) {
    return unavailableWaitlist(
      error instanceof Error ? error.message : 'Waitlist telemetry unavailable',
    );
  }
}

function buildWaitlistSummary(input: {
  signups: WaitlistSignupRow[];
  jobs: WaitlistPublishJobRow[];
  standardized: AttributionObservation[];
  total: number;
  now: Date;
}): SocialWaitlistSummary {
  const jobsById = new Map(input.jobs.map((job) => [job.id, job]));
  const sevenDaysAgo = input.now.getTime() - 7 * DAY_MS;
  const recent = input.signups.filter(
    (row) => Date.parse(row.created_at) >= sevenDaysAgo,
  );
  const attributedRecent = recent.filter(
    (row) =>
      row.social_publish_job_id !== null &&
      jobsById.has(row.social_publish_job_id),
  );
  const attributed = input.signups.filter(
    (row): row is WaitlistSignupRow & { social_publish_job_id: string } =>
      row.social_publish_job_id !== null &&
      jobsById.has(row.social_publish_job_id),
  );

  const conversions = [
    ...groupBy(attributed, (row) => row.social_publish_job_id).entries(),
  ]
    .flatMap(([jobId, rows]) => {
      const job = jobsById.get(jobId);
      if (!job) return [];
      const metric = job.social_post_id
        ? input.standardized.find(
            (row) =>
              row.social_post_id === job.social_post_id &&
              row.measurement_window === '24h',
          )
        : undefined;
      const views24h = metric?.views ?? null;
      return [
        {
          socialPublishJobId: job.id,
          episodeId: job.episode_id,
          platform: job.platform,
          languageCode: job.language_code ?? 'zh-Hant',
          socialPostId: job.social_post_id,
          signups: rows.length,
          views24h,
          signupRate: views24h && views24h > 0 ? rows.length / views24h : null,
        },
      ];
    })
    .sort(
      (left, right) =>
        right.signups - left.signups ||
        left.episodeId.localeCompare(right.episodeId) ||
        left.platform.localeCompare(right.platform),
    );

  return {
    status: 'ok',
    message: null,
    total: input.total,
    signups7d: recent.length,
    attributedSocial7d: attributedRecent.length,
    directOrUnknown7d: recent.length - attributedRecent.length,
    conversions,
  };
}

function unavailableWaitlist(message: string): SocialWaitlistSummary {
  return {
    status: 'unavailable',
    message,
    total: null,
    signups7d: 0,
    attributedSocial7d: 0,
    directOrUnknown7d: 0,
    conversions: [],
  };
}

function buildPlatforms(input: {
  snapshots: AttributionSnapshot[];
  posts: GrowthPost[];
  standardized: AttributionObservation[];
  attribution: ReturnType<typeof buildFollowerAttribution>;
  exact: Map<string, number>;
  now: Date;
}): SocialGrowthPlatform[] {
  const sevenDaysAgo = input.now.getTime() - 7 * DAY_MS;
  return PLATFORMS.map((platform) => {
    const snapshots = input.snapshots.filter(
      (row) => row.platform === platform,
    );
    const latest = snapshots.at(-1);
    const recentPosts = input.posts.filter(
      (post) =>
        post.platform === platform &&
        Date.parse(post.published_at) >= sevenDaysAgo,
    );
    const languages = [
      ...new Set(recentPosts.map((post) => post.language_code ?? 'zh-Hant')),
    ];
    return {
      platform,
      followersNow: latest?.followers ?? null,
      followersDelta24h: snapshotDelta(snapshots, input.now, DAY_MS),
      followersDelta7d: snapshotDelta(snapshots, input.now, 7 * DAY_MS),
      exactSubscribersGained7d:
        platform === 'youtube'
          ? sum(recentPosts.map((post) => input.exact.get(post.id)))
          : null,
      lanes: languages.map((languageCode) =>
        buildLane({ ...input, posts: recentPosts, platform, languageCode }),
      ),
    };
  }).filter(
    (platform) =>
      platform.followersNow !== null ||
      platform.exactSubscribersGained7d !== null ||
      platform.lanes.length > 0,
  );
}

function buildLane(input: {
  posts: GrowthPost[];
  standardized: AttributionObservation[];
  attribution: ReturnType<typeof buildFollowerAttribution>;
  exact: Map<string, number>;
  platform: string;
  languageCode: string;
}): SocialGrowthLane {
  const posts = input.posts.filter(
    (post) => (post.language_code ?? 'zh-Hant') === input.languageCode,
  );
  const postIds = new Set(posts.map((post) => post.id));
  const metrics = metrics24hForPostIds(input.standardized, postIds);
  const reaches = reachValues(metrics);
  const followers =
    input.platform === 'youtube'
      ? sum(posts.map((post) => input.exact.get(post.id)))
      : sum(
          input.attribution.flatMap((interval) =>
            interval.posts.flatMap((share) =>
              postIds.has(share.postId) ? [share.followersEstimated] : [],
            ),
          ),
        );
  const reach = reaches.reduce((total, value) => total + value, 0);
  return {
    languageCode: input.languageCode,
    postCount7d: posts.length,
    medianReach24h: reaches.length ? median(reaches) : null,
    followersGained7d: followers,
    followersPer1kReach:
      followers !== null && reach > 0 ? (followers * 1_000) / reach : null,
    basis: input.platform === 'youtube' ? 'exact' : 'estimated',
  };
}

function buildExperiments(input: {
  posts: GrowthPost[];
  standardized: AttributionObservation[];
  attribution: ReturnType<typeof buildFollowerAttribution>;
  exact: Map<string, number>;
}): SocialExperimentSummary[] {
  const groups = new Map<
    string,
    { kind: 'language' | 'packaging'; post: GrowthPost; variant: string }[]
  >();
  for (const post of input.posts) {
    const memberships = [
      post.experiment_key && post.experiment_variant
        ? {
            key: post.experiment_key,
            variant: post.experiment_variant,
            kind: 'language' as const,
          }
        : null,
      packaging(post.content_features),
    ].filter((value): value is NonNullable<typeof value> => value !== null);
    for (const membership of memberships) {
      const rows = groups.get(membership.key) ?? [];
      rows.push({ kind: membership.kind, post, variant: membership.variant });
      groups.set(membership.key, rows);
    }
  }
  return [...groups.entries()].map(([experimentKey, rows]) => {
    const paired = [
      ...groupBy(rows, (row) => row.post.episode_id).values(),
    ].some(
      (episodeRows) => new Set(episodeRows.map((row) => row.variant)).size >= 2,
    );
    const variants = [...new Set(rows.map((row) => row.variant))];
    const arms = variants.map((variant) =>
      buildArm({
        ...input,
        rows: rows.filter((row) => row.variant === variant),
        variant,
      }),
    );
    return {
      experimentKey,
      kind: rows[0]?.kind ?? 'language',
      paired,
      status: paired ? 'paired-cohort' : weakestStatus(arms),
      arms,
    };
  });
}

function buildArm(input: {
  rows: { post: GrowthPost }[];
  variant: string;
  standardized: AttributionObservation[];
  attribution: ReturnType<typeof buildFollowerAttribution>;
  exact: Map<string, number>;
}): SocialExperimentArm {
  const ids = new Set(input.rows.map((row) => row.post.id));
  const metrics = metrics24hForPostIds(input.standardized, ids);
  const reaches = reachValues(metrics);
  const engagementRates = metrics.flatMap((metric) => {
    if (!metric.views) {
      return [];
    }
    const engagement = [
      metric.likes,
      metric.comments,
      metric.shares,
      metric.saves,
    ]
      .filter((value): value is number => value !== null)
      .reduce((total, value) => total + value, 0);
    return [engagement / metric.views];
  });
  const youtube = input.rows.every((row) => row.post.platform === 'youtube');
  const followers = youtube
    ? sum(input.rows.map((row) => input.exact.get(row.post.id)))
    : sum(
        input.attribution.flatMap((interval) =>
          interval.posts.flatMap((share) =>
            ids.has(share.postId) ? [share.followersEstimated] : [],
          ),
        ),
      );
  const reach = reaches.reduce((total, value) => total + value, 0);
  return {
    variant: input.variant,
    samples24h: metrics.length,
    status: armStatus(metrics.length),
    medianReach24h: reaches.length ? median(reaches) : null,
    meanReach24h: reaches.length ? reach / reaches.length : null,
    medianEngagementRate: engagementRates.length
      ? median(engagementRates)
      : null,
    followersAttributed: followers,
    followersPer1kReach:
      followers !== null && reach > 0 ? (followers * 1_000) / reach : null,
    basis: youtube ? 'exact' : 'estimated',
  };
}

function recentIntervals(
  intervals: ReturnType<typeof buildFollowerAttribution>,
): SocialGrowthResponse['attribution'] {
  return [
    ...groupBy(intervals, (interval) => interval.platform).values(),
  ].flatMap((rows) =>
    [...rows]
      .sort((left, right) => Date.parse(right.endAt) - Date.parse(left.endAt))
      .slice(0, RECENT_INTERVALS_PER_PLATFORM)
      .map((interval) => ({
        platform: interval.platform,
        startAt: interval.startAt,
        endAt: interval.endAt,
        netDelta: interval.netDelta,
        unattributed: interval.unattributed,
        posts: interval.posts.map((post) => ({
          postId: post.postId,
          share: post.share,
          followersEstimated: post.followersEstimated,
          basis: 'estimated' as const,
        })),
        basis: 'estimated' as const,
      })),
  );
}

function snapshotDelta(
  rows: AttributionSnapshot[],
  now: Date,
  windowMs: number,
): number | null {
  const latest = rows.at(-1);
  if (!latest) {
    return null;
  }
  const target = now.getTime() - windowMs;
  const baseline = [...rows]
    .filter(
      (row) =>
        Math.abs(Date.parse(row.captured_at) - target) <=
        DELTA_BASELINE_TOLERANCE_MS,
    )
    .sort(
      (left, right) =>
        Math.abs(Date.parse(left.captured_at) - target) -
        Math.abs(Date.parse(right.captured_at) - target),
    )[0];
  return baseline ? latest.followers - baseline.followers : null;
}

function metrics24hForPostIds(
  metrics: AttributionObservation[],
  postIds: ReadonlySet<string>,
): AttributionObservation[] {
  return metrics.filter(
    (metric) =>
      postIds.has(metric.social_post_id) && metric.measurement_window === '24h',
  );
}

function reachValues(metrics: AttributionObservation[]): number[] {
  return metrics.flatMap((metric) =>
    metric.views === null ? [] : [metric.views],
  );
}

function packaging(
  features: unknown,
): { key: string; variant: string; kind: 'packaging' } | null {
  if (!features || typeof features !== 'object') {
    return null;
  }
  const value = (features as Record<string, unknown>)['packagingExperiment'];
  if (!value || typeof value !== 'object') {
    return null;
  }
  const key = (value as Record<string, unknown>)['key'];
  const variant = (value as Record<string, unknown>)['variant'];
  return typeof key === 'string' &&
    key &&
    typeof variant === 'string' &&
    variant
    ? { key, variant, kind: 'packaging' }
    : null;
}

function armStatus(
  samples: number,
): Exclude<SocialExperimentStatus, 'paired-cohort'> {
  return samples >= 20
    ? 'eligible'
    : samples >= 10
      ? 'provisional'
      : 'collecting';
}

function weakestStatus(arms: SocialExperimentArm[]): SocialExperimentStatus {
  if (arms.some((arm) => arm.status === 'collecting')) {
    return 'collecting';
  }
  if (arms.some((arm) => arm.status === 'provisional')) {
    return 'provisional';
  }
  return 'eligible';
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function sum(values: Array<number | undefined>): number | null {
  const known = values.filter((value): value is number => value !== undefined);
  return known.length ? known.reduce((total, value) => total + value, 0) : null;
}

function groupBy<T, K>(rows: readonly T[], key: (row: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>();
  for (const row of rows) {
    const values = groups.get(key(row)) ?? [];
    values.push(row);
    groups.set(key(row), values);
  }
  return groups;
}