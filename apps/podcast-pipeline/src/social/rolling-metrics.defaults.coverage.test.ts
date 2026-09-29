import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listPosts: vi.fn(),
  insertMetric: vi.fn(),
  updateIdentity: vi.fn(),
  updateReviewStatus: vi.fn(),
  createCollectors: vi.fn(),
}));

vi.mock('../services/db.js', () => ({
  insertSocialPostMetric: mocks.insertMetric,
  updateSocialPostIdentity: mocks.updateIdentity,
  updateSocialPostReviewStatus: mocks.updateReviewStatus,
}));

vi.mock('./daemon-store.js', () => ({
  listLearningSocialPosts: mocks.listPosts,
}));

vi.mock('./metric-collectors.js', () => ({
  createMetricCollectors: mocks.createCollectors,
}));

import { collectRollingPostMetrics } from './rolling-metrics.js';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listPosts.mockResolvedValue([
    {
      id: 'post-rednote',
      platform: 'rednote',
      published_at: '2026-09-29T00:00:00.000Z',
    },
  ]);
  mocks.insertMetric.mockResolvedValue(undefined);
  mocks.updateIdentity.mockResolvedValue(undefined);
  mocks.updateReviewStatus.mockResolvedValue(undefined);
});

describe('rolling metrics default wiring', () => {
  it('omits the browser option when default collectors run headlessly', async () => {
    const collectRednote = vi.fn().mockResolvedValue({
      status: 'collected',
      metrics: {
        views: 1,
        impressions: null,
        likes: 0,
        comments: 0,
        shares: 0,
        saves: 0,
        profileVisits: null,
        followersGained: null,
        details: null,
      },
    });
    mocks.createCollectors.mockReturnValue({
      rednote: collectRednote,
      x: vi.fn(),
      threads: vi.fn(),
      youtube: vi.fn(),
    });

    await expect(
      collectRollingPostMetrics({
        now: new Date('2026-09-29T01:00:00.000Z'),
        platforms: ['rednote'],
      }),
    ).resolves.toBe(1);

    expect(mocks.createCollectors).toHaveBeenCalledWith(
      expect.not.objectContaining({ browser: expect.anything() }),
    );
  });

  it('wires default DB functions and executes Rednote identity/review callbacks', async () => {
    const collectRednote = vi.fn().mockResolvedValue({
      status: 'collected',
      metrics: {
        views: 9,
        impressions: null,
        likes: 1,
        comments: 0,
        shares: 0,
        saves: 0,
        profileVisits: null,
        followersGained: null,
        details: { source: 'browser' },
      },
    });
    mocks.createCollectors.mockImplementation((options) => {
      options
        .onRednoteIdentity({
          post: { id: 'post-rednote' },
          platformPostId: 'platform-1',
          postUrl: 'https://rednote.example/post-1',
        })
        .catch(() => undefined);
      options
        .onRednoteReviewStatus({
          post: { id: 'post-rednote' },
          reviewStatus: 'approved',
        })
        .catch(() => undefined);
      return {
        rednote: collectRednote,
        x: vi.fn(),
        threads: vi.fn(),
        youtube: vi.fn(),
      };
    });

    await expect(
      collectRollingPostMetrics({
        now: new Date('2026-09-29T01:00:00.000Z'),
        platforms: ['rednote'],
        browser: { close: vi.fn() } as never,
      }),
    ).resolves.toBe(1);

    await vi.waitFor(() => {
      expect(mocks.updateIdentity).toHaveBeenCalledWith({
        id: 'post-rednote',
        platformPostId: 'platform-1',
        postUrl: 'https://rednote.example/post-1',
      });
      expect(mocks.updateReviewStatus).toHaveBeenCalledWith({
        id: 'post-rednote',
        reviewStatus: 'approved',
      });
    });
    expect(mocks.insertMetric).toHaveBeenCalledWith(
      expect.objectContaining({
        socialPostId: 'post-rednote',
        details: { source: 'browser' },
      }),
    );
  });
});
