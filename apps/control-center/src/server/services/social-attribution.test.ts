import { describe, expect, it } from 'vitest';

import {
  attributeIntervalDelta,
  buildFollowerAttribution,
  computePostActivity,
  exactYoutubeFollowersByPost,
  pairSnapshotIntervals,
  type AttributionObservation,
  type SnapshotInterval,
} from './social-attribution.js';

const interval: SnapshotInterval = {
  platform: 'x',
  startAt: '2026-08-01T00:00:00.000Z',
  endAt: '2026-08-01T03:00:00.000Z',
  followersStart: 10,
  followersEnd: 14,
};

describe('social follower attribution', () => {
  it('pairs adjacent valid snapshots without overlapping follower deltas', () => {
    expect(
      pairSnapshotIntervals([
        snapshot('x', '2026-08-01T03:00:00.000Z', 14),
        snapshot('x', 'bad', 99),
        snapshot('x', '2026-08-01T00:00:00.000Z', 10),
        snapshot('x', '2026-08-01T06:00:00.000Z', 15),
      ]),
    ).toMatchObject([
      { followersStart: 10, followersEnd: 14 },
      { followersStart: 14, followersEnd: 15 },
    ]);
  });

  it('uses a baseline at the interval boundary and clamps counter resets', () => {
    expect(
      computePostActivity({
        interval,
        post: post('x', '2026-07-31T20:00:00.000Z'),
        observations: [
          observation('post-1', interval.startAt, { views: 100, likes: 9 }),
          observation('post-1', interval.endAt, { views: 90, likes: 12 }),
        ],
      }),
    ).toEqual({
      postId: 'post-1',
      deltaReach: 0,
      deltaEngagement: 3,
      deltaProfileVisits: null,
    });
  });

  it('uses a virtual zero only for a post born inside the interval', () => {
    const endpoint = observation('post-1', interval.endAt, {
      views: 50,
      likes: 5,
    });
    expect(
      computePostActivity({
        interval,
        post: post('x', '2026-08-01T01:00:00.000Z'),
        observations: [endpoint],
      }),
    ).toMatchObject({ deltaReach: 50, deltaEngagement: 5 });
    expect(
      computePostActivity({
        interval,
        post: post('x', '2026-07-31T23:00:00.000Z'),
        observations: [endpoint],
      }),
    ).toBeNull();
  });

  it('renormalizes missing profile visits to 62.5% reach / 37.5% engagement', () => {
    const attributed = attributeIntervalDelta({
      interval,
      activities: [
        {
          postId: 'reach',
          deltaReach: 100,
          deltaEngagement: 0,
          deltaProfileVisits: null,
        },
        {
          postId: 'engagement',
          deltaReach: 0,
          deltaEngagement: 10,
          deltaProfileVisits: null,
        },
      ],
    });
    expect(attributed.posts.map((post) => post.postId)).toEqual([
      'reach',
      'engagement',
    ]);
    expect(attributed.posts[0]?.share).toBeCloseTo(0.625);
    expect(attributed.posts[0]?.followersEstimated).toBeCloseTo(2.5);
    expect(attributed.posts[1]?.share).toBeCloseTo(0.375);
    expect(attributed.posts[1]?.followersEstimated).toBeCloseTo(1.5);
  });

  it('attributes a positive interval wholly to its only active post', () => {
    expect(
      attributeIntervalDelta({
        interval,
        activities: [
          {
            postId: 'only',
            deltaReach: 1,
            deltaEngagement: null,
            deltaProfileVisits: null,
          },
        ],
      }).posts[0],
    ).toMatchObject({ share: 1, followersEstimated: 4, basis: 'estimated' });
  });

  it('leaves churn and activity-free growth unattributed', () => {
    expect(
      attributeIntervalDelta({
        interval: { ...interval, followersEnd: 8 },
        activities: [],
      }),
    ).toMatchObject({ netDelta: -2, unattributed: -2, posts: [] });
    expect(attributeIntervalDelta({ interval, activities: [] })).toMatchObject({
      unattributed: 4,
      posts: [],
    });
  });

  it('builds adjacent attribution and never produces YouTube estimates', () => {
    const result = buildFollowerAttribution({
      snapshots: [
        snapshot('x', interval.startAt, 10),
        snapshot('x', interval.endAt, 14),
      ],
      posts: [
        post('x', '2026-08-01T01:00:00.000Z'),
        { ...post('youtube', '2026-08-01T01:00:00.000Z'), id: 'youtube' },
      ],
      observations: [observation('post-1', interval.endAt, { views: 5 })],
    });
    expect(result[0]?.posts.map((share) => share.postId)).toEqual(['post-1']);
  });

  it('uses the latest cumulative standardized YouTube row instead of summing', () => {
    const exact = exactYoutubeFollowersByPost(
      [{ ...post('youtube', interval.startAt), id: 'youtube' }],
      [
        {
          ...observation('youtube', interval.endAt),
          age_hours: 24,
          measurement_window: '24h',
          followers_gained: 2,
        },
        {
          ...observation('youtube', interval.endAt),
          age_hours: 72,
          measurement_window: '72h',
          followers_gained: 3,
        },
        {
          ...observation('youtube', interval.endAt),
          age_hours: 80,
          measurement_window: null,
          followers_gained: 99,
        },
      ],
    );
    expect(exact.get('youtube')).toBe(3);
  });
});

function snapshot(platform: string, captured_at: string, followers: number) {
  return { platform, captured_at, followers };
}

function post(platform: string, published_at: string) {
  return { id: 'post-1', platform, published_at };
}

function observation(
  social_post_id: string,
  captured_at: string,
  overrides: Partial<AttributionObservation> = {},
): AttributionObservation {
  return {
    social_post_id,
    captured_at,
    age_hours: 1,
    measurement_window: null,
    collection_status: 'collected',
    views: null,
    impressions: null,
    likes: null,
    comments: null,
    shares: null,
    saves: null,
    profile_visits: null,
    followers_gained: null,
    ...overrides,
  };
}
