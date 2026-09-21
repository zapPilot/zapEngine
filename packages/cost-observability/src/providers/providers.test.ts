import { describe, expect, it, vi } from 'vitest';

import { UsageNotMeasurableError } from '../errors.js';
import { fetchBraveCostSnapshot } from './brave.js';
import { fetchDeBankCostSnapshot } from './debank.js';
import { createFixedMonthlyCostSnapshot } from './fixed.js';
import { fetchOpenRouterCostSnapshot } from './openrouter.js';
import {
  CLOUDFLARE_R2_ROWS,
  cloudflareRow,
  cloudflareUsageResponse,
  createOpenRouterKeyFetcher,
  expectBraveSearchAuthCall,
  fetchCloudflareUsageSnapshot,
} from './test-helpers.js';

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
  return createOpenRouterKeyFetcher({ usage: usageMonthly });
}

function braveQuotaResponse(status = 200) {
  return new Response(JSON.stringify({ results: [] }), {
    status,
    headers:
      status >= 200 && status < 300
        ? {
            'x-ratelimit-limit': '50, 15000',
            'x-ratelimit-policy': '50;w=1, 15000;w=2592000',
            'x-ratelimit-remaining': '49, 14000',
            'x-ratelimit-reset': '1, 1234567',
          }
        : undefined,
  });
}

import type { FetchLike } from '../types.js';

async function expectBraveRetrySnapshot(
  fetcher: FetchLike,
  expectedCalls: number,
  expectedSleeps: number[][],
) {
  const sleep = vi.fn().mockResolvedValue(undefined);

  const snapshot = await fetchBraveCostSnapshot({
    apiKey: 'brave-key',
    unitCostUsd: 5 / 1_000,
    fetch: fetcher,
    sleep,
  });

  expect(snapshot.accruedCostUsd).toBe(5);
  expect(fetcher).toHaveBeenCalledTimes(expectedCalls);
  expect(sleep.mock.calls).toEqual(expectedSleeps);
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
    const fetcher = vi.fn().mockResolvedValue(braveQuotaResponse());

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
    expectBraveSearchAuthCall(fetcher, 'count=1');
  });

  it('retries a transient Brave network failure before reading quota', async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(braveQuotaResponse());

    await expectBraveRetrySnapshot(fetcher, 2, [[250]]);
  });

  it('retries Brave 429 and 5xx responses with bounded backoff', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(braveQuotaResponse(503))
      .mockResolvedValueOnce(braveQuotaResponse(429))
      .mockResolvedValueOnce(braveQuotaResponse());

    await expectBraveRetrySnapshot(fetcher, 3, [[250], [500]]);
  });

  it('surfaces the final Brave transport failure after bounded retries', async () => {
    const fetcher = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(
      fetchBraveCostSnapshot({
        apiKey: 'brave-key',
        fetch: fetcher,
        sleep,
      }),
    ).rejects.toThrow(
      'Brave Search quota request failed after 3 attempts: fetch failed',
    );

    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls).toEqual([[250], [500]]);
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

  // Captured from the live account on 2026-09-11, the day this turned the
  // nightly sync red: the per-second window still works, the monthly one
  // reports no allowance at all.
  it('degrades Brave to not-measurable when the monthly window reports a zero limit', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ results: [] }), {
        headers: {
          'x-ratelimit-limit': '50, 0',
          'x-ratelimit-policy': '50;w=1, 0;w=2592000',
          'x-ratelimit-remaining': '49, 0',
          'x-ratelimit-reset': '1, 1703577',
        },
      }),
    );

    await expect(
      fetchBraveCostSnapshot({
        apiKey: 'brave-key',
        unitCostUsd: 0.0005,
        fetch: fetcher,
      }),
    ).rejects.toBeInstanceOf(UsageNotMeasurableError);
  });

  // The zero-limit degradation must not swallow a header we cannot read at
  // all: that is a Brave change we are meant to notice and fix.
  it('still fails Brave collection when the monthly limit is unreadable', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ results: [] }), {
        headers: {
          'x-ratelimit-limit': '50, not-a-number',
          'x-ratelimit-policy': '50;w=1, 15000;w=2592000',
          'x-ratelimit-remaining': '49, 14000',
          'x-ratelimit-reset': '1, 1234567',
        },
      }),
    );

    const failure = fetchBraveCostSnapshot({
      apiKey: 'brave-key',
      unitCostUsd: 0.0005,
      fetch: fetcher,
    });
    await expect(failure).rejects.toThrow(
      'Brave Search monthly quota is not measurable',
    );
    await expect(failure).rejects.not.toBeInstanceOf(UsageNotMeasurableError);
  });

  // A response that only exposes a short rate-limit window carries no
  // monthly quota to read at all — structurally unmeasurable, not a failure.
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

    const failure = fetchBraveCostSnapshot({
      apiKey: 'brave-key',
      unitCostUsd: 5 / 1_000,
      fetch: fetcher,
    });
    await expect(failure).rejects.toThrow(
      'Brave Search monthly quota window is not measurable',
    );
    await expect(failure).rejects.toBeInstanceOf(UsageNotMeasurableError);
  });

  it('sums Cloudflare charge rows into an actual monthly snapshot', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(cloudflareUsageResponse(CLOUDFLARE_R2_ROWS));

    const snapshot = await fetchCloudflareUsageSnapshot(CLOUDFLARE_R2_ROWS, {
      fetch: fetcher,
    });

    expect(snapshot).toMatchObject({
      provider: 'cloudflare',
      accruedCostUsd: 0.017001,
      costType: 'actual',
      source: 'api',
      periodStart: '2026-09-01T00:00:00.000Z',
    });
    expect(snapshot.usage).toEqual([
      {
        key: 'charge_rows',
        label: 'Billed charge rows',
        unit: 'units',
        value: 6,
      },
      {
        key: 'list_cost_usd',
        label: 'List price before discounts',
        unit: 'usd',
        value: 0.017001,
      },
      {
        key: 'product_families',
        label: 'Billed product families',
        unit: 'units',
        value: 1,
      },
      {
        key: 'metric_r2_class_a_operations',
        label: 'R2 Class A Operations (operations)',
        unit: 'units',
        value: 3_600,
      },
      {
        key: 'metric_r2_standard_storage',
        label: 'R2 Standard Storage (GB-hours)',
        unit: 'units',
        value: 39,
      },
    ]);
    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.href).toBe(
      'https://api.cloudflare.com/client/v4/accounts/acct-1/billable/usage?from=2026-09-01&to=2026-09-04',
    );
    expect(init.headers).toEqual({
      accept: 'application/json',
      authorization: 'Bearer cf-token',
    });
  });

  it.each([
    [undefined, 320],
    [9.2, 19.13],
  ])(
    'damps the Cloudflare projection with prior month %s',
    async (priorMonthTotalUsd, expected) => {
      const snapshot = await fetchCloudflareUsageSnapshot(
        [cloudflareRow({ EffectiveCost: 2, ListCost: 2 })],
        {
          now: new Date('2026-09-01T04:30:00.000Z'),
          priorMonthTotalUsd,
        },
      );

      expect(snapshot.projectedCostUsd).toBeCloseTo(expected, 2);
    },
  );

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
