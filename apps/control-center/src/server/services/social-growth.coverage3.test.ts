import type { createClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import { readControlCenterConfig } from '../config/env.js';
import {
  createSocialGrowthService,
  loadSocialGrowth,
} from './social-growth.js';

const mockedEmptyClient = vi.hoisted(() => ({
  make: null as unknown as () => unknown,
}));

vi.mock('@supabase/supabase-js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@supabase/supabase-js')>();
  return {
    ...actual,
    createClient: (...args: unknown[]) => {
      if (mockedEmptyClient.make) {
        return mockedEmptyClient.make();
      }
      return (actual.createClient as (...a: unknown[]) => unknown)(...args);
    },
  };
});

const NOW = new Date('2026-08-30T12:00:00.000Z');
const CONFIGURED = readControlCenterConfig({
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
});

interface QueryResult {
  data: unknown[] | null;
  error: unknown;
}

function chainFor(result: QueryResult) {
  const chain: Record<string, unknown> = {
    select: () => chain,
    gte: () => chain,
    lte: () => chain,
    order: () => chain,
    limit: () => Promise.resolve(result),
    not: () => chain,
    eq: () => chain,
  };
  return chain;
}

function factory(results: QueryResult[], waitlistRows: unknown[] = []) {
  let metricsCall = 0;
  const client = {
    from: (table: string) => {
      if (table === 'waitlist_signups') {
        return {
          select: () => ({
            gte: () => ({
              lte: () =>
                Promise.resolve({
                  data: waitlistRows,
                  error: null,
                  count: waitlistRows.length,
                }),
            }),
          }),
        };
      }
      if (table === 'social_post_metrics') {
        const result = results[2 + Math.min(metricsCall++, 1)] ?? {
          data: [],
          error: null,
        };
        return chainFor(result as QueryResult);
      }
      const index =
        table === 'social_account_snapshots'
          ? 0
          : table === 'social_posts'
            ? 1
            : 3;
      return chainFor(
        (results[index] ?? { data: [], error: null }) as QueryResult,
      );
    },
  };
  return (() => client) as unknown as typeof createClient;
}

function emptyClient() {
  return {
    from: (table: string) => {
      if (table === 'waitlist_signups') {
        return {
          select: () => ({
            gte: () => ({
              lte: () => Promise.resolve({ data: [], error: null, count: 0 }),
            }),
          }),
        };
      }
      return chainFor({ data: [], error: null });
    },
  };
}

describe('social growth coverage round 3', () => {
  it('builds an unconfigured response without a client factory', async () => {
    const service = createSocialGrowthService({
      config: readControlCenterConfig({}),
      now: () => NOW,
    });
    const response = await service.getSocialGrowth();
    expect(response.status).toBe('unconfigured');
  });

  it('defaults the snapshot clock when no now hook is provided', async () => {
    const service = createSocialGrowthService({
      config: readControlCenterConfig({}),
    });
    const response = await service.getSocialGrowth();
    expect(response.status).toBe('unconfigured');
    expect(Date.parse(response.generatedAt)).not.toBeNaN();
  });

  it('uses the default client when no factory is provided', async () => {
    mockedEmptyClient.make = emptyClient as unknown as () => unknown;
    try {
      const response = await loadSocialGrowth({ config: CONFIGURED, now: NOW });
      expect(response.status).toBe('ok');
      expect(response.platforms).toEqual([]);
    } finally {
      mockedEmptyClient.make = null as unknown as () => unknown;
    }
  });

  it('tolerates null data payloads across every core query', async () => {
    const response = await loadSocialGrowth({
      config: CONFIGURED,
      now: NOW,
      createSupabaseClient: factory([
        { data: null, error: null },
        { data: null, error: null },
        { data: null, error: null },
        { data: null, error: null },
      ]),
    });
    expect(response.status).toBe('ok');
    expect(response.platforms).toEqual([]);
    expect(response.experiments).toEqual([]);
  });

  it('falls back to zh-Hant when a recent post omits its language', async () => {
    const response = await loadSocialGrowth({
      config: CONFIGURED,
      now: NOW,
      createSupabaseClient: factory([
        {
          data: [
            {
              platform: 'x',
              captured_at: '2026-08-30T12:00:00.000Z',
              followers: 50,
            },
          ],
          error: null,
        },
        {
          data: [
            {
              id: 'null-lang',
              episode_id: 'ep-null',
              platform: 'x',
              language_code: null,
              published_at: '2026-08-29T12:00:00.000Z',
              content_features: null,
              experiment_key: null,
              experiment_variant: null,
            },
          ],
          error: null,
        },
        { data: [], error: null },
        { data: [], error: null },
      ]),
    });
    const platform = response.platforms.find((row) => row.platform === 'x');
    expect(platform?.lanes.map((lane) => lane.languageCode)).toEqual([
      'zh-Hant',
    ]);
    expect(platform?.lanes[0]?.postCount7d).toBe(1);
  });

  it('attributes shared follower deltas across lanes and experiment arms', async () => {
    const snapshots = [
      {
        platform: 'threads',
        captured_at: '2026-08-28T23:00:00.000Z',
        followers: 10,
      },
      {
        platform: 'threads',
        captured_at: '2026-08-30T12:00:00.000Z',
        followers: 14,
      },
    ];
    const posts = [
      {
        id: 'lane-ja',
        episode_id: 'ep-ja',
        platform: 'threads',
        language_code: 'ja',
        published_at: '2026-08-29T12:00:00.000Z',
        content_features: null,
        experiment_key: 'shared-v1',
        experiment_variant: 'control',
      },
      {
        id: 'lane-en',
        episode_id: 'ep-en',
        platform: 'threads',
        language_code: 'en',
        published_at: '2026-08-29T12:00:00.000Z',
        content_features: null,
        experiment_key: null,
        experiment_variant: null,
      },
    ];
    const observations = [
      {
        social_post_id: 'lane-ja',
        captured_at: '2026-08-28T22:00:00.000Z',
        age_hours: 24,
        measurement_window: '24h',
        collection_status: 'collected',
        views: 10,
        impressions: null,
        likes: 1,
        comments: 0,
        shares: 0,
        saves: 0,
        profile_visits: null,
        followers_gained: null,
      },
      {
        social_post_id: 'lane-ja',
        captured_at: '2026-08-29T12:00:00.000Z',
        age_hours: 24,
        measurement_window: '24h',
        collection_status: 'collected',
        views: 110,
        impressions: null,
        likes: 11,
        comments: 0,
        shares: 0,
        saves: 0,
        profile_visits: null,
        followers_gained: null,
      },
      {
        social_post_id: 'lane-en',
        captured_at: '2026-08-28T22:00:00.000Z',
        age_hours: 24,
        measurement_window: '24h',
        collection_status: 'collected',
        views: 20,
        impressions: null,
        likes: 2,
        comments: 0,
        shares: 0,
        saves: 0,
        profile_visits: null,
        followers_gained: null,
      },
      {
        social_post_id: 'lane-en',
        captured_at: '2026-08-29T12:00:00.000Z',
        age_hours: 24,
        measurement_window: '24h',
        collection_status: 'collected',
        views: 120,
        impressions: null,
        likes: 12,
        comments: 0,
        shares: 0,
        saves: 0,
        profile_visits: null,
        followers_gained: null,
      },
    ];
    const response = await loadSocialGrowth({
      config: CONFIGURED,
      now: NOW,
      createSupabaseClient: factory([
        { data: snapshots, error: null },
        { data: posts, error: null },
        { data: observations, error: null },
        { data: observations, error: null },
      ]),
    });
    expect(response.status).toBe('ok');
    const threads = response.platforms.find(
      (row) => row.platform === 'threads',
    );
    expect(threads?.lanes.map((lane) => lane.languageCode).sort()).toEqual([
      'en',
      'ja',
    ]);
    const experiment = response.experiments.find(
      (row) => row.experimentKey === 'shared-v1',
    );
    expect(experiment?.arms[0]?.samples24h).toBeGreaterThan(0);
    expect(
      threads?.lanes.every((lane) => lane.followersGained7d !== null),
    ).toBe(true);
  });
});
