import {
  type PrimaryLanguageCode,
  type SocialPostMetricRow,
  SUPPORTED_PRIMARY_LANGUAGE_CODES,
} from '../types.js';
import { SOCIAL_PLATFORMS, type SocialPlatform } from './platforms.js';

/**
 * The distribution snapshot: what one long-form article turns into once it has
 * been through the pipeline, aggregated over the whole corpus.
 *
 * This module is deliberately I/O-free. `buildDistributionSnapshot` is a pure
 * function over row literals so the numbers published on a public page can be
 * asserted in unit tests rather than only observed in production, which is the
 * same split `social-performance.ts` uses.
 */

export interface DistributionEpisodeRow {
  id: string;
  source_title: string | null;
  source_url: string;
  created_at: string;
}

export interface DistributionLocalizationRow {
  episode_id: string;
  language_code: PrimaryLanguageCode;
  hls_url: string | null;
  classroom_hls_url: string | null;
}

export interface DistributionVideoRow {
  episode_id: string | null;
  status: string;
}

export interface DistributionPostRow {
  id: string;
  episode_id: string;
  platform: SocialPlatform;
  language_code: PrimaryLanguageCode;
  post_url: string | null;
  published_at: string | null;
}

/** Projected off the row type that pins the DDL, so the two cannot drift. */
export type DistributionMetricRow = Pick<
  SocialPostMetricRow,
  | 'social_post_id'
  | 'captured_at'
  | 'collection_status'
  | 'views'
  | 'impressions'
  | 'likes'
  | 'comments'
  | 'shares'
>;

export interface DistributionPublishJobRow {
  status: string;
}

export interface DistributionStrategyVersionRow {
  platform: SocialPlatform;
  language_code: PrimaryLanguageCode;
}

export interface DistributionSnapshotSource {
  episodes: readonly DistributionEpisodeRow[];
  localizations: readonly DistributionLocalizationRow[];
  videos: readonly DistributionVideoRow[];
  posts: readonly DistributionPostRow[];
  metrics: readonly DistributionMetricRow[];
  publishJobs: readonly DistributionPublishJobRow[];
  strategyVersions: readonly DistributionStrategyVersionRow[];
}

export interface DistributionFunnel {
  articles: number;
  localizations: number;
  videos: number;
  posts: number;
  platforms: number;
  reach: number;
}

export interface DistributionLanguageSummary {
  code: PrimaryLanguageCode;
  localizations: number;
  mainAudio: number;
  classroomAudio: number;
  posts: number;
  reach: number;
}

export interface DistributionChannelSummary {
  platform: SocialPlatform;
  language: PrimaryLanguageCode;
  posts: number;
  postsWithMetrics: number;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  firstPostAt: string | null;
  lastPostAt: string | null;
}

export interface DistributionReliability {
  publishJobs: number;
  publishJobsCompleted: number;
  publishJobsFailed: number;
  metricSnapshots: number;
  metricSnapshotsCollected: number;
  strategyVersions: number;
}

export interface DistributionExampleChannel {
  platform: SocialPlatform;
  language: PrimaryLanguageCode;
  postUrl: string | null;
  publishedAt: string | null;
}

export interface DistributionExample {
  title: string | null;
  sourceUrl: string;
  createdAt: string;
  localizations: number;
  videos: number;
  posts: number;
  channels: DistributionExampleChannel[];
}

export interface DistributionSnapshot {
  /**
   * Keyed to the newest row the snapshot describes, never to the wall clock, so
   * an unchanged corpus regenerates byte-identically and the refresh job
   * commits nothing instead of pushing a no-op diff every day.
   */
  asOf: string;
  coverage: {
    firstEpisodeAt: string | null;
    lastEpisodeAt: string | null;
    firstPostAt: string | null;
    lastPostAt: string | null;
  };
  funnel: DistributionFunnel;
  languages: DistributionLanguageSummary[];
  channels: DistributionChannelSummary[];
  reliability: DistributionReliability;
  example: DistributionExample | null;
}

/**
 * Platforms an example article must have reached to stand for the pipeline.
 * Below the full four because a single platform being rate-limited or under
 * review must not leave the page with no example at all.
 */
const EXAMPLE_MIN_PLATFORMS = 3;

interface PostReach {
  reach: number;
  likes: number;
  comments: number;
  shares: number;
}

const NO_REACH: PostReach = { reach: 0, likes: 0, comments: 0, shares: 0 };

export function buildDistributionSnapshot(
  source: DistributionSnapshotSource,
): DistributionSnapshot {
  const reachByPost = latestReachByPost(source.metrics);
  const completedVideosByEpisode = countBy(
    source.videos.filter((video) => video.status === 'completed'),
    (video) => video.episode_id,
  );

  const channels = buildChannels(source.posts, reachByPost);
  const languages = buildLanguages(
    source.localizations,
    source.posts,
    reachByPost,
  );
  const episodeDates = source.episodes.map((episode) => episode.created_at);
  const postDates = source.posts.flatMap((post) =>
    post.published_at === null ? [] : [post.published_at],
  );

  return {
    asOf: newest([...episodeDates, ...postDates]) ?? '',
    coverage: {
      firstEpisodeAt: oldest(episodeDates),
      lastEpisodeAt: newest(episodeDates),
      firstPostAt: oldest(postDates),
      lastPostAt: newest(postDates),
    },
    funnel: {
      articles: source.episodes.length,
      localizations: source.localizations.length,
      videos: sum([...completedVideosByEpisode.values()]),
      posts: source.posts.length,
      platforms: new Set(source.posts.map((post) => post.platform)).size,
      reach: sum(channels.map((channel) => channel.reach)),
    },
    languages,
    channels,
    reliability: {
      publishJobs: source.publishJobs.length,
      publishJobsCompleted: source.publishJobs.filter(
        (job) => job.status === 'completed',
      ).length,
      publishJobsFailed: source.publishJobs.filter(
        (job) => job.status === 'failed',
      ).length,
      metricSnapshots: source.metrics.length,
      metricSnapshotsCollected: source.metrics.filter(
        (metric) => metric.collection_status === 'collected',
      ).length,
      strategyVersions: source.strategyVersions.length,
    },
    example: selectExample({
      episodes: source.episodes,
      localizations: source.localizations,
      completedVideosByEpisode,
      posts: source.posts,
      reachByPost,
    }),
  };
}

/**
 * Refuses to publish a snapshot that cannot be true.
 *
 * The refresh job pushes straight to the default branch without going through
 * CI, so this is the only gate between a half-read corpus and a public page
 * claiming the wrong numbers.
 */
export function assertPublishableDistributionSnapshot(
  snapshot: DistributionSnapshot,
): void {
  const { funnel } = snapshot;
  const problems: string[] = [];

  if (funnel.articles === 0) problems.push('no articles');
  if (funnel.localizations === 0) problems.push('no localizations');
  if (funnel.posts === 0) problems.push('no social posts');
  if (funnel.platforms === 0) problems.push('no platforms');
  if (!snapshot.asOf) problems.push('no timestamp to key the snapshot to');

  const channelPosts = sum(snapshot.channels.map((channel) => channel.posts));
  if (channelPosts !== funnel.posts) {
    problems.push(
      `channel posts (${channelPosts}) do not add up to funnel posts (${funnel.posts})`,
    );
  }

  const channelReach = sum(snapshot.channels.map((channel) => channel.reach));
  if (channelReach !== funnel.reach) {
    problems.push(
      `channel reach (${channelReach}) does not add up to funnel reach (${funnel.reach})`,
    );
  }

  const languageLocalizations = sum(
    snapshot.languages.map((language) => language.localizations),
  );
  if (languageLocalizations !== funnel.localizations) {
    problems.push(
      `per-language localizations (${languageLocalizations}) do not add up to funnel localizations (${funnel.localizations})`,
    );
  }

  if (problems.length > 0) {
    throw new Error(
      `Refusing to publish distribution snapshot: ${problems.join('; ')}.`,
    );
  }
}

/**
 * One reach figure per post, taken from its newest successful collection.
 *
 * Rows whose `collection_status` is not `collected` are dropped rather than
 * counted as zero: a collector that could not read a post is not evidence that
 * nobody saw it. Platforms report either views or impressions but never both,
 * so reach is whichever one came back.
 */
function latestReachByPost(
  metrics: readonly DistributionMetricRow[],
): Map<string, PostReach> {
  const newestByPost = new Map<string, DistributionMetricRow>();

  for (const metric of metrics) {
    if (metric.collection_status !== 'collected') continue;
    const current = newestByPost.get(metric.social_post_id);
    if (!current || metric.captured_at > current.captured_at) {
      newestByPost.set(metric.social_post_id, metric);
    }
  }

  return new Map(
    [...newestByPost].map(([postId, metric]) => [
      postId,
      {
        reach: metric.views ?? metric.impressions ?? 0,
        likes: metric.likes ?? 0,
        comments: metric.comments ?? 0,
        shares: metric.shares ?? 0,
      },
    ]),
  );
}

function buildChannels(
  posts: readonly DistributionPostRow[],
  reachByPost: Map<string, PostReach>,
): DistributionChannelSummary[] {
  const byChannel = new Map<string, DistributionChannelSummary>();

  for (const post of posts) {
    const key = `${post.platform} ${post.language_code}`;
    const channel = byChannel.get(key) ?? {
      platform: post.platform,
      language: post.language_code,
      posts: 0,
      postsWithMetrics: 0,
      reach: 0,
      likes: 0,
      comments: 0,
      shares: 0,
      firstPostAt: null,
      lastPostAt: null,
    };

    const measured = reachByPost.get(post.id);
    const reach = measured ?? NO_REACH;

    channel.posts += 1;
    if (measured) channel.postsWithMetrics += 1;
    channel.reach += reach.reach;
    channel.likes += reach.likes;
    channel.comments += reach.comments;
    channel.shares += reach.shares;
    channel.firstPostAt = oldest([channel.firstPostAt, post.published_at]);
    channel.lastPostAt = newest([channel.lastPostAt, post.published_at]);

    byChannel.set(key, channel);
  }

  return [...byChannel.values()].sort(
    (a, b) =>
      b.reach - a.reach ||
      platformOrder(a.platform) - platformOrder(b.platform) ||
      languageOrder(a.language) - languageOrder(b.language),
  );
}

function buildLanguages(
  localizations: readonly DistributionLocalizationRow[],
  posts: readonly DistributionPostRow[],
  reachByPost: Map<string, PostReach>,
): DistributionLanguageSummary[] {
  const summaries = new Map<PrimaryLanguageCode, DistributionLanguageSummary>();

  const summaryFor = (
    code: PrimaryLanguageCode,
  ): DistributionLanguageSummary => {
    const existing = summaries.get(code);
    if (existing) return existing;
    const created: DistributionLanguageSummary = {
      code,
      localizations: 0,
      mainAudio: 0,
      classroomAudio: 0,
      posts: 0,
      reach: 0,
    };
    summaries.set(code, created);
    return created;
  };

  for (const localization of localizations) {
    const summary = summaryFor(localization.language_code);
    summary.localizations += 1;
    if (localization.hls_url) summary.mainAudio += 1;
    if (localization.classroom_hls_url) summary.classroomAudio += 1;
  }

  for (const post of posts) {
    const summary = summaryFor(post.language_code);
    summary.posts += 1;
    summary.reach += reachByPost.get(post.id)?.reach ?? 0;
  }

  return [...summaries.values()].sort(
    (a, b) => languageOrder(a.code) - languageOrder(b.code),
  );
}

/**
 * The article whose chain best shows what the pipeline does, chosen by reach so
 * the example is one that actually landed rather than simply the most recent
 * one: a post published this morning has no views yet through no fault of the
 * pipeline. Ties break on recency then id, so the choice is reproducible.
 */
function selectExample(input: {
  episodes: readonly DistributionEpisodeRow[];
  localizations: readonly DistributionLocalizationRow[];
  completedVideosByEpisode: Map<string | null, number>;
  posts: readonly DistributionPostRow[];
  reachByPost: Map<string, PostReach>;
}): DistributionExample | null {
  const localizationsByEpisode = countBy(
    input.localizations,
    (localization) => localization.episode_id,
  );
  const postsByEpisode = new Map<string, DistributionPostRow[]>();
  for (const post of input.posts) {
    const bucket = postsByEpisode.get(post.episode_id) ?? [];
    bucket.push(post);
    postsByEpisode.set(post.episode_id, bucket);
  }

  const languageCount = SUPPORTED_PRIMARY_LANGUAGE_CODES.length;
  const candidates = input.episodes.flatMap((episode) => {
    const posts = postsByEpisode.get(episode.id) ?? [];
    const platforms = new Set(posts.map((post) => post.platform)).size;
    const videos = input.completedVideosByEpisode.get(episode.id) ?? 0;
    const localizations = localizationsByEpisode.get(episode.id) ?? 0;
    if (
      localizations < languageCount ||
      videos < languageCount ||
      platforms < EXAMPLE_MIN_PLATFORMS
    ) {
      return [];
    }
    const reach = sum(
      posts.map((post) => input.reachByPost.get(post.id)?.reach ?? 0),
    );
    return [{ episode, posts, localizations, videos, reach }];
  });

  const ranked = [...candidates].sort(
    (a, b) =>
      b.reach - a.reach ||
      compareAsc(b.episode.created_at, a.episode.created_at) ||
      compareAsc(a.episode.id, b.episode.id),
  );
  const best = ranked[0];
  if (!best) return null;

  return {
    title: best.episode.source_title,
    sourceUrl: best.episode.source_url,
    createdAt: best.episode.created_at,
    localizations: best.localizations,
    videos: best.videos,
    posts: best.posts.length,
    channels: best.posts
      .map((post) => ({
        platform: post.platform,
        language: post.language_code,
        postUrl: post.post_url,
        publishedAt: post.published_at,
      }))
      .sort(
        (a, b) =>
          compareAsc(a.publishedAt ?? '', b.publishedAt ?? '') ||
          platformOrder(a.platform) - platformOrder(b.platform) ||
          languageOrder(a.language) - languageOrder(b.language),
      ),
  };
}

function countBy<T, K>(rows: readonly T[], key: (row: T) => K): Map<K, number> {
  const counts = new Map<K, number>();
  for (const row of rows) {
    counts.set(key(row), (counts.get(key(row)) ?? 0) + 1);
  }
  return counts;
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function newest(values: readonly (string | null)[]): string | null {
  return values.reduce<string | null>(
    (best, value) =>
      value !== null && (best === null || value > best) ? value : best,
    null,
  );
}

function oldest(values: readonly (string | null)[]): string | null {
  return values.reduce<string | null>(
    (best, value) =>
      value !== null && (best === null || value < best) ? value : best,
    null,
  );
}

function compareAsc(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

function platformOrder(platform: SocialPlatform): number {
  return SOCIAL_PLATFORMS.indexOf(platform);
}

function languageOrder(language: PrimaryLanguageCode): number {
  return SUPPORTED_PRIMARY_LANGUAGE_CODES.indexOf(language);
}
