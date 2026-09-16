import { describe, expect, it } from 'vitest';

import {
  attributeIntervalDelta,
  computePostActivity,
  pairSnapshotIntervals,
} from './social-attribution.js';

const INTERVAL = {
  platform: 'x',
  startAt: '2026-09-01T00:00:00.000Z',
  endAt: '2026-09-02T00:00:00.000Z',
  followersStart: 100,
  followersEnd: 110,
};

describe('social attribution coverage gaps', () => {
  it('drops equal-timestamp snapshot pairs', () => {
    expect(
      pairSnapshotIntervals([
        {
          platform: 'x',
          captured_at: '2026-09-01T00:00:00.000Z',
          followers: 100,
        },
        {
          platform: 'x',
          captured_at: '2026-09-01T00:00:00.000Z',
          followers: 110,
        },
      ]),
    ).toEqual([]);
  });

  it('returns null when no observation falls inside the interval', () => {
    const activity = computePostActivity({
      interval: INTERVAL,
      post: {
        id: 'p1',
        platform: 'x',
        published_at: '2026-09-01T12:00:00.000Z',
      },
      observations: [
        {
          social_post_id: 'p1',
          captured_at: '2026-08-31T00:00:00.000Z',
          age_hours: 1,
          views: 10,
          impressions: null,
          likes: 1,
          comments: 0,
          shares: 0,
          saves: 0,
          profile_visits: 0,
          followers_gained: null,
        },
      ],
    });

    expect(activity).toBeNull();
  });

  it('splits followers across two active posts by weighted dimensions', () => {
    const result = attributeIntervalDelta({
      interval: INTERVAL,
      activities: [
        {
          postId: 'p1',
          deltaReach: 100,
          deltaEngagement: 10,
          deltaProfileVisits: 5,
        },
        {
          postId: 'p2',
          deltaReach: 100,
          deltaEngagement: 10,
          deltaProfileVisits: 5,
        },
      ],
    });

    expect(result.posts).toHaveLength(2);
    expect(result.posts[0]?.share).toBeCloseTo(0.5, 8);
    expect(result.posts[1]?.followersEstimated).toBeCloseTo(5, 8);
    expect(result.unattributed).toBeCloseTo(0, 8);
  });

  it('returns fully unattributed when active posts share no measurable dimension', () => {
    // Two active posts where each dimension total is zero: reach/engagement/
    // profile deltas are all 0, but the filter requires >0 in at least one
    // dimension, so they are inactive and the interval is unattributed.
    const result = attributeIntervalDelta({
      interval: INTERVAL,
      activities: [
        {
          postId: 'p1',
          deltaReach: null,
          deltaEngagement: null,
          deltaProfileVisits: null,
        },
      ],
    });

    expect(result.posts).toEqual([]);
    expect(result.unattributed).toBe(10);
  });
});
