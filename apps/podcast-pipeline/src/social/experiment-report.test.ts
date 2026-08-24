import { describe, expect, it } from 'vitest';

import type { SocialPostMetricRow, SocialPostRow } from '../types.js';
import { buildSocialExperimentReports } from './experiment-report.js';

describe('social experiment reporting', () => {
  it('reports medians but stays report-only until every guardrail passes', () => {
    const posts = [post('en', 0), post('ja', 8)];
    const metrics = [
      metric(posts[0]!.id, 100, 10),
      metric(posts[1]!.id, 200, 20),
    ];

    expect(buildSocialExperimentReports({ posts, metrics })).toEqual([
      expect.objectContaining({
        experimentKey: 'x-language-v1',
        evaluable: false,
        telemetryComplete: true,
        durationDays: 8,
        arms: [
          expect.objectContaining({
            variant: 'en',
            samples: 1,
            medianReach: 100,
          }),
          expect.objectContaining({
            variant: 'ja',
            samples: 1,
            medianReach: 200,
          }),
        ],
      }),
    ]);
  });

  it('marks telemetry gaps and excludes non-24h observations', () => {
    const posts = [post('en', 0), post('ja', 8)];
    const sixHour = {
      ...metric(posts[0]!.id, 100, 10),
      measurement_window: '6h' as const,
    };

    expect(
      buildSocialExperimentReports({ posts, metrics: [sixHour] })[0],
    ).toMatchObject({
      evaluable: false,
      telemetryComplete: false,
      arms: [
        { variant: 'en', samples: 0 },
        { variant: 'ja', samples: 0 },
      ],
    });
  });
});

function post(variant: 'en' | 'ja', day: number): SocialPostRow {
  return {
    id: `post-${variant}`,
    published_at: new Date(Date.UTC(2026, 7, 1 + day)).toISOString(),
    experiment_key: 'x-language-v1',
    experiment_variant: variant,
  } as SocialPostRow;
}

function metric(
  socialPostId: string,
  views: number,
  profileVisits: number,
): SocialPostMetricRow {
  return {
    social_post_id: socialPostId,
    measurement_window: '24h',
    views,
    profile_visits: profileVisits,
    likes: 5,
    comments: 2,
    shares: 1,
    saves: 2,
  } as SocialPostMetricRow;
}
