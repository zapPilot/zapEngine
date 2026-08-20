import { describe, expect, it } from 'vitest';

import type { SocialPostMetricRow, SocialPostRow } from '../types.js';
import {
  buildSocialPerformance,
  selectMetricSnapshot,
} from './social-performance.js';

function post(overrides: Partial<SocialPostRow> = {}): SocialPostRow {
  return {
    id: 'post-1',
    episode_id: 'episode-1',
    platform: 'youtube',
    post_url: 'https://example.com/post',
    platform_post_id: 'video-1',
    published_at: '2026-08-15T00:00:00.000Z',
    topic: 'technology',
    hook_type: 'explainer',
    generated_title: 'Generated',
    published_title: 'Published title',
    generated_body: 'generated body',
    published_body: 'published body',
    hashtags: [],
    video_duration_sec: 120,
    content_features: {
      containsQuestion: false,
      containsNumber: false,
      titleChars: 15,
      bodyChars: 14,
      hashtagCount: 0,
    },
    llm_model: null,
    review_status: null,
    created_at: '2026-08-15T00:00:00.000Z',
    updated_at: '2026-08-15T00:00:00.000Z',
    ...overrides,
  };
}

function metric(
  overrides: Partial<SocialPostMetricRow> = {},
): SocialPostMetricRow {
  return {
    id: 'metric-1',
    social_post_id: 'post-1',
    captured_at: '2026-08-16T00:00:00.000Z',
    age_hours: 24,
    views: 1000,
    impressions: 5000,
    likes: 100,
    comments: 20,
    shares: 10,
    saves: 5,
    profile_visits: null,
    followers_gained: 3,
    details: {},
    created_at: '2026-08-16T00:00:00.000Z',
    ...overrides,
  };
}

describe('social performance normalization', () => {
  it('selects the snapshot closest to a comparable age window', () => {
    const rows = [
      metric({
        id: 'early',
        age_hours: 3,
        captured_at: '2026-08-15T03:00:00Z',
      }),
      metric({
        id: 'near',
        age_hours: 25.5,
        captured_at: '2026-08-16T01:30:00Z',
      }),
      metric({
        id: 'late',
        age_hours: 70,
        captured_at: '2026-08-17T22:00:00Z',
      }),
    ];

    expect(selectMetricSnapshot(rows, '24h')?.id).toBe('near');
    expect(selectMetricSnapshot(rows, '72h')?.id).toBe('late');
    expect(selectMetricSnapshot(rows, 'latest')?.id).toBe('late');
  });

  it('uses impressions for ER when available and preserves sparse watch metrics', () => {
    const result = buildSocialPerformance({
      posts: [post()],
      metrics: [
        metric({
          details: {
            fiveSecondRetentionRate: 0.72,
            averageViewDurationSec: 83,
            averageViewPercentage: 0.69,
          },
        }),
      ],
      window: '24h',
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.totalViews).toBe(1000);
    expect(result[0]?.platforms[0]).toMatchObject({
      engagements: 135,
      engagementRate: 0.027,
      engagementRateBasis: 'impressions',
      fiveSecondRetentionRate: 0.72,
      averageViewDurationSec: 83,
      averageViewPercentage: 0.69,
    });
  });

  it('renders historical snapshots captured before details existed', () => {
    const historical = {
      ...metric(),
      details: undefined,
    } as unknown as SocialPostMetricRow;

    const result = buildSocialPerformance({
      posts: [post()],
      metrics: [historical],
      window: 'latest',
    });

    expect(result[0]?.platforms[0]).toMatchObject({
      views: 1000,
      coverCtr: null,
      fiveSecondRetentionRate: null,
      averageViewDurationSec: null,
    });
  });

  it('falls back to views for ER without pretending missing impressions are zero', () => {
    const result = buildSocialPerformance({
      posts: [post({ platform: 'rednote' })],
      metrics: [metric({ impressions: null })],
      window: 'latest',
    });

    expect(result[0]?.platforms[0]).toMatchObject({
      impressions: null,
      engagementRate: 0.135,
      engagementRateBasis: 'views',
    });
  });

  it('groups multiple platform rows per episode, ignores posts without metrics, and sums only known counters', () => {
    const posts = [
      post({ id: 'post-1', episode_id: 'episode-1', platform: 'youtube' }),
      post({
        id: 'post-2',
        episode_id: 'episode-1',
        platform: 'rednote',
        published_title: null,
        published_body: 'Body fallback\nsecond line',
      }),
      post({ id: 'post-without-metric', episode_id: 'episode-2' }),
    ];
    const metrics = [
      metric({ id: 'm1', social_post_id: 'post-1', age_hours: 24, views: 100 }),
      metric({
        id: 'm1-newer',
        social_post_id: 'post-1',
        age_hours: 25,
        views: 120,
        captured_at: '2026-08-16T01:00:00.000Z',
      }),
      metric({
        id: 'm2',
        social_post_id: 'post-2',
        age_hours: 30,
        views: null,
        impressions: null,
      }),
    ];

    const result = buildSocialPerformance({ posts, metrics, window: 'latest' });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      episodeId: 'episode-1',
      title: 'Published title',
      totalViews: 120,
      platforms: [
        expect.objectContaining({ postId: 'post-2', ageHours: 30 }),
        expect.objectContaining({ postId: 'post-1', ageHours: 25 }),
      ],
    });
  });

  it('returns null engagement math when every counter and denominator is unavailable', () => {
    const result = buildSocialPerformance({
      posts: [
        post({
          published_title: null,
          published_body: 'Fallback body title\nsecond line',
          content_features: {
            containsQuestion: false,
            containsNumber: false,
            titleChars: null,
            bodyChars: 19,
            hashtagCount: 0,
          },
        }),
      ],
      metrics: [
        metric({
          views: null,
          impressions: null,
          likes: null,
          comments: null,
          shares: null,
          saves: null,
        }),
      ],
      window: '24h',
    });

    expect(result[0]).toMatchObject({
      title: 'Fallback body title',
      totalViews: null,
      totalImpressions: null,
    });
    expect(result[0]?.platforms[0]).toMatchObject({
      engagements: null,
      engagementRate: null,
      engagementRateBasis: null,
      technicalQualityScore: null,
    });
  });

  it('uses Untitled episode when neither title nor body can name the episode', () => {
    const result = buildSocialPerformance({
      posts: [post({ published_title: null, published_body: '   ' })],
      metrics: [metric()],
      window: 'latest',
    });
    expect(result[0]?.title).toBe('Untitled episode');
  });

  it('sorts episodes with unknown totals behind known views and compares unknown totals safely', () => {
    const posts = [
      post({
        id: 'known',
        episode_id: 'known-episode',
        published_title: 'Known',
      }),
      post({ id: 'unknown-a', episode_id: 'unknown-a', published_title: 'A' }),
      post({ id: 'unknown-b', episode_id: 'unknown-b', published_title: 'B' }),
    ];
    const metrics = [
      metric({ id: 'known-m', social_post_id: 'known', views: 10 }),
      metric({
        id: 'unknown-a-m',
        social_post_id: 'unknown-a',
        views: null,
        impressions: null,
      }),
      metric({
        id: 'unknown-b-m',
        social_post_id: 'unknown-b',
        views: null,
        impressions: null,
      }),
    ];

    expect(
      buildSocialPerformance({ posts, metrics, window: 'latest' }).map(
        (row) => row.episodeId,
      ),
    ).toEqual(['known-episode', 'unknown-a', 'unknown-b']);
  });

  it('returns null when selecting from an empty metric set', () => {
    expect(selectMetricSnapshot([], 'latest')).toBeNull();
  });
});
