import type { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

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

function chainFor(result: QueryResult) {
  const chain: Record<string, unknown> = {
    select: () => chain,
    gte: () => chain,
    order: () => chain,
    limit: () => Promise.resolve(result),
    not: () => chain,
    eq: () => chain,
  };
  return chain;
}

function factory(results: QueryResult[]) {
  let metricsCall = 0;
  const client = {
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
      if (table === 'social_post_metrics') {
        return chainFor(
          results[2 + Math.min(metricsCall++, 1)] ?? { data: [], error: null },
        );
      }
      const index =
        table === 'social_account_snapshots'
          ? 0
          : table === 'social_posts'
            ? 1
            : 3;
      return chainFor(results[index] ?? { data: [], error: null });
    },
  };
  return (() => client) as unknown as typeof createClient;
}

describe('social growth coverage round 2', () => {
  it('picks the nearest baseline when several fall inside the tolerance', async () => {
    const response = await loadSocialGrowth({
      config: CONFIGURED,
      now: NOW,
      createSupabaseClient: factory([
        {
          data: [
            {
              platform: 'x',
              captured_at: '2026-08-29T11:00:00.000Z',
              followers: 90,
            },
            {
              platform: 'x',
              captured_at: '2026-08-29T12:30:00.000Z',
              followers: 95,
            },
            {
              platform: 'x',
              captured_at: '2026-08-30T12:00:00.000Z',
              followers: 104,
            },
          ],
          error: null,
        },
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
      ]),
    });
    expect(
      response.platforms.find((row) => row.platform === 'x')?.followersDelta24h,
    ).toBe(9);
  });

  it('ignores a non-object packagingExperiment value', async () => {
    const response = await loadSocialGrowth({
      config: CONFIGURED,
      now: NOW,
      createSupabaseClient: factory([
        { data: [], error: null },
        {
          data: [
            {
              id: 'p1',
              episode_id: 'ep-1',
              platform: 'x',
              language_code: 'en',
              published_at: '2026-08-29T00:00:00.000Z',
              content_features: { packagingExperiment: 'str' },
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
    expect(response.experiments).toEqual([]);
  });
});
