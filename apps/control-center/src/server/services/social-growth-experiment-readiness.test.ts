import type { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import { readControlCenterConfig } from '../config/env.js';
import { loadSocialGrowth } from './social-growth.js';

const NOW = new Date('2026-09-09T00:00:00.000Z');
const CONFIGURED = readControlCenterConfig({
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
});

describe('loadSocialGrowth experiment readiness', () => {
  it.each([
    { challengerSamples: 9, expectedStatus: 'collecting' },
    { challengerSamples: 10, expectedStatus: 'provisional' },
    { challengerSamples: 20, expectedStatus: 'eligible' },
  ] as const)(
    'uses the weakest arm when challenger has $challengerSamples samples',
    async ({ challengerSamples, expectedStatus }) => {
      const posts = [
        ...experimentPosts('control', 20),
        ...experimentPosts('challenger', challengerSamples),
      ];
      const metrics = posts.map((post) => metric(post.id));

      const response = await loadSocialGrowth({
        config: CONFIGURED,
        now: NOW,
        createSupabaseClient: clientFactory({ posts, metrics }),
      });

      const experiment = response.experiments.find(
        (row) => row.experimentKey === 'headline-readiness-v1',
      );
      expect(response.status).toBe('ok');
      expect(experiment).toMatchObject({
        paired: false,
        status: expectedStatus,
        arms: expect.arrayContaining([
          { variant: 'control', samples24h: 20, status: 'eligible' },
          {
            variant: 'challenger',
            samples24h: challengerSamples,
            status: expectedStatus,
          },
        ]),
      });
    },
  );
});

function experimentPosts(variant: string, count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `${variant}-${index}`,
    episode_id: `${variant}-episode-${index}`,
    platform: 'threads',
    language_code: 'ja',
    published_at: '2026-09-08T00:00:00.000Z',
    experiment_key: 'headline-readiness-v1',
    experiment_variant: variant,
    content_features: null,
  }));
}

function metric(socialPostId: string) {
  return {
    social_post_id: socialPostId,
    captured_at: '2026-09-09T00:00:00.000Z',
    age_hours: 24,
    measurement_window: '24h',
    collection_status: 'collected',
    views: 100,
    impressions: null,
    likes: 1,
    comments: 0,
    shares: 0,
    saves: 0,
    profile_visits: null,
    followers_gained: null,
  };
}

function clientFactory(input: {
  posts: ReturnType<typeof experimentPosts>;
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
