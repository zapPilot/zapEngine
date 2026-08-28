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
  captureDueAccountSnapshots: vi.fn().mockResolvedValue(0),
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

import { runSocialDaemonTick } from './daemon.js';

const EPISODE_ID = '123e4567-e89b-42d3-a456-426614174000';
const EPISODE_CREATED_AT = '2026-08-24T00:00:00.000Z';
const FIRST_STARTED_AT = '2026-08-16T08:00:00.000Z';
const NOW = new Date('2026-08-16T10:00:00.000Z');

function candidate(languageCode: 'zh-Hant' | 'ja' | 'en', readyAt: string) {
  return {
    episode_id: EPISODE_ID,
    ready_at: readyAt,
    language_code: languageCode,
    episode_created_at: EPISODE_CREATED_AT,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listPastDueSocialPublishJobs.mockResolvedValue([]);
  mocks.rescheduleSocialPublishJob.mockResolvedValue(true);
  mocks.claimSocialPublishBatch.mockResolvedValue([]);
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
  mocks.ensureSocialDaemonStart.mockResolvedValue(FIRST_STARTED_AT);
});

describe('platform media readiness barrier', () => {
  it('holds back only the platforms whose own language is still rendering', async () => {
    // The barrier is per platform now: platforms release on their own budgets,
    // so a language YouTube is waiting on must not keep a Rednote lane whose
    // own language has been ready for days out of the queue.
    const zhOnly = [candidate('zh-Hant', '2026-08-16T09:00:00.000Z')];
    mocks.listSocialPublishCandidates.mockResolvedValue(zhOnly);
    mocks.listSocialPublishCandidatesForEpisodes.mockResolvedValue(zhOnly);
    const log = vi.fn();

    await runSocialDaemonTick({
      now: NOW,
      firstStartedAt: FIRST_STARTED_AT,
      log,
    });

    expect(
      mocks.enqueueSocialPublishJob.mock.calls.map(([input]) => [
        input.platform,
        input.languageCode,
      ]),
    ).toEqual([['rednote', 'zh-Hant']]);
    for (const missing of ['🇯🇵 ja', '🇺🇸 en']) {
      expect(log).toHaveBeenCalledWith(
        expect.stringContaining(`cohort not release-ready · ${missing}`),
      );
    }
  });

  it('enqueues no lane of a platform until every language it needs is ready', async () => {
    // X ships one language per episode, so its barrier is a single language;
    // the pinned assignment makes that language ja.
    const englishOnly = [candidate('en', '2026-08-16T09:00:00.000Z')];
    mocks.listSocialPublishCandidates.mockResolvedValue(englishOnly);
    mocks.listSocialPublishCandidatesForEpisodes.mockResolvedValue(englishOnly);

    await runSocialDaemonTick({ now: NOW, firstStartedAt: FIRST_STARTED_AT });

    expect(
      mocks.enqueueSocialPublishJob.mock.calls.map(([input]) => input.platform),
    ).toEqual(['youtube']);
  });

  it('enqueues the full cohort in one tick once the last required language becomes ready', async () => {
    const allReady = [
      candidate('zh-Hant', '2026-08-16T09:00:00.000Z'),
      candidate('ja', '2026-08-16T09:00:00.000Z'),
      candidate('en', '2026-08-16T09:30:00.000Z'),
    ];
    mocks.listSocialPublishCandidates.mockResolvedValue(allReady);
    mocks.listSocialPublishCandidatesForEpisodes.mockResolvedValue(allReady);

    await runSocialDaemonTick({ now: NOW, firstStartedAt: FIRST_STARTED_AT });

    // Four lanes, not five: YouTube distributes in English only.
    expect(mocks.enqueueSocialPublishJob).toHaveBeenCalledTimes(4);
  });

  it('still counts a language that finished ready before the discovery anchor', async () => {
    // zh-Hant finished before the anchor, so the anchor-filtered candidate
    // list only surfaces ja/en -- but the episode must still be recognized as
    // fully ready once every localization is looked up without the anchor.
    const afterAnchor = [
      candidate('ja', '2026-08-16T09:00:00.000Z'),
      candidate('en', '2026-08-16T09:30:00.000Z'),
    ];
    const fullPicture = [
      candidate('zh-Hant', '2026-08-15T00:00:00.000Z'),
      ...afterAnchor,
    ];
    mocks.listSocialPublishCandidates.mockResolvedValue(afterAnchor);
    mocks.listSocialPublishCandidatesForEpisodes.mockResolvedValue(fullPicture);

    await runSocialDaemonTick({ now: NOW, firstStartedAt: FIRST_STARTED_AT });

    expect(mocks.listSocialPublishCandidatesForEpisodes).toHaveBeenCalledWith([
      EPISODE_ID,
    ]);
    // Four lanes, not five: YouTube distributes in English only.
    expect(mocks.enqueueSocialPublishJob).toHaveBeenCalledTimes(4);
    expect(
      mocks.enqueueSocialPublishJob.mock.calls.some(
        ([input]) =>
          input.platform === 'rednote' && input.languageCode === 'zh-Hant',
      ),
    ).toBe(true);
  });
});
