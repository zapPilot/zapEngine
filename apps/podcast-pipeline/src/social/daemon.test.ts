import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  claimSocialPublishJob: vi.fn(),
  alignPendingSocialReleaseCohorts: vi.fn().mockResolvedValue({
    alignedLanes: 0,
    rescheduledEpisodes: 0,
    recoveryEpisodes: [],
  }),
  listPartiallyPublishedCohorts: vi.fn().mockResolvedValue([]),
  listPastDueSocialPublishJobs: vi.fn().mockResolvedValue([]),
  rescheduleSocialPublishJob: vi.fn().mockResolvedValue(true),
  completeSocialPublishJob: vi.fn(),
  enqueueSocialPublishJob: vi.fn(),
  ensureSocialDaemonStart: vi.fn(),
  failSocialPublishJob: vi.fn(),
  getActiveSocialStrategies: vi.fn(),
  getSocialQueueSnapshot: vi.fn(),
  latestScheduledSocialJobs: vi.fn(),
  listPendingSocialPublishSchedules: vi.fn().mockResolvedValue([]),
  listDueSocialPublishPlatforms: vi.fn().mockResolvedValue([]),
  listLearningSocialPosts: vi.fn(),
  listLearningSocialMetrics: vi.fn(),
  listMetricWindowsForPosts: vi.fn(),
  listSocialEpisodeLocalizationTitles: vi.fn(),
  listSocialPublishCandidates: vi.fn(),
  listSocialPublishCandidatesForEpisodes: vi.fn(),
  listUnfinishedSocialPublishJobs: vi.fn(),
  reconcileSocialPublishJob: vi.fn(),
  releaseSocialPublishJobLease: vi.fn(),
  insertSocialPostMetric: vi.fn(),
  listSocialPostIdentitiesByEpisodes: vi.fn().mockResolvedValue([]),
  listSocialPostsByEpisode: vi.fn(),
  updateSocialPostIdentity: vi.fn(),
  updateSocialPostReviewStatus: vi.fn(),
  publishSocialBatch: vi.fn(),
  createMetricCollectors: vi.fn(),
  createMetricsBrowserSession: vi.fn(),
  closeMetricsBrowserSession: vi.fn(),
  collectX: vi.fn(),
  refreshSocialStrategies: vi.fn(),
  captureDueAccountSnapshots: vi.fn(),
  capturePrePublishAccountSnapshots: vi.fn(),
  collectRollingPostMetrics: vi.fn(),
  getOrCreateExperimentAssignment: vi.fn(),
  capturePipelineException: vi.fn(),
  flushSentry: vi.fn(),
  initSentry: vi.fn(),
}));

vi.mock('./release-cohort-store.js', () => ({
  alignPendingSocialReleaseCohorts: mocks.alignPendingSocialReleaseCohorts,
  listPartiallyPublishedCohorts: mocks.listPartiallyPublishedCohorts,
  claimReleaseCohortJobs: async (...args: unknown[]) => {
    const job = await mocks.claimSocialPublishJob(...args);
    return job ? [job] : [];
  },
}));

vi.mock('./daemon-store.js', () => ({
  claimSocialPublishBatch: async (...args: unknown[]) => {
    const job = await mocks.claimSocialPublishJob(...args);
    return job ? [job] : [];
  },
  listPastDueSocialPublishJobs: mocks.listPastDueSocialPublishJobs,
  rescheduleSocialPublishJob: mocks.rescheduleSocialPublishJob,
  completeSocialPublishJob: mocks.completeSocialPublishJob,
  enqueueSocialPublishJob: mocks.enqueueSocialPublishJob,
  ensureSocialDaemonStart: mocks.ensureSocialDaemonStart,
  failSocialPublishJob: mocks.failSocialPublishJob,
  getActiveSocialStrategies: mocks.getActiveSocialStrategies,
  getSocialQueueSnapshot: mocks.getSocialQueueSnapshot,
  latestPendingSocialPublishSchedule: async () => {
    const schedules = (await mocks.latestScheduledSocialJobs()) as Record<
      string,
      string
    >;
    const values = Object.values(schedules).sort();
    return values.at(-1) ?? null;
  },
  listPendingSocialPublishSchedules: mocks.listPendingSocialPublishSchedules,
  listDueSocialPublishPlatforms: mocks.listDueSocialPublishPlatforms,
  listLearningSocialPosts: mocks.listLearningSocialPosts,
  listLearningSocialMetrics: mocks.listLearningSocialMetrics,
  listMetricWindowsForPosts: mocks.listMetricWindowsForPosts,
  listSocialEpisodeLocalizationTitles:
    mocks.listSocialEpisodeLocalizationTitles,
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
  capturePrePublishAccountSnapshots: mocks.capturePrePublishAccountSnapshots,
}));
vi.mock('./rolling-metrics.js', () => ({
  collectRollingPostMetrics: mocks.collectRollingPostMetrics,
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
vi.mock('../observability/sentry.js', () => ({
  capturePipelineException: mocks.capturePipelineException,
  flushSentry: mocks.flushSentry,
  initSentry: mocks.initSentry,
}));

import type { SocialPostRow } from '../types.js';
import {
  collectDueMetricWindows,
  earliestDueWindow,
  runSocialDaemon,
  runSocialDaemonTick,
} from './daemon.js';

// 19:00 JST: outside the publish window, so a tick discovers and reschedules
// but claims nothing. NOW_PUBLISHING is 10:00 JST, inside it.
const NOW = new Date('2026-08-16T10:00:00.000Z');
const NOW_PUBLISHING = new Date('2026-08-16T01:00:00.000Z');
const EPISODE_ID = '123e4567-e89b-42d3-a456-426614174000';
const EPISODE_CREATED_AT = '2026-08-24T00:00:00.000Z';

function socialPost(input: Partial<SocialPostRow> = {}): SocialPostRow {
  return {
    id: 'post-1',
    episode_id: EPISODE_ID,
    platform: 'x',
    post_url: 'https://x.com/zap/status/1',
    platform_post_id: '1',
    published_at: '2026-08-15T09:00:00.000Z',
    topic: 'macro',
    hook_type: 'question',
    generated_title: null,
    published_title: null,
    generated_body: 'generated',
    published_body: 'published',
    hashtags: [],
    video_duration_sec: 120,
    content_features: {
      containsQuestion: true,
      containsNumber: false,
      titleChars: null,
      bodyChars: 9,
      hashtagCount: 0,
    },
    llm_model: 'model',
    review_status: null,
    created_at: '2026-08-15T09:00:00.000Z',
    updated_at: '2026-08-15T09:00:00.000Z',
    ...input,
  };
}

function publishJob(input: Record<string, unknown> = {}) {
  return {
    id: 'job-1',
    episode_id: EPISODE_ID,
    platform: 'x',
    status: 'processing',
    scheduled_at: '2026-08-16T09:05:00.000Z',
    next_attempt_at: '2026-08-16T09:05:00.000Z',
    strategy_version_id: null,
    social_post_id: null,
    attempt_count: 1,
    lease_owner: 'owner',
    lease_expires_at: '2026-08-16T10:15:00.000Z',
    last_error: null,
    completed_at: null,
    created_at: '2026-08-16T09:00:00.000Z',
    updated_at: '2026-08-16T10:00:00.000Z',
    ...input,
  };
}

// A cohort only enqueues once every required language is ready. The daemon's
// default policy mock resolves X's exclusive en/ja experiment to `ja`, so a
// complete cohort needs zh-Hant (rednote), ja (threads + x), and en
// (youtube) all ready.
function fullCohortCandidates(
  episodeId: string,
  readyAt: string,
  episodeCreatedAt: string = EPISODE_CREATED_AT,
) {
  return (['zh-Hant', 'ja', 'en'] as const).map((language_code) => ({
    episode_id: episodeId,
    ready_at: readyAt,
    language_code,
    episode_created_at: episodeCreatedAt,
  }));
}

function mockCandidates(
  candidates: ReturnType<typeof fullCohortCandidates>,
): void {
  mocks.listSocialPublishCandidates.mockResolvedValue(candidates);
  mocks.listSocialPublishCandidatesForEpisodes.mockResolvedValue(candidates);
}

beforeEach(() => {
  mocks.alignPendingSocialReleaseCohorts.mockReset().mockResolvedValue({
    alignedLanes: 0,
    rescheduledEpisodes: 0,
    recoveryEpisodes: [],
  });
  mocks.listPartiallyPublishedCohorts.mockReset().mockResolvedValue([]);
  vi.clearAllMocks();
  mocks.listPastDueSocialPublishJobs.mockResolvedValue([]);
  mocks.rescheduleSocialPublishJob.mockResolvedValue(true);
  mocks.listSocialPublishCandidates.mockResolvedValue([]);
  // Publishing now re-checks media for every claimed cohort, so the default is
  // the normal production state -- every episode asked about is fully ready.
  // Tests that exercise the hold override this.
  mocks.listSocialPublishCandidatesForEpisodes.mockImplementation(
    async (episodeIds: readonly string[]) =>
      episodeIds.flatMap((episodeId) =>
        fullCohortCandidates(episodeId, EPISODE_CREATED_AT),
      ),
  );
  mocks.getActiveSocialStrategies.mockResolvedValue([]);
  mocks.getSocialQueueSnapshot.mockResolvedValue({
    pendingCount: 0,
    episodeQueue: [],
    nextByPlatform: {},
  });
  mocks.latestScheduledSocialJobs.mockResolvedValue({});
  mocks.listPendingSocialPublishSchedules.mockResolvedValue([]);
  // The language experiment is pinned so lane assertions stay deterministic;
  // the slot experiments answer with their own primary variant.
  mocks.getOrCreateExperimentAssignment.mockImplementation(
    ({
      experimentKey,
      episodeId,
      variants,
    }: {
      experimentKey: string;
      episodeId: string;
      variants?: readonly [string, ...string[]];
    }) =>
      Promise.resolve({
        experiment_key: experimentKey,
        episode_id: episodeId,
        variant:
          experimentKey === 'x-language-v1' ? 'ja' : (variants?.[0] ?? 'ja'),
        assigned_at: '2026-08-24T00:00:00.000Z',
      }),
  );
  mocks.claimSocialPublishJob.mockResolvedValue(null);
  mocks.listUnfinishedSocialPublishJobs.mockResolvedValue([]);
  mocks.reconcileSocialPublishJob.mockResolvedValue(true);
  mocks.listSocialPostsByEpisode.mockResolvedValue([]);
  mocks.listLearningSocialPosts.mockResolvedValue([]);
  mocks.listLearningSocialMetrics.mockResolvedValue([]);
  mocks.listMetricWindowsForPosts.mockResolvedValue([]);
  mocks.listSocialEpisodeLocalizationTitles.mockResolvedValue([
    {
      episode_id: EPISODE_ID,
      language_code: 'zh-Hant',
      title: '穩定幣真實使用場景',
    },
    { episode_id: EPISODE_ID, language_code: 'ja', title: '日本語タイトル' },
    { episode_id: EPISODE_ID, language_code: 'en', title: 'English title' },
  ]);
  mocks.enqueueSocialPublishJob.mockResolvedValue(true);
  mocks.ensureSocialDaemonStart.mockResolvedValue('2026-08-16T08:00:00.000Z');
  mocks.createMetricCollectors.mockReturnValue({
    x: mocks.collectX,
    threads: vi.fn(),
    rednote: vi.fn(),
    youtube: vi.fn(),
  });
  mocks.closeMetricsBrowserSession.mockResolvedValue(undefined);
  mocks.createMetricsBrowserSession.mockReturnValue({
    withPage: vi.fn(),
    close: mocks.closeMetricsBrowserSession,
  });
  mocks.captureDueAccountSnapshots.mockResolvedValue([]);
  mocks.capturePrePublishAccountSnapshots.mockResolvedValue([]);
  mocks.collectRollingPostMetrics.mockResolvedValue(0);
});

describe('social daemon', () => {
  it('reconciles and aligns cohorts before discovering and claiming publish work', async () => {
    mockCandidates(
      fullCohortCandidates(EPISODE_ID, '2026-08-16T00:00:00.000Z'),
    );
    mocks.alignPendingSocialReleaseCohorts.mockResolvedValue({
      alignedLanes: 3,
      rescheduledEpisodes: 1,
      recoveryEpisodes: [],
    });
    const log = vi.fn();

    await runSocialDaemonTick({
      now: NOW_PUBLISHING,
      firstStartedAt: '2026-08-16T00:00:00.000Z',
      log,
    });

    expect(
      mocks.listUnfinishedSocialPublishJobs.mock.invocationCallOrder[0],
    ).toBeLessThan(
      mocks.alignPendingSocialReleaseCohorts.mock.invocationCallOrder[0]!,
    );
    expect(
      mocks.alignPendingSocialReleaseCohorts.mock.invocationCallOrder[0],
    ).toBeLessThan(mocks.enqueueSocialPublishJob.mock.invocationCallOrder[0]!);
    expect(
      mocks.enqueueSocialPublishJob.mock.invocationCallOrder.at(-1),
    ).toBeLessThan(mocks.claimSocialPublishJob.mock.invocationCallOrder[0]!);
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining(
        'repaired release cohorts · 3 lanes aligned · 1 article rescheduled',
      ),
    );
    expect(mocks.publishSocialBatch).not.toHaveBeenCalled();
  });

  it('claims nothing outside the hours a person can watch a browser fail', async () => {
    mocks.claimSocialPublishJob.mockResolvedValue(publishJob());

    await runSocialDaemonTick({
      now: NOW,
      firstStartedAt: '2026-08-16T00:00:00.000Z',
    });

    expect(mocks.claimSocialPublishJob).not.toHaveBeenCalled();
    expect(mocks.publishSocialBatch).not.toHaveBeenCalled();
  });

  it('publishes a due job inside the window', async () => {
    mocks.claimSocialPublishJob.mockResolvedValue(publishJob());
    mocks.publishSocialBatch.mockResolvedValue([
      { platform: 'x', status: 'published', url: 'https://x.com/zap/status/1' },
    ]);
    mocks.listSocialPostsByEpisode
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([socialPost()]);

    await runSocialDaemonTick({
      now: NOW_PUBLISHING,
      firstStartedAt: '2026-08-16T00:00:00.000Z',
    });

    expect(mocks.publishSocialBatch).toHaveBeenCalledOnce();
  });

  it('discovers a fully ready cohort, publishes one due job, and refreshes learning without backfilling before the durable start', async () => {
    mockCandidates(
      fullCohortCandidates(EPISODE_ID, '2026-08-16T09:00:00.000Z'),
    );
    mocks.claimSocialPublishJob.mockResolvedValue({
      id: 'job-1',
      episode_id: EPISODE_ID,
      platform: 'x',
      status: 'processing',
      scheduled_at: '2026-08-16T09:05:00.000Z',
      next_attempt_at: '2026-08-16T09:05:00.000Z',
      strategy_version_id: null,
      social_post_id: null,
      attempt_count: 1,
      lease_owner: 'owner',
      lease_expires_at: '2026-08-16T10:15:00.000Z',
      last_error: null,
      completed_at: null,
      created_at: '2026-08-16T09:00:00.000Z',
      updated_at: '2026-08-16T10:00:00.000Z',
    });
    mocks.publishSocialBatch.mockResolvedValue([
      { platform: 'x', status: 'published', url: 'https://x.com/zap/status/1' },
    ]);
    mocks.listSocialPostsByEpisode
      .mockResolvedValueOnce([])
      .mockResolvedValue([socialPost()]);

    const log = vi.fn();
    await runSocialDaemonTick({
      now: NOW_PUBLISHING,
      firstStartedAt: '2026-08-16T08:00:00.000Z',
      refreshStrategy: true,
      log,
    });

    expect(mocks.listSocialPublishCandidates).toHaveBeenCalledWith(
      '2026-08-16T08:00:00.000Z',
    );
    // rednote/zh-Hant, threads/ja, x/ja (assigned), youtube/en. Four lanes,
    // not five: YouTube distributes in English only.
    expect(mocks.enqueueSocialPublishJob).toHaveBeenCalledTimes(4);
    // One article-level log line carries every lane on the shared timestamp.
    const enqueueLogs = log.mock.calls
      .map(([line]) => String(line))
      .filter((line) => line.includes('· queued 4 lanes ·'));
    expect(enqueueLogs).toHaveLength(1);
    expect(enqueueLogs.join('\n')).toContain('“穩定幣真實使用場景”');
    for (const lane of ['📕zh-Hant', '🧵ja', '𝕏ja', '▶️en']) {
      expect(enqueueLogs.some((line) => line.includes(lane))).toBe(true);
    }
    expect(enqueueLogs.join('\n')).not.toContain(EPISODE_ID);
    expect(mocks.publishSocialBatch).toHaveBeenCalledWith(
      expect.objectContaining({ episodeId: EPISODE_ID }),
    );
    expect(mocks.completeSocialPublishJob).toHaveBeenCalledWith({
      jobId: 'job-1',
      owner: expect.any(String),
      completedAt: NOW_PUBLISHING,
      socialPostId: 'post-1',
    });
    expect(mocks.refreshSocialStrategies).toHaveBeenCalledWith(
      expect.objectContaining({ now: NOW_PUBLISHING }),
    );
  });

  it('holds back the whole article until every required language is ready', async () => {
    mocks.listSocialPublishCandidates.mockResolvedValue([
      {
        episode_id: EPISODE_ID,
        ready_at: '2026-08-16T09:00:00.000Z',
        language_code: 'zh-Hant',
        episode_created_at: EPISODE_CREATED_AT,
      },
    ]);
    mocks.listSocialPublishCandidatesForEpisodes.mockResolvedValue([
      {
        episode_id: EPISODE_ID,
        ready_at: '2026-08-16T09:00:00.000Z',
        language_code: 'zh-Hant',
        episode_created_at: EPISODE_CREATED_AT,
      },
    ]);
    const log = vi.fn();

    await runSocialDaemonTick({
      now: NOW,
      firstStartedAt: '2026-08-16T08:00:00.000Z',
      log,
    });

    expect(mocks.enqueueSocialPublishJob).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining(
        '“穩定幣真實使用場景” · cohort not release-ready · 🇯🇵 ja',
      ),
    );
  });

  it('reconciles a failed job whose platform is already live instead of re-uploading', async () => {
    mocks.listUnfinishedSocialPublishJobs.mockResolvedValue([
      {
        id: 'job-youtube',
        episode_id: EPISODE_ID,
        platform: 'youtube',
        status: 'failed',
      },
    ]);
    mocks.listSocialPostIdentitiesByEpisodes.mockResolvedValue([
      { id: 'post-youtube', episode_id: EPISODE_ID, platform: 'youtube' },
    ]);

    const log = vi.fn();
    await runSocialDaemonTick({
      now: NOW,
      firstStartedAt: '2026-08-16T08:00:00.000Z',
      log,
    });

    expect(mocks.reconcileSocialPublishJob).toHaveBeenCalledWith({
      jobId: 'job-youtube',
      socialPostId: 'post-youtube',
      completedAt: NOW,
    });
    expect(mocks.publishSocialBatch).not.toHaveBeenCalled();
    expect(mocks.failSocialPublishJob).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      '✅ [social-daemon] ▶️ youtube 🇹🇼 zh-Hant · “穩定幣真實使用場景” · reconciled · already published',
    );
  });

  it('reconciles a queued job that a manual publish already satisfied', async () => {
    mocks.listUnfinishedSocialPublishJobs.mockResolvedValue([
      {
        id: 'job-queued',
        episode_id: EPISODE_ID,
        platform: 'youtube',
        status: 'queued',
      },
    ]);
    mocks.listSocialPostIdentitiesByEpisodes.mockResolvedValue([
      { id: 'post-manual', episode_id: EPISODE_ID, platform: 'youtube' },
    ]);

    await runSocialDaemonTick({
      now: NOW,
      firstStartedAt: '2026-08-16T08:00:00.000Z',
    });

    expect(mocks.reconcileSocialPublishJob).toHaveBeenCalledWith({
      jobId: 'job-queued',
      socialPostId: 'post-manual',
      completedAt: NOW,
    });
    expect(mocks.publishSocialBatch).not.toHaveBeenCalled();
  });

  it('leaves a failed job alone when nothing was published, and ignores a lost reconcile race', async () => {
    mocks.listUnfinishedSocialPublishJobs.mockResolvedValue([
      {
        id: 'job-retry',
        episode_id: EPISODE_ID,
        platform: 'youtube',
        status: 'failed',
      },
      {
        id: 'job-raced',
        episode_id: EPISODE_ID,
        platform: 'x',
        status: 'failed',
      },
    ]);
    mocks.listSocialPostIdentitiesByEpisodes.mockResolvedValue([
      { id: 'post-raced', episode_id: EPISODE_ID, platform: 'x' },
    ]);
    mocks.reconcileSocialPublishJob.mockResolvedValue(false);

    const log = vi.fn();
    await runSocialDaemonTick({
      now: NOW,
      firstStartedAt: '2026-08-16T08:00:00.000Z',
      log,
    });

    expect(mocks.reconcileSocialPublishJob).toHaveBeenCalledTimes(1);
    expect(mocks.reconcileSocialPublishJob).toHaveBeenCalledWith({
      jobId: 'job-raced',
      socialPostId: 'post-raced',
      completedAt: NOW,
    });
    expect(log).not.toHaveBeenCalledWith(expect.stringContaining('reconciled'));
  });

  it('completes a claimed job without publishing when the post row already exists', async () => {
    mocks.claimSocialPublishJob.mockResolvedValue(
      publishJob({ id: 'job-crashed', platform: 'youtube', attempt_count: 3 }),
    );
    mocks.listSocialPostsByEpisode.mockResolvedValue([
      socialPost({ id: 'post-crashed', platform: 'youtube' }),
    ]);

    const log = vi.fn();
    await runSocialDaemonTick({
      now: NOW_PUBLISHING,
      firstStartedAt: '2026-08-16T08:00:00.000Z',
      log,
    });

    expect(mocks.publishSocialBatch).not.toHaveBeenCalled();
    expect(mocks.completeSocialPublishJob).toHaveBeenCalledWith({
      jobId: 'job-crashed',
      owner: expect.any(String),
      completedAt: NOW_PUBLISHING,
      socialPostId: 'post-crashed',
    });
    expect(mocks.failSocialPublishJob).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      '✅ [social-daemon] ▶️ youtube 🇹🇼 zh-Hant · “穩定幣真實使用場景” · reconciled · already published',
    );
  });

  it('records only the earliest missing standardized metric window', async () => {
    const post = socialPost();
    mocks.listLearningSocialPosts.mockResolvedValue([post]);
    mocks.listMetricWindowsForPosts.mockResolvedValue([
      { social_post_id: post.id, measurement_window: '1h' },
      { social_post_id: post.id, measurement_window: '6h' },
    ]);
    mocks.collectX.mockResolvedValue({
      views: 1000,
      impressions: null,
      likes: 20,
      comments: 3,
      shares: 2,
      saves: null,
      profileVisits: null,
      followersGained: null,
    });
    mocks.insertSocialPostMetric.mockResolvedValue({});

    await expect(collectDueMetricWindows(NOW)).resolves.toBe(1);
    expect(mocks.insertSocialPostMetric).toHaveBeenCalledWith(
      expect.objectContaining({
        socialPostId: post.id,
        measurementWindow: '24h',
      }),
    );
    expect(mocks.createMetricsBrowserSession).toHaveBeenCalledOnce();
    expect(mocks.closeMetricsBrowserSession).toHaveBeenCalledOnce();
  });

  it('uses only the current age bucket so missed early snapshots are never backfilled with stale data', () => {
    const post = socialPost({ published_at: '2026-08-16T03:00:00.000Z' });
    expect(earliestDueWindow(post, NOW, new Set())).toMatchObject({
      label: '6h',
    });
    expect(earliestDueWindow(post, NOW, new Set([`${post.id}:6h`]))).toBeNull();
    expect(
      earliestDueWindow(
        socialPost({ published_at: 'not-a-date' }),
        NOW,
        new Set(),
      ),
    ).toBeNull();
    expect(
      earliestDueWindow(
        socialPost({ published_at: '2026-08-16T09:30:00.000Z' }),
        NOW,
        new Set(),
      ),
    ).toBeNull();
  });

  it('runs repeated daemon ticks, refreshes only when due, and stops when injected sleep rejects', async () => {
    const oneHourLater = new Date(NOW.getTime() + 60 * 60_000);
    // Read order: the first-start anchor, then per tick a start reading and a
    // completion reading for the heartbeat. Only the start readings decide
    // whether the strategy refresh is due.
    const now = vi
      .fn()
      .mockReturnValueOnce(NOW)
      .mockReturnValueOnce(NOW)
      .mockReturnValueOnce(NOW)
      .mockReturnValueOnce(oneHourLater)
      .mockReturnValue(oneHourLater);
    const sleep = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('stop-loop'));
    const log = vi.fn();

    await expect(
      runSocialDaemon({ now, sleep, log, recordTick: vi.fn() }),
    ).rejects.toThrow('stop-loop');

    expect(mocks.ensureSocialDaemonStart).toHaveBeenCalledWith(NOW);
    expect(sleep).toHaveBeenNthCalledWith(1, 60_000);
    expect(sleep).toHaveBeenNthCalledWith(2, 60_000);
    expect(mocks.refreshSocialStrategies).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('[social-daemon] started as'),
    );
    expect(log).toHaveBeenCalledWith(
      '🔄 [social-daemon] checking discovery · publishing · metrics · strategy',
    );
    expect(log).toHaveBeenCalledWith(
      '📥 [social-daemon] queue · 0 jobs · 0 articles',
    );
    expect(log).toHaveBeenCalledWith(
      '✅ [social-daemon] check complete · next check in 60s.',
    );
  });

  it('logs the pending queue and next scheduled post per platform', async () => {
    mocks.getSocialQueueSnapshot.mockResolvedValue({
      pendingCount: 4,
      episodeQueue: [
        {
          episodeId: EPISODE_ID,
          title: '穩定幣真實使用場景：境內交易佔六成，亞太地區成最大市場',
          nextAt: '2026-08-16T10:05:00.000Z',
          laneCount: 2,
          lanes: [
            { platform: 'x', languageCode: 'en' },
            { platform: 'threads', languageCode: 'ja' },
          ],
        },
        {
          episodeId: 'episode-2',
          title: 'AI安全之爭：集中控制與分散競爭誰更危險？',
          nextAt: '2026-08-16T10:35:00.000Z',
          laneCount: 2,
          lanes: [
            { platform: 'rednote', languageCode: 'zh-Hant' },
            { platform: 'youtube', languageCode: 'en' },
          ],
        },
      ],
      nextByPlatform: {
        x: {
          episodeId: EPISODE_ID,
          platform: 'x',
          status: 'queued',
          title: '穩定幣真實使用場景：境內交易佔六成，亞太地區成最大市場',
          nextAt: '2026-08-16T10:05:00.000Z',
        },
        threads: {
          episodeId: EPISODE_ID,
          platform: 'threads',
          status: 'queued',
          title: '穩定幣真實使用場景',
          nextAt: '2026-08-16T10:15:00.000Z',
        },
      },
    });
    const sleep = vi.fn().mockRejectedValue(new Error('stop-loop'));
    const log = vi.fn();

    await expect(
      runSocialDaemon({ now: () => NOW, sleep, log, recordTick: vi.fn() }),
    ).rejects.toThrow('stop-loop');

    expect(log).toHaveBeenCalledWith(
      '📥 [social-daemon] queue · 4 jobs · 2 articles',
    );
    expect(log).toHaveBeenCalledWith(
      '📥 [social-daemon]   1. “穩定幣真實使用場景：境內交易佔六成，亞太地區成最大市場” · 08/16 19:05 JST (in 5m)',
    );
    expect(log).toHaveBeenCalledWith(
      '📥 [social-daemon]      ↳ 2 lanes · 🧵 threads 🇯🇵 ja · 𝕏 x 🇺🇸 en',
    );
    expect(log).toHaveBeenCalledWith(
      '📥 [social-daemon]   2. “AI安全之爭：集中控制與分散競爭誰更危險？” · 08/16 19:35 JST (in 35m)',
    );
    expect(log).toHaveBeenCalledWith(
      '📥 [social-daemon]      ↳ 2 lanes · 📕 rednote 🇹🇼 zh-Hant · ▶️ youtube 🇺🇸 en',
    );
    expect(log.mock.calls.map(([line]) => String(line))).not.toEqual(
      expect.arrayContaining([expect.stringContaining('next 𝕏 x')]),
    );
  });

  it('reports a live processing lease without claiming it is due now', async () => {
    const leaseExpiresAt = new Date(
      NOW.getTime() + 60 * 60 * 1000,
    ).toISOString();
    mocks.getSocialQueueSnapshot.mockResolvedValue({
      pendingCount: 1,
      episodeQueue: [],
      nextByPlatform: {},
      nextByLane: {
        'x|zh-Hant': {
          episodeId: EPISODE_ID,
          platform: 'x',
          languageCode: 'zh-Hant',
          status: 'processing',
          title: null,
          nextAt: leaseExpiresAt,
          leaseExpiresAt,
          attemptCount: 1,
          attemptsExhausted: false,
          experiment: null,
        },
      },
    });
    const log = vi.fn();
    await expect(
      runSocialDaemon({
        now: () => NOW,
        sleep: vi.fn().mockRejectedValue(new Error('stop-loop')),
        log,
        recordTick: vi.fn(),
      }),
    ).rejects.toThrow('stop-loop');
    const output = log.mock.calls.map(([line]) => String(line)).join('\n');
    expect(output).toContain('leased until');
    expect(output).not.toContain('due now');
  });

  it('logs missing video artifacts by article and language rather than channel', async () => {
    mocks.getSocialQueueSnapshot.mockResolvedValue({
      pendingCount: 0,
      episodeQueue: [],
      nextByPlatform: {},
      waitingVideos: [
        {
          episodeId: EPISODE_ID,
          title: '從巴菲特到但斌：七大基金持倉揭示人工智慧投資輪動',
          languageCodes: ['zh-Hant', 'ja', 'en'],
        },
      ],
    });
    const sleep = vi.fn().mockRejectedValue(new Error('stop-loop'));
    const log = vi.fn();

    await expect(
      runSocialDaemon({ now: () => NOW, sleep, log, recordTick: vi.fn() }),
    ).rejects.toThrow('stop-loop');

    expect(log).toHaveBeenCalledWith(
      '⏳ [social-daemon] “從巴菲特到但斌：七大基金持倉揭示人工智慧投資輪動” · waiting video · 🇹🇼 zh-Hant · 🇯🇵 ja · 🇺🇸 en',
    );
    expect(
      log.mock.calls.map(([line]) => String(line)).join('\n'),
    ).not.toContain('rednote · waiting');
  });

  // A lane past the claim RPC's attempt fence is never picked up again, so a
  // timestamp beside it would promise a retry that cannot happen.
  it('reports an attempt-exhausted lane as blocked instead of giving it a next time', async () => {
    mocks.getSocialQueueSnapshot.mockResolvedValue({
      pendingCount: 1,
      episodeQueue: [
        {
          episodeId: EPISODE_ID,
          title: '穩定幣真實使用場景',
          nextAt: '2026-08-16T10:05:00.000Z',
        },
      ],
      nextByPlatform: {
        x: {
          episodeId: EPISODE_ID,
          platform: 'x',
          languageCode: 'zh-Hant',
          status: 'failed',
          title: '穩定幣真實使用場景',
          nextAt: '2026-08-16T10:05:00.000Z',
          attemptCount: 8,
          attemptsExhausted: true,
        },
      },
    });
    const sleep = vi.fn().mockRejectedValue(new Error('stop-loop'));
    const log = vi.fn();

    await expect(
      runSocialDaemon({ now: () => NOW, sleep, log, recordTick: vi.fn() }),
    ).rejects.toThrow('stop-loop');

    expect(log).toHaveBeenCalledWith(
      '⚠️ [social-daemon] 𝕏 x 🇹🇼 zh-Hant · “穩定幣真實使用場景” · blocked (8 attempts exhausted; failed)',
    );
  });

  it('supports the default daemon dependencies up to the first sleep boundary', async () => {
    const timeout = vi.spyOn(global, 'setTimeout').mockImplementation(() => {
      throw new Error('stop-default-sleep');
    });
    const consoleLog = vi
      .spyOn(console, 'log')
      .mockImplementation(() => undefined);
    try {
      await expect(runSocialDaemon({ recordTick: vi.fn() })).rejects.toThrow(
        'stop-default-sleep',
      );
    } finally {
      timeout.mockRestore();
      consoleLog.mockRestore();
    }
  });

  it('skips an invalid candidate episode and enqueues a valid fully-ready one without a strategy version', async () => {
    const badCandidate = {
      episode_id: 'bad',
      ready_at: 'not-a-date',
      language_code: 'zh-Hant' as const,
      episode_created_at: EPISODE_CREATED_AT,
    };
    const goodCandidates = fullCohortCandidates(
      EPISODE_ID,
      '2026-08-16T11:00:00.000Z',
    );
    mocks.listSocialPublishCandidates.mockResolvedValue([
      badCandidate,
      ...goodCandidates,
    ]);
    mocks.listSocialPublishCandidatesForEpisodes.mockResolvedValue([
      badCandidate,
      ...goodCandidates,
    ]);

    await runSocialDaemonTick({
      now: NOW,
      firstStartedAt: '2026-08-16T08:00:00.000Z',
    });

    expect(
      mocks.enqueueSocialPublishJob.mock.calls.some(
        ([input]) => input.episodeId === 'bad',
      ),
    ).toBe(false);
    expect(
      mocks.enqueueSocialPublishJob.mock.calls.some(
        ([input]) => input.episodeId === EPISODE_ID,
      ),
    ).toBe(true);
    // Stamping a version at enqueue is what left early jobs permanently
    // unguided; the payload must stay free of it.
    for (const [input] of mocks.enqueueSocialPublishJob.mock.calls) {
      expect(input).not.toHaveProperty('strategyVersionId');
    }
  });

  it('schedules a stale cohort into a slot still ahead of it today', async () => {
    mockCandidates(
      fullCohortCandidates(EPISODE_ID, '2026-08-10T00:00:00.000Z'),
    );

    // 11:00 JST on the 16th: the article-level 12:00 slot is still ahead.
    await runSocialDaemonTick({
      now: new Date('2026-08-16T02:00:00.000Z'),
      firstStartedAt: '2026-08-01T00:00:00.000Z',
    });

    const calls = mocks.enqueueSocialPublishJob.mock.calls.map(
      ([input]) => input,
    );
    expect(
      calls.find(
        (input) =>
          input.episodeId === EPISODE_ID && input.platform === 'rednote',
      ),
    ).toMatchObject({ scheduledAt: '2026-08-16T03:00:00.000Z' });
  });

  it('does not schedule a stale cohort into a slot that already passed today', async () => {
    mockCandidates(
      fullCohortCandidates(EPISODE_ID, '2026-08-10T00:00:00.000Z'),
    );

    // 17:00 JST: every article slot for today is behind us, so the cohort waits
    // for tomorrow's first slot rather than becoming instantly due and
    // publishing off-slot.
    await runSocialDaemonTick({
      now: new Date('2026-08-16T08:00:00.000Z'),
      firstStartedAt: '2026-08-01T00:00:00.000Z',
    });

    const rednote = mocks.enqueueSocialPublishJob.mock.calls
      .map(([input]) => input)
      .find((input) => input.platform === 'rednote');
    expect(rednote).toMatchObject({ scheduledAt: '2026-08-17T00:30:00.000Z' });
  });

  it('skips unavailable metric snapshots, logs collector failures, and ignores null recorded windows', async () => {
    const tooYoung = socialPost({
      id: 'post-young',
      published_at: '2026-08-16T09:30:00.000Z',
    });
    const empty = socialPost({ id: 'post-empty' });
    const errorPost = socialPost({ id: 'post-error' });
    const stringErrorPost = socialPost({ id: 'post-string-error' });
    mocks.listLearningSocialPosts.mockResolvedValue([
      tooYoung,
      empty,
      errorPost,
      stringErrorPost,
    ]);
    mocks.listMetricWindowsForPosts.mockResolvedValue([
      { social_post_id: 'ignored', measurement_window: null },
    ]);
    mocks.collectX
      .mockResolvedValueOnce({
        views: null,
        impressions: null,
        likes: null,
        comments: null,
        shares: null,
        saves: null,
        profileVisits: null,
        followersGained: null,
      })
      .mockRejectedValueOnce(new Error('collector exploded'))
      .mockRejectedValueOnce('string collector failure');
    const log = vi.fn();

    await expect(collectDueMetricWindows(NOW, log)).resolves.toBe(0);
    expect(mocks.insertSocialPostMetric).not.toHaveBeenCalled();
    expect(mocks.closeMetricsBrowserSession).toHaveBeenCalledOnce();
    expect(log.mock.calls.map(([line]) => String(line))).toEqual(
      expect.arrayContaining([
        expect.stringContaining('collector exploded'),
        expect.stringContaining('string collector failure'),
      ]),
    );
  });

  it('persists a Rednote identity discovered by the collector callback', async () => {
    const post = socialPost({
      id: 'rednote-post',
      platform: 'rednote',
      platform_post_id: null,
      post_url: null,
      published_at: '2026-08-16T09:30:00.000Z',
    });
    mocks.listLearningSocialPosts.mockResolvedValue([post]);

    await collectDueMetricWindows(NOW);
    const options = mocks.createMetricCollectors.mock.calls[0]?.[0];
    await options.onRednoteIdentity({
      post,
      platformPostId: 'note-1',
      postUrl: 'https://www.xiaohongshu.com/explore/note-1',
    });

    expect(mocks.updateSocialPostIdentity).toHaveBeenCalledWith({
      id: 'rednote-post',
      platformPostId: 'note-1',
      postUrl: 'https://www.xiaohongshu.com/explore/note-1',
    });
  });

  it('records the review status the collector observed and names it in the log', async () => {
    const post = socialPost({
      id: 'rednote-post',
      platform: 'rednote',
      published_at: '2026-08-16T09:30:00.000Z',
    });
    mocks.listLearningSocialPosts.mockResolvedValue([post]);
    const log = vi.fn();

    await collectDueMetricWindows(NOW, log);
    const options = mocks.createMetricCollectors.mock.calls[0]?.[0];
    await options.onRednoteReviewStatus({ post, reviewStatus: 'rejected' });

    expect(mocks.updateSocialPostReviewStatus).toHaveBeenCalledWith({
      id: 'rednote-post',
      reviewStatus: 'rejected',
    });
    expect(log.mock.calls.map(([line]) => String(line))).toEqual(
      expect.arrayContaining([
        expect.stringContaining('“穩定幣真實使用場景” · review → rejected'),
      ]),
    );
  });

  it('records the strategy version a publish actually used', async () => {
    mocks.claimSocialPublishJob.mockResolvedValue(
      publishJob({ strategy_version_id: null }),
    );
    mocks.getActiveSocialStrategies.mockResolvedValue([
      {
        id: 'strategy-live',
        platform: 'x',
        version: 7,
        config: { preferredHookTypes: ['question'] },
        based_on_samples: 9,
        active: true,
        activated_at: NOW.toISOString(),
        created_at: NOW.toISOString(),
      },
    ]);
    mocks.publishSocialBatch.mockResolvedValue([
      { platform: 'x', status: 'published', url: 'https://x.com/zap/status/1' },
    ]);
    mocks.listSocialPostsByEpisode
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([socialPost()]);

    await runSocialDaemonTick({
      now: NOW_PUBLISHING,
      firstStartedAt: '2026-08-16T08:00:00.000Z',
    });

    expect(mocks.completeSocialPublishJob).toHaveBeenCalledWith(
      expect.objectContaining({ strategyVersionId: 'strategy-live' }),
    );
  });

  it('publishes without guidance when the active strategy read fails', async () => {
    mocks.claimSocialPublishJob.mockResolvedValue(publishJob());
    mocks.getActiveSocialStrategies.mockRejectedValue(
      new Error('strategy read down'),
    );
    mocks.publishSocialBatch.mockResolvedValue([
      { platform: 'x', status: 'published', url: 'https://x.com/zap/status/1' },
    ]);
    mocks.listSocialPostsByEpisode
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([socialPost()]);
    const log = vi.fn();

    await runSocialDaemonTick({
      now: NOW_PUBLISHING,
      firstStartedAt: '2026-08-16T08:00:00.000Z',
      log,
    });

    expect(mocks.publishSocialBatch).toHaveBeenCalledWith(
      expect.objectContaining({ episodeId: EPISODE_ID }),
    );
    expect(mocks.completeSocialPublishJob).toHaveBeenCalledWith(
      expect.not.objectContaining({ strategyVersionId: expect.anything() }),
    );
    expect(log.mock.calls.map(([line]) => String(line))).toEqual(
      expect.arrayContaining([
        expect.stringContaining('publishing without strategy guidance'),
      ]),
    );
  });

  it('hands account snapshots a browser factory and isolates their failure', async () => {
    mocks.captureDueAccountSnapshots.mockImplementationOnce(
      async ({ openBrowser }: { openBrowser: () => unknown }) => {
        openBrowser();
        return ['x'];
      },
    );
    await runSocialDaemonTick({
      now: NOW,
      firstStartedAt: '2026-08-16T08:00:00.000Z',
    });

    // A factory rather than an open session: at a three-hour cadence the
    // The account step keeps its lazily opened session available for rolling
    // metrics, then owns closing it after both reads finish.
    expect(mocks.captureDueAccountSnapshots).toHaveBeenCalledWith(
      expect.objectContaining({
        now: NOW,
        openBrowser: expect.any(Function),
        closeBrowser: false,
      }),
    );
    const browser = mocks.createMetricsBrowserSession.mock.results[0]?.value;
    expect(mocks.collectRollingPostMetrics).toHaveBeenCalledWith(
      expect.objectContaining({ now: NOW, platforms: ['x'], browser }),
    );
    expect(mocks.closeMetricsBrowserSession).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    mocks.listSocialPublishCandidates.mockResolvedValue([]);
    mocks.listSocialPublishCandidatesForEpisodes.mockResolvedValue([]);
    mocks.getSocialQueueSnapshot.mockResolvedValue({
      pendingCount: 0,
      episodeQueue: [],
      nextByPlatform: {},
    });
    mocks.claimSocialPublishJob.mockResolvedValue(null);
    mocks.listUnfinishedSocialPublishJobs.mockResolvedValue([]);
    mocks.listLearningSocialPosts.mockResolvedValue([]);
    mocks.listLearningSocialMetrics.mockResolvedValue([]);
    mocks.latestScheduledSocialJobs.mockResolvedValue({});
    mocks.createMetricsBrowserSession.mockReturnValue({
      withPage: vi.fn(),
      close: mocks.closeMetricsBrowserSession,
    });
    mocks.captureDueAccountSnapshots.mockRejectedValue(
      new Error('followers down'),
    );
    const log = vi.fn();

    await expect(
      runSocialDaemonTick({
        now: NOW,
        firstStartedAt: '2026-08-16T08:00:00.000Z',
        log,
      }),
    ).resolves.toBeUndefined();
    expect(log.mock.calls.map(([line]) => String(line))).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/account snapshots failed.*followers down/),
      ]),
    );
  });

  it('captures due pre-publish baselines without allowing a failure to block publishing', async () => {
    mocks.listDueSocialPublishPlatforms.mockResolvedValue(['x']);
    mocks.capturePrePublishAccountSnapshots.mockRejectedValue(
      new Error('baseline unavailable'),
    );
    mocks.claimSocialPublishJob.mockResolvedValue(publishJob());
    mocks.publishSocialBatch.mockResolvedValue([
      { platform: 'x', status: 'published', url: 'https://x.com/zap/status/1' },
    ]);
    mocks.listSocialPostsByEpisode
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([socialPost()]);
    const log = vi.fn();

    await expect(
      runSocialDaemonTick({
        now: NOW_PUBLISHING,
        firstStartedAt: '2026-08-16T08:00:00.000Z',
        log,
      }),
    ).resolves.toBeUndefined();

    expect(mocks.capturePrePublishAccountSnapshots).toHaveBeenCalledWith(
      expect.objectContaining({ now: NOW_PUBLISHING, platforms: ['x'] }),
    );
    expect(mocks.publishSocialBatch).toHaveBeenCalled();
    expect(log.mock.calls.map(([line]) => String(line))).toEqual(
      expect.arrayContaining([
        expect.stringMatching(
          /pre-publish snapshots failed.*baseline unavailable/,
        ),
      ]),
    );
  });

  it('isolates metric and strategy failures so one subsystem cannot stop a tick', async () => {
    mocks.listLearningSocialPosts.mockRejectedValue(new Error('metrics down'));
    mocks.refreshSocialStrategies.mockRejectedValue('strategy down');
    const log = vi.fn();

    await expect(
      runSocialDaemonTick({
        now: NOW,
        firstStartedAt: '2026-08-16T08:00:00.000Z',
        log,
        refreshStrategy: true,
      }),
    ).resolves.toBeUndefined();

    const messages = log.mock.calls.map(([line]) => String(line));
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/metrics failed.*metrics down/),
        expect.stringMatching(/strategy failed.*strategy down/),
      ]),
    );
    expect(mocks.capturePipelineException).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'metrics down' }),
      {
        component: 'social-daemon',
        tags: { operation: 'metrics' },
        level: 'warning',
      },
    );
    expect(mocks.capturePipelineException).toHaveBeenCalledWith(
      'strategy down',
      {
        component: 'social-daemon',
        tags: { operation: 'strategy' },
        level: 'warning',
      },
    );
  });

  it('does not run metrics, snapshots, or strategy when the publish stage fails fatally', async () => {
    mocks.alignPendingSocialReleaseCohorts.mockRejectedValue(
      new Error('cohort alignment read down'),
    );

    await expect(
      runSocialDaemonTick({
        now: NOW,
        firstStartedAt: '2026-08-16T08:00:00.000Z',
        refreshStrategy: true,
      }),
    ).rejects.toThrow('cohort alignment read down');

    expect(mocks.claimSocialPublishJob).not.toHaveBeenCalled();
    expect(mocks.publishSocialBatch).not.toHaveBeenCalled();
    expect(mocks.listLearningSocialPosts).not.toHaveBeenCalled();
    expect(mocks.captureDueAccountSnapshots).not.toHaveBeenCalled();
    expect(mocks.refreshSocialStrategies).not.toHaveBeenCalled();
  });
});
