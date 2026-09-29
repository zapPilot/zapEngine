import { describe, expect, it } from 'vitest';

import {
  attributeIntervalDelta,
  exactYoutubeFollowersByPost,
} from './social-attribution.js';

const INTERVAL = {
  platform: 'x',
  startAt: '2026-09-01T00:00:00.000Z',
  endAt: '2026-09-02T00:00:00.000Z',
  followersStart: 100,
  followersEnd: 110,
};

function metric(
  postId: string,
  age_hours: number,
  overrides: Record<string, unknown> = {},
) {
  return {
    social_post_id: postId,
    captured_at: '2026-09-01T12:00:00.000Z',
    age_hours,
    views: 10,
    impressions: null,
    likes: 1,
    comments: 0,
    shares: 0,
    saves: 0,
    profile_visits: 0,
    followers_gained: 5,
    measurement_window: '24h',
    collection_status: 'ok',
    ...overrides,
  };
}

describe('social attribution missing branches', () => {
  it('scores null dimensions as zero when weighting', () => {
    const result = attributeIntervalDelta({
      interval: INTERVAL,
      activities: [
        {
          postId: 'p1',
          deltaReach: 100,
          deltaEngagement: null,
          deltaProfileVisits: null,
        },
        {
          postId: 'p2',
          deltaReach: 50,
          deltaEngagement: 10,
          deltaProfileVisits: 5,
        },
      ],
    });

    expect(result.posts).toHaveLength(2);
    expect(
      result.posts.reduce((sum, p) => sum + p.followersEstimated, 0),
    ).toBeLessThanOrEqual(10);
  });

  it('keeps the oldest observation when a newer one is older', () => {
    const posts = [
      {
        id: 'v1',
        platform: 'youtube',
        published_at: '2026-09-01T00:00:00.000Z',
      },
    ];
    const metrics = [
      metric('v1', 10, { followers_gained: 7 }),
      metric('v1', 5, { followers_gained: 3 }),
    ];

    const result = exactYoutubeFollowersByPost(posts, metrics);

    expect(result.get('v1')).toBe(7);
  });
});
