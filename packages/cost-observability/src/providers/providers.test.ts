import { describe, expect, it, vi } from 'vitest';

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

  it('keeps DeBank USD cost unknown without an explicit unit price', async () => {
    const fetcher = createDeBankFetcher([
      { usage: 1_320, remains: 510_200, date: '2026-08-16' },
      { usage: 900, remains: 511_520, date: '2026-08-15' },
      { usage: 400, remains: 512_420, date: '2026-07-31' },
    ]);

    const snapshot = await fetchDeBankCostSnapshot({
      apiKey: 'test-key',
      fetch: fetcher,
      now: new Date('2026-08-16T00:00:00.000Z'),
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
