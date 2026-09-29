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

  it('becomes evaluable only after both arms have enough complete samples over a week', () => {
    const posts = Array.from({ length: 40 }, (_, index) => {
      const variant = index < 20 ? 'en' : 'ja';
      return {
        id: `post-${index}`,
        published_at: new Date(
          Date.UTC(2026, 7, 1 + (index % 10)),
        ).toISOString(),
        experiment_key: 'x-language-v1',
        experiment_variant: variant,
        content_features: {},
      } as SocialPostRow;
    });
    const metrics = posts.map(
      (entry, index) =>
        ({
          social_post_id: entry.id,
          measurement_window: '24h',
          views: index === 0 ? null : 100 + index,
          profile_visits: index === 1 ? null : 5,
          likes: index === 2 ? null : 5,
          comments: index === 3 ? null : 2,
          shares: index === 4 ? null : 1,
          saves: index === 5 ? null : 2,
        }) as SocialPostMetricRow,
    );

    expect(buildSocialExperimentReports({ posts, metrics })[0]).toMatchObject({
      evaluable: true,
      telemetryComplete: true,
      durationDays: 9,
      arms: [
        { variant: 'en', samples: 20 },
        { variant: 'ja', samples: 20 },
      ],
    });
  });

  it('ignores malformed direct and packaging memberships', () => {
    const posts = [
      {
        id: 'missing-direct',
        published_at: '2026-08-01T00:00:00.000Z',
        experiment_key: null,
        experiment_variant: null,
        content_features: 'bad',
      },
      {
        id: 'missing-packaging',
        published_at: '2026-08-01T00:00:00.000Z',
        content_features: {},
      },
      {
        id: 'non-object-packaging',
        published_at: '2026-08-01T00:00:00.000Z',
        content_features: { packagingExperiment: 'bad' },
      },
      {
        id: 'bad-key',
        published_at: '2026-08-01T00:00:00.000Z',
        content_features: {
          packagingExperiment: { key: 7, variant: 'a' },
        },
      },
      {
        id: 'blank-key',
        published_at: '2026-08-01T00:00:00.000Z',
        content_features: {
          packagingExperiment: { key: '', variant: 'a' },
        },
      },
      {
        id: 'bad-variant',
        published_at: '2026-08-01T00:00:00.000Z',
        content_features: {
          packagingExperiment: { key: 'pack', variant: 7 },
        },
      },
      {
        id: 'blank-variant',
        published_at: '2026-08-01T00:00:00.000Z',
        content_features: {
          packagingExperiment: { key: 'pack', variant: '' },
        },
      },
    ] as unknown as SocialPostRow[];

    expect(buildSocialExperimentReports({ posts, metrics: [] })).toEqual([]);
  });

  it('reports orthogonal packaging membership from content features', () => {
    const posts = [post('en', 0), post('ja', 8)];
    posts[0]!.content_features = {
      packagingExperiment: {
        key: 'youtube-title-packaging-v1',
        variant: 'descriptive',
      },
    } as SocialPostRow['content_features'];
    posts[1]!.content_features = {
      packagingExperiment: {
        key: 'youtube-title-packaging-v1',
        variant: 'hook_first',
      },
    } as SocialPostRow['content_features'];
    const reports = buildSocialExperimentReports({
      posts,
      metrics: [metric(posts[0]!.id, 100, 1), metric(posts[1]!.id, 120, 1)],
    });
    expect(reports.map((report) => report.experimentKey)).toEqual([
      'x-language-v1',
      'youtube-title-packaging-v1',
    ]);
    expect(reports[1]?.arms.map((arm) => arm.variant)).toEqual([
      'descriptive',
      'hook_first',
    ]);
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
