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

describe('social attribution interval boundaries', () => {
  it('does not leak a future observation into the current interval', () => {
    expect(
      computePostActivity({
        interval,
        post: {
          id: 'post-1',
          platform: 'x',
          published_at: '2026-07-31T20:00:00.000Z',
        },
        observations: [
          observation(interval.startAt, 100),
          observation(interval.endAt, 140),
          observation('2026-08-01T04:00:00.000Z', 1_000),
        ],
      }),
    ).toMatchObject({
      postId: 'post-1',
      deltaReach: 40,
    });
  });
});

function observation(captured_at: string, views: number): AttributionObservation {
  return {
    social_post_id: 'post-1',
    captured_at,
    age_hours: 1,
    measurement_window: null,
    collection_status: 'collected',
    views,
    impressions: null,
    likes: null,
    comments: null,
    shares: null,
    saves: null,
    profile_visits: null,
    followers_gained: null,
  };
}
