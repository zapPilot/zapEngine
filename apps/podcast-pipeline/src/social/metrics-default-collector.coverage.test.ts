import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createMetricCollectors: vi.fn(),
  close: vi.fn().mockResolvedValue(undefined),
  updateIdentity: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./metric-collectors.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./metric-collectors.js')>()),
  createMetricsBrowserSession: () => ({ close: mocks.close }),
  createMetricCollectors: mocks.createMetricCollectors,
}));

import type { SocialPostRow } from '../types.js';
import { runAutomaticSocialMetricsCollector } from './metrics.js';

const post: SocialPostRow = {
  id: 'post-rednote',
  episode_id: 'episode-1',
  platform: 'rednote',
  language_code: 'zh-Hant',
  post_url: null,
  platform_post_id: null,
  published_at: '2026-09-28T00:00:00.000Z',
  topic: 'macro',
  hook_type: 'question',
  generated_title: '標題',
  published_title: '標題',
  generated_body: 'generated',
  published_body: 'published',
  hashtags: [],
  video_duration_sec: null,
  content_features: {
    containsQuestion: true,
    containsNumber: false,
    titleChars: 2,
    bodyChars: 9,
    hashtagCount: 0,
  },
  llm_model: 'model',
  review_status: null,
  created_at: '2026-09-28T00:00:00.000Z',
  updated_at: '2026-09-28T00:00:00.000Z',
};

describe('automatic social metrics default collector wiring', () => {
  it('creates and closes the browser session and persists a Rednote identity discovered by the collector callback', async () => {
    mocks.createMetricCollectors.mockImplementationOnce((input) => ({
      rednote: async () => {
        await input.onRednoteIdentity({
          post,
          platformPostId: 'note-1',
          postUrl: 'https://www.xiaohongshu.com/explore/note-1',
        });
        return {
          status: 'collected',
          metrics: {
            views: 10,
            impressions: null,
            likes: 1,
            comments: 0,
            shares: 0,
            saves: 0,
            profileVisits: null,
            followersGained: null,
          },
        };
      },
      x: vi.fn(),
      threads: vi.fn(),
      youtube: vi.fn(),
    }));
    const insertMetric = vi.fn().mockResolvedValue(undefined);

    await runAutomaticSocialMetricsCollector({
      now: () => new Date('2026-09-29T00:00:00.000Z'),
      log: vi.fn(),
      listRecentPosts: vi.fn().mockResolvedValue([post]),
      insertMetric,
      updateIdentity: mocks.updateIdentity,
    });

    expect(mocks.updateIdentity).toHaveBeenCalledWith({
      id: 'post-rednote',
      platformPostId: 'note-1',
      postUrl: 'https://www.xiaohongshu.com/explore/note-1',
    });
    expect(insertMetric).toHaveBeenCalledOnce();
    expect(mocks.close).toHaveBeenCalledOnce();
  });
});
