import type { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import { readControlCenterConfig } from '../config/env.js';
import { loadSocialGrowth } from './social-growth.js';

const NOW = new Date('2026-09-09T00:00:00.000Z');
const CONFIGURED = readControlCenterConfig({
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
});

describe('loadSocialGrowth zero-view metrics', () => {
  it('keeps zero reach in reach aggregates without inventing an engagement rate', async () => {
    const posts = [post('zero-view'), post('normal-view')];
    const metrics = [metric('zero-view', 0, 7), metric('normal-view', 100, 10)];

    const response = await loadSocialGrowth({
      config: CONFIGURED,
      now: NOW,
      createSupabaseClient: clientFactory({ posts, metrics }),
    });

    const experiment = response.experiments.find(
      (row) => row.experimentKey === 'zero-view-v1',
    );
    const arm = experiment?.arms.find((row) => row.variant === 'control');

    expect(response.status).toBe('ok');
    expect(arm).toMatchObject({
      samples24h: 2,
      medianReach24h: 50,
      meanReach24h: 50,
      medianEngagementRate: 0.1,
    });
  });

  it('does not count null-view observations as usable experiment samples', async () => {
    const posts = [post('missing-view'), post('normal-view')];
    const metrics = [
      metric('missing-view', null, 7),
      metric('normal-view', 100, 10),
    ];

    const response = await loadSocialGrowth({
      config: CONFIGURED,
      now: NOW,
      createSupabaseClient: clientFactory({ posts, metrics }),
    });

    const experiment = response.experiments.find(
      (row) => row.experimentKey === 'zero-view-v1',
    );
    const arm = experiment?.arms.find((row) => row.variant === 'control');

    expect(response.status).toBe('ok');
    expect(arm).toMatchObject({
      samples24h: 1,
      status: 'collecting',
      medianReach24h: 100,
      meanReach24h: 100,
      medianEngagementRate: 0.1,
    });
  });

  it('does not invent follower efficiency when exact YouTube followers have zero reach', async () => {
    const posts = [post('youtube-zero-view', 'youtube')];
    const metrics = [metric('youtube-zero-view', 0, 0, 3)];

    const response = await loadSocialGrowth({
      config: CONFIGURED,
      now: NOW,
      createSupabaseClient: clientFactory({ posts, metrics }),
    });

    const platform = response.platforms.find(
      (row) => row.platform === 'youtube',
    );
    const experiment = response.experiments.find(
      (row) => row.experimentKey === 'zero-view-v1',
    );
    const arm = experiment?.arms.find((row) => row.variant === 'control');

    expect(response.status).toBe('ok');
    expect(platform?.lanes[0]).toMatchObject({
      followersGained7d: 3,
      followersPer1kReach: null,
      basis: 'exact',
    });
    expect(arm).toMatchObject({
      samples24h: 1,
      followersAttributed: 3,
      followersPer1kReach: null,
      basis: 'exact',
    });
  });
});

function post(id: string, platform = 'threads') {
  return {
    id,
    episode_id: `episode-${id}`,
    platform,
    language_code: 'ja',
    published_at: '2026-09-08T00:00:00.000Z',
    experiment_key: 'zero-view-v1',
    experiment_variant: 'control',
    content_features: null,
  };
}

function metric(
  socialPostId: string,
  views: number | null,
  likes: number,
  followersGained: number | null = null,
) {
  return {
    social_post_id: socialPostId,
    captured_at: '2026-09-09T00:00:00.000Z',
    age_hours: 24,
    measurement_window: '24h',
    collection_status: 'collected',
    views,
    impressions: null,
    likes,
    comments: 0,
    shares: 0,
    saves: 0,
    profile_visits: null,
    followers_gained: followersGained,
  };
}

function clientFactory(input: {
  posts: ReturnType<typeof post>[];
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
