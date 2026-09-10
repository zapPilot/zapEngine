import { describe, expect, it } from 'vitest';

import {
  exactYoutubeFollowersByPost,
  type AttributionObservation,
} from './social-attribution.js';

describe('exact YouTube follower attribution data quality', () => {
  it('ignores a newer unavailable cumulative row', () => {
    const exact = exactYoutubeFollowersByPost(
      [
        {
          id: 'youtube-post',
          platform: 'youtube',
          published_at: '2026-08-01T00:00:00.000Z',
        },
      ],
      [
        metric({
          age_hours: 24,
          measurement_window: '24h',
          followers_gained: 2,
        }),
        metric({
          age_hours: 72,
          measurement_window: '72h',
          collection_status: 'unavailable',
          followers_gained: 99,
        }),
      ],
    );

    expect(exact.get('youtube-post')).toBe(2);
  });

  it('keeps a collected zero as an exact cumulative result', () => {
    const exact = exactYoutubeFollowersByPost(
      [
        {
          id: 'youtube-post',
          platform: 'youtube',
          published_at: '2026-08-01T00:00:00.000Z',
        },
      ],
      [
        metric({
          age_hours: 24,
          measurement_window: '24h',
          followers_gained: 0,
        }),
      ],
    );

    expect(exact.has('youtube-post')).toBe(true);
    expect(exact.get('youtube-post')).toBe(0);
  });
});

function metric(
  overrides: Partial<AttributionObservation>,
): AttributionObservation {
  return {
    social_post_id: 'youtube-post',
    captured_at: '2026-08-04T00:00:00.000Z',
    age_hours: 1,
    measurement_window: '24h',
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
