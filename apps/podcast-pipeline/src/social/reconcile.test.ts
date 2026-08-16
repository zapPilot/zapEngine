import { describe, expect, it, vi } from 'vitest';

import type { NewSocialPost, SocialPostRow } from '../types.js';
import type { RecoveredPublishedPost } from './metric-collectors.js';
import {
  buildRecoveredSocialPost,
  findXProfileUrl,
  inferRecoveredTaxonomy,
  reconcileRecentSocialPosts,
} from './reconcile.js';
import type { SocialPublishState } from './types.js';

const sibling: SocialPostRow = {
  id: 'sibling-post',
  episode_id: 'episode-1',
  platform: 'rednote',
  post_url: 'https://www.xiaohongshu.com/explore/existing',
  platform_post_id: 'existing',
  published_at: '2026-08-16T01:48:53.342Z',
  topic: 'technology',
  hook_type: 'surprising_number',
  generated_title: 'AI 中轉站',
  published_title: 'AI 中轉站',
  generated_body: 'generated',
  published_body: 'published',
  hashtags: ['AI'],
  video_duration_sec: 480,
  content_features: {
    containsQuestion: false,
    containsNumber: false,
    titleChars: 6,
    bodyChars: 9,
    hashtagCount: 1,
  },
  llm_model: 'model-1',
  created_at: '2026-08-16T01:49:00.000Z',
  updated_at: '2026-08-16T01:49:00.000Z',
};

function rowFromNewPost(post: NewSocialPost): SocialPostRow {
  return {
    id: `recovered-${post.platform}`,
    episode_id: post.episodeId,
    platform: post.platform,
    post_url: post.postUrl,
    platform_post_id: post.platformPostId,
    published_at: post.publishedAt,
    topic: post.topic,
    hook_type: post.hookType,
    generated_title: post.generatedTitle,
    published_title: post.publishedTitle,
    generated_body: post.generatedBody,
    published_body: post.publishedBody,
    hashtags: post.hashtags,
    video_duration_sec: post.videoDurationSec,
    content_features: post.contentFeatures,
    llm_model: post.llmModel,
    created_at: '2026-08-16T10:00:00.000Z',
    updated_at: '2026-08-16T10:00:00.000Z',
  };
}

describe('social telemetry reconciliation', () => {
  it('rebuilds a missing X telemetry row from local publish state and a sibling taxonomy', async () => {
    const state: SocialPublishState = {
      'episode-1': {
        zh: {
          x: {
            published: true,
            publishedAt: '2026-08-16T01:50:42.907Z',
            url: 'https://x.com/fromfedtochain/status/2088805628345188514',
          },
        },
      },
    };
    const discovered: RecoveredPublishedPost = {
      platformPostId: '2088805628345188514',
      postUrl: 'https://x.com/fromfedtochain/status/2088805628345188514',
      publishedTitle: null,
      publishedBody: '中轉站利潤薄、流失高，但真正賺錢的只有那10%。',
      hashtags: [],
      videoDurationSec: null,
    };
    const insertPost = vi.fn(async (post: NewSocialPost) =>
      rowFromNewPost(post),
    );
    const inspectX = vi.fn(async () => discovered);
    const log = vi.fn();

    const rows = await reconcileRecentSocialPosts({
      posts: [sibling],
      publishedSince: '2026-08-10T10:00:00.000Z',
      log,
      dependencies: {
        readState: async () => state,
        insertPost,
        inspectX,
      },
    });

    expect(inspectX).toHaveBeenCalledWith(
      'https://x.com/fromfedtochain/status/2088805628345188514',
    );
    expect(insertPost).toHaveBeenCalledWith(
      expect.objectContaining({
        episodeId: 'episode-1',
        platform: 'x',
        platformPostId: '2088805628345188514',
        topic: 'technology',
        hookType: 'surprising_number',
        publishedBody: discovered.publishedBody,
        contentFeatures: expect.objectContaining({ telemetryRecovered: true }),
      }),
    );
    expect(rows.map((row) => row.id)).toContain('recovered-x');
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('Reconciled missing X telemetry'),
    );
  });

  it('recovers X by publish timestamp when an old local state entry lost its post URL', async () => {
    const state: SocialPublishState = {
      'episode-1': {
        zh: {
          rednote: {
            published: true,
            publishedAt: sibling.published_at,
          },
          x: {
            published: true,
            publishedAt: '2026-08-16T01:50:42.907Z',
          },
        },
      },
      'episode-profile-source': {
        zh: {
          x: {
            published: true,
            publishedAt: '2026-08-15T03:08:23.445Z',
            url: 'https://x.com/fromfedtochain/status/2088462776549494987',
          },
        },
      },
    };
    const discovered: RecoveredPublishedPost = {
      platformPostId: '2088805628345188514',
      postUrl: 'https://x.com/fromfedtochain/status/2088805628345188514',
      publishedTitle: null,
      publishedBody: '中轉站利潤薄、流失高，但真正賺錢的只有那10%。',
      hashtags: [],
      videoDurationSec: null,
    };
    const inspectXAt = vi.fn(async () => discovered);
    const insertPost = vi.fn(async (post: NewSocialPost) =>
      rowFromNewPost(post),
    );

    const rows = await reconcileRecentSocialPosts({
      posts: [sibling],
      publishedSince: '2026-08-10T00:00:00.000Z',
      log: vi.fn(),
      dependencies: {
        readState: async () => state,
        inspectXAt,
        insertPost,
        inspectX: async () => discovered,
      },
    });

    expect(findXProfileUrl(state)).toBe('https://x.com/fromfedtochain');
    expect(inspectXAt).toHaveBeenCalledWith(
      '2026-08-16T01:50:42.907Z',
      'https://x.com/fromfedtochain',
    );
    expect(
      rows.some((row) => row.platform_post_id === '2088805628345188514'),
    ).toBe(true);
  });

  it('does not duplicate a state entry that already has a matching database row', async () => {
    const state: SocialPublishState = {
      'episode-1': {
        zh: {
          rednote: {
            published: true,
            publishedAt: sibling.published_at,
          },
        },
      },
    };
    const insertPost = vi.fn();
    const inspectRednote = vi.fn();

    const rows = await reconcileRecentSocialPosts({
      posts: [sibling],
      publishedSince: '2026-08-10T00:00:00.000Z',
      log: vi.fn(),
      dependencies: {
        readState: async () => state,
        insertPost,
        inspectRednote,
      },
    });

    expect(rows).toEqual([sibling]);
    expect(inspectRednote).not.toHaveBeenCalled();
    expect(insertPost).not.toHaveBeenCalled();
  });

  it('recovers an orphan with conservative inferred taxonomy when no sibling row exists', async () => {
    const state: SocialPublishState = {
      'episode-orphan': {
        zh: {
          x: {
            published: true,
            publishedAt: '2026-08-14T08:01:43.255Z',
            url: 'https://x.com/fromfedtochain/status/2088174209709363415',
          },
        },
      },
    };
    const discovered: RecoveredPublishedPost = {
      platformPostId: '2088174209709363415',
      postUrl: 'https://x.com/fromfedtochain/status/2088174209709363415',
      publishedTitle: null,
      publishedBody:
        '韓國股市一降溫，Upbit 和 Bithumb 一個月內各上 17 種韓元交易資產。',
      hashtags: [],
      videoDurationSec: null,
    };
    const inspectX = vi.fn(async () => discovered);
    const insertPost = vi.fn(async (post: NewSocialPost) =>
      rowFromNewPost(post),
    );
    const log = vi.fn();

    const rows = await reconcileRecentSocialPosts({
      posts: [],
      publishedSince: '2026-08-10T00:00:00.000Z',
      log,
      dependencies: {
        readState: async () => state,
        inspectX,
        insertPost,
      },
    });

    expect(rows).toHaveLength(1);
    expect(insertPost).toHaveBeenCalledWith(
      expect.objectContaining({
        topic: 'market_event',
        hookType: 'surprising_number',
        llmModel: null,
        contentFeatures: expect.objectContaining({ telemetryRecovered: true }),
      }),
    );
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('inferred taxonomy'),
    );
  });

  it('infers obvious recovered topic signals without calling an LLM', () => {
    expect(inferRecoveredTaxonomy('以太坊 EIP-8363 質押率達 50%')).toEqual({
      topic: 'eth',
      hookType: 'surprising_number',
    });
    expect(inferRecoveredTaxonomy('GPU 也能分期買？')).toEqual({
      topic: 'technology',
      hookType: 'question',
    });
  });

  it('keeps recovered Rednote hashtags and video duration while marking copy metadata as recovered', () => {
    const recovered = buildRecoveredSocialPost({
      episodeId: 'episode-1',
      platform: 'rednote',
      published: {
        published: true,
        publishedAt: '2026-08-15T03:11:19.482Z',
      },
      sibling,
      discovered: {
        platformPostId: '6a7fd8d70000000008009c00',
        postUrl: 'https://www.xiaohongshu.com/explore/6a7fd8d70000000008009c00',
        publishedTitle: '2025年底，Manus以超過20億美元',
        publishedBody: 'Manus ARR 突破3億美元，風波期間收入反而上升。',
        hashtags: ['Manus', 'Meta', 'AI創業', '創業故事', '大模型'],
        videoDurationSec: 480,
      },
    });

    expect(recovered).toMatchObject({
      platform: 'rednote',
      hashtags: ['Manus', 'Meta', 'AI創業', '創業故事', '大模型'],
      videoDurationSec: 480,
      contentFeatures: {
        telemetryRecovered: true,
        hashtagCount: 5,
      },
    });
  });
});
