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
  followersEnd: 11,
};

describe('social follower attribution reach fallback', () => {
  it('uses impressions when views are unavailable at both interval boundaries', () => {
    expect(
      computePostActivity({
        interval,
        post: {
          id: 'x-post',
          platform: 'x',
          published_at: '2026-07-31T20:00:00.000Z',
        },
        observations: [
          observation(interval.startAt, 100),
          observation(interval.endAt, 160),
        ],
      }),
    ).toEqual({
      postId: 'x-post',
      deltaReach: 60,
      deltaEngagement: null,
      deltaProfileVisits: null,
    });
  });
});

function observation(
  captured_at: string,
  impressions: number,
): AttributionObservation {
  return {
    social_post_id: 'x-post',
    captured_at,
    age_hours: 1,
    measurement_window: null,
    collection_status: 'collected',
    views: null,
    impressions,
    likes: null,
    comments: null,
    shares: null,
    saves: null,
    profile_visits: null,
    followers_gained: null,
  };
}
