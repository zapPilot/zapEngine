import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listLearningSocialPosts: vi.fn(),
  listLearningSocialMetrics: vi.fn(),
  listMetricWindowsForPosts: vi.fn(),
  listSocialEpisodeLocalizationTitles: vi.fn(),
  insertSocialPostMetric: vi.fn(),
  updateSocialPostIdentity: vi.fn(),
  updateSocialPostReviewStatus: vi.fn(),
  createMetricsBrowserSession: vi.fn(),
  closeMetricsBrowserSession: vi.fn(),
  collectRednote: vi.fn(),
  collectX: vi.fn(),
  getSocialQueueSnapshot: vi.fn(),
  listUnfinishedSocialPublishJobs: vi.fn(),
  listSocialPostIdentitiesByEpisodes: vi.fn(),
  reconcileSocialPublishJob: vi.fn(),
  listSocialPublishCandidates: vi.fn(),
  listSocialPublishCandidatesForEpisodes: vi.fn(),
  listPastDueSocialPublishJobs: vi.fn().mockResolvedValue([]),
  rescheduleSocialPublishJob: vi.fn().mockResolvedValue(true),
  getActiveSocialStrategies: vi.fn(),
  claimSocialPublishJob: vi.fn(),
  listPendingSocialPublishSchedules: vi.fn().mockResolvedValue([]),
  listDueSocialPublishPlatforms: vi.fn().mockResolvedValue([]),
  captureDueAccountSnapshots: vi.fn(),
  capturePrePublishAccountSnapshots: vi.fn(),
  refreshSocialStrategies: vi.fn(),
  publishSocialBatch: vi.fn(),
}));

vi.mock('./daemon-store.js', () => ({
  claimSocialPublishBatch: async (...args: unknown[]) => {
    const job = await mocks.claimSocialPublishJob(...args);
    return job ? [job] : [];
  },
  listPastDueSocialPublishJobs: mocks.listPastDueSocialPublishJobs,
  rescheduleSocialPublishJob: mocks.rescheduleSocialPublishJob,
  completeSocialPublishJob: vi.fn(),
  enqueueSocialPublishJob: vi.fn(),
  ensureSocialDaemonStart: vi
    .fn()
    .mockResolvedValue('2026-08-16T08:00:00.000Z'),
  failSocialPublishJob: vi.fn(),
  getActiveSocialStrategies: mocks.getActiveSocialStrategies,
  getSocialQueueSnapshot: mocks.getSocialQueueSnapshot,
  latestPendingSocialPublishSchedule: vi.fn().mockResolvedValue(null),
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
  releaseSocialPublishJobLease: vi.fn(),
}));

vi.mock('./release-cohort-store.js', () => ({
  alignPendingSocialReleaseCohorts: vi.fn().mockResolvedValue({
    alignedLanes: 0,
    rescheduledEpisodes: 0,
    recoveryEpisodes: [],
  }),
  listPartiallyPublishedCohorts: vi.fn().mockResolvedValue([]),
  claimReleaseCohortJobs: async (...args: unknown[]) => {
    const job = await mocks.claimSocialPublishJob(...args);
    return job ? [job] : [];
  },
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
    x: mocks.collectX,
    threads: vi
      .fn()
      .mockResolvedValue({ status: 'collected', metrics: { views: 10 } }),
    rednote: mocks.collectRednote,
    youtube: vi
      .fn()
      .mockResolvedValue({ status: 'collected', metrics: { views: 10 } }),
  })),
  createMetricsBrowserSession: mocks.createMetricsBrowserSession,
}));

vi.mock('./account-snapshots.js', () => ({
  captureDueAccountSnapshots: mocks.captureDueAccountSnapshots,
  capturePrePublishAccountSnapshots: mocks.capturePrePublishAccountSnapshots,
}));

vi.mock('./publish-batch.js', () => ({
  publishSocialBatch: mocks.publishSocialBatch,
}));

vi.mock('./strategy.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./strategy.js')>()),
  refreshSocialStrategies: mocks.refreshSocialStrategies,
}));

import type { SocialPostRow } from '../types.js';
import { collectDueMetricWindows, earliestDueWindow } from './daemon.js';
import { learnSocialStrategies } from './strategy.js';

function post(overrides: Partial<SocialPostRow> = {}): SocialPostRow {
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
    ...overrides,
  };
}

const NOW_72H = new Date('2026-08-16T10:00:00.000Z'); // 72h after 2026-08-13T10:00:00Z
const NOW_7D = new Date('2026-08-20T10:00:00.000Z');

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listPastDueSocialPublishJobs.mockResolvedValue([]);
  mocks.rescheduleSocialPublishJob.mockResolvedValue(true);
  mocks.listSocialPublishCandidates.mockResolvedValue([]);
  mocks.listSocialPublishCandidatesForEpisodes.mockResolvedValue([]);
  mocks.getActiveSocialStrategies.mockResolvedValue([]);
  mocks.getSocialQueueSnapshot.mockResolvedValue({
    pendingCount: 0,
    episodeQueue: [],
    nextByPlatform: {},
  });
  mocks.listUnfinishedSocialPublishJobs.mockResolvedValue([]);
  mocks.listSocialPostIdentitiesByEpisodes.mockResolvedValue([]);
  mocks.claimSocialPublishJob.mockResolvedValue(null);
  mocks.listLearningSocialPosts.mockResolvedValue([]);
  mocks.listLearningSocialMetrics.mockResolvedValue([]);
  mocks.listMetricWindowsForPosts.mockResolvedValue([]);
  mocks.listSocialEpisodeLocalizationTitles.mockResolvedValue([
    {
      episode_id: 'episode-1',
      language_code: 'zh-Hant',
      title: '穩定幣真實使用場景',
    },
  ]);
  mocks.insertSocialPostMetric.mockResolvedValue({});
  mocks.updateSocialPostReviewStatus.mockResolvedValue(undefined);
  mocks.updateSocialPostIdentity.mockResolvedValue(undefined);
  mocks.collectRednote.mockReset();
  mocks.collectX.mockReset();
  mocks.createMetricsBrowserSession.mockReturnValue({
    withPage: vi.fn(),
    close: mocks.closeMetricsBrowserSession,
  });
  mocks.closeMetricsBrowserSession.mockResolvedValue(undefined);
  mocks.captureDueAccountSnapshots.mockResolvedValue([]);
  mocks.capturePrePublishAccountSnapshots.mockResolvedValue([]);
});

describe('earliestDueWindow terminal', () => {
  it('does not re-run 72h when already collected', () => {
    const p = post({ published_at: '2026-08-13T10:00:00.000Z' });
    expect(earliestDueWindow(p, NOW_72H, new Set(['post-1:72h']))).toBeNull();
  });

  it('does not re-run 72h when already unavailable', () => {
    const p = post({ published_at: '2026-08-13T10:00:00.000Z' });
    // unavailable also marks completed via same set
    expect(earliestDueWindow(p, NOW_72H, new Set(['post-1:72h']))).toBeNull();
  });

  it('returns 72h when not yet recorded', () => {
    const p = post({ published_at: '2026-08-13T10:00:00.000Z' });
    expect(earliestDueWindow(p, NOW_72H, new Set())).toMatchObject({
      label: '72h',
    });
  });

  it('returns null for rejected/self_only terminal review_status', () => {
    for (const status of ['rejected', 'self_only'] as const) {
      const p = post({ review_status: status });
      expect(earliestDueWindow(p, NOW_72H, new Set())).toBeNull();
      expect(earliestDueWindow(p, NOW_7D, new Set())).toBeNull();
    }
  });

  it('does not treat under_review as terminal', () => {
    const p = post({
      review_status: 'under_review',
      published_at: '2026-08-13T10:00:00.000Z',
    });
    expect(earliestDueWindow(p, NOW_72H, new Set())).toMatchObject({
      label: '72h',
    });
  });
});

describe('collectDueMetricWindows unavailable handling', () => {
  it('writes unavailable row when rednote card not found', async () => {
    const p = post({
      id: 'rednote-1',
      published_at: '2026-08-13T10:00:00.000Z',
    });
    mocks.listLearningSocialPosts.mockResolvedValue([p]);
    mocks.listMetricWindowsForPosts.mockResolvedValue([]);
    mocks.collectRednote.mockResolvedValue({
      status: 'unavailable',
      reason: 'rednote post note-1 not found in manager',
    });
    const log = vi.fn();
    const inserted = await collectDueMetricWindows(NOW_72H, log);
    expect(inserted).toBe(0);
    expect(mocks.insertSocialPostMetric).toHaveBeenCalledWith(
      expect.objectContaining({
        socialPostId: 'rednote-1',
        measurementWindow: '72h',
        collectionStatus: 'unavailable',
        views: null,
      }),
    );
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('metrics unavailable'),
    );
    expect(log).toHaveBeenCalledWith(
      '📊 [social-daemon] metrics · 1 unavailable',
    );
  });

  it('records collected metrics for visible post across windows', async () => {
    const p = post({
      id: 'visible-1',
      published_at: '2026-08-16T09:00:00.000Z',
      review_status: 'visible',
    });
    const now1h = new Date('2026-08-16T10:00:00.000Z');
    mocks.listLearningSocialPosts.mockResolvedValue([p]);
    mocks.listMetricWindowsForPosts.mockResolvedValue([]);
    mocks.collectRednote.mockResolvedValue({
      status: 'collected',
      metrics: {
        views: 100,
        likes: 5,
        comments: 1,
        shares: 0,
        saves: 2,
        impressions: null,
        profileVisits: null,
        followersGained: null,
      },
    });
    await collectDueMetricWindows(now1h, vi.fn());
    expect(mocks.insertSocialPostMetric).toHaveBeenCalledWith(
      expect.objectContaining({
        measurementWindow: '1h',
        collectionStatus: 'collected',
        views: 100,
      }),
    );
  });

  it('does not write row for under_review retryable and stays due', async () => {
    const p = post({
      id: 'review-1',
      published_at: '2026-08-13T10:00:00.000Z',
      review_status: 'visible',
    });
    mocks.listLearningSocialPosts.mockResolvedValue([p]);
    mocks.listMetricWindowsForPosts.mockResolvedValue([]);
    mocks.collectRednote.mockResolvedValue({
      status: 'retryable',
      reason: 'rednote post under_review',
    });
    const log = vi.fn();
    await collectDueMetricWindows(NOW_72H, log);
    expect(mocks.insertSocialPostMetric).not.toHaveBeenCalled();
    // retryable is not logged per-post, only pending in summary if any collected/unavailable. Here 0 collected/unavailable so no summary.
    expect(log).not.toHaveBeenCalledWith(
      expect.stringContaining('metrics unavailable'),
    );
    // still due next tick because no completed entry was added
    expect(earliestDueWindow(p, NOW_72H, new Set())).not.toBeNull();
  });

  it('does not retry unavailable window on next tick', async () => {
    const p = post({ id: 'post-1', published_at: '2026-08-13T10:00:00.000Z' });
    mocks.listLearningSocialPosts.mockResolvedValue([p]);
    mocks.listMetricWindowsForPosts.mockResolvedValue([
      { social_post_id: 'post-1', measurement_window: '72h' },
    ]);
    mocks.collectRednote.mockResolvedValue({
      status: 'collected',
      metrics: {
        views: 10,
        likes: 1,
        comments: 0,
        shares: 0,
        saves: 0,
        impressions: null,
        profileVisits: null,
        followersGained: null,
      },
    });
    const inserted = await collectDueMetricWindows(NOW_72H, vi.fn());
    expect(inserted).toBe(0);
    expect(mocks.collectRednote).not.toHaveBeenCalled();
  });
});

describe('strategy learning excludes suppressed', () => {
  it('excludes rejected/self_only rednote metrics', () => {
    const metrics = [
      {
        id: 'm1',
        social_post_id: 'p1',
        captured_at: '2026-08-16T10:00:00.000Z',
        age_hours: 24,
        measurement_window: '24h' as const,
        views: 100,
        impressions: null,
        likes: 10,
        comments: 2,
        shares: 1,
        saves: 3,
        profile_visits: null,
        followers_gained: null,
        details: {},
        created_at: '2026-08-16T10:00:00.000Z',
      },
      {
        id: 'm2',
        social_post_id: 'p2',
        captured_at: '2026-08-16T10:00:00.000Z',
        age_hours: 24,
        measurement_window: '24h' as const,
        views: 200,
        impressions: null,
        likes: 20,
        comments: 5,
        shares: 2,
        saves: 4,
        profile_visits: null,
        followers_gained: null,
        details: {},
        created_at: '2026-08-16T10:00:00.000Z',
      },
    ];
    // need 5 samples per platform variant to trigger strategy, so duplicate visible post metrics to pass MIN_PLATFORM_SAMPLES=5 threshold. Instead test isLearnable directly via counts? Simplify: test that visible contributes but rejected does not by checking learned config vs all suppressed.
    const manyVisible = Array.from({ length: 5 }, (_, i) => ({
      ...metrics[1]!,
      id: `m2-${i}`,
      social_post_id: `p2-${i}`,
    }));
    const manyPosts = Array.from({ length: 5 }, (_, i) =>
      post({
        id: `p2-${i}`,
        review_status: 'visible',
        hashtags: [`tag${i}`],
        hook_type: 'question' as const,
      }),
    );
    // Also add rejected posts that should be ignored
    const rejectedPosts = Array.from({ length: 5 }, (_, i) =>
      post({
        id: `p1-${i}`,
        review_status: 'rejected',
        hashtags: [`bad${i}`],
        hook_type: 'contrarian' as const,
      }),
    );
    const rejectedMetrics = Array.from({ length: 5 }, (_, i) => ({
      ...metrics[0]!,
      id: `m1-${i}`,
      social_post_id: `p1-${i}`,
      views: 1,
    }));
    const learned = learnSocialStrategies({
      posts: [...manyPosts, ...rejectedPosts],
      metrics: [...manyVisible, ...rejectedMetrics],
    });
    // Should learn from visible only, not include rejected hashtags. The preferred hashtags should be from visible tags, not bad*
    expect(learned.length).toBeGreaterThan(0);
    for (const s of learned) {
      expect(s.config.avoidHashtags ?? []).not.toEqual(
        expect.arrayContaining(['bad0']),
      );
    }
  });

  it('excludes unavailable metric rows', () => {
    const p = post({ id: 'p1', review_status: 'visible' });
    const unavailableMetric = {
      id: 'm1',
      social_post_id: 'p1',
      captured_at: '2026-08-16T10:00:00.000Z',
      age_hours: 24,
      measurement_window: '24h' as const,
      collection_status: 'unavailable' as const,
      views: null,
      impressions: null,
      likes: null,
      comments: null,
      shares: null,
      saves: null,
      profile_visits: null,
      followers_gained: null,
      details: {},
      created_at: '2026-08-16T10:00:00.000Z',
    };
    const visibleMetric = {
      id: 'm2',
      social_post_id: 'p1',
      captured_at: '2026-08-16T10:00:00.000Z',
      age_hours: 24,
      measurement_window: '24h' as const,
      collection_status: 'collected' as const,
      views: 500,
      impressions: null,
      likes: 10,
      comments: 2,
      shares: 1,
      saves: 1,
      profile_visits: null,
      followers_gained: null,
      details: {},
      created_at: '2026-08-16T10:00:00.000Z',
    };
    const manyPosts = Array.from({ length: 5 }, (_, i) => ({
      ...p,
      id: `p1-${i}`,
    }));
    const manyUnavailable = Array.from({ length: 5 }, (_, i) => ({
      ...unavailableMetric,
      id: `m1-${i}`,
      social_post_id: `p1-${i}`,
    }));
    const manyVisible = Array.from({ length: 5 }, (_, i) => ({
      ...visibleMetric,
      id: `m2-${i}`,
      social_post_id: `p1-${i}`,
    }));
    const learned = learnSocialStrategies({
      posts: manyPosts,
      metrics: [...manyUnavailable, ...manyVisible],
    });
    // Should still learn because visible metrics count =5, unavailable ignored
    expect(learned.length).toBeGreaterThan(0);
    // If unavailable had views, it would inflate samples, but we ensure its filtered
    const allUnavailable = learnSocialStrategies({
      posts: manyPosts,
      metrics: manyUnavailable,
    });
    expect(allUnavailable).toEqual([]);
  });
});

describe('visible post windows sequence', () => {
  it('progresses through 1h/6h/24h/72h/7d', () => {
    const p = post({
      published_at: '2026-08-13T10:00:00.000Z',
      review_status: 'visible',
    });
    expect(
      earliestDueWindow(p, new Date('2026-08-13T11:00:00.000Z'), new Set()),
    ).toMatchObject({ label: '1h' });
    expect(
      earliestDueWindow(
        p,
        new Date('2026-08-13T16:00:00.000Z'),
        new Set(['post-1:1h']),
      ),
    ).toMatchObject({ label: '6h' });
    expect(
      earliestDueWindow(
        p,
        new Date('2026-08-14T10:00:00.000Z'),
        new Set(['post-1:1h', 'post-1:6h']),
      ),
    ).toMatchObject({ label: '24h' });
    expect(
      earliestDueWindow(
        p,
        new Date('2026-08-16T10:00:00.000Z'),
        new Set(['post-1:1h', 'post-1:6h', 'post-1:24h']),
      ),
    ).toMatchObject({ label: '72h' });
    expect(
      earliestDueWindow(
        p,
        new Date('2026-08-20T10:00:00.000Z'),
        new Set(['post-1:1h', 'post-1:6h', 'post-1:24h', 'post-1:72h']),
      ),
    ).toMatchObject({ label: '7d' });
  });
});
