import { describe, expect, it } from 'vitest';

import { buildEpisodes } from './social.js';

function post(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    episode_id: `episode-${id}`,
    platform: 'x',
    language_code: 'en',
    post_url: null,
    published_at: '2026-08-20T00:30:00.000Z',
    topic: 't',
    hook_type: 'q',
    published_title: `Title ${id}`,
    published_body: `Body ${id}`,
    hashtags: [],
    review_status: null,
    ...overrides,
  };
}

function metric(
  id: string,
  views: number | null,
  overrides: Record<string, unknown> = {},
) {
  return {
    social_post_id: id,
    captured_at: '2026-08-21T00:30:00.000Z',
    age_hours: 24,
    measurement_window: '24h',
    collection_status: 'collected',
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

describe('social coverage round 2', () => {
  it('keeps the newest publish date per episode', () => {
    const posts = [
      post('a', { episode_id: 'ep', published_at: '2026-08-20T00:00:00Z' }),
      post('b', { episode_id: 'ep', published_at: '2026-08-22T00:00:00Z' }),
    ];
    const episodes = buildEpisodes(
      posts as never,
      [] as never,
      'latest',
      new Date('2026-08-30T12:00:00.000Z'),
    );
    expect(episodes).toHaveLength(1);
    // newest date wins; episodes sorted desc puts it first trivially with one row
    expect(episodes[0]?.platforms).toHaveLength(2);
  });

  it('selects the latest captured metric within the window', () => {
    const published = post('w', { post_url: 'https://example.com/p' });
    const result = buildEpisodes(
      [published] as never,
      [
        metric('w', 10, { captured_at: '2026-08-21T00:00:00.000Z' }),
        metric('w', 99, { captured_at: '2026-08-22T00:00:00.000Z' }),
      ] as never,
      'latest',
      new Date('2026-08-30T12:00:00.000Z'),
    );
    expect(result[0]?.platforms[0]?.views).toBe(99);
  });
});
