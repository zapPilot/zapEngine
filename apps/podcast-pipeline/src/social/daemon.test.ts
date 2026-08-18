import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  claimSocialPublishJob: vi.fn(),
  alignPendingSocialPublishSchedules: vi.fn(),
  completeSocialPublishJob: vi.fn(),
  enqueueSocialPublishJob: vi.fn(),
  ensureSocialDaemonStart: vi.fn(),
  failSocialPublishJob: vi.fn(),
  getActiveSocialStrategies: vi.fn(),
  getSocialQueueSnapshot: vi.fn(),
  getSocialStrategyById: vi.fn(),
  latestScheduledSocialJobs: vi.fn(),
  listDueMetricPosts: vi.fn(),
  listMetricWindowsForPosts: vi.fn(),
  listSocialPublishCandidates: vi.fn(),
  listUnfinishedSocialPublishJobs: vi.fn(),
  reconcileSocialPublishJob: vi.fn(),
  insertSocialPostMetric: vi.fn(),
  listSocialPostsByEpisode: vi.fn(),
  updateSocialPostIdentity: vi.fn(),
  runSocialCli: vi.fn(),
  createMetricCollectors: vi.fn(),
  collectX: vi.fn(),
  refreshSocialStrategies: vi.fn(),
}));

vi.mock('./daemon-store.js', () => ({
  claimSocialPublishBatch: async (...args: unknown[]) => {
    const job = await mocks.claimSocialPublishJob(...args);
    return job ? [job] : [];
  },
  alignPendingSocialPublishSchedules: mocks.alignPendingSocialPublishSchedules,
  completeSocialPublishJob: mocks.completeSocialPublishJob,
  enqueueSocialPublishJob: mocks.enqueueSocialPublishJob,
  ensureSocialDaemonStart: mocks.ensureSocialDaemonStart,
  failSocialPublishJob: mocks.failSocialPublishJob,
  getActiveSocialStrategies: mocks.getActiveSocialStrategies,
  getSocialQueueSnapshot: mocks.getSocialQueueSnapshot,
  getSocialStrategyById: mocks.getSocialStrategyById,
  latestPendingSocialPublishSchedule: async () => {
    const schedules = (await mocks.latestScheduledSocialJobs()) as Record<
      string,
      string
    >;
    const values = Object.values(schedules).sort();
    return values.at(-1) ?? null;
  },
  listDueMetricPosts: mocks.listDueMetricPosts,
  listMetricWindowsForPosts: mocks.listMetricWindowsForPosts,
  listSocialPublishCandidates: mocks.listSocialPublishCandidates,
  listUnfinishedSocialPublishJobs: mocks.listUnfinishedSocialPublishJobs,
  reconcileSocialPublishJob: mocks.reconcileSocialPublishJob,
}));

vi.mock('../services/db.js', () => ({
  insertSocialPostMetric: mocks.insertSocialPostMetric,
  listSocialPostsByEpisode: mocks.listSocialPostsByEpisode,
  updateSocialPostIdentity: mocks.updateSocialPostIdentity,
}));

vi.mock('./cli.js', () => ({ runSocialCli: mocks.runSocialCli }));
vi.mock('./metric-collectors.js', () => ({
  createMetricCollectors: mocks.createMetricCollectors,
}));
vi.mock('./strategy.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./strategy.js')>()),
  refreshSocialStrategies: mocks.refreshSocialStrategies,
}));

import type { SocialPostRow } from '../types.js';
import {
  collectDueMetricWindows,
  earliestDueWindow,
  runSocialDaemon,
  runSocialDaemonTick,
} from './daemon.js';

const NOW = new Date('2026-08-16T10:00:00.000Z');
const EPISODE_ID = '123e4567-e89b-42d3-a456-426614174000';

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

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listSocialPublishCandidates.mockResolvedValue([]);
  mocks.alignPendingSocialPublishSchedules.mockResolvedValue(0);
  mocks.getActiveSocialStrategies.mockResolvedValue([]);
  mocks.getSocialQueueSnapshot.mockResolvedValue({
    pendingCount: 0,
    episodeQueue: [],
    nextByPlatform: {},
  });
  mocks.latestScheduledSocialJobs.mockResolvedValue({});
  mocks.claimSocialPublishJob.mockResolvedValue(null);
  mocks.listUnfinishedSocialPublishJobs.mockResolvedValue([]);
  mocks.reconcileSocialPublishJob.mockResolvedValue(true);
  mocks.listSocialPostsByEpisode.mockResolvedValue([]);
  mocks.listDueMetricPosts.mockResolvedValue([]);
  mocks.listMetricWindowsForPosts.mockResolvedValue([]);
  mocks.enqueueSocialPublishJob.mockResolvedValue(true);
  mocks.ensureSocialDaemonStart.mockResolvedValue('2026-08-16T08:00:00.000Z');
  mocks.getSocialStrategyById.mockResolvedValue(null);
  mocks.createMetricCollectors.mockReturnValue({
    x: mocks.collectX,
    threads: vi.fn(),
    rednote: vi.fn(),
    youtube: vi.fn(),
  });
});

describe('social daemon', () => {
  it('discovers new episodes, publishes one due job, and refreshes learning without backfilling before the durable start', async () => {
    mocks.listSocialPublishCandidates.mockResolvedValue([
      { episode_id: EPISODE_ID, ready_at: '2026-08-16T09:00:00.000Z' },
    ]);
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
    mocks.runSocialCli.mockResolvedValue([
      { platform: 'x', status: 'published', url: 'https://x.com/zap/status/1' },
    ]);
    mocks.listSocialPostsByEpisode
      .mockResolvedValueOnce([])
      .mockResolvedValue([socialPost()]);

    const log = vi.fn();
    await runSocialDaemonTick({
      now: NOW,
      firstStartedAt: '2026-08-16T08:00:00.000Z',
      refreshStrategy: true,
      log,
    });

    expect(mocks.listSocialPublishCandidates).toHaveBeenCalledWith(
      '2026-08-16T08:00:00.000Z',
    );
    expect(mocks.enqueueSocialPublishJob).toHaveBeenCalledTimes(4);
    expect(log).toHaveBeenCalledWith(
      `[social-daemon] discovered episode ${EPISODE_ID}; ready at 2026-08-16T09:00:00.000Z.`,
    );
    expect(log).toHaveBeenCalledWith(
      `[social-daemon] queued x for ${EPISODE_ID} at 2026-08-17T00:30:00.000Z.`,
    );
    expect(mocks.runSocialCli).toHaveBeenCalledWith(
      [EPISODE_ID, '--yes', '--platform', 'x'],
      expect.objectContaining({ setExitCodeOnFailure: false }),
    );
    expect(mocks.completeSocialPublishJob).toHaveBeenCalledWith({
      jobId: 'job-1',
      owner: expect.any(String),
      completedAt: NOW,
      socialPostId: 'post-1',
    });
    expect(mocks.refreshSocialStrategies).toHaveBeenCalledWith(
      expect.objectContaining({ now: NOW }),
    );
  });

  it('backs off a failed publish without preventing the rest of the tick', async () => {
    mocks.claimSocialPublishJob.mockResolvedValue({
      id: 'job-fail',
      episode_id: EPISODE_ID,
      platform: 'threads',
      status: 'processing',
      scheduled_at: '2026-08-16T09:00:00.000Z',
      next_attempt_at: '2026-08-16T09:00:00.000Z',
      strategy_version_id: null,
      social_post_id: null,
      attempt_count: 2,
      lease_owner: 'owner',
      lease_expires_at: '2026-08-16T10:15:00.000Z',
      last_error: null,
      completed_at: null,
      created_at: '2026-08-16T09:00:00.000Z',
      updated_at: '2026-08-16T10:00:00.000Z',
    });
    mocks.runSocialCli.mockResolvedValue([
      { platform: 'threads', status: 'failed', error: new Error('Meta down') },
    ]);

    await runSocialDaemonTick({
      now: NOW,
      firstStartedAt: '2026-08-16T08:00:00.000Z',
    });

    expect(mocks.failSocialPublishJob).toHaveBeenCalledWith({
      jobId: 'job-fail',
      owner: expect.any(String),
      now: NOW,
      attemptCount: 2,
      error: 'Meta down',
    });
    expect(mocks.completeSocialPublishJob).not.toHaveBeenCalled();
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
    mocks.listSocialPostsByEpisode.mockResolvedValue([
      socialPost({
        id: 'post-youtube',
        platform: 'youtube',
        post_url: 'https://www.youtube.com/watch?v=abc',
      }),
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
    expect(mocks.runSocialCli).not.toHaveBeenCalled();
    expect(mocks.failSocialPublishJob).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      `[social-daemon] reconciled youtube for ${EPISODE_ID} - already published (post-youtube).`,
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
    mocks.listSocialPostsByEpisode.mockResolvedValue([
      socialPost({ id: 'post-manual', platform: 'youtube' }),
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
    expect(mocks.runSocialCli).not.toHaveBeenCalled();
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
    mocks.listSocialPostsByEpisode.mockImplementation(
      async (_episodeId: string, platform: string) =>
        platform === 'x' ? [socialPost({ id: 'post-raced' })] : [],
    );
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
      now: NOW,
      firstStartedAt: '2026-08-16T08:00:00.000Z',
      log,
    });

    expect(mocks.runSocialCli).not.toHaveBeenCalled();
    expect(mocks.completeSocialPublishJob).toHaveBeenCalledWith({
      jobId: 'job-crashed',
      owner: expect.any(String),
      completedAt: NOW,
      socialPostId: 'post-crashed',
    });
    expect(mocks.failSocialPublishJob).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      `[social-daemon] reconciled youtube for ${EPISODE_ID} - already published (post-crashed).`,
    );
  });

  it('records only the earliest missing standardized metric window', async () => {
    const post = socialPost();
    mocks.listDueMetricPosts.mockResolvedValue([post]);
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
    const now = vi
      .fn()
      .mockReturnValueOnce(NOW)
      .mockReturnValueOnce(NOW)
      .mockReturnValueOnce(oneHourLater);
    const sleep = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('stop-loop'));
    const log = vi.fn();

    await expect(runSocialDaemon({ now, sleep, log })).rejects.toThrow(
      'stop-loop',
    );

    expect(mocks.ensureSocialDaemonStart).toHaveBeenCalledWith(NOW);
    expect(sleep).toHaveBeenNthCalledWith(1, 60_000);
    expect(sleep).toHaveBeenNthCalledWith(2, 60_000);
    expect(mocks.refreshSocialStrategies).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('[social-daemon] started as'),
    );
    expect(log).toHaveBeenCalledWith(
      '[social-daemon] checking discovery, publishing, metrics, and strategy...',
    );
    expect(log).toHaveBeenCalledWith(
      '[social-daemon] queue: no publish jobs pending.',
    );
    expect(log).toHaveBeenCalledWith(
      '[social-daemon] check complete; next check in 60s.',
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
        },
        {
          episodeId: 'episode-2',
          title: 'AI安全之爭：集中控制與分散競爭誰更危險？',
          nextAt: '2026-08-16T10:35:00.000Z',
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
      runSocialDaemon({ now: () => NOW, sleep, log }),
    ).rejects.toThrow('stop-loop');

    expect(log).toHaveBeenCalledWith(
      '[social-daemon] queue: 4 publish jobs pending across 2 articles.',
    );
    expect(log).toHaveBeenCalledWith(
      '[social-daemon]   1. “穩定幣真實使用場景：境內交易佔六成，亞太地區成最大市場” — first publish 08/16 19:05 JST (in 5m).',
    );
    expect(log).toHaveBeenCalledWith(
      '[social-daemon]   2. “AI安全之爭：集中控制與分散競爭誰更危險？” — first publish 08/16 19:35 JST (in 35m).',
    );
    expect(log).toHaveBeenCalledWith(
      '[social-daemon] next x: “穩定幣真實使用場景：境內交易佔六成，亞太地區成最大市場” at 08/16 19:05 JST (in 5m; queued).',
    );
    expect(log).toHaveBeenCalledWith(
      '[social-daemon] next threads: “穩定幣真實使用場景” at 08/16 19:15 JST (in 15m; queued).',
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
      await expect(runSocialDaemon()).rejects.toThrow('stop-default-sleep');
    } finally {
      timeout.mockRestore();
      consoleLog.mockRestore();
    }
  });

  it('uses active strategy schedules, skips invalid candidates, and keeps rolling slots only for inserted jobs', async () => {
    mocks.listSocialPublishCandidates.mockResolvedValue([
      { episode_id: 'bad', ready_at: 'not-a-date' },
      { episode_id: EPISODE_ID, ready_at: '2026-08-16T11:00:00.000Z' },
    ]);
    mocks.getActiveSocialStrategies.mockResolvedValue([
      {
        id: 'strategy-x',
        platform: 'x',
        version: 2,
        config: { publishSlotsJst: [{ hour: 19, minute: 0 }] },
        based_on_samples: 5,
        active: true,
        activated_at: '2026-08-16T08:00:00.000Z',
        created_at: '2026-08-16T08:00:00.000Z',
      },
    ]);
    mocks.latestScheduledSocialJobs.mockResolvedValue({
      x: '2026-08-16T10:05:00.000Z',
    });
    mocks.enqueueSocialPublishJob.mockImplementation(
      async (input) => input.platform !== 'threads',
    );

    await runSocialDaemonTick({
      now: NOW,
      firstStartedAt: '2026-08-16T08:00:00.000Z',
    });

    expect(mocks.enqueueSocialPublishJob).toHaveBeenCalledTimes(4);
    const calls = mocks.enqueueSocialPublishJob.mock.calls.map(
      ([input]) => input,
    );
    expect(calls.find((input) => input.platform === 'x')).toMatchObject({
      strategyVersionId: 'strategy-x',
    });
    expect(calls.find((input) => input.platform === 'threads')).toMatchObject({
      strategyVersionId: null,
    });
  });

  it('passes learned guidance into publishing and fails on state or record persistence errors', async () => {
    for (const field of ['stateError', 'recordError'] as const) {
      vi.clearAllMocks();
      mocks.listSocialPublishCandidates.mockResolvedValue([]);
      mocks.getActiveSocialStrategies.mockResolvedValue([]);
      mocks.latestScheduledSocialJobs.mockResolvedValue({});
      mocks.listDueMetricPosts.mockResolvedValue([]);
      mocks.claimSocialPublishJob.mockResolvedValue(
        publishJob({ strategy_version_id: 'strategy-1' }),
      );
      mocks.getSocialStrategyById.mockResolvedValue({
        id: 'strategy-1',
        platform: 'x',
        version: 1,
        config: { preferredHookTypes: ['question'] },
        based_on_samples: 5,
        active: true,
        activated_at: NOW.toISOString(),
        created_at: NOW.toISOString(),
      });
      mocks.runSocialCli.mockResolvedValue([
        {
          platform: 'x',
          status: 'published',
          url: 'https://x.com/zap/status/1',
          [field]: new Error(`${field} failed`),
        },
      ]);

      await runSocialDaemonTick({
        now: NOW,
        firstStartedAt: '2026-08-16T08:00:00.000Z',
      });

      expect(mocks.runSocialCli).toHaveBeenCalledWith(
        [EPISODE_ID, '--yes', '--platform', 'x'],
        expect.objectContaining({
          strategyGuidance: expect.stringContaining('question'),
          setExitCodeOnFailure: false,
        }),
      );
      expect(mocks.failSocialPublishJob).toHaveBeenCalledWith(
        expect.objectContaining({ error: `${field} failed` }),
      );
    }
  });

  it('fails cleanly when publish outcome or telemetry row is missing and normalizes non-Error failures', async () => {
    const scenarios = [
      {
        outcomes: [],
        posts: [socialPost()],
        expected: 'x did not publish.',
      },
      {
        outcomes: [
          {
            platform: 'x',
            status: 'published',
            url: 'https://x.com/zap/status/1',
          },
        ],
        posts: [],
        expected: 'publish completed but no social_posts row was recorded',
      },
    ];

    for (const scenario of scenarios) {
      vi.clearAllMocks();
      mocks.listSocialPublishCandidates.mockResolvedValue([]);
      mocks.getActiveSocialStrategies.mockResolvedValue([]);
      mocks.latestScheduledSocialJobs.mockResolvedValue({});
      mocks.listDueMetricPosts.mockResolvedValue([]);
      mocks.claimSocialPublishJob.mockResolvedValue(publishJob());
      mocks.runSocialCli.mockResolvedValue(scenario.outcomes);
      mocks.listSocialPostsByEpisode
        .mockResolvedValueOnce([])
        .mockResolvedValue(scenario.posts);

      await runSocialDaemonTick({
        now: NOW,
        firstStartedAt: '2026-08-16T08:00:00.000Z',
      });
      expect(mocks.failSocialPublishJob).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining(scenario.expected),
        }),
      );
    }

    vi.clearAllMocks();
    mocks.listSocialPublishCandidates.mockResolvedValue([]);
    mocks.getActiveSocialStrategies.mockResolvedValue([]);
    mocks.latestScheduledSocialJobs.mockResolvedValue({});
    mocks.listDueMetricPosts.mockResolvedValue([]);
    mocks.claimSocialPublishJob.mockResolvedValue(publishJob());
    mocks.listSocialPostsByEpisode.mockResolvedValue([]);
    mocks.runSocialCli.mockRejectedValue('plain publish failure');
    await runSocialDaemonTick({
      now: NOW,
      firstStartedAt: '2026-08-16T08:00:00.000Z',
    });
    expect(mocks.failSocialPublishJob).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'plain publish failure' }),
    );
  });

  it('skips unavailable metric snapshots, logs collector failures, and ignores null recorded windows', async () => {
    const tooYoung = socialPost({
      id: 'post-young',
      published_at: '2026-08-16T09:30:00.000Z',
    });
    const empty = socialPost({ id: 'post-empty' });
    const errorPost = socialPost({ id: 'post-error' });
    const stringErrorPost = socialPost({ id: 'post-string-error' });
    mocks.listDueMetricPosts.mockResolvedValue([
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
    mocks.listDueMetricPosts.mockResolvedValue([post]);

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

  it('isolates discover, publish, metric, and strategy failures so one subsystem cannot stop a tick', async () => {
    mocks.listSocialPublishCandidates.mockRejectedValue(
      new Error('discover down'),
    );
    mocks.claimSocialPublishJob.mockRejectedValue('publish down');
    mocks.listDueMetricPosts.mockRejectedValue(new Error('metrics down'));
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
        expect.stringContaining('discover failed: discover down'),
        expect.stringContaining('publish failed: publish down'),
        expect.stringContaining('metrics failed: metrics down'),
        expect.stringContaining('strategy failed: strategy down'),
      ]),
    );
  });
});
