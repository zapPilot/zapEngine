import { describe, expect, it } from 'vitest';

import {
  assertPublishableDistributionSnapshot,
  buildDistributionSnapshot,
  type DistributionEpisodeRow,
  type DistributionLocalizationRow,
  type DistributionMetricRow,
  type DistributionPostRow,
  type DistributionSnapshotSource,
  type DistributionVideoRow,
} from './distribution-snapshot.js';

const LANGUAGES = ['zh-Hant', 'ja', 'en'] as const;

function episode(
  id: string,
  createdAt: string,
  title = `Article ${id}`,
): DistributionEpisodeRow {
  return {
    id,
    source_title: title,
    source_url: `https://example.test/${id}`,
    created_at: createdAt,
  };
}

function localizations(episodeId: string): DistributionLocalizationRow[] {
  return LANGUAGES.map((language) => ({
    episode_id: episodeId,
    language_code: language,
    hls_url: `https://cdn.test/${episodeId}/${language}.m3u8`,
    classroom_hls_url:
      language === 'zh-Hant'
        ? `https://cdn.test/${episodeId}/${language}-classroom.m3u8`
        : null,
  }));
}

function videos(
  episodeId: string,
  status = 'completed',
): DistributionVideoRow[] {
  return LANGUAGES.map(() => ({ episode_id: episodeId, status }));
}

function post(
  overrides: Partial<DistributionPostRow> & { id: string; episode_id: string },
): DistributionPostRow {
  return {
    platform: 'x',
    language_code: 'zh-Hant',
    post_url: `https://x.test/${overrides.id}`,
    published_at: '2026-08-20T00:00:00.000Z',
    ...overrides,
  };
}

function metric(
  overrides: Partial<DistributionMetricRow> & { social_post_id: string },
): DistributionMetricRow {
  return {
    captured_at: '2026-08-21T00:00:00.000Z',
    collection_status: 'collected',
    views: 100,
    impressions: null,
    likes: 1,
    comments: 0,
    shares: 0,
    ...overrides,
  };
}

function source(
  overrides: Partial<DistributionSnapshotSource> = {},
): DistributionSnapshotSource {
  return {
    episodes: [],
    localizations: [],
    videos: [],
    posts: [],
    metrics: [],
    publishJobs: [],
    strategyVersions: [],
    ...overrides,
  };
}

/** One article that went the whole way: 3 languages, 3 videos, 4 platforms. */
function completeChain(): DistributionSnapshotSource {
  return source({
    episodes: [episode('ep1', '2026-08-19T00:00:00.000Z')],
    localizations: localizations('ep1'),
    videos: videos('ep1'),
    posts: [
      post({ id: 'p1', episode_id: 'ep1', platform: 'x' }),
      post({ id: 'p2', episode_id: 'ep1', platform: 'threads' }),
      post({ id: 'p3', episode_id: 'ep1', platform: 'rednote' }),
      post({
        id: 'p4',
        episode_id: 'ep1',
        platform: 'youtube',
        language_code: 'ja',
      }),
    ],
    metrics: [
      metric({ social_post_id: 'p1', views: 500 }),
      metric({ social_post_id: 'p2', views: 40 }),
      metric({ social_post_id: 'p3', views: 30 }),
      metric({ social_post_id: 'p4', views: 5 }),
    ],
  });
}

describe('buildDistributionSnapshot', () => {
  it('counts the funnel from article through platform reach', () => {
    const snapshot = buildDistributionSnapshot(completeChain());

    expect(snapshot.funnel).toEqual({
      articles: 1,
      localizations: 3,
      videos: 3,
      posts: 4,
      platforms: 4,
      reach: 575,
    });
  });

  it('counts only completed renders as videos', () => {
    const snapshot = buildDistributionSnapshot(
      source({
        episodes: [episode('ep1', '2026-08-19T00:00:00.000Z')],
        videos: [
          { episode_id: 'ep1', status: 'completed' },
          { episode_id: 'ep1', status: 'failed' },
          { episode_id: 'ep1', status: 'pending' },
        ],
      }),
    );

    expect(snapshot.funnel.videos).toBe(1);
  });

  it('takes the newest collected snapshot as a post reach', () => {
    const snapshot = buildDistributionSnapshot(
      source({
        posts: [post({ id: 'p1', episode_id: 'ep1' })],
        metrics: [
          metric({
            social_post_id: 'p1',
            captured_at: '2026-08-21T00:00:00.000Z',
            views: 10,
          }),
          metric({
            social_post_id: 'p1',
            captured_at: '2026-08-23T00:00:00.000Z',
            views: 90,
          }),
          metric({
            social_post_id: 'p1',
            captured_at: '2026-08-22T00:00:00.000Z',
            views: 50,
          }),
        ],
      }),
    );

    expect(snapshot.funnel.reach).toBe(90);
  });

  it('ignores a collection that failed instead of reading it as zero reach', () => {
    const snapshot = buildDistributionSnapshot(
      source({
        posts: [post({ id: 'p1', episode_id: 'ep1' })],
        metrics: [
          metric({
            social_post_id: 'p1',
            captured_at: '2026-08-21T00:00:00.000Z',
            views: 120,
          }),
          metric({
            social_post_id: 'p1',
            captured_at: '2026-08-24T00:00:00.000Z',
            collection_status: 'unavailable',
            views: null,
          }),
        ],
      }),
    );

    expect(snapshot.funnel.reach).toBe(120);
    expect(snapshot.channels[0]?.postsWithMetrics).toBe(1);
  });

  it('falls back to impressions when a platform reports no views', () => {
    const snapshot = buildDistributionSnapshot(
      source({
        posts: [post({ id: 'p1', episode_id: 'ep1', platform: 'threads' })],
        metrics: [
          metric({ social_post_id: 'p1', views: null, impressions: 77 }),
        ],
      }),
    );

    expect(snapshot.funnel.reach).toBe(77);
  });

  it('counts a post with no snapshot yet without inventing reach for it', () => {
    const snapshot = buildDistributionSnapshot(
      source({
        posts: [
          post({ id: 'p1', episode_id: 'ep1' }),
          post({ id: 'p2', episode_id: 'ep1' }),
        ],
        metrics: [metric({ social_post_id: 'p1', views: 20 })],
      }),
    );

    expect(snapshot.channels[0]).toMatchObject({
      posts: 2,
      postsWithMetrics: 1,
      reach: 20,
    });
  });

  it('splits channels by platform and language and sorts them by reach', () => {
    const snapshot = buildDistributionSnapshot(
      source({
        posts: [
          post({ id: 'p1', episode_id: 'ep1', platform: 'x' }),
          post({
            id: 'p2',
            episode_id: 'ep1',
            platform: 'x',
            language_code: 'ja',
          }),
          post({
            id: 'p3',
            episode_id: 'ep1',
            platform: 'x',
            language_code: 'ja',
          }),
        ],
        metrics: [
          metric({ social_post_id: 'p1', views: 5 }),
          metric({ social_post_id: 'p2', views: 30 }),
          metric({ social_post_id: 'p3', views: 30 }),
        ],
      }),
    );

    expect(
      snapshot.channels.map((channel) => [
        channel.platform,
        channel.language,
        channel.posts,
        channel.reach,
      ]),
    ).toEqual([
      ['x', 'ja', 2, 60],
      ['x', 'zh-Hant', 1, 5],
    ]);
  });

  it('reports audio coverage per language', () => {
    const snapshot = buildDistributionSnapshot(
      source({
        localizations: [
          ...localizations('ep1'),
          {
            episode_id: 'ep2',
            language_code: 'ja',
            hls_url: null,
            classroom_hls_url: null,
          },
        ],
      }),
    );

    expect(snapshot.languages).toEqual([
      {
        code: 'zh-Hant',
        localizations: 1,
        mainAudio: 1,
        classroomAudio: 1,
        posts: 0,
        reach: 0,
      },
      {
        code: 'ja',
        localizations: 2,
        mainAudio: 1,
        classroomAudio: 0,
        posts: 0,
        reach: 0,
      },
      {
        code: 'en',
        localizations: 1,
        mainAudio: 1,
        classroomAudio: 0,
        posts: 0,
        reach: 0,
      },
    ]);
  });

  it('summarises publish reliability', () => {
    const snapshot = buildDistributionSnapshot(
      source({
        publishJobs: [
          { status: 'completed' },
          { status: 'completed' },
          { status: 'queued' },
          { status: 'failed' },
        ],
        metrics: [
          metric({ social_post_id: 'p1' }),
          metric({ social_post_id: 'p2', collection_status: 'unavailable' }),
        ],
        strategyVersions: [
          { platform: 'x', language_code: 'zh-Hant' },
          { platform: 'threads', language_code: 'ja' },
        ],
      }),
    );

    expect(snapshot.reliability).toEqual({
      publishJobs: 4,
      publishJobsCompleted: 2,
      publishJobsFailed: 1,
      metricSnapshots: 2,
      metricSnapshotsCollected: 1,
      strategyVersions: 2,
    });
  });

  it('keys asOf to the newest row rather than the wall clock', () => {
    const snapshot = buildDistributionSnapshot(
      source({
        episodes: [episode('ep1', '2026-08-19T00:00:00.000Z')],
        posts: [
          post({
            id: 'p1',
            episode_id: 'ep1',
            published_at: '2026-08-26T09:30:00.000Z',
          }),
        ],
      }),
    );

    expect(snapshot.asOf).toBe('2026-08-26T09:30:00.000Z');
    expect(snapshot.coverage).toEqual({
      firstEpisodeAt: '2026-08-19T00:00:00.000Z',
      lastEpisodeAt: '2026-08-19T00:00:00.000Z',
      firstPostAt: '2026-08-26T09:30:00.000Z',
      lastPostAt: '2026-08-26T09:30:00.000Z',
    });
  });

  it('ignores an unpublished post when bounding the coverage window', () => {
    const snapshot = buildDistributionSnapshot(
      source({
        episodes: [episode('ep1', '2026-08-19T00:00:00.000Z')],
        posts: [
          post({
            id: 'p1',
            episode_id: 'ep1',
            published_at: '2026-08-20T00:00:00.000Z',
          }),
          post({ id: 'p2', episode_id: 'ep1', published_at: null }),
        ],
      }),
    );

    expect(snapshot.coverage.lastPostAt).toBe('2026-08-20T00:00:00.000Z');
    expect(snapshot.channels[0]?.firstPostAt).toBe('2026-08-20T00:00:00.000Z');
  });

  it('returns an empty snapshot for an empty corpus', () => {
    const snapshot = buildDistributionSnapshot(source());

    expect(snapshot.asOf).toBe('');
    expect(snapshot.funnel).toEqual({
      articles: 0,
      localizations: 0,
      videos: 0,
      posts: 0,
      platforms: 0,
      reach: 0,
    });
    expect(snapshot.example).toBeNull();
  });
});

describe('buildDistributionSnapshot example selection', () => {
  it('picks the complete chain with the most reach', () => {
    const base = completeChain();
    const snapshot = buildDistributionSnapshot({
      ...base,
      episodes: [
        ...base.episodes,
        episode('ep2', '2026-08-25T00:00:00.000Z', 'Louder article'),
      ],
      localizations: [...base.localizations, ...localizations('ep2')],
      videos: [...base.videos, ...videos('ep2')],
      posts: [
        ...base.posts,
        post({ id: 'q1', episode_id: 'ep2', platform: 'x' }),
        post({ id: 'q2', episode_id: 'ep2', platform: 'threads' }),
        post({ id: 'q3', episode_id: 'ep2', platform: 'rednote' }),
      ],
      metrics: [
        ...base.metrics,
        metric({ social_post_id: 'q1', views: 9_000 }),
      ],
    });

    expect(snapshot.example?.title).toBe('Louder article');
    expect(snapshot.example).toMatchObject({
      sourceUrl: 'https://example.test/ep2',
      localizations: 3,
      videos: 3,
      posts: 3,
    });
  });

  it('lists the example channels in publish order', () => {
    const base = completeChain();
    const snapshot = buildDistributionSnapshot({
      ...base,
      posts: [
        post({
          id: 'p1',
          episode_id: 'ep1',
          platform: 'rednote',
          published_at: '2026-08-20T03:00:00.000Z',
        }),
        post({
          id: 'p2',
          episode_id: 'ep1',
          platform: 'x',
          published_at: '2026-08-20T01:00:00.000Z',
        }),
        post({
          id: 'p3',
          episode_id: 'ep1',
          platform: 'threads',
          published_at: '2026-08-20T02:00:00.000Z',
        }),
      ],
      metrics: [],
    });

    expect(
      snapshot.example?.channels.map((channel) => channel.platform),
    ).toEqual(['x', 'threads', 'rednote']);
  });

  it('skips an article that has not reached enough platforms', () => {
    const base = completeChain();
    const snapshot = buildDistributionSnapshot({
      ...base,
      posts: [
        post({ id: 'p1', episode_id: 'ep1', platform: 'x' }),
        post({ id: 'p2', episode_id: 'ep1', platform: 'threads' }),
      ],
    });

    expect(snapshot.example).toBeNull();
  });

  it('skips an article whose renders are not all finished', () => {
    const base = completeChain();
    const snapshot = buildDistributionSnapshot({
      ...base,
      videos: [
        { episode_id: 'ep1', status: 'completed' },
        { episode_id: 'ep1', status: 'completed' },
        { episode_id: 'ep1', status: 'pending' },
      ],
    });

    expect(snapshot.example).toBeNull();
  });

  it('breaks a reach tie on recency so the choice is reproducible', () => {
    const snapshot = buildDistributionSnapshot(
      source({
        episodes: [
          episode('ep1', '2026-08-19T00:00:00.000Z', 'Older'),
          episode('ep2', '2026-08-25T00:00:00.000Z', 'Newer'),
        ],
        localizations: [...localizations('ep1'), ...localizations('ep2')],
        videos: [...videos('ep1'), ...videos('ep2')],
        posts: [
          post({ id: 'p1', episode_id: 'ep1', platform: 'x' }),
          post({ id: 'p2', episode_id: 'ep1', platform: 'threads' }),
          post({ id: 'p3', episode_id: 'ep1', platform: 'rednote' }),
          post({ id: 'q1', episode_id: 'ep2', platform: 'x' }),
          post({ id: 'q2', episode_id: 'ep2', platform: 'threads' }),
          post({ id: 'q3', episode_id: 'ep2', platform: 'rednote' }),
        ],
      }),
    );

    expect(snapshot.example?.title).toBe('Newer');
  });
});

describe('assertPublishableDistributionSnapshot', () => {
  it('accepts a snapshot whose parts add up', () => {
    const snapshot = buildDistributionSnapshot(completeChain());

    expect(() => assertPublishableDistributionSnapshot(snapshot)).not.toThrow();
  });

  it('rejects an empty corpus', () => {
    const snapshot = buildDistributionSnapshot(source());

    expect(() => assertPublishableDistributionSnapshot(snapshot)).toThrow(
      /no articles; no localizations; no social posts; no platforms/,
    );
  });

  it('rejects a funnel that disagrees with its channel totals', () => {
    const snapshot = buildDistributionSnapshot(completeChain());
    snapshot.funnel.posts = 99;

    expect(() => assertPublishableDistributionSnapshot(snapshot)).toThrow(
      /channel posts \(4\) do not add up to funnel posts \(99\)/,
    );
  });

  it('rejects a funnel that disagrees with its channel reach', () => {
    const snapshot = buildDistributionSnapshot(completeChain());
    snapshot.funnel.reach = 1;

    expect(() => assertPublishableDistributionSnapshot(snapshot)).toThrow(
      /channel reach \(575\) does not add up to funnel reach \(1\)/,
    );
  });

  it('rejects a funnel that disagrees with its language totals', () => {
    const snapshot = buildDistributionSnapshot(completeChain());
    snapshot.funnel.localizations = 7;

    expect(() => assertPublishableDistributionSnapshot(snapshot)).toThrow(
      /per-language localizations \(3\) do not add up to funnel localizations \(7\)/,
    );
  });
});
