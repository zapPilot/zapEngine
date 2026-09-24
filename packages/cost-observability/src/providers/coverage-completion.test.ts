import { describe, expect, it, vi } from 'vitest';

import * as costObservability from '../index.js';
import {
  braveTestResponse,
  cloudflareRow,
  cloudflareUsageResponse,
  createOpenRouterKeyFetcher,
  expectBraveSearchAuthCall,
  expectFreshZeroCostSnapshot,
  fetchBraveQuotaSnapshot,
  fetchCloudflareUsageSnapshot,
} from './test-helpers.js';

const NOW = new Date('2026-09-01T00:00:00.000Z');
const BRAVE_QUOTA_HEADERS = {
  'x-ratelimit-limit': '100',
  'x-ratelimit-policy': '100;w=2592000',
  'x-ratelimit-remaining': '100',
  'x-ratelimit-reset': '123',
};

describe('coverage completion', () => {
  it('executes every runtime export through the public entry point', async () => {
    const fixed = costObservability.createFixedMonthlyCostSnapshot({
      provider: 'fly',
      monthlyCostUsd: 5,
      now: NOW,
    });
    expect(fixed.accruedCostUsd).toBe(5);

    const rate = costObservability.resolvePricingRate(
      [
        {
          id: 'rate',
          provider: 'debank',
          metricKey: 'api_unit',
          unit: 'unit',
          priceUsd: 0.25,
          effectiveFrom: '2026-01-01T00:00:00.000Z',
          effectiveTo: null,
        },
      ],
      { provider: 'debank', metricKey: 'api_unit', at: NOW },
    );
    expect(rate?.id).toBe('rate');

    const authoredError = new costObservability.UsageNotMeasurableError(
      'usage unavailable',
    );
    expect(authoredError.name).toBe('UsageNotMeasurableError');
    expect(costObservability.COST_PROVIDERS).toContain('brave');

    const openRouter = await costObservability.fetchOpenRouterCostSnapshot({
      apiKey: 'router-key',
      fetch: createOpenRouterKeyFetcher({
        usage: 0,
        limit: null,
        limitRemaining: 5,
      }),
      now: NOW,
    });
    expect(openRouter.usage).toContainEqual(
      expect.objectContaining({ key: 'limit_remaining', value: 5 }),
    );

    const deBank = await costObservability.fetchDeBankCostSnapshot({
      apiKey: 'debank-key',
      unitCostUsd: 0,
      fetch: vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            balance: 10,
            stats: [{ usage: 0, remains: 10, date: '2026-09-01' }],
          }),
        ),
      ),
      now: NOW,
    });
    expectFreshZeroCostSnapshot(deBank);

    const braveFetcher = vi
      .fn()
      .mockResolvedValue(braveTestResponse(BRAVE_QUOTA_HEADERS));
    const brave = await costObservability.fetchBraveCostSnapshot({
      apiKey: 'entry-key',
      unitCostUsd: 1,
      fetch: braveFetcher,
      now: NOW,
    });
    expectFreshZeroCostSnapshot(brave);
    expectBraveSearchAuthCall(braveFetcher, 'count=1', 'entry-key');

    const cloudflare = await costObservability.fetchCloudflareCostSnapshot({
      apiToken: 'entry-token',
      accountId: 'entry-account',
      fetch: vi
        .fn()
        .mockResolvedValue(cloudflareUsageResponse([cloudflareRow()])),
      now: NOW,
    });
    expect(cloudflare.usage).toContainEqual(
      expect.objectContaining({ key: 'charge_rows', value: 1 }),
    );
  });

  it('executes every shared test-helper default and override', async () => {
    const defaultResponse = braveTestResponse({ 'x-test': 'default' });
    const errorResponse = braveTestResponse({}, 503);
    expect(defaultResponse.status).toBe(200);
    expect(defaultResponse.headers.get('x-test')).toBe('default');
    expect(errorResponse.status).toBe(503);

    const defaultKeyResponse = await createOpenRouterKeyFetcher({ usage: 2 })();
    expect(await defaultKeyResponse.json()).toMatchObject({
      data: { usage: 2, limit: 100, limit_remaining: null },
    });

    const snapshot = await fetchBraveQuotaSnapshot(BRAVE_QUOTA_HEADERS, NOW);
    expectFreshZeroCostSnapshot(snapshot);

    expect(cloudflareRow()).toMatchObject({
      BillingCurrency: 'USD',
      ServiceName: 'R2 Data Storage (First 10GB-Month included)',
    });
    const emptyUsage = cloudflareUsageResponse([]);
    expect(emptyUsage.status).toBe(200);
    expect(await emptyUsage.json()).toEqual({
      success: true,
      errors: [],
      messages: [],
      result: [],
    });
    const rejected = cloudflareUsageResponse([cloudflareRow()], {
      status: 429,
      success: false,
      errors: [{ code: 10_000 }],
    });
    expect(rejected.status).toBe(429);
    expect(await rejected.json()).toMatchObject({
      success: false,
      errors: [{ code: 10_000 }],
      result: null,
    });
    const cloudflare = await fetchCloudflareUsageSnapshot([cloudflareRow()]);
    expect(cloudflare.accruedCostUsd).toBe(0.000257);
  });
});
