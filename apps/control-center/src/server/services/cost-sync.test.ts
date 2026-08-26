import { describe, expect, it, vi } from 'vitest';

import { readControlCenterConfig } from '../config/env.js';
import type { CostRepository } from './cost-repository.js';
import { degradedProviders, syncCosts } from './cost-sync.js';
import { fetchFlyRunRateSnapshot } from './fly.js';

vi.mock('./fly.js', () => ({ fetchFlyRunRateSnapshot: vi.fn() }));

const NOW = new Date('2026-08-22T12:00:00.000Z');
const VENDOR_KEYS = {
  OPENROUTER_API_KEY: 'openrouter-key',
  DEBANK_API_KEY: 'debank-key',
};
const PRICING_RATES = [
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
];

function createRepository(
  overrides: Partial<CostRepository> = {},
): CostRepository {
  return {
    loadPricingRates: vi.fn().mockResolvedValue(PRICING_RATES),
    upsertSnapshot: vi.fn().mockResolvedValue(undefined),
    loadLatestProviders: vi.fn().mockResolvedValue([]),
    loadHistory: vi.fn(),
    insertTransaction: vi.fn(),
    upsertManualSnapshot: vi.fn(),
    ...overrides,
  };
}

function openRouterOk() {
  return new Response(
    JSON.stringify({
      data: {
        usage: 0.44,
        usage_daily: 0.02,
        usage_weekly: 0.11,
        usage_monthly: 0.44,
        limit: null,
        limit_remaining: null,
      },
    }),
  );
}

function deBankOk() {
  return new Response(
    JSON.stringify({
      balance: 500_000,
      stats: [{ usage: 14_405, remains: 500_000, date: '2026-08-22' }],
    }),
  );
}

function createFetcher(overrides: { openrouter?: () => Response } = {}) {
  const openrouter = overrides.openrouter ?? openRouterOk;
  return vi.fn(async (input: string | URL | Request) =>
    String(input).includes('openrouter') ? openrouter() : deBankOk(),
  );
}

describe('syncCosts', () => {
  it('persists healthy providers when another provider fetch fails', async () => {
    const upsertSnapshot = vi.fn().mockResolvedValue(undefined);
    const result = await syncCosts({
      config: readControlCenterConfig(VENDOR_KEYS),
      repository: createRepository({ upsertSnapshot }),
      fetch: createFetcher({
        openrouter: () => new Response('nope', { status: 500 }),
      }),
      now: NOW,
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
    expect(degradedProviders(result).map((provider) => provider.label)).toEqual(
      ['OpenRouter'],
    );
  });

  it('carries a current-month manual Fly estimate into the daily snapshot', async () => {
    const upsertSnapshot = vi.fn().mockResolvedValue(undefined);
    const repository = createRepository({
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
    });

    const result = await syncCosts({
      config: readControlCenterConfig({}),
      repository,
      now: NOW,
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

  it('reports no degradation while Fly.io sits in manual mode', async () => {
    const result = await syncCosts({
      config: readControlCenterConfig(VENDOR_KEYS),
      repository: createRepository(),
      fetch: createFetcher(),
      now: NOW,
    });

    expect(result.persisted).toBe(3);
    expect(degradedProviders(result)).toEqual([]);
    expect(result.providers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider: 'fly',
          status: 'skipped',
          expected: false,
          message: 'Not connected',
        }),
      ]),
    );
  });

  it('reports a missing vendor key as degraded even though other providers persisted', async () => {
    const result = await syncCosts({
      config: readControlCenterConfig({
        OPENROUTER_API_KEY: 'openrouter-key',
      }),
      repository: createRepository(),
      fetch: createFetcher(),
      now: NOW,
    });

    expect(result.persisted).toBe(2);
    expect(degradedProviders(result)).toEqual([
      expect.objectContaining({
        provider: 'debank',
        status: 'skipped',
        expected: true,
      }),
    ]);
  });

  it('reports a vanished Supabase pro_plan rate as degraded', async () => {
    const result = await syncCosts({
      config: readControlCenterConfig(VENDOR_KEYS),
      repository: createRepository({
        loadPricingRates: vi.fn().mockResolvedValue([PRICING_RATES[0]]),
      }),
      fetch: createFetcher(),
      now: NOW,
    });

    expect(degradedProviders(result)).toEqual([
      expect.objectContaining({
        provider: 'supabase',
        status: 'skipped',
        expected: true,
      }),
    ]);
  });

  it('reports a failed Fly collection as degraded once FLY_COST_MODE is flyctl', async () => {
    vi.mocked(fetchFlyRunRateSnapshot).mockRejectedValue(
      new Error('flyctl is not authenticated'),
    );

    const result = await syncCosts({
      config: readControlCenterConfig({
        ...VENDOR_KEYS,
        FLY_COST_MODE: 'flyctl',
      }),
      repository: createRepository(),
      fetch: createFetcher(),
      now: NOW,
    });

    expect(degradedProviders(result)).toEqual([
      expect.objectContaining({
        provider: 'fly',
        status: 'error',
        expected: true,
      }),
    ]);
  });
});
