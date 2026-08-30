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
  listDueSocialPublishPlatforms: vi.fn().mockResolvedValue([]),
  listLearningSocialPosts: vi.fn().mockResolvedValue([]),
  listLearningSocialMetrics: vi.fn().mockResolvedValue([]),
  listMetricWindowsForPosts: vi.fn().mockResolvedValue([]),
  listSocialPublishCandidates: vi.fn(),
  listSocialPublishCandidatesForEpisodes: vi.fn(),
  listUnfinishedSocialPublishJobs: vi.fn().mockResolvedValue([]),
  reconcileSocialPublishJob: vi.fn(),
  releaseSocialPublishJobLease: vi.fn(),
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
  captureDueAccountSnapshots: vi.fn().mockResolvedValue([]),
  capturePrePublishAccountSnapshots: vi.fn().mockResolvedValue([]),
  refreshSocialStrategies: vi.fn(),
  getOrCreateExperimentAssignment: vi.fn(),
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
  listDueSocialPublishPlatforms: mocks.listDueSocialPublishPlatforms,
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
  capturePrePublishAccountSnapshots: mocks.capturePrePublishAccountSnapshots,
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

import { runSocialDaemonTick } from './daemon.js';

const EPISODE_ID = '123e4567-e89b-42d3-a456-426614174000';
const EPISODE_CREATED_AT = '2026-08-24T00:00:00.000Z';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listPastDueSocialPublishJobs.mockResolvedValue([]);
  mocks.rescheduleSocialPublishJob.mockResolvedValue(true);
  mocks.claimSocialPublishBatch.mockResolvedValue([]);
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
        assigned_at: EPISODE_CREATED_AT,
      }),
  );
  mocks.ensureSocialDaemonStart.mockResolvedValue('2026-08-16T08:00:00.000Z');
});

describe('platform publish scheduling', () => {
  function readyCandidates() {
    return (['zh-Hant', 'ja', 'en'] as const).map((language_code) => ({
      episode_id: EPISODE_ID,
      ready_at: '2026-08-16T09:00:00.000Z',
      language_code,
      episode_created_at: EPISODE_CREATED_AT,
    }));
  }

  function enqueuedLanes() {
    return mocks.enqueueSocialPublishJob.mock.calls.map(([input]) => ({
      platform: input.platform,
      languageCode: input.languageCode,
      scheduledAt: input.scheduledAt,
    }));
  }

  it('gives each platform its own slot instead of one shared cohort time', async () => {
    const candidates = readyCandidates();
    mocks.listSocialPublishCandidates.mockResolvedValue(candidates);
    mocks.listSocialPublishCandidatesForEpisodes.mockResolvedValue(candidates);

    await runSocialDaemonTick({
      now: new Date('2026-08-16T10:00:00.000Z'),
      firstStartedAt: '2026-08-16T08:00:00.000Z',
    });

    const lanes = enqueuedLanes();
    // YouTube is English-only now, so the cohort is four lanes, not five.
    expect(
      lanes.map(({ platform, languageCode }) => ({ platform, languageCode })),
    ).toEqual(
      expect.arrayContaining([
        { platform: 'rednote', languageCode: 'zh-Hant' },
        { platform: 'threads', languageCode: 'ja' },
        { platform: 'x', languageCode: 'ja' },
        { platform: 'youtube', languageCode: 'en' },
      ]),
    );
    expect(lanes).toHaveLength(4);

    // One time per platform, and four different ones: the shared `scheduled_at`
    // this replaces is exactly what made an article publish everywhere at once.
    const byPlatform = new Map(
      lanes.map(({ platform, scheduledAt }) => [platform, scheduledAt]),
    );
    expect(new Set(byPlatform.values()).size).toBe(4);
    for (const scheduledAt of byPlatform.values()) {
      const jstHour = new Date(
        Date.parse(scheduledAt) + 9 * 60 * 60_000,
      ).getUTCHours();
      expect(jstHour).toBeGreaterThanOrEqual(9);
      expect(jstHour).toBeLessThan(18);
    }
  });

  it('keeps the language lanes of one platform on the same slot', async () => {
    // X is the only multilingual platform, and its experiment assigns one
    // language per episode -- so the guarantee is asserted by construction on
    // any platform that does enqueue more than one lane.
    const candidates = readyCandidates();
    mocks.listSocialPublishCandidates.mockResolvedValue(candidates);
    mocks.listSocialPublishCandidatesForEpisodes.mockResolvedValue(candidates);

    await runSocialDaemonTick({
      now: new Date('2026-08-16T10:00:00.000Z'),
      firstStartedAt: '2026-08-16T08:00:00.000Z',
    });

    const byPlatform = new Map<string, Set<string>>();
    for (const { platform, scheduledAt } of enqueuedLanes()) {
      byPlatform.set(
        platform,
        (byPlatform.get(platform) ?? new Set()).add(scheduledAt),
      );
    }
    for (const times of byPlatform.values()) {
      expect(times.size).toBe(1);
    }
  });

  it('reuses the slot a platform cohort already holds', async () => {
    const candidates = readyCandidates();
    mocks.listSocialPublishCandidates.mockResolvedValue(candidates);
    mocks.listSocialPublishCandidatesForEpisodes.mockResolvedValue(candidates);
    const existingSlot = '2026-08-17T05:30:00.000Z';
    mocks.listPendingSocialPublishSchedules.mockResolvedValue([
      {
        episode_id: EPISODE_ID,
        platform: 'rednote',
        language_code: 'zh-Hant',
        scheduled_at: existingSlot,
        completed_at: null,
        status: 'queued',
      },
    ]);

    await runSocialDaemonTick({
      now: new Date('2026-08-16T10:00:00.000Z'),
      firstStartedAt: '2026-08-16T08:00:00.000Z',
    });

    // An interrupted tick must not drift the slot it already inserted.
    const rednote = enqueuedLanes().filter(
      ({ platform }) => platform === 'rednote',
    );
    expect(rednote).toHaveLength(1);
    expect(rednote[0]?.scheduledAt).toBe(existingSlot);
  });

  it('leaves a lane unqueued rather than compressing past the horizon', async () => {
    const candidates = readyCandidates();
    mocks.listSocialPublishCandidates.mockResolvedValue(candidates);
    mocks.listSocialPublishCandidatesForEpisodes.mockResolvedValue(candidates);
    // Every Rednote day inside the horizon is already spoken for.
    mocks.listPendingSocialPublishSchedules.mockResolvedValue(
      Array.from({ length: 9 }, (_value, index) => ({
        episode_id: `other-episode-${index}`,
        platform: 'rednote' as const,
        language_code: 'zh-Hant' as const,
        scheduled_at: new Date(
          Date.parse('2026-08-16T05:30:00.000Z') + index * 24 * 60 * 60_000,
        ).toISOString(),
        completed_at: null,
        status: 'queued' as const,
      })),
    );
    const log = vi.fn();

    await runSocialDaemonTick({
      now: new Date('2026-08-16T10:00:00.000Z'),
      firstStartedAt: '2026-08-16T08:00:00.000Z',
      log,
    });

    // Not dropped and not squeezed in: the backlog stays a candidate and the
    // next tick offers it again.
    expect(
      enqueuedLanes().filter(({ platform }) => platform === 'rednote'),
    ).toHaveLength(0);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('horizon'));
    expect(
      enqueuedLanes().filter(({ platform }) => platform === 'threads'),
    ).toHaveLength(1);
  });

  it('does not let a reconciled ghost row reserve a day it never used', async () => {
    const candidates = readyCandidates();
    mocks.listSocialPublishCandidates.mockResolvedValue(candidates);
    mocks.listSocialPublishCandidatesForEpisodes.mockResolvedValue(candidates);
    const ghostSlot = '2026-08-17T05:30:00.000Z';
    mocks.listPendingSocialPublishSchedules.mockResolvedValue([
      {
        episode_id: 'reconciled-episode',
        platform: 'rednote',
        language_code: 'zh-Hant',
        scheduled_at: ghostSlot,
        completed_at: '2026-08-05T02:00:00.000Z',
        status: 'completed',
      },
    ]);

    await runSocialDaemonTick({
      now: new Date('2026-08-16T10:00:00.000Z'),
      firstStartedAt: '2026-08-16T08:00:00.000Z',
    });

    // Reconciliation bound an already-live post to a future slot; counting it
    // would hold that day shut for a post that went out days earlier.
    const rednote = enqueuedLanes().filter(
      ({ platform }) => platform === 'rednote',
    );
    expect(rednote[0]?.scheduledAt).toBe(ghostSlot);
  });
});
