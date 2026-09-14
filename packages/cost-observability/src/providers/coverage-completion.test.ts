import { describe, expect, it, vi } from 'vitest';

import * as costObservability from '../index.js';
import { UsageNotMeasurableError } from '../errors.js';
import { fetchBraveCostSnapshot } from './brave.js';
import { fetchDeBankCostSnapshot } from './debank.js';
import { createFixedMonthlyCostSnapshot } from './fixed.js';
import { fetchOpenRouterCostSnapshot } from './openrouter.js';

const NOW = new Date('2026-09-14T04:00:00.000Z');
const LONG_WINDOW_HEADERS = {
  'x-ratelimit-limit': '100',
  'x-ratelimit-policy': '100;w=2592000',
  'x-ratelimit-remaining': '90',
  'x-ratelimit-reset': '123',
};

function braveResponse(
  headers: Record<string, string>,
  status = 200,
): Response {
  return new Response('{}', { status, headers });
}

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
    expect(costObservability.COST_PROVIDERS).toEqual([
      'debank',
      'openrouter',
      'brave',
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
      .mockResolvedValue(
        new Response(JSON.stringify({ balance: 5, stats: [] })),
      ) as typeof globalThis.fetch;

    const snapshot = await withGlobalFetch(fetcher, () =>
      fetchDeBankCostSnapshot({ apiKey: 'debank-key', unitCostUsd: 0 }),
    );

    expect(snapshot.accruedCostUsd).toBe(0);
    expect(Number.isNaN(Date.parse(snapshot.fetchedAt))).toBe(false);
    expect(fetcher).toHaveBeenCalledWith(
      'https://pro-openapi.debank.com/v1/account/units',
      expect.objectContaining({
        headers: { AccessKey: 'debank-key', accept: 'application/json' },
      }),
    );
  });

  it('uses OpenRouter global fetch, clock, and endpoint defaults', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            usage: 0,
            usage_daily: 0,
            usage_weekly: 0,
            usage_monthly: 0,
            limit: null,
            limit_remaining: 0,
          },
        }),
      ),
    ) as typeof globalThis.fetch;

    const snapshot = await withGlobalFetch(fetcher, () =>
      fetchOpenRouterCostSnapshot({ apiKey: 'router-key' }),
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

  it('uses Brave global fetch, clock, and endpoint defaults', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        braveResponse(LONG_WINDOW_HEADERS),
      ) as typeof globalThis.fetch;

    const snapshot = await withGlobalFetch(fetcher, () =>
      fetchBraveCostSnapshot({ apiKey: 'brave-key', unitCostUsd: 0 }),
    );

    expect(snapshot.accruedCostUsd).toBe(0);
    expect(Number.isNaN(Date.parse(snapshot.fetchedAt))).toBe(false);
    expect(fetcher).toHaveBeenCalledWith(
      expect.objectContaining({
        href: expect.stringContaining(
          'https://api.search.brave.com/res/v1/images/search?',
        ),
      }),
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-subscription-token': 'brave-key',
        }),
      }),
    );
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

  it('ignores blank and non-numeric values before selecting a long window', async () => {
    const snapshot = await fetchBraveCostSnapshot({
      apiKey: 'key',
      unitCostUsd: 1,
      fetch: vi.fn().mockResolvedValue(
        braveResponse({
          'x-ratelimit-limit': ' , nope, 100',
          'x-ratelimit-policy': ' , 100;w=2592000, ',
          'x-ratelimit-remaining': ' , Infinity, 90',
          'x-ratelimit-reset': ' , NaN, 123',
        }),
      ),
      now: NOW,
    });

    expect(snapshot.accruedCostUsd).toBe(10);
    expect(snapshot.usage).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'quota_reset_seconds', value: 123 }),
      ]),
    );
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
