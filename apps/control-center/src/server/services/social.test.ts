import { describe, expect, it } from 'vitest';

import { buildEpisodes } from './social.js';

type Post = Parameters<typeof buildEpisodes>[0][number];
type Metric = Parameters<typeof buildEpisodes>[1][number];

function post(id: string, overrides: Partial<Post> = {}): Post {
  return {
    id,
    episode_id: `episode-${id}`,
    platform: 'x',
    language_code: 'en',
    post_url: null,
    published_at: '2026-08-20T00:30:00.000Z',
    published_title: `Title ${id}`,
    published_body: `Body ${id}`,
    review_status: null,
    ...overrides,
  };
}

function metric(
  socialPostId: string,
  views: number | null,
  overrides: Partial<Metric> = {},
): Metric {
  return {
    social_post_id: socialPostId,
    captured_at: '2026-08-21T00:30:00.000Z',
    age_hours: 24,
    measurement_window: '24h',
    views,
    impressions: null,
    likes: null,
    comments: null,
    shares: null,
    saves: null,
    followers_gained: null,
    details: null,
    ...overrides,
  };
}

describe('buildEpisodes', () => {
  it('does not substitute a different window for unavailable 24h telemetry', () => {
    const published = post('window', { post_url: 'https://example.com/post' });
    const result = buildEpisodes(
      [published],
      [
        metric('window', 10, { measurement_window: '6h', age_hours: 6 }),
        metric('window', null, { collection_status: 'unavailable' }),
        metric('window', 90, { measurement_window: '72h', age_hours: 72 }),
      ],
      '24h',
      new Date('2026-08-30T12:00:00.000Z'),
    );

    expect(result[0]?.platforms[0]).toMatchObject({
      views: null,
      postUrl: 'https://example.com/post',
    });
    expect(
      buildEpisodes(
        [published],
        [
          metric('window', 24),
          metric('window', 90, { measurement_window: '72h', age_hours: 23 }),
        ],
        '24h',
        new Date('2026-08-30T12:00:00.000Z'),
      )[0]?.platforms[0]?.views,
    ).toBe(24);
  });

  it('keeps published platform links visible when metrics are missing', () => {
    const youtube = post('youtube', {
      episode_id: 'episode-shared',
      platform: 'youtube',
      language_code: 'en',
      post_url: 'https://youtube.com/watch?v=video-1',
      published_title: 'English title',
    });

    expect(
      buildEpisodes(
        [youtube],
        [],
        'latest',
        new Date('2026-08-30T12:00:00.000Z'),
      ),
    ).toEqual([
      expect.objectContaining({
        episodeId: 'episode-shared',
        title: 'English title',
        platforms: [
          expect.objectContaining({
            platform: 'youtube',
            postUrl: 'https://youtube.com/watch?v=video-1',
            views: null,
          }),
        ],
      }),
    ]);
  });

  it('prefers the Traditional Chinese published title for a shared episode', () => {
    const english = post('english', {
      episode_id: 'episode-shared',
      platform: 'youtube',
      language_code: 'en',
      published_title: 'English title',
      published_at: '2026-08-20T00:31:00.000Z',
    });
    const chinese = post('chinese', {
      episode_id: 'episode-shared',
      platform: 'rednote',
      language_code: 'zh-Hant',
      published_title: '繁體中文標題',
      published_at: '2026-08-20T00:30:00.000Z',
    });

    expect(
      buildEpisodes(
        [english, chinese],
        [],
        'latest',
        new Date('2026-08-30T12:00:00.000Z'),
      )[0]?.title,
    ).toBe('繁體中文標題');
  });

  it('treats unavailable collection as a telemetry gap instead of zero views', () => {
    const rednote = post('rednote', {
      episode_id: 'episode-shared',
      platform: 'rednote',
      language_code: 'zh-Hant',
      post_url: 'https://www.xiaohongshu.com/explore/note-1',
    });

    const episode = buildEpisodes(
      [rednote],
      [metric('rednote', null, { collection_status: 'unavailable' })],
      '24h',
      new Date('2026-08-30T12:00:00.000Z'),
    )[0];

    expect(episode?.platforms[0]).toMatchObject({
      postUrl: 'https://www.xiaohongshu.com/explore/note-1',
      views: null,
    });
  });
});

it('never includes cross-platform raw totals in episode summaries', () => {
  const [episode] = buildEpisodes(
    [post('r'), post('y', { platform: 'youtube', episode_id: 'episode-r' })],
    [metric('r', 100), metric('y', 1_000_000)],
    '24h',
    new Date('2026-08-30T12:00:00.000Z'),
  );
  expect(episode).not.toHaveProperty('totalViews');
  expect(episode).not.toHaveProperty('totalImpressions');
  expect(episode?.platforms.map((row) => row.views)).toEqual([100, 1_000_000]);
});

it('uses latest lane publication plus one-hour grace for comparable windows', () => {
  const posts = [
    post('early', { episode_id: 'same' }),
    post('late', { episode_id: 'same', published_at: '2026-08-20T01:30:00Z' }),
  ];
  expect(
    buildEpisodes(posts, [], '24h', new Date('2026-08-21T02:29:59Z'))[0],
  ).toMatchObject({
    publishedAt: '2026-08-20T01:30:00Z',
    windowReached: false,
  });
  expect(
    buildEpisodes(posts, [], '24h', new Date('2026-08-21T02:30:00Z'))[0]
      ?.windowReached,
  ).toBe(true);
  expect(
    buildEpisodes(posts, [], 'latest', new Date('2026-08-20T01:30:00Z'))[0]
      ?.windowReached,
  ).toBe(true);
});
it.each(['1h', '6h', '24h', '72h', '7d', 'unknown'])(
  'narrows measurement window %s while retaining age',
  (window) => {
    const result = buildEpisodes(
      [post('p')],
      [metric('p', 5, { measurement_window: window, age_hours: 31 })],
      'latest',
      new Date('2026-08-30T12:00:00Z'),
    );
    expect(result[0]?.platforms[0]).toMatchObject({
      measurementWindow: window === 'unknown' ? null : window,
      ageHours: 31,
    });
  },
);

describe('save telemetry', () => {
  it.each([
    [null, 100, null, null],
    [0, 100, null, 0],
    [5, 100, null, 0.05],
    [5, 100, 200, 0.025],
    [5, 100, 0, null],
    [5, 0, null, null],
    [5, null, null, null],
  ])(
    'preserves saves %s with views %s and impressions %s',
    (saves, views, impressions, saveRate) => {
      const result = buildEpisodes(
        [post('save')],
        [metric('save', views, { saves, impressions })],
        '24h',
        new Date('2026-08-30'),
      );
      expect(result[0]?.platforms[0]).toMatchObject({
        saves,
        saveRate,
        savesSupport: 'native',
        playlistAdds: null,
      });
    },
  );
  it('keeps playlist additions separate from saves and declares platform support', () => {
    const result = buildEpisodes(
      [
        post('youtube', { platform: 'youtube' }),
        post('threads', { platform: 'threads' }),
        post('rednote', { platform: 'rednote' }),
      ],
      [metric('youtube', 100, { details: { youtubePlaylistAdds: 0 } })],
      '24h',
      new Date('2026-08-30'),
    );
    expect(result[0]?.platforms[0]).toMatchObject({
      saves: null,
      saveRate: null,
      playlistAdds: 0,
      savesSupport: 'playlist_add_proxy',
    });
    expect(result[1]?.platforms[0]?.savesSupport).toBe('unsupported');
    expect(result[2]?.platforms[0]?.savesSupport).toBe('native');
  });
  it('declares unsupported saves for a platform outside the contract, measured or not', () => {
    const result = buildEpisodes(
      [
        post('measured', { platform: 'tiktok' }),
        post('unmeasured', { platform: 'tiktok' }),
      ],
      [metric('measured', 100, { saves: 5 })],
      '24h',
      new Date('2026-08-30'),
    );
    expect(result[0]?.platforms[0]?.savesSupport).toBe('unsupported');
    expect(result[1]?.platforms[0]?.savesSupport).toBe('unsupported');
  });
});
