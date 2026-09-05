import { describe, expect, it, vi } from 'vitest';

const cleanup = vi.hoisted(() => ({
  getEvidence: vi.fn(),
  closeRelease: vi.fn(),
}));

vi.mock('./services/social-release-cleanup.js', () => ({
  createSocialReleaseCleanupService: () => cleanup,
}));

import { createControlCenterApp } from './app.js';
import { readControlCenterConfig } from './config/env.js';

const EPISODE_ID = '826f4b87-6278-4275-bff5-535ba5ef438d';

function app() {
  return createControlCenterApp({
    config: readControlCenterConfig({}),
    podcastPipeline: {
      getPipeline: vi.fn(),
      restartIngest: vi.fn(),
      restartVideo: vi.fn(),
      restartRender: vi.fn(),
    } as never,
    podcastVisual: {
      getVisualDebug: vi.fn(),
      upsertReview: vi.fn(),
      resolveReview: vi.fn(),
    } as never,
    service: {
      getOverview: vi.fn(),
      getCostHistory: vi.fn(),
      syncCosts: vi.fn(),
      getSocial: vi.fn(),
    } as never,
    operations: {
      getOperations: vi.fn(),
      getSocial: vi.fn(),
      getCustomers: vi.fn(),
      inspectSignal: vi.fn(),
      resolveSentryIssue: vi.fn(),
      investigate: vi.fn(),
    } as never,
    socialGrowth: { getSocialGrowth: vi.fn() } as never,
    serveClient: false,
  });
}

describe('social release cleanup routes', () => {
  it('returns post evidence for the Distribution board', async () => {
    cleanup.getEvidence.mockResolvedValueOnce({
      generatedAt: '2026-09-05T04:00:00.000Z',
      posts: [
        {
          episodeId: EPISODE_ID,
          platform: 'x',
          languageCode: 'en',
          postUrl: 'https://x.com/zap/status/1',
          publishedAt: '2026-09-05T03:30:00.000Z',
        },
      ],
      message: null,
    });

    const response = await app().request(
      '/api/operations/social/release-evidence',
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      posts: [{ postUrl: 'https://x.com/zap/status/1' }],
    });
  });

  it('marks an episode complete through the bounded cleanup service', async () => {
    cleanup.closeRelease.mockResolvedValueOnce({ skipped: 2 });

    const response = await app().request(
      `/api/operations/social/${EPISODE_ID}/complete`,
      { method: 'POST' },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ skipped: 2 });
    expect(cleanup.closeRelease).toHaveBeenCalledWith(EPISODE_ID);
  });

  it('maps a live publish lease conflict to 409', async () => {
    cleanup.closeRelease.mockRejectedValueOnce(
      Object.assign(new Error('Social release is currently processing'), {
        code: '55000',
      }),
    );

    const response = await app().request(
      `/api/operations/social/${EPISODE_ID}/complete`,
      { method: 'POST' },
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: 'Social release is currently processing',
    });
  });
});
