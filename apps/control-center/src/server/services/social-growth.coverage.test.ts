import type { createClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import { readControlCenterConfig } from '../config/env.js';
import {
  createSocialGrowthService,
  loadSocialGrowth,
} from './social-growth.js';

const NOW = new Date('2026-08-30T12:00:00.000Z');
const CONFIGURED = readControlCenterConfig({
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
});

interface QueryResult {
  data: unknown[] | null;
  error: unknown;
}

function chainFor(result: QueryResult, calls?: string[]) {
  const chain: Record<string, unknown> = {
    select: () => chain,
    gte: () => chain,
    lte: () => chain,
    order: () => chain,
    limit: (v: number) => {
      calls?.push(`limit:${v}`);
      return Promise.resolve(result);
    },
    not: () => chain,
    eq: () => chain,
    in: () => chain,
    range: () => Promise.resolve(result),
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

describe('social growth coverage', () => {
  it('caches the growth read and supports forced refresh', async () => {
    const createSupabaseClient = factory([
      { data: [], error: null },
      { data: [], error: null },
      { data: [], error: null },
      { data: [], error: null },
    ]);
    const spy = vi.fn(createSupabaseClient);
    const service = createSocialGrowthService({
      config: CONFIGURED,
      now: () => NOW,
      createSupabaseClient: spy as unknown as typeof createClient,
    });
    const first = await service.getSocialGrowth();
    const second = await service.getSocialGrowth();
    expect(first.status).toBe('ok');
    expect(second).toEqual(first);
    expect(spy).toHaveBeenCalledTimes(2);
    await service.getSocialGrowth(true);
    expect(spy).toHaveBeenCalledTimes(4);
  });

  it('maps a query failure to error while still resolving the waitlist', async () => {
    const response = await loadSocialGrowth({
      config: CONFIGURED,
      now: NOW,
      createSupabaseClient: factory([
        { data: null, error: { message: 'snapshots down' } },
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
      ]),
    });
    expect(response.status).toBe('error');
    expect(response.message).toBe('snapshots down');
    expect(response.platforms).toEqual([]);
  });

  it('returns null deltas without snapshots and filters empty platforms', async () => {
    const response = await loadSocialGrowth({
      config: CONFIGURED,
      now: NOW,
      createSupabaseClient: factory([
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
      ]),
    });
    expect(response.status).toBe('ok');
    expect(response.platforms).toEqual([]);
    expect(response.attribution).toEqual([]);
    expect(response.experiments).toEqual([]);
  });

  it('keeps only the most recent intervals per platform', async () => {
    const snapshots = Array.from({ length: 12 }, (_, i) => ({
      platform: 'x',
      captured_at: `2026-08-${String(i + 1).padStart(2, '0')}T12:00:00.000Z`,
      followers: 100 + i,
    }));
    const posts = [
      {
        id: 'p1',
        episode_id: 'ep-1',
        platform: 'x',
        language_code: 'en',
        published_at: '2026-08-29T00:00:00.000Z',
        content_features: null,
        experiment_key: null,
        experiment_variant: null,
      },
    ];
    const response = await loadSocialGrowth({
      config: CONFIGURED,
      now: NOW,
      createSupabaseClient: factory([
        { data: snapshots, error: null },
        { data: posts, error: null },
        { data: [], error: null },
        { data: [], error: null },
      ]),
    });
    const xIntervals = response.attribution.filter(
      (row) => row.platform === 'x',
    );
    expect(xIntervals.length).toBeLessThanOrEqual(10);
  });

  it('ignores packaging experiments with malformed shapes', async () => {
    const posts = [
      {
        id: 'p1',
        episode_id: 'ep-1',
        platform: 'x',
        language_code: 'en',
        published_at: '2026-08-29T00:00:00.000Z',
        content_features: 'nope',
        experiment_key: null,
        experiment_variant: null,
      },
      {
        id: 'p2',
        episode_id: 'ep-1',
        platform: 'x',
        language_code: 'en',
        published_at: '2026-08-29T00:00:00.000Z',
        content_features: { packagingExperiment: { key: 42 } },
        experiment_key: null,
        experiment_variant: null,
      },
      {
        id: 'p3',
        episode_id: 'ep-1',
        platform: 'x',
        language_code: 'en',
        published_at: '2026-08-29T00:00:00.000Z',
        content_features: {
          packagingExperiment: { key: 'pack-1', variant: 'a' },
        },
        experiment_key: null,
        experiment_variant: null,
      },
    ];
    const response = await loadSocialGrowth({
      config: CONFIGURED,
      now: NOW,
      createSupabaseClient: factory([
        { data: [], error: null },
        { data: posts, error: null },
        { data: [], error: null },
        { data: [], error: null },
      ]),
    });
    expect(response.experiments.map((e) => e.experimentKey)).toEqual([
      'pack-1',
    ]);
    expect(response.experiments[0]?.status).toBe('collecting');
  });
});
