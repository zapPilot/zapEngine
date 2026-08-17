import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  readPublishState: vi.fn(),
  insertSocialPost: vi.fn(),
  inspectXPublishedPost: vi.fn(),
  inspectXPublishedPostAt: vi.fn(),
  inspectRednotePublishedPost: vi.fn(),
}));

vi.mock('../services/db.js', () => ({
  insertSocialPost: mocks.insertSocialPost,
}));
vi.mock('./state.js', () => ({
  readPublishState: mocks.readPublishState,
}));
vi.mock('./metric-collectors.js', () => ({
  inspectXPublishedPost: mocks.inspectXPublishedPost,
  inspectXPublishedPostAt: mocks.inspectXPublishedPostAt,
  inspectRednotePublishedPost: mocks.inspectRednotePublishedPost,
}));

import type { NewSocialPost, SocialPostRow } from '../types.js';
import { reconcileRecentSocialPosts } from './reconcile.js';

function insertedRow(input: NewSocialPost): SocialPostRow {
  return {
    id: `row-${input.episodeId}-${input.platform}`,
    episode_id: input.episodeId,
    platform: input.platform,
    post_url: input.postUrl,
    platform_post_id: input.platformPostId,
    published_at: input.publishedAt,
    topic: input.topic,
    hook_type: input.hookType,
    generated_title: input.generatedTitle,
    published_title: input.publishedTitle,
    generated_body: input.generatedBody,
    published_body: input.publishedBody,
    hashtags: input.hashtags,
    video_duration_sec: input.videoDurationSec,
    content_features: input.contentFeatures,
    llm_model: input.llmModel,
    created_at: input.publishedAt,
    updated_at: input.publishedAt,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.insertSocialPost.mockImplementation(async (input: NewSocialPost) =>
    insertedRow(input),
  );
  mocks.inspectXPublishedPost.mockResolvedValue({
    platformPostId: 'x-direct',
    postUrl: 'https://x.com/zap/status/101',
    publishedTitle: null,
    publishedBody: 'Direct X post 101',
    hashtags: [],
    videoDurationSec: null,
  });
  mocks.inspectXPublishedPostAt.mockResolvedValue({
    platformPostId: 'x-timestamp',
    postUrl: 'https://x.com/zap/status/102',
    publishedTitle: null,
    publishedBody: 'Timestamp X post 102',
    hashtags: [],
    videoDurationSec: null,
  });
  mocks.inspectRednotePublishedPost.mockResolvedValue({
    platformPostId: 'rednote-103',
    postUrl: 'https://www.xiaohongshu.com/explore/rednote-103',
    publishedTitle: '測試標題',
    publishedBody: '小紅書正文',
    hashtags: ['AI', '投資'],
    videoDurationSec: 30,
  });
});

describe('social reconciliation production dependency wiring', () => {
  it('uses default state, inspectors, and insert function for every recoverable platform path', async () => {
    mocks.readPublishState.mockResolvedValue({
      'profile-source': {
        zh: {
          x: {
            published: true,
            publishedAt: '2026-08-01T00:00:00.000Z',
            url: 'https://x.com/zap/status/99',
          },
        },
      },
      direct: {
        zh: {
          x: {
            published: true,
            publishedAt: '2026-08-16T01:00:00.000Z',
            url: 'https://x.com/zap/status/101',
          },
        },
      },
      timestamp: {
        zh: {
          x: {
            published: true,
            publishedAt: '2026-08-16T02:00:00.000Z',
          },
        },
      },
      rednote: {
        zh: {
          rednote: {
            published: true,
            publishedAt: '2026-08-16T03:00:00.000Z',
          },
        },
      },
    });
    const log = vi.fn();

    const rows = await reconcileRecentSocialPosts({
      posts: [],
      publishedSince: '2026-08-10T00:00:00.000Z',
      log,
    });

    expect(rows).toHaveLength(3);
    expect(mocks.readPublishState).toHaveBeenCalledOnce();
    expect(mocks.inspectXPublishedPost).toHaveBeenCalledWith(
      'https://x.com/zap/status/101',
    );
    expect(mocks.inspectXPublishedPostAt).toHaveBeenCalledWith(
      '2026-08-16T02:00:00.000Z',
      'https://x.com/zap',
    );
    expect(mocks.inspectRednotePublishedPost).toHaveBeenCalledWith(
      '2026-08-16T03:00:00.000Z',
    );
    expect(mocks.insertSocialPost).toHaveBeenCalledTimes(3);
    expect(log).toHaveBeenCalledWith(
      'Social telemetry reconciliation: 3 repaired.',
    );
  });
});
