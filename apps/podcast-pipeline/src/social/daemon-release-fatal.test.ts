import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listPastDueSocialPublishJobs: vi.fn().mockResolvedValue([]),
  rescheduleSocialPublishJob: vi.fn().mockResolvedValue(true),
  claimSocialPublishBatch: vi.fn().mockResolvedValue([]),
  completeSocialPublishJob: vi.fn(),
  enqueueSocialPublishJob: vi.fn().mockResolvedValue(true),
  ensureSocialDaemonStart: vi.fn(),
  failSocialPublishJob: vi.fn(),
  getActiveSocialStrategies: vi.fn().mockResolvedValue([]),
  getSocialQueueSnapshot: vi.fn().mockResolvedValue({
    pendingCount: 0,
    episodeQueue: [],
    nextByPlatform: {},
  }),
  listPendingSocialPublishSchedules: vi.fn().mockResolvedValue([]),
  listLearningSocialPosts: vi.fn().mockResolvedValue([]),
  listLearningSocialMetrics: vi.fn().mockResolvedValue([]),
  listMetricWindowsForPosts: vi.fn().mockResolvedValue([]),
  listSocialPublishCandidates: vi.fn().mockResolvedValue([]),
  listSocialPublishCandidatesForEpisodes: vi.fn().mockResolvedValue([]),
  listUnfinishedSocialPublishJobs: vi.fn().mockResolvedValue([]),
  reconcileSocialPublishJob: vi.fn(),
  releaseSocialPublishJobLease: vi.fn().mockResolvedValue(undefined),
  insertSocialPostMetric: vi.fn(),
  listSocialPostIdentitiesByEpisodes: vi.fn().mockResolvedValue([]),
  listSocialPostsByEpisode: vi.fn().mockResolvedValue([]),
  updateSocialPostIdentity: vi.fn(),
  updateSocialPostReviewStatus: vi.fn(),
  publishSocialBatch: vi.fn(),
  createMetricCollectors: vi.fn().mockReturnValue({
    x: vi.fn(),
    threads: vi.fn(),
    rednote: vi.fn(),
    youtube: vi.fn(),
  }),
  createMetricsBrowserSession: vi.fn().mockReturnValue({
    withPage: vi.fn(),
    close: vi.fn(),
  }),
  captureDueAccountSnapshots: vi.fn().mockResolvedValue(0),
  refreshSocialStrategies: vi.fn(),
  getOrCreateExperimentAssignment: vi.fn(),
  getAllowedTelegramUserIds: vi.fn(),
  sendTelegramNotification: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./daemon-store.js', () => ({
  listPastDueSocialPublishJobs: mocks.listPastDueSocialPublishJobs,
  rescheduleSocialPublishJob: mocks.rescheduleSocialPublishJob,
  claimSocialPublishBatch: mocks.claimSocialPublishBatch,
  completeSocialPublishJob: mocks.completeSocialPublishJob,
  enqueueSocialPublishJob: mocks.enqueueSocialPublishJob,
  ensureSocialDaemonStart: mocks.ensureSocialDaemonStart,
  failSocialPublishJob: mocks.failSocialPublishJob,
  getActiveSocialStrategies: mocks.getActiveSocialStrategies,
  getSocialQueueSnapshot: mocks.getSocialQueueSnapshot,
  latestPendingSocialPublishSchedule: vi.fn().mockResolvedValue(null),
  listPendingSocialPublishSchedules: mocks.listPendingSocialPublishSchedules,
  listLearningSocialPosts: mocks.listLearningSocialPosts,
  listLearningSocialMetrics: mocks.listLearningSocialMetrics,
  listMetricWindowsForPosts: mocks.listMetricWindowsForPosts,
  listSocialEpisodeLocalizationTitles: vi.fn().mockResolvedValue([]),
  listSocialPublishCandidates: mocks.listSocialPublishCandidates,
  listSocialPublishCandidatesForEpisodes:
    mocks.listSocialPublishCandidatesForEpisodes,
  listUnfinishedSocialPublishJobs: mocks.listUnfinishedSocialPublishJobs,
  reconcileSocialPublishJob: mocks.reconcileSocialPublishJob,
  releaseSocialPublishJobLease: mocks.releaseSocialPublishJobLease,
}));

vi.mock('../services/db.js', () => ({
  insertSocialPostMetric: mocks.insertSocialPostMetric,
  listSocialPostIdentitiesByEpisodes: mocks.listSocialPostIdentitiesByEpisodes,
  listSocialPostsByEpisode: mocks.listSocialPostsByEpisode,
  updateSocialPostIdentity: mocks.updateSocialPostIdentity,
  updateSocialPostReviewStatus: mocks.updateSocialPostReviewStatus,
}));
vi.mock('./account-snapshots.js', () => ({
  captureDueAccountSnapshots: mocks.captureDueAccountSnapshots,
}));
vi.mock('./publish-batch.js', () => ({
  publishSocialBatch: mocks.publishSocialBatch,
}));
vi.mock('./metric-collectors.js', () => ({
  createMetricCollectors: mocks.createMetricCollectors,
  createMetricsBrowserSession: mocks.createMetricsBrowserSession,
}));
vi.mock('./strategy.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./strategy.js')>()),
  refreshSocialStrategies: mocks.refreshSocialStrategies,
}));
vi.mock('./experiments.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./experiments.js')>()),
  getOrCreateExperimentAssignment: mocks.getOrCreateExperimentAssignment,
}));
vi.mock('../lib/env.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/env.js')>()),
  getAllowedTelegramUserIds: mocks.getAllowedTelegramUserIds,
}));
vi.mock('../services/telegram.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/telegram.js')>()),
  sendTelegramNotification: mocks.sendTelegramNotification,
}));

import {
  buildFatalReport,
  fatalSummary,
  notifyFatalFailure,
  runSocialDaemon,
  runSocialDaemonTick,
} from './daemon.js';
import { SocialReleaseFailureError } from './publish-error.js';

// 10:00 JST: inside the window `publishDueJobs` will claim in.
const NOW = new Date('2026-08-16T01:00:00.000Z');
const FIRST_STARTED_AT = '2026-08-16T08:00:00.000Z';
const EPISODE_A = '123e4567-e89b-42d3-a456-426614174000';
const EPISODE_B = '123e4567-e89b-42d3-a456-426614174001';

function job(input: Record<string, unknown>) {
  return {
    id: 'job',
    episode_id: EPISODE_A,
    platform: 'x',
    language_code: 'ja',
    status: 'processing',
    scheduled_at: NOW.toISOString(),
    next_attempt_at: NOW.toISOString(),
    strategy_version_id: null,
    social_post_id: null,
    attempt_count: 1,
    lease_owner: 'owner',
    lease_expires_at: new Date(NOW.getTime() + 60 * 60_000).toISOString(),
    last_error: null,
    completed_at: null,
    created_at: NOW.toISOString(),
    updated_at: NOW.toISOString(),
    ...input,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listPastDueSocialPublishJobs.mockResolvedValue([]);
  mocks.rescheduleSocialPublishJob.mockResolvedValue(true);
  mocks.claimSocialPublishBatch.mockResolvedValue([]);
  mocks.listUnfinishedSocialPublishJobs.mockResolvedValue([]);
  mocks.listSocialPublishCandidates.mockResolvedValue([]);
  mocks.listSocialPublishCandidatesForEpisodes.mockResolvedValue([]);
  mocks.listSocialPostsByEpisode.mockResolvedValue([]);
  mocks.listLearningSocialPosts.mockResolvedValue([]);
  mocks.releaseSocialPublishJobLease.mockResolvedValue(undefined);
  mocks.failSocialPublishJob.mockResolvedValue(undefined);
  mocks.ensureSocialDaemonStart.mockResolvedValue(FIRST_STARTED_AT);
  mocks.getAllowedTelegramUserIds.mockReturnValue(new Set(['111']));
  mocks.sendTelegramNotification.mockResolvedValue(undefined);
});

describe('social daemon release-shape stages are fatal', () => {
  it('stops the tick when the reconcile sweep fails', async () => {
    mocks.listUnfinishedSocialPublishJobs.mockRejectedValue(
      new Error('reconcile lookup down'),
    );

    await expect(
      runSocialDaemonTick({ now: NOW, firstStartedAt: FIRST_STARTED_AT }),
    ).rejects.toThrow('reconcile lookup down');

    expect(mocks.listPastDueSocialPublishJobs).not.toHaveBeenCalled();
    expect(mocks.listSocialPublishCandidates).not.toHaveBeenCalled();
    expect(mocks.claimSocialPublishBatch).not.toHaveBeenCalled();
  });

  it('stops the tick when rescheduling a missed slot fails', async () => {
    mocks.listPastDueSocialPublishJobs.mockRejectedValue(
      new Error('past-due read down'),
    );

    await expect(
      runSocialDaemonTick({ now: NOW, firstStartedAt: FIRST_STARTED_AT }),
    ).rejects.toThrow('past-due read down');

    expect(mocks.listSocialPublishCandidates).not.toHaveBeenCalled();
    expect(mocks.claimSocialPublishBatch).not.toHaveBeenCalled();
  });

  it('stops the tick when discovery fails', async () => {
    mocks.listSocialPublishCandidates.mockRejectedValue(
      new Error('candidates query down'),
    );

    await expect(
      runSocialDaemonTick({ now: NOW, firstStartedAt: FIRST_STARTED_AT }),
    ).rejects.toThrow('candidates query down');

    expect(mocks.claimSocialPublishBatch).not.toHaveBeenCalled();
    expect(mocks.listLearningSocialPosts).not.toHaveBeenCalled();
  });

  it('stops the tick on a publish failure and releases only lanes never attempted', async () => {
    const jobA1 = job({ id: 'a1', episode_id: EPISODE_A, platform: 'x' });
    const jobA2 = job({ id: 'a2', episode_id: EPISODE_A, platform: 'threads' });
    const jobB1 = job({
      id: 'b1',
      episode_id: EPISODE_B,
      platform: 'x',
      language_code: 'en',
      scheduled_at: '2026-08-16T09:00:00.000Z',
    });
    mocks.claimSocialPublishBatch.mockResolvedValue([jobA1, jobA2, jobB1]);
    mocks.publishSocialBatch.mockRejectedValue(
      new SocialReleaseFailureError({
        episodeId: EPISODE_A,
        languageCode: 'ja',
        platform: 'x',
        phase: 'transport',
        cause: new Error('x publish failed'),
        publishedLanes: [],
        untouchedLanes: ['threads'],
      }),
    );

    await expect(
      runSocialDaemonTick({ now: NOW, firstStartedAt: FIRST_STARTED_AT }),
    ).rejects.toThrow('x publish failed');

    expect(mocks.publishSocialBatch).toHaveBeenCalledOnce();
    expect(mocks.failSocialPublishJob).not.toHaveBeenCalled();
    // Episode B's lane was never claimed for publishing at all -- safe to
    // hand back immediately.
    expect(mocks.releaseSocialPublishJobLease).toHaveBeenCalledWith({
      jobId: 'b1',
      owner: expect.any(String),
      scheduledAt: '2026-08-16T09:00:00.000Z',
      now: NOW,
    });
    // Episode A's own lanes stay untouched (not released back to queued):
    // threads may already be live from this same failed batch call, and
    // releasing it would risk a duplicate publish.
    expect(mocks.releaseSocialPublishJobLease).not.toHaveBeenCalledWith(
      expect.objectContaining({ jobId: 'a1' }),
    );
    expect(mocks.releaseSocialPublishJobLease).not.toHaveBeenCalledWith(
      expect.objectContaining({ jobId: 'a2' }),
    );
    expect(mocks.releaseSocialPublishJobLease).toHaveBeenCalledTimes(1);

    // Nothing after the publish stage ran this tick.
    expect(mocks.listLearningSocialPosts).not.toHaveBeenCalled();
    expect(mocks.captureDueAccountSnapshots).not.toHaveBeenCalled();
  });

  it('does not let a failed lease release mask the original fatal error', async () => {
    const jobA1 = job({ id: 'a1', episode_id: EPISODE_A, platform: 'x' });
    const jobB1 = job({
      id: 'b1',
      episode_id: EPISODE_B,
      platform: 'x',
      language_code: 'en',
    });
    mocks.claimSocialPublishBatch.mockResolvedValue([jobA1, jobB1]);
    mocks.publishSocialBatch.mockRejectedValue(
      new SocialReleaseFailureError({
        episodeId: EPISODE_A,
        languageCode: 'ja',
        platform: 'x',
        phase: 'transport',
        cause: new Error('x publish failed'),
      }),
    );
    mocks.releaseSocialPublishJobLease.mockRejectedValue(
      new Error('lease release also failed'),
    );

    await expect(
      runSocialDaemonTick({ now: NOW, firstStartedAt: FIRST_STARTED_AT }),
    ).rejects.toThrow('x publish failed');
  });

  it('propagates a fatal tick out of the daemon loop instead of sleeping to the next tick', async () => {
    mocks.listUnfinishedSocialPublishJobs.mockRejectedValue(
      new Error('reconcile lookup down'),
    );
    const sleep = vi.fn();

    await expect(
      runSocialDaemon({
        now: () => NOW,
        sleep,
        log: vi.fn(),
        recordTick: vi.fn(),
      }),
    ).rejects.toThrow('reconcile lookup down');

    expect(sleep).not.toHaveBeenCalled();
  });
});

describe('fatal report formatting and notification', () => {
  it('names the episode, platform, and phase for a release failure', () => {
    const error = new SocialReleaseFailureError({
      episodeId: EPISODE_A,
      languageCode: 'ja',
      platform: 'x',
      phase: 'transport',
      cause: new Error('x publish failed'),
      publishedLanes: ['threads'],
      untouchedLanes: ['youtube'],
    });

    expect(fatalSummary(error)).toBe(
      `x/ja for episode ${EPISODE_A} (transport): x publish failed`,
    );
    expect(buildFatalReport(error)).toBe(
      [
        `❌ [social-daemon] FATAL: x/ja for episode ${EPISODE_A} (transport): x publish failed`,
        '  published before failure: threads',
        '  untouched after failure: youtube',
      ].join('\n'),
    );
  });

  it('falls back to the plain error message for a non-release failure, with no lane detail', () => {
    const error = new Error('reconcile lookup down');

    expect(fatalSummary(error)).toBe('reconcile lookup down');
    expect(buildFatalReport(error)).toBe(
      '❌ [social-daemon] FATAL: reconcile lookup down',
    );
  });

  it('labels empty lane lists as none rather than leaving them blank', () => {
    const error = new SocialReleaseFailureError({
      episodeId: EPISODE_A,
      languageCode: 'ja',
      platform: 'x',
      phase: 'transport',
      cause: new Error('x publish failed'),
    });

    expect(buildFatalReport(error)).toContain(
      '  published before failure: (none)',
    );
    expect(buildFatalReport(error)).toContain(
      '  untouched after failure: (none)',
    );
  });

  it('sends a Telegram notice to the first allowed user when configured', async () => {
    mocks.getAllowedTelegramUserIds.mockReturnValue(new Set(['111', '222']));

    await notifyFatalFailure(new Error('reconcile lookup down'));

    expect(mocks.sendTelegramNotification).toHaveBeenCalledWith(
      '111',
      expect.stringContaining('reconcile lookup down'),
    );
  });

  it('skips notifying silently when no allowed user is configured', async () => {
    mocks.getAllowedTelegramUserIds.mockReturnValue(new Set());

    await expect(
      notifyFatalFailure(new Error('reconcile lookup down')),
    ).resolves.toBeUndefined();

    expect(mocks.sendTelegramNotification).not.toHaveBeenCalled();
  });

  it('never lets a broken Telegram config mask the original fatal error', async () => {
    mocks.getAllowedTelegramUserIds.mockImplementation(() => {
      throw new Error('PIPELINE_TELEGRAM_ALLOWED_USER_IDS missing');
    });

    await expect(
      notifyFatalFailure(new Error('reconcile lookup down')),
    ).resolves.toBeUndefined();
  });
});
