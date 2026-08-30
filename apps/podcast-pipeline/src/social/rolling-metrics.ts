import { errorMessage } from '../lib/errorMessage.js';
import {
  insertSocialPostMetric,
  updateSocialPostIdentity,
  updateSocialPostReviewStatus,
} from '../services/db.js';
import type { SocialPostRow } from '../types.js';
import { listLearningSocialPosts } from './daemon-store.js';
import { platformIcon } from './log-format.js';
import {
  createMetricCollectors,
  type MetricsBrowserSession,
} from './metric-collectors.js';
import { buildSocialPostMetric, collectPostMetrics } from './metrics.js';
import type { SocialPlatform } from './types.js';

export const ROLLING_METRIC_LOOKBACK_MS = 48 * 60 * 60_000;

/**
 * Rolling rows exist only to measure post activity inside follower-snapshot
 * intervals. They deliberately carry no measurement window: standard 1h/6h/
 * 24h/72h/7d scheduling remains an independent state machine. YouTube is
 * excluded because it has exact cumulative subscribersGained per video and no
 * follower interval attribution.
 */
export async function collectRollingPostMetrics(input: {
  now: Date;
  platforms: readonly SocialPlatform[];
  browser?: MetricsBrowserSession;
  log?: (message: string) => void;
  listPosts?: typeof listLearningSocialPosts;
  insertMetric?: typeof insertSocialPostMetric;
  collectors?: ReturnType<typeof createMetricCollectors>;
}): Promise<number> {
  const platforms = new Set(
    input.platforms.filter((platform) => platform !== 'youtube'),
  );
  if (platforms.size === 0) return 0;
  const cutoff = new Date(
    input.now.getTime() - ROLLING_METRIC_LOOKBACK_MS,
  ).toISOString();
  const posts = (
    await (input.listPosts ?? listLearningSocialPosts)(cutoff)
  ).filter((post) => isRollingMetricCandidate(post, input.now, platforms));
  if (posts.length === 0) return 0;

  const log = input.log ?? (() => void 0);
  const collectors =
    input.collectors ??
    createMetricCollectors({
      ...(input.browser ? { browser: input.browser } : {}),
      onRednoteIdentity: async ({ post, platformPostId, postUrl }) => {
        await updateSocialPostIdentity({
          id: post.id,
          platformPostId,
          postUrl,
        });
      },
      onRednoteReviewStatus: async ({ post, reviewStatus }) => {
        await updateSocialPostReviewStatus({ id: post.id, reviewStatus });
      },
    });
  const insert = input.insertMetric ?? insertSocialPostMetric;
  let inserted = 0;

  for (const post of posts) {
    try {
      const result = await collectPostMetrics(collectors[post.platform], post);
      if (result.status !== 'collected') continue;
      const { details, ...counts } = result.metrics;
      await insert(
        buildSocialPostMetric({
          post,
          capturedAt: input.now,
          counts,
          ...(details ? { details } : {}),
          collectionStatus: 'collected',
        }),
      );
      inserted += 1;
    } catch (error) {
      log(
        `❌ [social-daemon] ${platformIcon(post.platform)} ${post.platform} · rolling metrics failed · post=${post.id} · ${errorMessage(error)}`,
      );
    }
  }
  if (inserted > 0) {
    log(`📈 [social-daemon] rolling metrics · ${inserted} collected`);
  }
  return inserted;
}

export function isRollingMetricCandidate(
  post: SocialPostRow,
  now: Date,
  platforms: ReadonlySet<SocialPlatform>,
): boolean {
  const publishedAt = Date.parse(post.published_at);
  return (
    platforms.has(post.platform) &&
    Number.isFinite(publishedAt) &&
    publishedAt <= now.getTime() &&
    now.getTime() - publishedAt <= ROLLING_METRIC_LOOKBACK_MS
  );
}
