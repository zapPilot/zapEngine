import { describe, expect, it, vi } from 'vitest';

import type { SocialPostMetricRow, SocialPostRow } from '../types.js';
import { createSocialDashboardApp, parseWindow } from './dashboard.js';

const post: SocialPostRow = {
  id: 'post-1',
  episode_id: 'episode-1',
  platform: 'youtube',
  post_url: 'https://youtube.com/watch?v=abc',
  platform_post_id: 'abc',
  published_at: '2026-08-15T00:00:00.000Z',
  topic: 'technology',
  hook_type: 'explainer',
  generated_title: 'Title',
  published_title: 'Title',
  generated_body: 'Body',
  published_body: 'Body',
  hashtags: [],
  video_duration_sec: 120,
  content_features: {
    containsQuestion: false,
    containsNumber: false,
    titleChars: 5,
    bodyChars: 4,
    hashtagCount: 0,
  },
  llm_model: null,
  created_at: '2026-08-15T00:00:00.000Z',
  updated_at: '2026-08-15T00:00:00.000Z',
};

const metric: SocialPostMetricRow = {
  id: 'metric-1',
  social_post_id: 'post-1',
  captured_at: '2026-08-16T00:00:00.000Z',
  age_hours: 24,
  views: 100,
  impressions: null,
  likes: 10,
  comments: 2,
  shares: 1,
  saves: null,
  profile_visits: null,
  followers_gained: 1,
  details: { averageViewDurationSec: 45 },
  created_at: '2026-08-16T00:00:00.000Z',
};

describe('social dashboard', () => {
  it('serves the dashboard shell', async () => {
    const response = await createSocialDashboardApp().request('/');
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('Social Performance');
  });

  it('returns normalized performance JSON for a requested window', async () => {
    const listPosts = vi.fn().mockResolvedValue([post]);
    const listMetrics = vi.fn().mockResolvedValue([metric]);
    const app = createSocialDashboardApp({
      now: () => new Date('2026-08-16T12:00:00.000Z'),
      listPosts,
      listMetrics,
    });

    const response = await app.request('/api/social-performance?window=24h');
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      window: '24h',
      episodes: [
        {
          episodeId: 'episode-1',
          totalViews: 100,
          platforms: [{ averageViewDurationSec: 45 }],
        },
      ],
    });
    expect(listPosts).toHaveBeenCalledTimes(1);
    expect(listMetrics).toHaveBeenCalledTimes(1);
  });

  it('falls back to latest for unknown windows', () => {
    expect(parseWindow('wat')).toBe('latest');
    expect(parseWindow(undefined)).toBe('latest');
  });
});
