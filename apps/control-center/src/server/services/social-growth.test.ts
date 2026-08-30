import type { createClient, SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import { readControlCenterConfig } from '../config/env.js';
import { loadSocialGrowth } from './social-growth.js';

const NOW = new Date('2026-08-30T12:00:00.000Z');
const CONFIGURED = readControlCenterConfig({
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
});

interface QueryResult {
  data: unknown[] | null;
  error: unknown;
}

function clientFactory(input: {
  snapshots?: QueryResult;
  posts?: QueryResult;
  standardized?: QueryResult;
  observations?: QueryResult;
  calls?: string[];
}) {
  const empty = { data: [], error: null } satisfies QueryResult;
  let metricsCall = 0;
  return (() =>
    ({
      from: (table: string) => {
        const result =
          table === 'social_account_snapshots'
            ? (input.snapshots ?? empty)
            : table === 'social_posts'
              ? (input.posts ?? empty)
              : metricsCall++ === 0
                ? (input.standardized ?? empty)
                : (input.observations ?? empty);
        const chain = {
          select: () => chain,
          gte: () => chain,
          not: (column: string, operator: string, value: unknown) => {
            input.calls?.push(`not:${column}:${operator}:${String(value)}`);
            return chain;
          },
          eq: (column: string, value: unknown) => {
            input.calls?.push(`eq:${column}:${String(value)}`);
            return chain;
          },
          order: () => chain,
          limit: (value: number) => {
            input.calls?.push(`limit:${table}:${value}`);
            return Promise.resolve(result);
          },
        };
        return chain;
      },
    }) as unknown as SupabaseClient) as unknown as typeof createClient;
}

describe('loadSocialGrowth', () => {
  it('returns unconfigured without creating a Supabase client', async () => {
    const createSupabaseClient = vi.fn(() => {
      throw new Error('must not connect');
    });
    const response = await loadSocialGrowth({
      config: readControlCenterConfig({}),
      now: NOW,
      createSupabaseClient,
    });

    expect(response.status).toBe('unconfigured');
    expect(createSupabaseClient).not.toHaveBeenCalled();
  });

  it('builds measured platform deltas, estimated lanes, and exact YouTube totals', async () => {
    const calls: string[] = [];
    const posts = [
      post('x-post', 'episode-x', 'x', 'ja', '2026-08-30T00:00:00.000Z'),
      post(
        'youtube-en',
        'episode-youtube',
        'youtube',
        'en',
        '2026-08-29T00:00:00.000Z',
        {
          experiment_key: 'youtube-language-cohort-v1',
          experiment_variant: 'en',
        },
      ),
      post(
        'youtube-ja',
        'episode-youtube',
        'youtube',
        'ja',
        '2026-08-29T00:00:00.000Z',
        {
          experiment_key: 'youtube-language-cohort-v1',
          experiment_variant: 'ja',
        },
      ),
    ];
    const standardized = [
      metric('x-post', 24, 100),
      metric('youtube-en', 24, 200, 2),
      metric('youtube-en', 72, 250, 3, '72h'),
      metric('youtube-ja', 24, 180, 4),
    ];
    const response = await loadSocialGrowth({
      config: CONFIGURED,
      now: NOW,
      createSupabaseClient: clientFactory({
        calls,
        snapshots: {
          data: [
            {
              platform: 'x',
              captured_at: '2026-08-29T12:00:00.000Z',
              followers: 100,
            },
            {
              platform: 'x',
              captured_at: '2026-08-30T12:00:00.000Z',
              followers: 104,
            },
          ],
          error: null,
        },
        posts: { data: posts, error: null },
        standardized: { data: standardized, error: null },
        observations: {
          data: [
            {
              ...metric('x-post', 11, 100),
              captured_at: '2026-08-30T11:00:00.000Z',
              measurement_window: null,
            },
          ],
          error: null,
        },
      }),
    });

    expect(response.status).toBe('ok');
    expect(
      response.platforms.find((row) => row.platform === 'x'),
    ).toMatchObject({
      followersNow: 104,
      followersDelta24h: 4,
      followersDelta7d: null,
      lanes: [
        {
          languageCode: 'ja',
          followersGained7d: 4,
          followersPer1kReach: 40,
          basis: 'estimated',
        },
      ],
    });
    expect(
      response.platforms.find((row) => row.platform === 'youtube'),
    ).toMatchObject({ exactSubscribersGained7d: 7 });
    expect(
      response.experiments.find(
        (row) => row.experimentKey === 'youtube-language-cohort-v1',
      ),
    ).toMatchObject({ paired: true, status: 'paired-cohort' });
    expect(calls).toContain('not:measurement_window:is:null');
    expect(calls).toContain('eq:collection_status:collected');
    expect(calls).toEqual(
      expect.arrayContaining([
        'limit:social_account_snapshots:1500',
        'limit:social_posts:500',
        'limit:social_post_metrics:3000',
        'limit:social_post_metrics:4000',
      ]),
    );
  });

  it('fails closed when any bounded query fails', async () => {
    const response = await loadSocialGrowth({
      config: CONFIGURED,
      now: NOW,
      createSupabaseClient: clientFactory({
        posts: { data: null, error: new Error('posts unavailable') },
      }),
    });

    expect(response).toMatchObject({
      status: 'error',
      message: 'posts unavailable',
      platforms: [],
      experiments: [],
      attribution: [],
    });
  });
});

function post(
  id: string,
  episode_id: string,
  platform: string,
  language_code: string,
  published_at: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    episode_id,
    platform,
    language_code,
    published_at,
    experiment_key: null,
    experiment_variant: null,
    content_features: null,
    ...overrides,
  };
}

function metric(
  social_post_id: string,
  age_hours: number,
  views: number,
  followers_gained: number | null = null,
  measurement_window = '24h',
) {
  return {
    social_post_id,
    captured_at: '2026-08-30T11:00:00.000Z',
    age_hours,
    measurement_window,
    collection_status: 'collected',
    views,
    impressions: null,
    likes: 10,
    comments: 0,
    shares: 0,
    saves: 0,
    profile_visits: null,
    followers_gained,
  };
}
