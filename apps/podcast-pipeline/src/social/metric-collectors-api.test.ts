import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SocialPostRow } from '../types.js';

const authMocks = vi.hoisted(() => ({
  threads: vi.fn(),
  youtube: vi.fn(),
}));

vi.mock('./threads-auth.js', () => ({
  THREADS_INSIGHTS_SCOPE: 'threads_manage_insights',
  assertThreadsSessionReady: authMocks.threads,
}));

vi.mock('./youtube-auth.js', () => ({
  YOUTUBE_ANALYTICS_SCOPE:
    'https://www.googleapis.com/auth/yt-analytics.readonly',
  assertYouTubeSessionReady: authMocks.youtube,
}));

import {
  collectThreadsMetrics,
  collectYouTubeMetrics,
  createMetricCollectors,
} from './metric-collectors.js';

function post(
  platform: SocialPostRow['platform'],
  platformPostId: string | null = 'post-1',
  overrides: Partial<SocialPostRow> = {},
): SocialPostRow {
  return {
    id: `${platform}-row-1`,
    episode_id: 'episode-1',
    platform,
    post_url: `https://example.test/${platform}/post-1`,
    platform_post_id: platformPostId,
    published_at: '2026-08-16T02:00:00.000Z',
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
    llm_model: 'test/model',
    created_at: '2026-08-16T02:00:00.000Z',
    updated_at: '2026-08-16T02:00:00.000Z',
    ...overrides,
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  authMocks.threads.mockReset();
  authMocks.youtube.mockReset();
  authMocks.threads.mockResolvedValue({
    session: { accessToken: 'threads-token' },
  });
  authMocks.youtube.mockResolvedValue({ accessToken: 'youtube-token' });
});

describe('Threads metric collection', () => {
  it('maps insight values and combines every known share counter', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      json({
        data: [
          { name: 'views', values: [{ value: 1234 }] },
          { name: 'likes', value: 25 },
          { name: 'replies', values: [], value: 7 },
          { name: 'shares', value: 3 },
          { name: 'reposts', value: 4 },
          { name: 'quotes', value: 5 },
          { bad: true },
          { name: 'ignored', value: 'not-a-number' },
        ],
      }),
    );

    await expect(
      collectThreadsMetrics(post('threads', 'thread/1'), fetchImpl),
    ).resolves.toMatchObject({
      views: 1234,
      likes: 25,
      comments: 7,
      shares: 12,
    });

    const [requestUrl] = fetchImpl.mock.calls[0]!;
    const url = new URL(String(requestUrl));
    expect(url.pathname).toBe('/thread%2F1/insights');
    expect(url.searchParams.get('access_token')).toBe('threads-token');
    expect(authMocks.threads).toHaveBeenCalledWith(
      expect.objectContaining({
        fetchImpl,
        additionalScopes: ['threads_manage_insights'],
      }),
    );
  });

  it('returns nulls for metrics the API omits', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(json({ data: [{ name: 'views', value: 9 }] }));

    await expect(
      collectThreadsMetrics(post('threads'), fetchImpl),
    ).resolves.toMatchObject({
      views: 9,
      likes: null,
      comments: null,
      shares: null,
    });
  });

  it('rejects missing ids, HTTP errors, and malformed insight payloads', async () => {
    await expect(
      collectThreadsMetrics(post('threads', '  '), vi.fn()),
    ).rejects.toThrow('has no platform_post_id');

    await expect(
      collectThreadsMetrics(
        post('threads'),
        vi.fn<typeof fetch>().mockResolvedValue(json({}, 403)),
      ),
    ).rejects.toThrow('Threads insights failed with HTTP 403');

    await expect(
      collectThreadsMetrics(
        post('threads'),
        vi.fn<typeof fetch>().mockResolvedValue(json({ data: 'wrong' })),
      ),
    ).rejects.toThrow('invalid response');
  });
});

describe('YouTube metric collection', () => {
  it('combines public counters with analytics, demographics, and retention', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(String(input));
      if (url.hostname === 'www.googleapis.com') {
        return json({
          items: [
            {
              id: 'video-1',
              statistics: {
                viewCount: '1000',
                likeCount: '50',
                commentCount: '8',
              },
            },
          ],
        });
      }
      const metrics = url.searchParams.get('metrics');
      if (metrics?.startsWith('shares,')) {
        return json({ rows: [[6, 4, 800, 42, 63]] });
      }
      if (metrics === 'viewerPercentage') {
        return json({
          rows: [
            ['age25-34', 'male', 60],
            ['age25-34', 'female', 40],
          ],
        });
      }
      if (metrics === 'audienceWatchRatio') {
        return json({
          rows: [
            [0, 1],
            [0.04, 0.81],
            [0.1, 0.6],
          ],
        });
      }
      throw new Error(`unexpected URL ${url.href}`);
    });

    await expect(
      collectYouTubeMetrics(post('youtube', 'video-1'), fetchImpl),
    ).resolves.toEqual(
      expect.objectContaining({
        views: 1000,
        likes: 50,
        comments: 8,
        shares: 6,
        followersGained: 4,
        details: {
          engagedViews: 800,
          averageViewDurationSec: 42,
          averageViewPercentage: 0.63,
          audienceDemographics: {
            age: { 'age25-34': 1 },
            gender: { male: 0.6, female: 0.4 },
          },
          fiveSecondRetentionRate: 0.81,
        },
      }),
    );
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(authMocks.youtube).toHaveBeenCalledWith(
      expect.objectContaining({
        fetchImpl,
        additionalScopes: [
          'https://www.googleapis.com/auth/yt-analytics.readonly',
        ],
      }),
    );
  });

  it('keeps public counters when analytics reports are unavailable', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        json({
          items: [
            { id: 'video-1', statistics: { viewCount: '12', likeCount: '2' } },
          ],
        }),
      )
      .mockResolvedValueOnce(json({}, 503));

    await expect(
      collectYouTubeMetrics(post('youtube', 'video-1'), fetchImpl),
    ).resolves.toMatchObject({
      views: 12,
      likes: 2,
      comments: null,
      shares: null,
      followersGained: null,
      details: {},
    });
  });

  it('handles empty analytics rows without inventing detail values', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        json({
          items: [{ id: 'video-1', statistics: {} }],
        }),
      )
      .mockResolvedValueOnce(json({ rows: [] }))
      .mockResolvedValueOnce(json({ rows: [] }))
      .mockResolvedValueOnce(json({ rows: [] }));

    await expect(
      collectYouTubeMetrics(
        post('youtube', 'video-1', { video_duration_sec: null }),
        fetchImpl,
      ),
    ).resolves.toMatchObject({
      views: null,
      likes: null,
      comments: null,
      shares: null,
      followersGained: null,
      details: {},
    });
  });

  it('ignores unavailable demographics and retention independently', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        json({
          items: [
            {
              id: 'video-1',
              statistics: {
                viewCount: '12',
                likeCount: '2',
                commentCount: '1',
              },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(json({ rows: [[null, null, null, null, null]] }))
      .mockResolvedValueOnce(json({}, 403))
      .mockResolvedValueOnce(json({ rows: [] }));

    await expect(
      collectYouTubeMetrics(post('youtube', 'video-1'), fetchImpl),
    ).resolves.toMatchObject({
      shares: null,
      followersGained: null,
      details: {},
    });
  });

  it('rejects public-statistics HTTP errors, malformed payloads, and missing videos', async () => {
    await expect(
      collectYouTubeMetrics(post('youtube', null), vi.fn()),
    ).rejects.toThrow('has no platform_post_id');

    await expect(
      collectYouTubeMetrics(
        post('youtube', 'video-1'),
        vi.fn<typeof fetch>().mockResolvedValue(json({}, 500)),
      ),
    ).rejects.toThrow('YouTube statistics failed with HTTP 500');

    await expect(
      collectYouTubeMetrics(
        post('youtube', 'video-1'),
        vi.fn<typeof fetch>().mockResolvedValue(json({ items: 'bad' })),
      ),
    ).rejects.toThrow('invalid response');

    await expect(
      collectYouTubeMetrics(
        post('youtube', 'video-1'),
        vi
          .fn<typeof fetch>()
          .mockResolvedValue(json({ items: [{ id: 'other' }] })),
      ),
    ).rejects.toThrow('was not returned by videos.list');
  });

  it('constructs collectors with default dependencies without invoking them', () => {
    expect(Object.keys(createMetricCollectors()).sort()).toEqual([
      'rednote',
      'threads',
      'x',
      'youtube',
    ]);
  });

  it('routes injected fetch through the collector registry', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(json({ data: [{ name: 'views', value: 3 }] }));
    const collectors = createMetricCollectors({ fetchImpl });

    await expect(collectors.threads(post('threads'))).resolves.toMatchObject({
      views: 3,
    });
    expect(Object.keys(collectors).sort()).toEqual([
      'rednote',
      'threads',
      'x',
      'youtube',
    ]);
  });
});
