import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  alignPendingSocialPublishSchedules: vi.fn(),
  captureDueAccountSnapshots: vi.fn(),
  claimSocialPublishBatch: vi.fn(),
  closeMetricsBrowserSession: vi.fn(),
  collectRednote: vi.fn(),
  insertSocialPostMetric: vi.fn(),
  listLearningSocialPosts: vi.fn(),
  listMetricWindowsForPosts: vi.fn(),
  listPartiallyPublishedCohorts: vi.fn(),
  listPendingSocialPublishSchedules: vi.fn(),
  listSocialPublishCandidates: vi.fn(),
  listUnfinishedSocialPublishJobs: vi.fn(),
}));

vi.mock('./daemon-store.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./daemon-store.js')>()),
  alignPendingSocialPublishSchedules: mocks.alignPendingSocialPublishSchedules,
  claimSocialPublishBatch: mocks.claimSocialPublishBatch,
  listLearningSocialPosts: mocks.listLearningSocialPosts,
  listMetricWindowsForPosts: mocks.listMetricWindowsForPosts,
  listPartiallyPublishedCohorts: mocks.listPartiallyPublishedCohorts,
  listPendingSocialPublishSchedules: mocks.listPendingSocialPublishSchedules,
  listSocialPublishCandidates: mocks.listSocialPublishCandidates,
  listUnfinishedSocialPublishJobs: mocks.listUnfinishedSocialPublishJobs,
}));

vi.mock('../services/db.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/db.js')>()),
  insertSocialPostMetric: mocks.insertSocialPostMetric,
}));

vi.mock('./metric-collectors.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./metric-collectors.js')>()),
  createMetricCollectors: vi.fn().mockImplementation(() => ({
    x: vi.fn(),
    threads: vi.fn(),
    rednote: mocks.collectRednote,
    youtube: vi.fn(),
  })),
  createMetricsBrowserSession: vi.fn().mockImplementation(() => ({
    withPage: vi.fn(),
    close: mocks.closeMetricsBrowserSession,
  })),
}));

vi.mock('./account-snapshots.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./account-snapshots.js')>()),
  captureDueAccountSnapshots: mocks.captureDueAccountSnapshots,
}));

import type { SocialPostRow } from '../types.js';
import { runSocialDaemonTick } from './daemon.js';

function post(): SocialPostRow {
  return {
    id: 'post-1',
    episode_id: 'episode-1',
    platform: 'rednote',
    post_url: 'https://www.xiaohongshu.com/explore/note-1',
    platform_post_id: 'note-1',
    published_at: '2026-08-13T10:00:00.000Z',
    topic: 'macro',
    hook_type: 'question',
    generated_title: 'title',
    published_title: 'title',
    generated_body: 'generated',
    published_body: 'published',
    hashtags: ['AI'],
    video_duration_sec: 120,
    content_features: {
      containsQuestion: true,
      containsNumber: false,
      titleChars: 4,
      bodyChars: 9,
      hashtagCount: 1,
    },
    llm_model: 'model',
    review_status: 'visible',
    created_at: '2026-08-13T10:00:00.000Z',
    updated_at: '2026-08-13T10:00:00.000Z',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.alignPendingSocialPublishSchedules.mockResolvedValue(0);
  mocks.captureDueAccountSnapshots.mockResolvedValue(0);
  mocks.claimSocialPublishBatch.mockResolvedValue([]);
  mocks.closeMetricsBrowserSession.mockResolvedValue(undefined);
  mocks.insertSocialPostMetric.mockResolvedValue({});
  mocks.listPartiallyPublishedCohorts.mockResolvedValue([]);
  mocks.listPendingSocialPublishSchedules.mockResolvedValue([]);
  mocks.listSocialPublishCandidates.mockResolvedValue([]);
  mocks.listUnfinishedSocialPublishJobs.mockResolvedValue([]);
});

describe('social daemon terminal metric windows', () => {
  it('does not call the platform collector again after unavailable is recorded', async () => {
    const now = new Date('2026-08-16T10:00:00.000Z');
    mocks.listLearningSocialPosts.mockResolvedValue([post()]);
    mocks.listMetricWindowsForPosts
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { social_post_id: 'post-1', measurement_window: '72h' },
      ]);
    mocks.collectRednote.mockResolvedValue({
      status: 'unavailable',
      reason: 'rednote post note-1 not found in manager',
    });

    const tick = () =>
      runSocialDaemonTick({
        now,
        firstStartedAt: '2026-08-16T08:00:00.000Z',
        log: vi.fn(),
      });

    await tick();
    await tick();

    expect(mocks.collectRednote).toHaveBeenCalledTimes(1);
    expect(mocks.insertSocialPostMetric).toHaveBeenCalledTimes(1);
    expect(mocks.insertSocialPostMetric).toHaveBeenCalledWith(
      expect.objectContaining({
        socialPostId: 'post-1',
        measurementWindow: '72h',
        collectionStatus: 'unavailable',
      }),
    );
    expect(mocks.listMetricWindowsForPosts).toHaveBeenCalledTimes(2);
  });

  it('still collects a later due window after an earlier window is unavailable', async () => {
    const now = new Date('2026-08-20T10:00:00.000Z');
    mocks.listLearningSocialPosts.mockResolvedValue([post()]);
    mocks.listMetricWindowsForPosts.mockResolvedValue([
      { social_post_id: 'post-1', measurement_window: '72h' },
    ]);
    mocks.collectRednote.mockResolvedValue({
      status: 'collected',
      metrics: {
        views: 1200,
        impressions: null,
        likes: 45,
        comments: 3,
        shares: 2,
        saves: 8,
        profileVisits: null,
        followersGained: null,
      },
    });

    await runSocialDaemonTick({
      now,
      firstStartedAt: '2026-08-20T08:00:00.000Z',
      log: vi.fn(),
    });

    expect(mocks.collectRednote).toHaveBeenCalledTimes(1);
    expect(mocks.insertSocialPostMetric).toHaveBeenCalledTimes(1);
    expect(mocks.insertSocialPostMetric).toHaveBeenCalledWith(
      expect.objectContaining({
        socialPostId: 'post-1',
        measurementWindow: '7d',
        collectionStatus: 'collected',
        views: 1200,
      }),
    );
  });

  it('retries a later metric window after a retryable failure even when an earlier window is terminal', async () => {
    const now = new Date('2026-08-20T10:00:00.000Z');
    mocks.listLearningSocialPosts.mockResolvedValue([post()]);
    mocks.listMetricWindowsForPosts.mockResolvedValue([
      { social_post_id: 'post-1', measurement_window: '72h' },
    ]);
    mocks.collectRednote
      .mockResolvedValueOnce({
        status: 'retryable',
        reason: 'temporary Rednote metrics failure',
      })
      .mockResolvedValueOnce({
        status: 'collected',
        metrics: {
          views: 1300,
          impressions: null,
          likes: 50,
          comments: 4,
          shares: 3,
          saves: 9,
          profileVisits: null,
          followersGained: null,
        },
      });

    const tick = () =>
      runSocialDaemonTick({
        now,
        firstStartedAt: '2026-08-20T08:00:00.000Z',
        log: vi.fn(),
      });

    await tick();
    await tick();

    expect(mocks.collectRednote).toHaveBeenCalledTimes(2);
    expect(mocks.insertSocialPostMetric).toHaveBeenCalledTimes(1);
    expect(mocks.insertSocialPostMetric).toHaveBeenCalledWith(
      expect.objectContaining({
        socialPostId: 'post-1',
        measurementWindow: '7d',
        collectionStatus: 'collected',
        views: 1300,
      }),
    );
  });
});
