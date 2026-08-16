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
});
