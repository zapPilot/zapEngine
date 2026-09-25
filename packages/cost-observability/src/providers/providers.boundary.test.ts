import { describe, expect, it, vi } from 'vitest';

import { UsageNotMeasurableError } from '../errors.js';
import * as costObservability from '../index.js';
import { resolvePricingRate, type CostPricingRate } from '../pricing.js';
import { currentUtcPeriod, projectMonthEnd, roundUsd } from '../time.js';
import { fetchBraveCostSnapshot } from './brave.js';
import { fetchCloudflareCostSnapshot } from './cloudflare.js';
import { fetchDeBankCostSnapshot } from './debank.js';
import { createFixedMonthlyCostSnapshot } from './fixed.js';
import { normalizeNonNegative, roundUsageUsd } from './numbers.js';
import { fetchOpenRouterCostSnapshot } from './openrouter.js';
import {
  cloudflareRow,
  cloudflareUsageResponse,
  expectDefaultCollectorCall,
  expectFreshZeroCostSnapshot,
  fetchCloudflareUsageSnapshot,
} from './test-helpers.js';

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
const LONG_WINDOW_HEADERS = {
  'x-ratelimit-limit': '100',
  'x-ratelimit-policy': '100;w=2592000',
  'x-ratelimit-remaining': '90',
  'x-ratelimit-reset': '123',
};

async function withGlobalFetch<T>(
  fetcher: typeof globalThis.fetch,
  callback: () => Promise<T>,
): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = fetcher;
  try {
    return await callback();
  } finally {
    globalThis.fetch = original;
  }
}

async function expectBraveQuotaFailure(
  headers: Record<string, string>,
): Promise<unknown> {
  try {
    await fetchBraveCostSnapshot({
      apiKey: 'key',
      fetch: vi.fn().mockResolvedValue(braveResponse(headers)),
      now: NOW,
    });
  } catch (error) {
    return error;
  }
  throw new Error('Expected Brave quota parsing to fail');
}

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
  const minimumMonthlyWindow = {
    'x-ratelimit-limit': '10',
    'x-ratelimit-policy': '10;w=2419200',
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
      .mockResolvedValueOnce(braveResponse(minimumMonthlyWindow));
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

  it('accepts the minimum monthly-class window, clamps used, and omits missing reset', async () => {
    const snapshot = await fetchBraveCostSnapshot({
      apiKey: 'key',
      unitCostUsd: 0.5,
      monthlyFreeCreditUsd: 0,
      fetch: vi.fn().mockResolvedValue(braveResponse(minimumMonthlyWindow)),
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
      'daily-only window',
      {
        'x-ratelimit-policy': '10;w=86400',
      },
    ],
    [
      'window below monthly class',
      {
        'x-ratelimit-policy': '10;w=2419199',
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

describe('Cloudflare failures and boundaries', () => {
  const costFallbacks: [string, Record<string, unknown>, number][] = [
    ['contracted', { EffectiveCost: null, ContractedCost: 0.5 }, 0.5],
    [
      'list',
      { EffectiveCost: null, ContractedCost: null, ListCost: 0.25 },
      0.25,
    ],
  ];
  const currencies: [string, Record<string, unknown>][] = [
    ['an explicit USD currency', { BillingCurrency: 'USD' }],
    ['a null currency', { BillingCurrency: null }],
    ['an absent currency', { BillingCurrency: undefined }],
  ];
  const rejections: [string, unknown[], string][] = [
    [
      'a coded rejection',
      [{ code: 10_000 }],
      'Cloudflare billable usage request was rejected (error code 10000)',
    ],
    [
      'an uncoded rejection',
      [],
      'Cloudflare billable usage request was rejected (no error code)',
    ],
  ];

  it('does not retry a rejected Cloudflare credential', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      cloudflareUsageResponse([], {
        status: 401,
        success: false,
        errors: [{ code: 10_000 }],
      }),
    );
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(
      fetchCloudflareUsageSnapshot([], { fetch: fetcher, sleep }),
    ).rejects.toThrow('Cloudflare billable usage request failed (401)');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('retries a transient Cloudflare failure and gives up after three', async () => {
    const recovering = vi
      .fn()
      .mockResolvedValueOnce(
        cloudflareUsageResponse([], { status: 503, success: false }),
      )
      .mockResolvedValueOnce(cloudflareUsageResponse([]));
    const sleep = vi.fn().mockResolvedValue(undefined);

    const snapshot = await fetchCloudflareUsageSnapshot([], {
      fetch: recovering,
      sleep,
    });
    expect(snapshot.accruedCostUsd).toBe(0);
    expect(sleep.mock.calls).toEqual([[250]]);

    await expect(
      fetchCloudflareUsageSnapshot([], {
        fetch: vi.fn().mockRejectedValue(new TypeError('fetch failed')),
        sleep: vi.fn().mockResolvedValue(undefined),
      }),
    ).rejects.toThrow(
      'Cloudflare billable usage request failed after 3 attempts: fetch failed',
    );
  });

  it.each(rejections)(
    'names %s by its account error code',
    async (_label, errors, message) => {
      await expect(
        fetchCloudflareUsageSnapshot([], {
          fetch: vi
            .fn()
            .mockResolvedValue(
              cloudflareUsageResponse([], { success: false, errors }),
            ),
        }),
      ).rejects.toThrow(message);
    },
  );

  // A payload we cannot parse is a Cloudflare change to notice, never a
  // vendor that stopped publishing a quantity.
  it('keeps a structurally broken Cloudflare payload a plain failure', async () => {
    const invalidRow = fetchCloudflareUsageSnapshot([
      cloudflareRow({ ServiceName: '' }),
    ]);
    await expect(invalidRow).rejects.toThrow();
    await expect(invalidRow).rejects.not.toBeInstanceOf(
      UsageNotMeasurableError,
    );

    const notJson = fetchCloudflareUsageSnapshot([], {
      fetch: vi.fn().mockResolvedValue(new Response('<html>502</html>')),
    });
    await expect(notJson).rejects.toThrow();
    await expect(notJson).rejects.not.toBeInstanceOf(UsageNotMeasurableError);
  });

  it.each(currencies)('accepts %s', async (_label, overrides) => {
    const snapshot = await fetchCloudflareUsageSnapshot([
      cloudflareRow(overrides),
    ]);

    expect(snapshot.accruedCostUsd).toBe(0.000257);
  });

  it('refuses to sum a non-USD Cloudflare bill into a dollar ledger', async () => {
    await expect(
      fetchCloudflareUsageSnapshot([cloudflareRow({ BillingCurrency: 'EUR' })]),
    ).rejects.toThrow(
      'Cloudflare billable usage reported a non-USD currency (EUR)',
    );
  });

  it.each(costFallbacks)(
    'falls back to the %s cost',
    async (_label, overrides, expected) => {
      const snapshot = await fetchCloudflareUsageSnapshot([
        cloudflareRow(overrides),
      ]);

      expect(snapshot.accruedCostUsd).toBe(expected);
    },
  );

  it('keeps the whole total unknown when one Cloudflare row carries no cost', async () => {
    const snapshot = await fetchCloudflareUsageSnapshot([
      cloudflareRow(),
      cloudflareRow({
        EffectiveCost: null,
        ContractedCost: null,
        ListCost: null,
      }),
    ]);

    expect(snapshot.accruedCostUsd).toBeNull();
    expect(snapshot.projectedCostUsd).toBeNull();
    expect(snapshot.usage.map((item) => item.key)).toEqual([
      'charge_rows',
      'product_families',
      'metric_r2_data_storage_first_10gb_month_included',
    ]);
  });

  it('reports a Cloudflare account with nothing billable as zero', async () => {
    const snapshot = await fetchCloudflareUsageSnapshot([]);

    expect(snapshot.accruedCostUsd).toBe(0);
    expect(snapshot.projectedCostUsd).toBe(0);
    expect(snapshot.usage).toEqual([
      {
        key: 'charge_rows',
        label: 'Billed charge rows',
        unit: 'units',
        value: 0,
      },
      {
        key: 'list_cost_usd',
        label: 'List price before discounts',
        unit: 'usd',
        value: 0,
      },
    ]);
  });

  // A `Correction` row reverses an earlier charge. Dropping it would bill us
  // for usage Cloudflare has already taken back.
  it('keeps a Cloudflare correction row in the total and the metric', async () => {
    const snapshot = await fetchCloudflareUsageSnapshot([
      cloudflareRow({ ConsumedQuantity: 1_000, EffectiveCost: 3, ListCost: 3 }),
      cloudflareRow({
        ChargeClass: 'Correction',
        ConsumedQuantity: -100,
        EffectiveCost: -0.5,
        ListCost: -0.5,
      }),
    ]);

    expect(snapshot.accruedCostUsd).toBe(2.5);
    expect(snapshot.usage).toContainEqual(
      expect.objectContaining({
        key: 'metric_r2_data_storage_first_10gb_month_included',
        value: 900,
      }),
    );
  });

  it('aggregates repeated Cloudflare metrics and keeps slug collisions apart', async () => {
    const snapshot = await fetchCloudflareUsageSnapshot([
      cloudflareRow({ ConsumedQuantity: 1 }),
      cloudflareRow({ ConsumedQuantity: 2 }),
      cloudflareRow({
        ConsumedQuantity: 4,
        ServiceName: 'R2 Data Storage - First 10GB-Month included',
      }),
    ]);

    expect(
      snapshot.usage.filter((item) => item.key.startsWith('metric_')),
    ).toEqual([
      {
        key: 'metric_r2_data_storage_first_10gb_month_included',
        label: 'R2 Data Storage (First 10GB-Month included) (GB-months)',
        unit: 'units',
        value: 3,
      },
      {
        key: 'metric_r2_data_storage_first_10gb_month_included_2',
        label: 'R2 Data Storage - First 10GB-Month included (GB-months)',
        unit: 'units',
        value: 4,
      },
    ]);
  });

  it('labels a Cloudflare metric that reports no unit by its name alone', async () => {
    const snapshot = await fetchCloudflareUsageSnapshot([
      cloudflareRow({ ConsumedUnit: '', PricingUnit: null }),
    ]);

    expect(snapshot.usage).toContainEqual(
      expect.objectContaining({
        key: 'metric_r2_data_storage_first_10gb_month_included',
        label: 'R2 Data Storage (First 10GB-Month included)',
      }),
    );
  });

  it('counts distinct Cloudflare families and drops an incomplete list price', async () => {
    const snapshot = await fetchCloudflareUsageSnapshot([
      cloudflareRow(),
      cloudflareRow({
        ListCost: null,
        ServiceFamilyName: 'Workers',
        ServiceName: 'Workers Requests',
      }),
      cloudflareRow({
        ServiceFamilyName: null,
        ServiceName: 'R2 Storage Class B Operations (First 10M included)',
      }),
    ]);

    expect(snapshot.usage).toContainEqual(
      expect.objectContaining({ key: 'product_families', value: 2 }),
    );
    expect(snapshot.usage.map((item) => item.key)).not.toContain(
      'list_cost_usd',
    );
  });

  it('encodes the Cloudflare account id and honours a custom base URL', async () => {
    const fetcher = vi.fn().mockResolvedValue(cloudflareUsageResponse([]));

    await fetchCloudflareUsageSnapshot([], {
      accountId: 'acct/1',
      baseUrl: 'https://cloudflare.example/v4',
      fetch: fetcher,
      now: new Date('2026-09-01T09:31:00.000Z'),
    });

    const [url] = fetcher.mock.calls[0] as [URL];
    expect(url.href).toBe(
      'https://cloudflare.example/v4/accounts/acct%2F1/billable-usage?from=2026-09-01&to=2026-09-01',
    );
  });
});

describe('provider defaults through the public surface', () => {
  it('exports every cost collector and shared runtime value', () => {
    expect(costObservability.fetchBraveCostSnapshot).toBe(
      fetchBraveCostSnapshot,
    );
    expect(costObservability.fetchDeBankCostSnapshot).toBe(
      fetchDeBankCostSnapshot,
    );
    expect(costObservability.fetchOpenRouterCostSnapshot).toBe(
      fetchOpenRouterCostSnapshot,
    );
    expect(costObservability.createFixedMonthlyCostSnapshot).toBe(
      createFixedMonthlyCostSnapshot,
    );
    expect(costObservability.fetchCloudflareCostSnapshot).toBe(
      fetchCloudflareCostSnapshot,
    );
    expect(costObservability.COST_PROVIDERS).toEqual([
      'debank',
      'openrouter',
      'brave',
      'cloudflare',
      'supabase',
      'fly',
    ]);
  });

  it('uses the fixed collector clock and label defaults', () => {
    const snapshot = createFixedMonthlyCostSnapshot({
      provider: 'supabase',
      monthlyCostUsd: 25,
    });

    expect(snapshot.usage[0]?.label).toBe('Monthly plan');
    expect(Number.isNaN(Date.parse(snapshot.fetchedAt))).toBe(false);
  });

  it('uses DeBank global fetch, clock, and endpoint defaults', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(jsonResponse({ balance: 5, stats: [] }));

    const snapshot = await withGlobalFetch(
      fetcher as typeof globalThis.fetch,
      () => fetchDeBankCostSnapshot({ apiKey: 'debank-key', unitCostUsd: 0 }),
    );

    expectFreshZeroCostSnapshot(snapshot);
    expect(fetcher).toHaveBeenCalledWith(
      'https://pro-openapi.debank.com/v1/account/units',
      expect.objectContaining({
        headers: { AccessKey: 'debank-key', accept: 'application/json' },
      }),
    );
  });

  it('uses OpenRouter global fetch, clock, and endpoint defaults', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      jsonResponse({
        data: {
          ...openRouterPayload.data,
          usage: 0,
          usage_daily: 0,
          usage_weekly: 0,
          usage_monthly: 0,
          limit: null,
          limit_remaining: 0,
        },
      }),
    );

    const snapshot = await withGlobalFetch(
      fetcher as typeof globalThis.fetch,
      () => fetchOpenRouterCostSnapshot({ apiKey: 'router-key' }),
    );

    expect(snapshot.projectedCostUsd).toBe(0);
    expect(Number.isNaN(Date.parse(snapshot.fetchedAt))).toBe(false);
    expect(fetcher).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/key',
      expect.objectContaining({
        headers: { Authorization: 'Bearer router-key' },
      }),
    );
  });

  it('uses Cloudflare global fetch, clock, and endpoint defaults', async () => {
    const fetcher = vi.fn().mockResolvedValue(cloudflareUsageResponse([]));

    const snapshot = await withGlobalFetch(
      fetcher as typeof globalThis.fetch,
      () =>
        fetchCloudflareCostSnapshot({
          apiToken: 'cf-token',
          accountId: 'acct-1',
        }),
    );

    expectFreshZeroCostSnapshot(snapshot);
    const url = expectDefaultCollectorCall(fetcher, {
      urlSubstring:
        'https://api.cloudflare.com/client/v4/accounts/acct-1/billable-usage?from=',
      headerName: 'authorization',
      headerValue: 'Bearer cf-token',
    });
    expect(url.searchParams.get('from')).toBe(
      `${new Date().toISOString().slice(0, 8)}01`,
    );
  });

  it('uses Brave global fetch, clock, and endpoint defaults', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(braveResponse(LONG_WINDOW_HEADERS));

    const snapshot = await withGlobalFetch(
      fetcher as typeof globalThis.fetch,
      () => fetchBraveCostSnapshot({ apiKey: 'brave-key', unitCostUsd: 0 }),
    );

    expectFreshZeroCostSnapshot(snapshot);
    expectDefaultCollectorCall(fetcher, {
      urlSubstring: 'https://api.search.brave.com/res/v1/images/search?',
      headerName: 'x-subscription-token',
      headerValue: 'brave-key',
    });
  });
});

describe('Brave retry completion paths', () => {
  it('uses the default sleeper and a response without a body', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503, body: null } as Response)
      .mockResolvedValueOnce(braveResponse(LONG_WINDOW_HEADERS));

    const snapshot = await fetchBraveCostSnapshot({
      apiKey: 'key',
      fetch: fetcher,
      now: NOW,
    });

    expect(snapshot.provider).toBe('brave');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('throws the final retryable HTTP response after the attempt limit', async () => {
    const fetcher = vi.fn().mockResolvedValue(braveResponse({}, 503));
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(
      fetchBraveCostSnapshot({
        apiKey: 'key',
        fetch: fetcher,
        sleep,
        now: NOW,
      }),
    ).rejects.toThrow('Brave Search quota request failed (503)');
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls).toEqual([[250], [500]]);
  });
});

describe('Brave quota header completion paths', () => {
  it('distinguishes a missing limit from a missing remaining header', async () => {
    const missingLimit = await expectBraveQuotaFailure({
      'x-ratelimit-policy': '100;w=2592000',
      'x-ratelimit-remaining': '90',
    });
    const missingRemaining = await expectBraveQuotaFailure({
      'x-ratelimit-limit': '100',
      'x-ratelimit-policy': '100;w=2592000',
    });

    expect(missingLimit).toBeInstanceOf(Error);
    expect((missingLimit as Error).message).toBe(
      'Brave Search quota headers missing',
    );
    expect(missingRemaining).toBeInstanceOf(Error);
    expect((missingRemaining as Error).message).toBe(
      'Brave Search quota headers missing',
    );
  });

  it('rejects misaligned slots instead of realigning a coherent quota', async () => {
    // Slot 1 is the only monthly window, and its limit/remaining are
    // unreadable. Compacting the slots would realign limit=100 with
    // remaining=90 and invoice a quota Brave never reported.
    const error = await expectBraveQuotaFailure({
      'x-ratelimit-limit': ' , nope, 100',
      'x-ratelimit-policy': ' , 100;w=2592000, ',
      'x-ratelimit-remaining': ' , Infinity, 90',
      'x-ratelimit-reset': ' , NaN, 123',
    });
    expect((error as Error).message).toBe(
      'Brave Search monthly quota is not measurable',
    );
    expect(error).not.toBeInstanceOf(UsageNotMeasurableError);
  });

  it('skips malformed policies and keeps the greatest measurable window', async () => {
    const snapshot = await fetchBraveCostSnapshot({
      apiKey: 'key',
      unitCostUsd: 1,
      fetch: vi.fn().mockResolvedValue(
        braveResponse({
          'x-ratelimit-limit': '1, 100, 9',
          'x-ratelimit-policy': 'broken, 100;w=2592000, 9;w=86400',
          'x-ratelimit-remaining': '1, 90, 8',
        }),
      ),
      now: NOW,
    });

    expect(snapshot.accruedCostUsd).toBe(10);
  });

  it.each([
    [
      'missing aligned limit',
      {
        'x-ratelimit-limit': '50',
        'x-ratelimit-policy': '50;w=1, 100;w=2592000',
        'x-ratelimit-remaining': '49, 90',
      },
    ],
    [
      'missing aligned remaining',
      {
        'x-ratelimit-limit': '50, 100',
        'x-ratelimit-policy': '50;w=1, 100;w=2592000',
        'x-ratelimit-remaining': '49',
      },
    ],
    [
      'unparseable aligned remaining',
      {
        'x-ratelimit-limit': '50, 100',
        'x-ratelimit-policy': '50;w=1, 100;w=2592000',
        'x-ratelimit-remaining': '49, nope',
      },
    ],
    [
      'negative limit',
      {
        'x-ratelimit-limit': '-1',
        'x-ratelimit-policy': '100;w=2592000',
        'x-ratelimit-remaining': '0',
      },
    ],
    [
      'negative remaining',
      {
        'x-ratelimit-limit': '100',
        'x-ratelimit-policy': '100;w=2592000',
        'x-ratelimit-remaining': '-1',
      },
    ],
  ])('rejects %s quota data', async (_label, headers) => {
    const error = await expectBraveQuotaFailure(headers);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(
      'Brave Search monthly quota is not measurable',
    );
    expect(error).not.toBeInstanceOf(UsageNotMeasurableError);
  });
});
