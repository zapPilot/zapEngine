import type { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import { readControlCenterConfig } from '../config/env.js';
import { loadSocialGrowth } from './social-growth.js';

const NOW = new Date('2026-09-11T00:00:00.000Z');
const CONFIGURED = readControlCenterConfig({
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
});

describe('loadSocialGrowth standardized metric windows', () => {
  it('does not let later 72h metrics inflate the 24h experiment sample', async () => {
    const posts = [
      {
        id: 'post-1',
        episode_id: 'episode-1',
        platform: 'threads',
        language_code: 'ja',
        published_at: '2026-09-10T00:00:00.000Z',
        experiment_key: 'window-v1',
        experiment_variant: 'control',
        content_features: null,
      },
    ];
    const metrics = [
      metric('24h', '2026-09-11T00:00:00.000Z', 100, 10),
      metric('72h', '2026-09-13T00:00:00.000Z', 9_999, 999),
    ];

    const response = await loadSocialGrowth({
      config: CONFIGURED,
      now: NOW,
      createSupabaseClient: clientFactory({ posts, metrics }),
    });

    const experiment = response.experiments.find(
      (row) => row.experimentKey === 'window-v1',
    );
    const arm = experiment?.arms.find((row) => row.variant === 'control');

    expect(response.status).toBe('ok');
    expect(arm).toMatchObject({
      samples24h: 1,
      medianReach24h: 100,
      meanReach24h: 100,
      medianEngagementRate: 0.1,
    });
  });

  it('does not let unavailable 24h rows with stale metrics inflate experiments', async () => {
    const posts = [
      {
        id: 'post-1',
        episode_id: 'episode-1',
        platform: 'threads',
        language_code: 'ja',
        published_at: '2026-09-10T00:00:00.000Z',
        experiment_key: 'status-v1',
        experiment_variant: 'control',
        content_features: null,
      },
    ];
    const metrics = [
      metric('24h', '2026-09-11T00:00:00.000Z', 100, 10),
      metric('24h', '2026-09-11T00:05:00.000Z', 9_999, 999, 'unavailable'),
    ];

    const response = await loadSocialGrowth({
      config: CONFIGURED,
      now: NOW,
      createSupabaseClient: clientFactory({ posts, metrics }),
    });

    const experiment = response.experiments.find(
      (row) => row.experimentKey === 'status-v1',
    );
    const arm = experiment?.arms.find((row) => row.variant === 'control');

    expect(response.status).toBe('ok');
    expect(arm).toMatchObject({
      samples24h: 1,
      medianReach24h: 100,
      meanReach24h: 100,
      medianEngagementRate: 0.1,
    });
  });
});

function metric(
  measurementWindow: string,
  capturedAt: string,
  views: number,
  likes: number,
  collectionStatus = 'collected',
) {
  return {
    social_post_id: 'post-1',
    captured_at: capturedAt,
    age_hours: measurementWindow === '24h' ? 24 : 72,
    measurement_window: measurementWindow,
    collection_status: collectionStatus,
    views,
    impressions: null,
    likes,
    comments: 0,
    shares: 0,
    saves: 0,
    profile_visits: null,
    followers_gained: null,
  };
}

function clientFactory(input: {
  posts: Array<Record<string, unknown>>;
  metrics: ReturnType<typeof metric>[];
}) {
  const client = {
    from(table: string) {
      const rows =
        table === 'social_posts'
          ? input.posts
          : table === 'social_post_metrics'
            ? input.metrics
            : [];
      const chain = {
        select() {
          return chain;
        },
        gte() {
          return chain;
        },
        lte() {
          return chain;
        },
        not() {
          return chain;
        },
        eq() {
          return chain;
        },
        order() {
          return chain;
        },
        limit() {
          return Promise.resolve({
            data: rows,
            count: rows.length,
            error: null,
          });
        },
        then(
          resolve: (value: {
            data: typeof rows;
            count: number;
            error: null;
          }) => unknown,
        ) {
          return Promise.resolve({
            data: rows,
            count: rows.length,
            error: null,
          }).then(resolve);
        },
      };
      return chain;
    },
    schema() {
      return client;
    },
  };
  return (() => client) as unknown as typeof createClient;
}
