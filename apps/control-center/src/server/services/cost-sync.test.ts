import { describe, expect, it, vi } from 'vitest';

import { readControlCenterConfig } from '../config/env.js';
import type { CostRepository } from './cost-repository.js';
import { syncCosts } from './cost-sync.js';

describe('syncCosts', () => {
  it('persists healthy providers when another provider fetch fails', async () => {
    const upsertSnapshot = vi.fn().mockResolvedValue(undefined);
    const repository: CostRepository = {
      loadPricingRates: vi.fn().mockResolvedValue([
        {
          id: 'debank-rate',
          provider: 'debank',
          metricKey: 'api_unit',
          unit: 'unit',
          priceUsd: 0.0002,
          effectiveFrom: '2026-08-01T00:00:00.000Z',
          effectiveTo: null,
        },
        {
          id: 'supabase-rate',
          provider: 'supabase',
          metricKey: 'pro_plan',
          unit: 'month',
          priceUsd: 25,
          effectiveFrom: '2026-08-01T00:00:00.000Z',
          effectiveTo: null,
        },
      ]),
      upsertSnapshot,
      loadLatestProviders: vi.fn().mockResolvedValue([]),
      loadHistory: vi.fn(),
      insertTransaction: vi.fn(),
      upsertManualSnapshot: vi.fn(),
    };
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('openrouter')) {
        return new Response('nope', { status: 500 });
      }
      return new Response(
        JSON.stringify({
          balance: 500_000,
          stats: [{ usage: 14_405, remains: 500_000, date: '2026-08-22' }],
        }),
      );
    });

    const result = await syncCosts({
      config: readControlCenterConfig({
        OPENROUTER_API_KEY: 'openrouter-key',
        DEBANK_API_KEY: 'debank-key',
      }),
      repository,
      fetch: fetcher,
      now: new Date('2026-08-22T12:00:00.000Z'),
    });

    expect(result.persisted).toBe(2);
    expect(result.providers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ provider: 'openrouter', status: 'error' }),
        expect.objectContaining({
          provider: 'debank',
          status: 'persisted',
          accruedCostUsd: 2.881,
        }),
        expect.objectContaining({
          provider: 'supabase',
          status: 'persisted',
          accruedCostUsd: 25,
        }),
      ]),
    );
    expect(upsertSnapshot).toHaveBeenCalledTimes(2);
  });

  it('carries a current-month manual Fly estimate into the daily snapshot', async () => {
    const upsertSnapshot = vi.fn().mockResolvedValue(undefined);
    const repository: CostRepository = {
      loadPricingRates: vi.fn().mockResolvedValue([]),
      upsertSnapshot,
      loadLatestProviders: vi.fn().mockResolvedValue([
        {
          provider: 'fly',
          label: 'Fly.io',
          status: 'ok',
          costType: 'estimated',
          message: null,
          snapshot: {
            provider: 'fly',
            periodStart: '2026-08-01T00:00:00.000Z',
            periodEnd: '2026-08-20T12:00:00.000Z',
            usage: [],
            accruedCostUsd: 18.43,
            projectedCostUsd: 18.43,
            costType: 'estimated',
            source: 'manual',
            fetchedAt: '2026-08-20T12:00:00.000Z',
          },
        },
      ]),
      loadHistory: vi.fn(),
      insertTransaction: vi.fn(),
      upsertManualSnapshot: vi.fn(),
    };

    const result = await syncCosts({
      config: readControlCenterConfig({}),
      repository,
      now: new Date('2026-08-22T12:00:00.000Z'),
    });

    expect(result.providers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider: 'fly',
          status: 'persisted',
          accruedCostUsd: 18.43,
        }),
      ]),
    );
    expect(upsertSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'fly',
        fetchedAt: '2026-08-22T12:00:00.000Z',
      }),
      null,
    );
  });
});
