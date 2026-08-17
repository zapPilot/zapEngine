import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  getSocialPostById: vi.fn(),
  insertSocialPostMetric: vi.fn(),
  listRecentSocialPosts: vi.fn(),
  listSocialPostsByEpisode: vi.fn(),
  updateSocialPostIdentity: vi.fn(),
}));

vi.mock('../services/db.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/db.js')>()),
  getSocialPostById: dbMocks.getSocialPostById,
  insertSocialPostMetric: dbMocks.insertSocialPostMetric,
  listRecentSocialPosts: dbMocks.listRecentSocialPosts,
  listSocialPostsByEpisode: dbMocks.listSocialPostsByEpisode,
  updateSocialPostIdentity: dbMocks.updateSocialPostIdentity,
}));

import type { NewSocialPostMetric, SocialPostRow } from '../types.js';
import {
  buildSocialPostMetric,
  formatMetricsSummary,
  parseMetricsCliOptions,
  runAutomaticSocialMetricsCollector,
  runSocialMetricsCli,
  selectSocialPost,
  type SocialMetricCounts,
} from './metrics.js';

const EPISODE_ID = '123e4567-e89b-42d3-a456-426614174000';
const OTHER_EPISODE_ID = '123e4567-e89b-42d3-a456-4266141740ff';
const POST_ID = '00000000-0000-4000-8000-000000000001';

function post(input?: Partial<SocialPostRow>): SocialPostRow {
  return {
    id: POST_ID,
    episode_id: EPISODE_ID,
    platform: 'x',
    post_url: 'https://x.com/zap/status/1',
    platform_post_id: '1',
    published_at: '2026-08-14T00:00:00.000Z',
    topic: 'macro',
    hook_type: 'question',
    generated_title: null,
    published_title: null,
    generated_body: 'AI 文案',
    published_body: '實際發出的文案',
    hashtags: [],
    video_duration_sec: null,
    content_features: {
      containsQuestion: true,
      containsNumber: false,
      titleChars: null,
      bodyChars: 8,
      hashtagCount: 0,
    },
    llm_model: 'openrouter/model-v1',
    created_at: '2026-08-14T00:00:00.000Z',
    updated_at: '2026-08-14T00:00:00.000Z',
    ...input,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

const NO_COUNTS: SocialMetricCounts = {
  views: null,
  impressions: null,
  likes: null,
  comments: null,
  shares: null,
  saves: null,
  profileVisits: null,
  followersGained: null,
};

describe('parseMetricsCliOptions', () => {
  it('parses an episode id, platform, and the metrics that were supplied', () => {
    const options = parseMetricsCliOptions([
      EPISODE_ID,
      '--platform',
      'x',
      '--views',
      '1200',
      '--likes',
      '18',
      '--comments',
      '0',
    ]);

    expect(options).toEqual({
      episodeId: EPISODE_ID,
      platform: 'x',
      counts: {
        ...NO_COUNTS,
        views: 1200,
        likes: 18,
        comments: 0,
      },
    });
  });

  it('accepts a share URL in place of the bare episode id', () => {
    const options = parseMetricsCliOptions([
      `https://from-fed-to-chain-api.fly.dev/e/${EPISODE_ID}?lang=zh-Hant`,
      '--platform',
      'rednote',
      '--saves',
      '7',
    ]);

    expect(options.episodeId).toBe(EPISODE_ID);
    expect(options.platform).toBe('rednote');
    expect(options.counts.saves).toBe(7);
  });

  it('keeps an omitted metric null so it stays distinct from a measured zero', () => {
    const options = parseMetricsCliOptions([
      EPISODE_ID,
      '--platform',
      'threads',
      '--likes',
      '0',
    ]);

    expect(options.counts.likes).toBe(0);
    expect(options.counts.views).toBeNull();
    expect(options.counts.saves).toBeNull();
  });

  it('allows a negative followers delta but no other negative metric', () => {
    // parseArgs treats a dash-leading value as another option unless the equals
    // form is used, so that is the syntax the usage text documents.
    const options = parseMetricsCliOptions([
      EPISODE_ID,
      '--platform',
      'x',
      '--followers-gained=-3',
    ]);
    expect(options.counts.followersGained).toBe(-3);

    expect(() =>
      parseMetricsCliOptions([EPISODE_ID, '--platform', 'x', '--views=-1']),
    ).toThrow(/--views cannot be negative/);
  });

  it('carries --post-id through when disambiguation is needed', () => {
    const options = parseMetricsCliOptions([
      EPISODE_ID,
      '--platform',
      'x',
      '--post-id',
      ` ${POST_ID} `,
      '--views',
      '5',
    ]);

    expect(options.postId).toBe(POST_ID);
  });

  it.each([
    [[EPISODE_ID, '--views', '5'], /--platform is required/],
    [[EPISODE_ID, '--platform', 'mastodon', '--views', '5'], /--platform must/],
    [['--platform', 'x', '--views', '5'], /Usage: pnpm social:metrics/],
    [[EPISODE_ID, '--platform', 'x'], /No metrics given/],
    [
      [EPISODE_ID, '--platform', 'x', '--likes', '2.5'],
      /--likes must be a whole number/,
    ],
    [
      [EPISODE_ID, '--platform', 'x', '--likes', 'many'],
      /--likes must be a whole number/,
    ],
    [
      [EPISODE_ID, '--platform', 'x', '--post-id', '', '--views', '5'],
      /--post-id cannot be empty/,
    ],
    [
      [EPISODE_ID, '--platform', 'x', '--views', '99999999999999999999'],
      /--views is out of range/,
    ],
    [
      [EPISODE_ID, '--platform', 'x', '--reposts', '5'],
      /Unknown option '--reposts'/,
    ],
  ])('rejects %j', (args, expected) => {
    expect(() => parseMetricsCliOptions(args)).toThrow(expected);
  });
});

describe('selectSocialPost', () => {
  it('returns the only recorded post for that platform', () => {
    const only = post();
    expect(
      selectSocialPost([only], { episodeId: EPISODE_ID, platform: 'x' }),
    ).toBe(only);
  });

  it('explains that nothing was published when no row exists', () => {
    expect(() =>
      selectSocialPost([], { episodeId: EPISODE_ID, platform: 'threads' }),
    ).toThrow(/No Threads post is recorded for episode/);
  });

  it('refuses to guess between reposts and names the candidate ids', () => {
    const second = post({
      id: '00000000-0000-4000-8000-000000000002',
      published_at: '2026-08-15T00:00:00.000Z',
    });

    expect(() =>
      selectSocialPost([second, post()], {
        episodeId: EPISODE_ID,
        platform: 'x',
      }),
    ).toThrow(/has 2 X posts. Choose one with --post-id/);
    expect(() =>
      selectSocialPost([second, post()], {
        episodeId: EPISODE_ID,
        platform: 'x',
      }),
    ).toThrow(new RegExp(second.id));
  });
});

describe('buildSocialPostMetric', () => {
  it('computes age in hours from the post publish time', () => {
    const metric = buildSocialPostMetric({
      post: post({ published_at: '2026-08-14T00:00:00.000Z' }),
      capturedAt: new Date('2026-08-15T02:30:00.000Z'),
      counts: { ...NO_COUNTS, views: 900 },
    });

    expect(metric).toEqual({
      socialPostId: POST_ID,
      capturedAt: '2026-08-15T02:30:00.000Z',
      ageHours: 26.5,
      ...NO_COUNTS,
      views: 900,
    });
  });

  it('rounds age to two decimals', () => {
    const metric = buildSocialPostMetric({
      post: post({ published_at: '2026-08-14T00:00:00.000Z' }),
      capturedAt: new Date('2026-08-14T00:01:00.000Z'),
      counts: { ...NO_COUNTS, views: 1 },
    });

    expect(metric.ageHours).toBe(0.02);
  });

  it('clamps clock skew to zero so a valid snapshot is never rejected', () => {
    const metric = buildSocialPostMetric({
      post: post({ published_at: '2026-08-15T00:00:02.000Z' }),
      capturedAt: new Date('2026-08-15T00:00:00.000Z'),
      counts: { ...NO_COUNTS, views: 1 },
    });

    expect(metric.ageHours).toBe(0);
  });

  it('includes standardized window and detail metadata only when supplied', () => {
    const built = buildSocialPostMetric({
      post: post(),
      capturedAt: new Date('2026-08-15T00:00:00.000Z'),
      counts: { ...NO_COUNTS, views: 3 },
      measurementWindow: '24h',
      details: { fiveSecondRetentionRate: 0.5 },
    });
    expect(built).toMatchObject({
      measurementWindow: '24h',
      details: { fiveSecondRetentionRate: 0.5 },
    });
  });

  it('fails loudly on an unreadable published_at', () => {
    expect(() =>
      buildSocialPostMetric({
        post: post({ published_at: 'not-a-timestamp' }),
        capturedAt: new Date('2026-08-15T00:00:00.000Z'),
        counts: { ...NO_COUNTS, views: 1 },
      }),
    ).toThrow(/unreadable published_at/);
  });
});

describe('formatMetricsSummary', () => {
  it('reports only the metrics that were recorded', () => {
    const metric: NewSocialPostMetric = {
      socialPostId: POST_ID,
      capturedAt: '2026-08-15T02:30:00.000Z',
      ageHours: 26.5,
      ...NO_COUNTS,
      views: 900,
      profileVisits: 12,
    };

    const summary = formatMetricsSummary(post(), metric);

    expect(summary).toContain('X metrics at 26.5h after publish');
    expect(summary).toContain(POST_ID);
    expect(summary).toContain('views 900');
    expect(summary).toContain('profile visits 12');
    expect(summary).not.toContain('likes');
  });
});

describe('runSocialMetricsCli', () => {
  it('uses the automatic collector default dependencies without touching external services when there are no posts', async () => {
    dbMocks.listRecentSocialPosts.mockResolvedValue([]);
    const log = vi.fn();

    await runAutomaticSocialMetricsCollector({
      now: () => new Date('2026-08-16T00:00:00.000Z'),
      log,
      insertMetric: vi.fn(),
    });

    expect(dbMocks.listRecentSocialPosts).toHaveBeenCalledWith(
      '2026-08-09T00:00:00.000Z',
    );
    expect(log).toHaveBeenCalledWith(
      'No social posts published in the last 7 days.',
    );
  });

  it('uses the production dependencies and default clock/logger when none are injected', async () => {
    dbMocks.listSocialPostsByEpisode.mockResolvedValue([post()]);
    dbMocks.insertSocialPostMetric.mockResolvedValue({ id: 'metric-default' });
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      await runSocialMetricsCli([
        EPISODE_ID,
        '--platform',
        'x',
        '--views',
        '1',
      ]);
      expect(dbMocks.listSocialPostsByEpisode).toHaveBeenCalledWith(
        EPISODE_ID,
        'x',
      );
      expect(dbMocks.insertSocialPostMetric).toHaveBeenCalledOnce();
      expect(log).toHaveBeenCalledWith(
        expect.stringContaining('Recorded X metrics'),
      );
    } finally {
      log.mockRestore();
    }
  });

  function dependencies(overrides?: {
    posts?: SocialPostRow[];
    lookup?: SocialPostRow | null;
  }) {
    return {
      listPosts: vi.fn().mockResolvedValue(overrides?.posts ?? [post()]),
      getPost: vi.fn().mockResolvedValue(overrides?.lookup ?? null),
      insertMetric: vi.fn().mockResolvedValue({ id: 'metric-1' }),
      now: () => new Date('2026-08-15T02:30:00.000Z'),
      log: vi.fn(),
    };
  }

  it('records a snapshot against the episode post for that platform', async () => {
    const deps = dependencies();

    await runSocialMetricsCli(
      [EPISODE_ID, '--platform', 'x', '--views', '900', '--likes', '18'],
      deps,
    );

    expect(deps.listPosts).toHaveBeenCalledWith(EPISODE_ID, 'x');
    expect(deps.getPost).not.toHaveBeenCalled();
    expect(deps.insertMetric).toHaveBeenCalledWith({
      socialPostId: POST_ID,
      capturedAt: '2026-08-15T02:30:00.000Z',
      ageHours: 26.5,
      ...NO_COUNTS,
      views: 900,
      likes: 18,
    });
    expect(deps.log).toHaveBeenCalledWith(expect.stringContaining('views 900'));
  });

  it('looks the post up directly when --post-id is given', async () => {
    const deps = dependencies({ lookup: post() });

    await runSocialMetricsCli(
      [EPISODE_ID, '--platform', 'x', '--post-id', POST_ID, '--views', '5'],
      deps,
    );

    expect(deps.getPost).toHaveBeenCalledWith(POST_ID);
    expect(deps.listPosts).not.toHaveBeenCalled();
    expect(deps.insertMetric).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['a missing post', { lookup: null }, /No social post found with id/],
    [
      'a post from another episode',
      { lookup: post({ episode_id: OTHER_EPISODE_ID }) },
      /belongs to episode/,
    ],
    [
      'a post from another platform',
      { lookup: post({ platform: 'threads' as const }) },
      /is a Threads post, not X/,
    ],
  ])('refuses to record against %s', async (_name, overrides, expected) => {
    const deps = dependencies(overrides);

    await expect(
      runSocialMetricsCli(
        [EPISODE_ID, '--platform', 'x', '--post-id', POST_ID, '--views', '5'],
        deps,
      ),
    ).rejects.toThrow(expected);
    expect(deps.insertMetric).not.toHaveBeenCalled();
  });

  it('does not swallow an insert failure', async () => {
    const deps = dependencies();
    deps.insertMetric.mockRejectedValue(new Error('duplicate key'));

    await expect(
      runSocialMetricsCli(
        [EPISODE_ID, '--platform', 'x', '--views', '5'],
        deps,
      ),
    ).rejects.toThrow('duplicate key');
    expect(deps.log).not.toHaveBeenCalled();
  });

  it('collects recent posts automatically when no arguments are given', async () => {
    const recent = post({ published_at: '2026-08-14T00:00:00.000Z' });
    const listRecentPosts = vi.fn().mockResolvedValue([recent]);
    const insertMetric = vi.fn().mockResolvedValue({ id: 'metric-auto' });
    const log = vi.fn();
    const collectX = vi.fn().mockResolvedValue({
      ...NO_COUNTS,
      views: 321,
      likes: 9,
    });

    await runSocialMetricsCli([], {
      listRecentPosts,
      insertMetric,
      now: () => new Date('2026-08-16T00:00:00.000Z'),
      log,
      collectors: {
        x: collectX,
        threads: vi.fn(),
        rednote: vi.fn(),
        youtube: vi.fn(),
      },
    });

    expect(listRecentPosts).toHaveBeenCalledWith('2026-08-09T00:00:00.000Z');
    expect(collectX).toHaveBeenCalledWith(recent);
    expect(insertMetric).toHaveBeenCalledWith(
      expect.objectContaining({
        socialPostId: POST_ID,
        capturedAt: '2026-08-16T00:00:00.000Z',
        views: 321,
        likes: 9,
      }),
    );
    expect(log).toHaveBeenCalledWith(
      'Social metrics complete: 1 snapshot recorded.',
    );
  });

  it('handles no posts, reconciliation, empty snapshots, plural success, and non-Error failures', async () => {
    const log = vi.fn();
    await runAutomaticSocialMetricsCollector({
      now: () => new Date('2026-08-16T00:00:00.000Z'),
      log,
      listRecentPosts: vi.fn().mockResolvedValue([]),
      insertMetric: vi.fn(),
      collectors: {
        x: vi.fn(),
        threads: vi.fn(),
        rednote: vi.fn(),
        youtube: vi.fn(),
      },
    });
    expect(log).toHaveBeenCalledWith(
      'No social posts published in the last 7 days.',
    );

    log.mockClear();
    const first = post({ id: POST_ID });
    const second = post({
      id: '00000000-0000-4000-8000-000000000002',
      platform_post_id: '2',
    });
    const empty = post({
      id: '00000000-0000-4000-8000-000000000003',
      platform_post_id: '3',
    });
    const emptyDetails = post({
      id: '00000000-0000-4000-8000-000000000004',
      platform_post_id: '4',
    });
    const failed = post({
      id: '00000000-0000-4000-8000-000000000005',
      platform: 'threads',
      platform_post_id: '5',
    });
    const reconcileRecentPosts = vi
      .fn()
      .mockResolvedValue([first, second, empty, emptyDetails, failed]);
    const insertMetric = vi.fn().mockResolvedValue({});
    const collectX = vi
      .fn()
      .mockResolvedValueOnce({ ...NO_COUNTS, views: 10 })
      .mockResolvedValueOnce({ ...NO_COUNTS, views: 20 })
      .mockResolvedValueOnce({ ...NO_COUNTS })
      .mockResolvedValueOnce({ ...NO_COUNTS, details: {} });

    await runAutomaticSocialMetricsCollector({
      now: () => new Date('2026-08-16T00:00:00.000Z'),
      log,
      listRecentPosts: vi.fn().mockResolvedValue([first]),
      reconcileRecentPosts,
      insertMetric,
      collectors: {
        x: collectX,
        threads: vi.fn().mockRejectedValue('plain failure'),
        rednote: vi.fn(),
        youtube: vi.fn(),
      },
    });

    expect(reconcileRecentPosts).toHaveBeenCalledOnce();
    expect(insertMetric).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('no metrics available yet'),
    );
    expect(log).toHaveBeenCalledWith(expect.stringContaining('plain failure'));
    expect(log).toHaveBeenCalledWith(
      'Social metrics complete: 2 snapshots recorded, 1 failed.',
    );
  });

  it('continues collecting other posts when one platform fails', async () => {
    const xPost = post();
    const threadsPost = post({
      id: '00000000-0000-4000-8000-000000000002',
      platform: 'threads',
      platform_post_id: 'threads-1',
    });
    const insertMetric = vi.fn().mockResolvedValue({ id: 'metric-auto' });
    const log = vi.fn();

    await runSocialMetricsCli([], {
      listRecentPosts: vi.fn().mockResolvedValue([threadsPost, xPost]),
      insertMetric,
      now: () => new Date('2026-08-16T00:00:00.000Z'),
      log,
      collectors: {
        x: vi.fn().mockResolvedValue({ ...NO_COUNTS, views: 10 }),
        threads: vi.fn().mockRejectedValue(new Error('permission missing')),
        rednote: vi.fn(),
        youtube: vi.fn(),
      },
    });

    expect(insertMetric).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('permission missing'),
    );
    expect(log).toHaveBeenCalledWith(
      'Social metrics complete: 1 snapshot recorded, 1 failed.',
    );
  });
});
