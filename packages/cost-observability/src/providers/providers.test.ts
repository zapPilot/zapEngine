import { describe, expect, it, vi } from 'vitest';

import { fetchBraveCostSnapshot } from './brave.js';
import { fetchDeBankCostSnapshot } from './debank.js';
import { createFixedMonthlyCostSnapshot } from './fixed.js';
import { fetchOpenRouterCostSnapshot } from './openrouter.js';

function createDeBankFetcher(
  stats: Array<{ usage: number; remains: number; date: string }>,
) {
  return vi
    .fn()
    .mockResolvedValue(
      new Response(JSON.stringify({ balance: 510_200, stats })),
    );
}

function createOpenRouterFetcher(usageMonthly: number) {
  return vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        data: {
          usage: usageMonthly,
          usage_daily: usageMonthly,
          usage_weekly: usageMonthly,
          usage_monthly: usageMonthly,
          limit: 100,
          limit_remaining: null,
        },
      }),
    ),
  );
}

describe('cost providers', () => {
  it('normalizes OpenRouter monthly usage as actual cost', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            usage: 12.83,
            usage_daily: 0.48,
            usage_weekly: 3.2,
            usage_monthly: 12.83,
            limit: 100,
            limit_remaining: 87.17,
          },
        }),
      ),
    );

    const snapshot = await fetchOpenRouterCostSnapshot({
      apiKey: 'test-key',
      fetch: fetcher,
      now: new Date('2026-08-16T00:00:00.000Z'),
    });

    expect(snapshot).toMatchObject({
      provider: 'openrouter',
      accruedCostUsd: 12.83,
      costType: 'actual',
      periodStart: '2026-08-01T00:00:00.000Z',
    });
    expect(snapshot.projectedCostUsd).toBeCloseTo(26.52, 2);
    expect(fetcher).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/key',
      expect.objectContaining({
        headers: { Authorization: 'Bearer test-key' },
      }),
    );
  });

  it('damps the OpenRouter projection with the prior month total', async () => {
    const earlyMonth = new Date('2026-09-01T04:30:00.000Z');

    const withoutPrior = await fetchOpenRouterCostSnapshot({
      apiKey: 'test-key',
      fetch: createOpenRouterFetcher(2),
      now: earlyMonth,
    });
    const withPrior = await fetchOpenRouterCostSnapshot({
      apiKey: 'test-key',
      fetch: createOpenRouterFetcher(2),
      now: earlyMonth,
      priorMonthTotalUsd: 9.2,
    });

    expect(withoutPrior.projectedCostUsd).toBe(320);
    expect(withPrior.projectedCostUsd).toBeCloseTo(19.13, 2);
  });

  it('derives Brave monthly usage and gross cost from rate-limit headers', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ results: [] }), {
        headers: {
          'x-ratelimit-limit': '50, 15000',
          'x-ratelimit-policy': '50;w=1, 15000;w=2592000',
          'x-ratelimit-remaining': '49, 14000',
          'x-ratelimit-reset': '1, 1234567',
        },
      }),
    );

    const snapshot = await fetchBraveCostSnapshot({
      apiKey: 'brave-key',
      unitCostUsd: 5 / 1_000,
      fetch: fetcher,
      now: new Date('2026-09-16T00:00:00.000Z'),
    });

    expect(snapshot).toMatchObject({
      provider: 'brave',
      accruedCostUsd: 5,
      costType: 'list-price-equivalent',
      periodStart: '2026-09-01T00:00:00.000Z',
    });
    expect(snapshot.usage).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'monthly_requests', value: 1_000 }),
        expect.objectContaining({ key: 'remaining_requests', value: 14_000 }),
        expect.objectContaining({
          key: 'monthly_request_limit',
          value: 15_000,
        }),
        expect.objectContaining({
          key: 'quota_reset_seconds',
          value: 1_234_567,
        }),
        expect.objectContaining({ key: 'gross_search_cost_usd', value: 5 }),
        expect.objectContaining({ key: 'monthly_free_credit_usd', value: 5 }),
        expect.objectContaining({ key: 'estimated_billed_usd', value: 0 }),
      ]),
    );
    expect(fetcher).toHaveBeenCalledWith(
      expect.objectContaining({
        href: expect.stringContaining('count=1'),
      }),
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-subscription-token': 'brave-key',
        }),
      }),
    );
  });

  it('fails Brave collection instead of guessing when quota headers are absent', async () => {
    await expect(
      fetchBraveCostSnapshot({
        apiKey: 'brave-key',
        unitCostUsd: 5 / 1_000,
        fetch: vi.fn().mockResolvedValue(new Response('{}')),
      }),
    ).rejects.toThrow('Brave Search quota headers missing');
  });

  it('rejects a Brave response that only exposes a short rate-limit window', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response('{}', {
        headers: {
          'x-ratelimit-limit': '1',
          'x-ratelimit-policy': '1;w=1',
          'x-ratelimit-remaining': '0',
          'x-ratelimit-reset': '1',
        },
      }),
    );

    await expect(
      fetchBraveCostSnapshot({
        apiKey: 'brave-key',
        unitCostUsd: 5 / 1_000,
        fetch: fetcher,
      }),
    ).rejects.toThrow('Brave Search long-term quota window is not measurable');
  });

  it('keeps DeBank USD cost unknown without a unit price, prior month or not', async () => {
    const fetcher = createDeBankFetcher([
      { usage: 1_320, remains: 510_200, date: '2026-08-16' },
      { usage: 900, remains: 511_520, date: '2026-08-15' },
      { usage: 400, remains: 512_420, date: '2026-07-31' },
    ]);

    const snapshot = await fetchDeBankCostSnapshot({
      apiKey: 'test-key',
      fetch: fetcher,
      now: new Date('2026-08-16T00:00:00.000Z'),
      priorMonthTotalUsd: 12.5,
    });

    expect(snapshot).toMatchObject({
      provider: 'debank',
      accruedCostUsd: null,
      projectedCostUsd: null,
      costType: 'list-price-equivalent',
    });
    expect(snapshot.usage).toEqual([
      expect.objectContaining({ key: 'monthly_units', value: 2_220 }),
      expect.objectContaining({ key: 'today_units', value: 1_320 }),
      expect.objectContaining({ key: 'remaining_units', value: 510_200 }),
    ]);
  });

  it('calculates DeBank list-price equivalent from the supplied pricing rate', async () => {
    const fetcher = createDeBankFetcher([
      { usage: 14_405, remains: 510_200, date: '2026-08-16' },
    ]);

    const snapshot = await fetchDeBankCostSnapshot({
      apiKey: 'test-key',
      unitCostUsd: 200 / 1_000_000,
      fetch: fetcher,
      now: new Date('2026-08-16T00:00:00.000Z'),
    });

    expect(snapshot.accruedCostUsd).toBe(2.881);
  });

  it('damps the DeBank projection with the prior month total', async () => {
    const earlyMonth = new Date('2026-09-01T04:30:00.000Z');
    const stats = [{ usage: 14_405, remains: 510_200, date: '2026-09-01' }];

    const withoutPrior = await fetchDeBankCostSnapshot({
      apiKey: 'test-key',
      unitCostUsd: 200 / 1_000_000,
      fetch: createDeBankFetcher(stats),
      now: earlyMonth,
    });
    const withPrior = await fetchDeBankCostSnapshot({
      apiKey: 'test-key',
      unitCostUsd: 200 / 1_000_000,
      fetch: createDeBankFetcher(stats),
      now: earlyMonth,
      priorMonthTotalUsd: 3,
    });

    expect(withoutPrior.projectedCostUsd).toBeCloseTo(460.96, 2);
    expect(withPrior.projectedCostUsd).toBeCloseTo(17.96, 2);
  });

  it('keeps a fixed monthly plan constant for accrued and projected cost', () => {
    const snapshot = createFixedMonthlyCostSnapshot({
      provider: 'supabase',
      monthlyCostUsd: 25,
      now: new Date('2026-08-22T12:00:00.000Z'),
    });

    expect(snapshot).toMatchObject({
      provider: 'supabase',
      accruedCostUsd: 25,
      projectedCostUsd: 25,
      costType: 'fixed',
      source: 'fixed',
    });
  });
});
