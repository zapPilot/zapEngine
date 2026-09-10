import { describe, expect, it } from 'vitest';

import {
  computePostActivity,
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

describe('social follower attribution unavailable baselines', () => {
  it('falls back to the latest collected baseline before an unavailable boundary row', () => {
    expect(
      computePostActivity({
        interval,
        post: {
          id: 'post-1',
          platform: 'x',
          published_at: '2026-07-31T20:00:00.000Z',
        },
        observations: [
          observation('2026-07-31T23:00:00.000Z', {
            views: 100,
            likes: 5,
          }),
          observation(interval.startAt, {
            collection_status: 'unavailable',
            views: 999,
            likes: 99,
          }),
          observation('2026-08-01T02:00:00.000Z', {
            views: 140,
            likes: 9,
          }),
        ],
      }),
    ).toEqual({
      postId: 'post-1',
      deltaReach: 40,
      deltaEngagement: 4,
      deltaProfileVisits: null,
    });
  });
});

function observation(
  captured_at: string,
  overrides: Partial<AttributionObservation> = {},
): AttributionObservation {
  return {
    social_post_id: 'post-1',
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
