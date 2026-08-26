import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listLearningSocialPosts: vi.fn(),
  listLearningSocialMetrics: vi.fn(),
  listMetricWindowsForPosts: vi.fn(),
  insertSocialPostMetric: vi.fn(),
  updateSocialPostIdentity: vi.fn(),
  updateSocialPostReviewStatus: vi.fn(),
  createMetricsBrowserSession: vi.fn(),
  closeMetricsBrowserSession: vi.fn(),
  collectRednote: vi.fn(),
  getSocialQueueSnapshot: vi.fn(),
  listUnfinishedSocialPublishJobs: vi.fn(),
  listSocialPostIdentitiesByEpisodes: vi.fn(),
  reconcileSocialPublishJob: vi.fn(),
  listSocialPublishCandidates: vi.fn(),
  listSocialPublishCandidatesForEpisodes: vi.fn(),
  listPartiallyPublishedCohorts: vi.fn(),
  alignPendingSocialPublishSchedules: vi.fn(),
  getActiveSocialStrategies: vi.fn(),
  claimSocialPublishJob: vi.fn(),
  skipOverdueSocialPublishJobs: vi.fn(),
  listPendingSocialPublishSchedules: vi.fn(),
  captureDueAccountSnapshots: vi.fn(),
  refreshSocialStrategies: vi.fn(),
  publishSocialBatch: vi.fn(),
}));

vi.mock('./daemon-store.js', () => ({
  claimSocialPublishBatch: async (...args: unknown[]) => {
    const job = await mocks.claimSocialPublishJob(...args);
    return job ? [job] : [];
  },
  alignPendingSocialPublishSchedules: mocks.alignPendingSocialPublishSchedules,
  completeSocialPublishJob: vi.fn(),
  enqueueSocialPublishJob: vi.fn(),
  ensureSocialDaemonStart: vi.fn(),
  failSocialPublishJob: vi.fn(),
  getActiveSocialStrategies: mocks.getActiveSocialStrategies,
  getSocialQueueSnapshot: mocks.getSocialQueueSnapshot,
  latestPendingSocialPublishSchedule: vi.fn().mockResolvedValue(null),
  listPendingSocialPublishSchedules: mocks.listPendingSocialPublishSchedules,
  listLearningSocialPosts: mocks.listLearningSocialPosts,
  listLearningSocialMetrics: mocks.listLearningSocialMetrics,
  listMetricWindowsForPosts: mocks.listMetricWindowsForPosts,
  listSocialPublishCandidates: mocks.listSocialPublishCandidates,
  listSocialPublishCandidatesForEpisodes:
    mocks.listSocialPublishCandidatesForEpisodes,
  listPartiallyPublishedCohorts: mocks.listPartiallyPublishedCohorts,
  listUnfinishedSocialPublishJobs: mocks.listUnfinishedSocialPublishJobs,
  reconcileSocialPublishJob: mocks.reconcileSocialPublishJob,
  releaseSocialPublishJobLease: vi.fn(),
  skipOverdueSocialPublishJobs: mocks.skipOverdueSocialPublishJobs,
}));

vi.mock('../services/db.js', () => ({
  insertSocialPostMetric: mocks.insertSocialPostMetric,
  listSocialPostIdentitiesByEpisodes: mocks.listSocialPostIdentitiesByEpisodes,
  listSocialPostsByEpisode: vi.fn().mockResolvedValue([]),
  updateSocialPostIdentity: mocks.updateSocialPostIdentity,
  updateSocialPostReviewStatus: mocks.updateSocialPostReviewStatus,
}));

vi.mock('./metric-collectors.js', () => ({
  createMetricCollectors: vi.fn().mockImplementation(() => ({
    x: vi.fn(),
    threads: vi.fn(),
    rednote: mocks.collectRednote,
    youtube: vi.fn(),
  })),
  createMetricsBrowserSession: mocks.createMetricsBrowserSession,
}));

vi.mock('./account-snapshots.js', () => ({
  captureDueAccountSnapshots: mocks.captureDueAccountSnapshots,
}));

vi.mock('./publish-batch.js', () => ({
  publishSocialBatch: mocks.publishSocialBatch,
}));

vi.mock('./strategy.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./strategy.js')>()),
  refreshSocialStrategies: mocks.refreshSocialStrategies,
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
  mocks.listSocialPublishCandidates.mockResolvedValue([]);
  mocks.listSocialPublishCandidatesForEpisodes.mockResolvedValue([]);
  mocks.listPartiallyPublishedCohorts.mockResolvedValue([]);
  mocks.alignPendingSocialPublishSchedules.mockResolvedValue(0);
  mocks.getActiveSocialStrategies.mockResolvedValue([]);
  mocks.getSocialQueueSnapshot.mockResolvedValue({
    pendingCount: 0,
    episodeQueue: [],
    nextByPlatform: {},
  });
  mocks.listUnfinishedSocialPublishJobs.mockResolvedValue([]);
  mocks.listSocialPostIdentitiesByEpisodes.mockResolvedValue([]);
  mocks.claimSocialPublishJob.mockResolvedValue(null);
  mocks.skipOverdueSocialPublishJobs.mockResolvedValue(0);
  mocks.listPendingSocialPublishSchedules.mockResolvedValue([]);
  mocks.listLearningSocialMetrics.mockResolvedValue([]);
  mocks.insertSocialPostMetric.mockResolvedValue({});
  mocks.updateSocialPostReviewStatus.mockResolvedValue(undefined);
  mocks.updateSocialPostIdentity.mockResolvedValue(undefined);
  mocks.createMetricsBrowserSession.mockReturnValue({
    withPage: vi.fn(),
    close: mocks.closeMetricsBrowserSession,
  });
  mocks.closeMetricsBrowserSession.mockResolvedValue(undefined);
  mocks.captureDueAccountSnapshots.mockResolvedValue(0);
});

describe('social daemon terminal metric windows', () => {
  it('does not call the platform collector again after unavailable is recorded', async () => {
    const publishedPost = post();
    const now = new Date('2026-08-16T10:00:00.000Z');
    mocks.listLearningSocialPosts.mockResolvedValue([publishedPost]);
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
});
