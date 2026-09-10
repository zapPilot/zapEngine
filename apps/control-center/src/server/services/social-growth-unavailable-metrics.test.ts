import type { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import { readControlCenterConfig } from '../config/env.js';
import { loadSocialGrowth } from './social-growth.js';

const NOW = new Date('2026-09-09T00:00:00.000Z');
const CONFIGURED = readControlCenterConfig({
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
});

describe('loadSocialGrowth unavailable standardized metrics', () => {
  it('does not count unavailable 24h rows as reach samples', async () => {
    const response = await loadSocialGrowth({
      config: CONFIGURED,
      now: NOW,
      createSupabaseClient: clientFactory(),
    });

    const platform = response.platforms.find(
      (row) => row.platform === 'threads',
    );
    const experiment = response.experiments.find(
      (row) => row.experimentKey === 'availability-v1',
    );
    const arm = experiment?.arms.find((row) => row.variant === 'control');

    expect(response.status).toBe('ok');
    expect(platform?.lanes[0]).toMatchObject({
      postCount7d: 1,
      medianReach24h: 100,
      basis: 'estimated',
    });
    expect(arm).toMatchObject({
      samples24h: 1,
      medianReach24h: 100,
      meanReach24h: 100,
      medianEngagementRate: 0.1,
      basis: 'estimated',
    });
  });
});

function clientFactory() {
  const posts = [
    {
      id: 'threads-post',
      episode_id: 'episode-threads-post',
      platform: 'threads',
      language_code: 'ja',
      published_at: '2026-09-08T00:00:00.000Z',
      experiment_key: 'availability-v1',
      experiment_variant: 'control',
      content_features: null,
    },
  ];
  const metrics = [
    metric('collected', 100, 10),
    metric('unavailable', 999, 99),
  ];
  const client = {
    from(table: string) {
      const rows =
        table === 'social_posts'
          ? posts
          : table === 'social_post_metrics'
            ? metrics
            : [];
      let head = false;
      const chain = {
        select(_columns: string, options?: { head?: boolean }) {
          head = options?.head ?? false;
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
          return Promise.resolve(result());
        },
        then(resolve: (value: ReturnType<typeof result>) => unknown) {
          return Promise.resolve(result()).then(resolve);
        },
      };
      function result() {
        return {
          data: head ? null : rows,
          count: head ? 0 : rows.length,
          error: null,
        };
      }
      return chain;
    },
    schema() {
      return client;
    },
  };
  return (() => client) as unknown as typeof createClient;
}

function metric(
  collectionStatus: 'collected' | 'unavailable',
  views: number,
  likes: number,
) {
  return {
    social_post_id: 'threads-post',
    captured_at: '2026-09-09T00:00:00.000Z',
    age_hours: 24,
    measurement_window: '24h',
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
