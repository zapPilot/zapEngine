import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import dotenv from 'dotenv';

import {
  getSocialPostById,
  insertSocialPostMetric,
  listSocialPostsByEpisode,
} from '../services/db.js';
import type { NewSocialPostMetric, SocialPostRow } from '../types.js';
import { parsePlatformOption, requireEpisodeArgument } from './cli-args.js';
import { platformLabel, SOCIAL_PLATFORMS } from './platforms.js';
import type { SocialPlatform } from './types.js';

const REPO_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..',
);
const USAGE = `Usage: pnpm social:metrics <episode-uuid-or-share-url> --platform ${SOCIAL_PLATFORMS.join('|')} [--post-id <uuid>] [--views N] [--impressions N] [--likes N] [--comments N] [--shares N] [--saves N] [--profile-visits N] [--followers-gained N]

Every metric is optional; omit the ones the platform does not report. An omitted
metric is stored as NULL, which stays distinguishable from a measured zero.
--followers-gained is a net delta and may be negative, which needs the equals
form: --followers-gained=-3.`;

dotenv.config({ path: resolve(REPO_ROOT, '.env') });

export type SocialMetricCounts = Omit<
  NewSocialPostMetric,
  'socialPostId' | 'capturedAt' | 'ageHours'
>;

const METRIC_LABELS: Record<keyof SocialMetricCounts, string> = {
  views: 'views',
  impressions: 'impressions',
  likes: 'likes',
  comments: 'comments',
  shares: 'shares',
  saves: 'saves',
  profileVisits: 'profile visits',
  followersGained: 'followers gained',
};

export interface SocialMetricsCliOptions {
  episodeId: string;
  platform: SocialPlatform;
  postId?: string;
  counts: SocialMetricCounts;
}

export interface SocialMetricsCliDependencies {
  listPosts?: typeof listSocialPostsByEpisode;
  getPost?: typeof getSocialPostById;
  insertMetric?: typeof insertSocialPostMetric;
  now?: () => Date;
  log?: (message: string) => void;
}

export async function runSocialMetricsCli(
  args: string[],
  dependencies: SocialMetricsCliDependencies = {},
): Promise<void> {
  const listPosts = dependencies.listPosts ?? listSocialPostsByEpisode;
  const getPost = dependencies.getPost ?? getSocialPostById;
  const insertMetric = dependencies.insertMetric ?? insertSocialPostMetric;
  const now = dependencies.now ?? (() => new Date());
  const log = dependencies.log ?? console.log;

  const options = parseMetricsCliOptions(args);
  const post = options.postId
    ? await resolvePostById(getPost, options, options.postId)
    : selectSocialPost(
        await listPosts(options.episodeId, options.platform),
        options,
      );

  const metric = buildSocialPostMetric({
    post,
    capturedAt: now(),
    counts: options.counts,
  });

  await insertMetric(metric);
  log(formatMetricsSummary(post, metric));
}

export function parseMetricsCliOptions(
  args: string[],
): SocialMetricsCliOptions {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    strict: true,
    options: {
      help: { type: 'boolean', short: 'h', default: false },
      platform: { type: 'string' },
      'post-id': { type: 'string' },
      views: { type: 'string' },
      impressions: { type: 'string' },
      likes: { type: 'string' },
      comments: { type: 'string' },
      shares: { type: 'string' },
      saves: { type: 'string' },
      'profile-visits': { type: 'string' },
      'followers-gained': { type: 'string' },
    },
  });

  const episodeId = requireEpisodeArgument(values.help, positionals, USAGE);
  if (values.platform === undefined) {
    throw new Error(
      `--platform is required and must be one of: ${SOCIAL_PLATFORMS.join(', ')}.`,
    );
  }
  const platform = parsePlatformOption(values.platform);
  if (values['post-id'] !== undefined && !values['post-id'].trim()) {
    throw new Error('--post-id cannot be empty.');
  }

  const counts: SocialMetricCounts = {
    views: parseCount('views', values.views),
    impressions: parseCount('impressions', values.impressions),
    likes: parseCount('likes', values.likes),
    comments: parseCount('comments', values.comments),
    shares: parseCount('shares', values.shares),
    saves: parseCount('saves', values.saves),
    profileVisits: parseCount('profile-visits', values['profile-visits']),
    // A net delta: unfollows during the measured window can make it negative.
    followersGained: parseCount(
      'followers-gained',
      values['followers-gained'],
      { allowNegative: true },
    ),
  };

  if (Object.values(counts).every((value) => value === null)) {
    throw new Error(
      `No metrics given, so there is nothing to record. ${USAGE}`,
    );
  }

  return {
    episodeId,
    platform,
    ...(values['post-id'] ? { postId: values['post-id'].trim() } : {}),
    counts,
  };
}

export function selectSocialPost(
  posts: readonly SocialPostRow[],
  options: { episodeId: string; platform: SocialPlatform },
): SocialPostRow {
  const label = platformLabel(options.platform);
  const [post] = posts;
  if (!post) {
    throw new Error(
      `No ${label} post is recorded for episode ${options.episodeId}. Publish it first, or add its social_posts row by hand.`,
    );
  }
  if (posts.length > 1) {
    const candidates = posts
      .map((row) => `  ${row.id}  published ${row.published_at}`)
      .join('\n');
    throw new Error(
      `Episode ${options.episodeId} has ${posts.length} ${label} posts. Choose one with --post-id:\n${candidates}`,
    );
  }
  return post;
}

export function buildSocialPostMetric(input: {
  post: SocialPostRow;
  capturedAt: Date;
  counts: SocialMetricCounts;
}): NewSocialPostMetric {
  const publishedAt = new Date(input.post.published_at);
  if (Number.isNaN(publishedAt.getTime())) {
    throw new Error(
      `Social post ${input.post.id} has an unreadable published_at (${input.post.published_at}).`,
    );
  }

  const elapsedHours =
    (input.capturedAt.getTime() - publishedAt.getTime()) / 3_600_000;
  return {
    socialPostId: input.post.id,
    capturedAt: input.capturedAt.toISOString(),
    // The column is checked as >= 0, so clock skew between this machine and the
    // platform timestamp must not reject an otherwise valid snapshot.
    ageHours: Math.round(Math.max(0, elapsedHours) * 100) / 100,
    ...input.counts,
  };
}

export function formatMetricsSummary(
  post: SocialPostRow,
  metric: NewSocialPostMetric,
): string {
  const recorded = (
    Object.entries(METRIC_LABELS) as [keyof SocialMetricCounts, string][]
  )
    .filter(([key]) => metric[key] !== null)
    .map(([key, label]) => `${label} ${metric[key]}`)
    .join('  ');

  return [
    `✓ Recorded ${platformLabel(post.platform)} metrics at ${metric.ageHours}h after publish.`,
    `  post  ${post.id}`,
    `  ${recorded}`,
  ].join('\n');
}

async function resolvePostById(
  getPost: typeof getSocialPostById,
  options: { episodeId: string; platform: SocialPlatform },
  postId: string,
): Promise<SocialPostRow> {
  const post = await getPost(postId);
  if (!post) {
    throw new Error(`No social post found with id ${postId}.`);
  }
  if (post.episode_id !== options.episodeId) {
    throw new Error(
      `Social post ${postId} belongs to episode ${post.episode_id}, not ${options.episodeId}.`,
    );
  }
  if (post.platform !== options.platform) {
    throw new Error(
      `Social post ${postId} is a ${platformLabel(post.platform)} post, not ${platformLabel(options.platform)}.`,
    );
  }
  return post;
}

function parseCount(
  flag: string,
  raw: string | undefined,
  options: { allowNegative?: boolean } = {},
): number | null {
  if (raw === undefined) return null;

  const normalized = raw.trim();
  if (!/^-?\d+$/.test(normalized)) {
    throw new Error(`--${flag} must be a whole number, got "${raw}".`);
  }

  const value = Number(normalized);
  if (!Number.isSafeInteger(value)) {
    throw new Error(`--${flag} is out of range, got "${raw}".`);
  }
  if (value < 0 && !options.allowNegative) {
    throw new Error(`--${flag} cannot be negative, got "${raw}".`);
  }
  return value;
}

// jscpd:ignore-start — CLI direct-invocation check, same pattern as social/cli.ts
const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : null;
if (invokedPath === import.meta.url) {
  try {
    await runSocialMetricsCli(process.argv.slice(2));
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
// jscpd:ignore-end
