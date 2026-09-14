import { describe, expect, it, vi } from 'vitest';

import { UsageNotMeasurableError } from '../errors.js';
import { resolvePricingRate, type CostPricingRate } from '../pricing.js';
import { currentUtcPeriod, projectMonthEnd, roundUsd } from '../time.js';
import { fetchBraveCostSnapshot } from './brave.js';
import { fetchDeBankCostSnapshot } from './debank.js';
import { createFixedMonthlyCostSnapshot } from './fixed.js';
import { normalizeNonNegative, roundUsageUsd } from './numbers.js';
import { fetchOpenRouterCostSnapshot } from './openrouter.js';

const NOW = new Date('2026-09-01T00:00:00.000Z');
const jsonResponse = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status });
const braveResponse = (headers: Record<string, string>, status = 200) =>
  new Response('{}', { status, headers });
const openRouterPayload = {
  data: {
    usage: 2,
    usage_daily: 1,
    usage_weekly: 2,
    usage_monthly: 2,
    limit: 100,
    limit_remaining: null,
  },
};

describe('numeric and error boundaries', () => {
  it.each([undefined, Number.NaN, Number.POSITIVE_INFINITY, -1])(
    'normalizes %s to unknown',
    (value) => expect(normalizeNonNegative(value)).toBeNull(),
  );

  it('preserves zero, rounds both signs, and names authored errors', () => {
    expect(normalizeNonNegative(0)).toBe(0);
    expect(normalizeNonNegative(1.25)).toBe(1.25);
    expect(roundUsageUsd(1.23456789)).toBe(1.234568);
    expect(roundUsageUsd(-1.23456789)).toBe(-1.234568);
    expect(roundUsd(1.005)).toBe(1);
    expect(roundUsd(-1.236)).toBe(-1.24);
    const error = new UsageNotMeasurableError('quota unavailable');
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('UsageNotMeasurableError');
    expect(error.message).toBe('quota unavailable');
  });
});

describe('time and pricing seams', () => {
  it('uses UTC boundaries across local offsets and clamps the first hour', () => {
    expect(currentUtcPeriod(new Date('2026-08-31T23:59:59.999-07:00'))).toEqual(
      {
        periodStart: '2026-09-01T00:00:00.000Z',
        periodEnd: '2026-09-01T06:59:59.999Z',
      },
    );
    expect(projectMonthEnd(1, NOW)).toBe(720);
  });

  it('treats effective-from as inclusive, effective-to as exclusive', () => {
    const rates: CostPricingRate[] = [
      {
        id: 'older-overlap',
        provider: 'debank',
        metricKey: 'unit',
        unit: 'request',
        priceUsd: 1,
        effectiveFrom: '2026-01-01T00:00:00.000Z',
        effectiveTo: null,
      },
      {
        id: 'newer-overlap',
        provider: 'debank',
        metricKey: 'unit',
        unit: 'request',
        priceUsd: 2,
        effectiveFrom: '2026-09-01T00:00:00.000Z',
        effectiveTo: '2026-10-01T00:00:00.000Z',
      },
    ];
    expect(
      resolvePricingRate(rates, {
        provider: 'debank',
        metricKey: 'unit',
        at: NOW,
      })?.id,
    ).toBe('newer-overlap');
    expect(
      resolvePricingRate(rates, {
        provider: 'debank',
        metricKey: 'unit',
        at: new Date('2026-10-01T00:00:00.000Z'),
      })?.id,
    ).toBe('older-overlap');
    expect(
      resolvePricingRate(rates, {
        provider: 'brave',
        metricKey: 'unit',
        at: NOW,
      }),
    ).toBeNull();
  });
});

describe('fixed provider validation', () => {
  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid monthly cost %s',
    (monthlyCostUsd) => {
      expect(() =>
        createFixedMonthlyCostSnapshot({
          provider: 'fly',
          monthlyCostUsd,
          now: NOW,
        }),
      ).toThrow('Fixed monthly cost must be a non-negative number');
    },
  );

  it('accepts zero and a custom label', () => {
    expect(
      createFixedMonthlyCostSnapshot({
        provider: 'fly',
        monthlyCostUsd: 0,
        usageLabel: 'Free tier',
        now: NOW,
      }),
    ).toMatchObject({
      accruedCostUsd: 0,
      projectedCostUsd: 0,
      fetchedAt: NOW.toISOString(),
      usage: [{ label: 'Free tier', value: 0 }],
    });
  });
});

describe('DeBank failures and boundaries', () => {
  it('rejects non-success and malformed success responses', async () => {
    await expect(
      fetchDeBankCostSnapshot({
        apiKey: 'key',
        fetch: vi.fn().mockResolvedValue(jsonResponse({}, 401)),
        now: NOW,
      }),
    ).rejects.toThrow('DeBank units request failed (401)');
    await expect(
      fetchDeBankCostSnapshot({
        apiKey: 'key',
        fetch: vi.fn().mockResolvedValue(
          jsonResponse({
            balance: 1,
            stats: [{ usage: -1, remains: 1, date: '2026-09-01' }],
          }),
        ),
        now: NOW,
      }),
    ).rejects.toThrow();
  });

  it('filters other months, defaults missing today, and accepts zero price', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      jsonResponse({
        balance: 9,
        stats: [
          { usage: 3, remains: 9, date: '2026-08-31' },
          { usage: 4, remains: 9, date: '2026-09-02' },
        ],
      }),
    );
    const snapshot = await fetchDeBankCostSnapshot({
      apiKey: 'key',
      unitCostUsd: 0,
      fetch: fetcher,
      baseUrl: 'https://debank.example/v1',
      now: NOW,
    });
    expect(snapshot).toMatchObject({
      accruedCostUsd: 0,
      projectedCostUsd: 0,
      usage: [
        { key: 'monthly_units', value: 4 },
        { key: 'today_units', value: 0 },
        { key: 'remaining_units', value: 9 },
      ],
    });
    expect(fetcher).toHaveBeenCalledWith(
      'https://debank.example/v1/account/units',
      expect.objectContaining({
        headers: { AccessKey: 'key', accept: 'application/json' },
      }),
    );
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])(
    'keeps cost unknown for invalid unit cost %s',
    async (unitCostUsd) => {
      const snapshot = await fetchDeBankCostSnapshot({
        apiKey: 'key',
        unitCostUsd,
        fetch: vi
          .fn()
          .mockResolvedValue(jsonResponse({ balance: 1, stats: [] })),
        now: NOW,
      });
      expect(snapshot.accruedCostUsd).toBeNull();
      expect(snapshot.projectedCostUsd).toBeNull();
    },
  );
});

describe('OpenRouter failures and optional usage', () => {
  it('rejects non-success and schema-invalid responses', async () => {
    await expect(
      fetchOpenRouterCostSnapshot({
        apiKey: 'key',
        fetch: vi.fn().mockResolvedValue(jsonResponse({}, 503)),
        now: NOW,
      }),
    ).rejects.toThrow('OpenRouter usage request failed (503)');
    await expect(
      fetchOpenRouterCostSnapshot({
        apiKey: 'key',
        fetch: vi.fn().mockResolvedValue(
          jsonResponse({
            data: { ...openRouterPayload.data, usage_monthly: -1 },
          }),
        ),
        now: NOW,
      }),
    ).rejects.toThrow();
  });

  it('omits null remaining limit and honors custom base URL', async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse(openRouterPayload));
    const snapshot = await fetchOpenRouterCostSnapshot({
      apiKey: 'secret',
      fetch: fetcher,
      baseUrl: 'https://router.example/api',
      now: NOW,
    });
    expect(snapshot.usage.map((item) => item.key)).toEqual([
      'daily',
      'weekly',
      'monthly',
    ]);
    expect(fetcher).toHaveBeenCalledWith(
      'https://router.example/api/key',
      expect.objectContaining({ headers: { Authorization: 'Bearer secret' } }),
    );
  });
});

describe('Brave retry and quota boundaries', () => {
  const minimumWindow = {
    'x-ratelimit-limit': '10',
    'x-ratelimit-policy': '10;w=86400',
    'x-ratelimit-remaining': '11',
  };
  const requestBraveQuota = (
    fetch: NonNullable<Parameters<typeof fetchBraveCostSnapshot>[0]['fetch']>,
    sleep: NonNullable<Parameters<typeof fetchBraveCostSnapshot>[0]['sleep']>,
  ) => fetchBraveCostSnapshot({ apiKey: 'key', fetch, sleep, now: NOW });

  it('does not retry non-retryable client errors', async () => {
    const fetcher = vi.fn().mockResolvedValue(braveResponse({}, 400));
    const sleep = vi.fn().mockResolvedValue(undefined);
    await expect(requestBraveQuota(fetcher, sleep)).rejects.toThrow(
      'Brave Search quota request failed (400)',
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('retries 408 and tolerates failed body cancellation', async () => {
    const cancel = vi.fn().mockRejectedValue(new Error('already closed'));
    const transient = {
      ok: false,
      status: 408,
      body: { cancel },
    } as unknown as Response;
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(transient)
      .mockResolvedValueOnce(braveResponse(minimumWindow));
    const sleep = vi.fn().mockResolvedValue(undefined);
    const snapshot = await fetchBraveCostSnapshot({
      apiKey: 'key',
      unitCostUsd: 1,
      fetch: fetcher,
      sleep,
      now: NOW,
    });
    expect(snapshot.usage).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'monthly_requests', value: 0 }),
      ]),
    );
    expect(cancel).toHaveBeenCalledOnce();
    expect(sleep).toHaveBeenCalledWith(250);
  });

  it('reports non-Error transport failures after bounded retries', async () => {
    const fetcher = vi.fn().mockRejectedValue('offline');
    const sleep = vi.fn().mockResolvedValue(undefined);
    await expect(requestBraveQuota(fetcher, sleep)).rejects.toThrow(
      'Brave Search quota request failed after 3 attempts: offline',
    );
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls).toEqual([[250], [500]]);
  });

  it('accepts minimum long window, clamps used, and omits missing reset', async () => {
    const snapshot = await fetchBraveCostSnapshot({
      apiKey: 'key',
      unitCostUsd: 0.5,
      monthlyFreeCreditUsd: 0,
      fetch: vi.fn().mockResolvedValue(braveResponse(minimumWindow)),
      now: NOW,
    });
    expect(snapshot.accruedCostUsd).toBe(0);
    expect(snapshot.usage.map((item) => item.key)).not.toContain(
      'quota_reset_seconds',
    );
    expect(snapshot.usage).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'monthly_free_credit_usd', value: 0 }),
        expect.objectContaining({ key: 'estimated_billed_usd', value: 0 }),
      ]),
    );
  });

  it.each([
    ['missing policy', {}],
    [
      'window below one day',
      {
        'x-ratelimit-policy': '10;w=86399',
      },
    ],
  ])('degrades a successful %s response', async (_label, headers) => {
    await expect(
      fetchBraveCostSnapshot({
        apiKey: 'key',
        fetch: vi.fn().mockResolvedValue(
          braveResponse({
            'x-ratelimit-limit': '10',
            'x-ratelimit-remaining': '9',
            ...headers,
          }),
        ),
        now: NOW,
      }),
    ).rejects.toBeInstanceOf(UsageNotMeasurableError);
  });

  it('defaults invalid credit and omits cost metrics for unknown price', async () => {
    const headers = {
      'x-ratelimit-limit': '100',
      'x-ratelimit-policy': '100;w=2592000',
      'x-ratelimit-remaining': '88',
    };
    const unknown = await fetchBraveCostSnapshot({
      apiKey: 'key',
      unitCostUsd: Number.POSITIVE_INFINITY,
      fetch: vi.fn().mockResolvedValue(braveResponse(headers)),
      now: NOW,
    });
    expect(unknown.accruedCostUsd).toBeNull();
    expect(unknown.projectedCostUsd).toBeNull();
    expect(unknown.usage.map((item) => item.key)).not.toContain(
      'gross_search_cost_usd',
    );

    const fallbackCredit = await fetchBraveCostSnapshot({
      apiKey: 'key',
      unitCostUsd: 0.5,
      monthlyFreeCreditUsd: -1,
      fetch: vi.fn().mockResolvedValue(braveResponse(headers)),
      now: NOW,
    });
    expect(fallbackCredit.usage).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'monthly_free_credit_usd', value: 5 }),
        expect.objectContaining({ key: 'estimated_billed_usd', value: 1 }),
      ]),
    );
  });
});
