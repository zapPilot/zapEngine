import type {
  CostPricingRate,
  CostProvider,
  FetchLike,
} from '@zapengine/cost-observability';
import { describe, expect, it, vi } from 'vitest';

import { readControlCenterConfig } from '../config/env.js';
import { CLOUDFLARE_UNPRICED_MESSAGE } from './cost-history-aggregate.js';
import { collectCostProviders } from './costs.js';

const NOW = new Date('2026-09-11T09:00:00.000Z');

const BRAVE_RATE: CostPricingRate = {
  id: 'rate-brave',
  provider: 'brave',
  metricKey: 'search_request',
  unit: 'request',
  priceUsd: 0.0005,
  effectiveFrom: '2026-01-01T00:00:00.000Z',
  effectiveTo: null,
};

const CLOUDFLARE_ENV = {
  CLOUDFLARE_API_TOKEN: 'cf-token',
  CLOUDFLARE_ACCOUNT_ID: 'cf-account',
};

/**
 * Only the provider under test carries a credential, so every other source
 * reports itself unconfigured without reaching the network. `FLY_COST_MODE` is
 * left at its `manual` default for the same reason -- this file is about how a
 * collector failure is classified, not about the roster.
 */
async function collectProvider(input: {
  provider: CostProvider;
  env: Record<string, string>;
  fetch: FetchLike;
  pricingRates?: CostPricingRate[];
}) {
  const providers = await collectCostProviders({
    config: readControlCenterConfig(input.env),
    pricingRates: input.pricingRates ?? [],
    fetch: input.fetch,
    now: NOW,
  });
  const collected = providers.find(
    (entry) => entry.provider === input.provider,
  );
  expect(collected).toBeDefined();
  return collected!;
}

function collectBrave(fetcher: FetchLike) {
  return collectProvider({
    provider: 'brave',
    env: { BRAVE_SEARCH_API_KEY: 'brave-key' },
    fetch: fetcher,
    pricingRates: [BRAVE_RATE],
  });
}

function collectCloudflare(
  fetcher: FetchLike,
  env: Record<string, string> = CLOUDFLARE_ENV,
) {
  return collectProvider({ provider: 'cloudflare', env, fetch: fetcher });
}

function braveResponse(headers: Record<string, string>) {
  return new Response(JSON.stringify({ results: [] }), { headers });
}

/**
 * The package keeps its own Cloudflare fixtures, but they are internal to it,
 * so the smallest envelope that satisfies the collector is declared here --
 * the same way this file already stubs Brave with a bare header response.
 */
function cloudflareUsageResponse(
  rows: Record<string, unknown>[],
  status = 200,
) {
  return new Response(
    JSON.stringify({ success: true, errors: [], messages: [], result: rows }),
    { status },
  );
}

function cloudflareChargeRow(overrides: Record<string, unknown> = {}) {
  return {
    BillingCurrency: 'USD',
    ConsumedQuantity: 1_200,
    ConsumedUnit: 'operations',
    EffectiveCost: 0.0054,
    ListCost: 0.0054,
    x_BillableMetricId: 'r2_class_a_operations',
    x_BillableMetricName: 'R2 Class A Operations',
    x_ProductFamilyName: 'R2',
    ...overrides,
  };
}

describe('cost provider collection', () => {
  // The live account started reporting a zero monthly allowance on 2026-09-05
  // and every scheduled sync since exited non-zero on it. Nothing in this
  // process can fix a quota Brave no longer publishes, so it must not be filed
  // as a failure the job is waiting to have repaired.
  it('reads an unmeasurable Brave quota as unconfigured, not as an error', async () => {
    const brave = await collectBrave(
      vi.fn().mockResolvedValue(
        braveResponse({
          'x-ratelimit-limit': '50, 0',
          'x-ratelimit-policy': '50;w=1, 0;w=2592000',
          'x-ratelimit-remaining': '49, 0',
          'x-ratelimit-reset': '1, 1703577',
        }),
      ),
    );

    expect(brave.status).toBe('unconfigured');
    expect(brave.snapshot).toBeNull();
    expect(brave.message).toContain('monthly quota limit of 0');
  });

  // The degradation above is narrow on purpose: a provider that actually
  // breaks still has to turn the scheduled sync red.
  it('still reports a Brave transport failure as an error', async () => {
    const brave = await collectBrave(
      vi.fn().mockRejectedValue(new Error('fetch failed')),
    );

    expect(brave.status).toBe('error');
    expect(brave.snapshot).toBeNull();
  });

  it('keeps a measurable Brave quota priced and collected', async () => {
    const brave = await collectBrave(
      vi.fn().mockResolvedValue(
        braveResponse({
          'x-ratelimit-limit': '50, 15000',
          'x-ratelimit-policy': '50;w=1, 15000;w=2592000',
          'x-ratelimit-remaining': '49, 14000',
          'x-ratelimit-reset': '1, 1234567',
        }),
      ),
    );

    expect(brave.status).toBe('ok');
    expect(brave.snapshot?.accruedCostUsd).toBeCloseTo(0.5, 6);
  });

  // The zero-limit degradation above covers a monthly window that reports no
  // allowance; a response with no long window at all is the same situation —
  // Brave exposes only the per-second window — and must degrade the same way.
  it('reads a short-window-only Brave quota as unconfigured, not as an error', async () => {
    const brave = await collectBrave(
      vi.fn().mockResolvedValue(
        braveResponse({
          'x-ratelimit-limit': '50',
          'x-ratelimit-policy': '50;w=1',
          'x-ratelimit-remaining': '49',
          'x-ratelimit-reset': '1',
        }),
      ),
    );

    expect(brave.status).toBe('unconfigured');
    expect(brave.snapshot).toBeNull();
    expect(brave.message).toContain('not measurable');
  });
});

describe('Cloudflare cost collection', () => {
  it('collects a Cloudflare bill as an actual figure with no rate card', async () => {
    const cloudflare = await collectCloudflare(
      vi
        .fn()
        .mockResolvedValue(cloudflareUsageResponse([cloudflareChargeRow()])),
    );

    expect(cloudflare).toMatchObject({
      status: 'ok',
      costType: 'actual',
      pricingRateId: null,
      message: null,
    });
    expect(cloudflare.snapshot?.accruedCostUsd).toBe(0.0054);
  });

  // 403 rather than a retryable status on purpose: `collectCostProviders`
  // exposes no sleeper, so a 5xx here would spend the collector's real backoff
  // and put this file within reach of the CI test timeout.
  it('passes a Cloudflare status failure through to the operator', async () => {
    const cloudflare = await collectCloudflare(
      vi.fn().mockResolvedValue(cloudflareUsageResponse([], 403)),
    );

    expect(cloudflare.status).toBe('error');
    expect(cloudflare.message).toBe(
      'Cloudflare billable usage request failed (403)',
    );
  });

  // The allowlist used to pass only Brave's prefix or a trailing status code.
  // This message has neither a status nor Brave's name, and is still ours.
  it('passes an authored Cloudflare message through without a status code', async () => {
    const cloudflare = await collectCloudflare(
      vi
        .fn()
        .mockResolvedValue(
          cloudflareUsageResponse([
            cloudflareChargeRow({ BillingCurrency: 'EUR' }),
          ]),
        ),
    );

    expect(cloudflare.status).toBe('error');
    expect(cloudflare.message).toBe(
      'Cloudflare billable usage reported a non-USD currency (EUR)',
    );
  });

  it('masks a Cloudflare failure it did not author', async () => {
    const cloudflare = await collectCloudflare(
      vi
        .fn()
        .mockResolvedValue(
          cloudflareUsageResponse([
            cloudflareChargeRow({ x_BillableMetricId: '' }),
          ]),
        ),
    );

    expect(cloudflare.status).toBe('error');
    expect(cloudflare.message).toBe('Provider request failed');
  });

  it('reports half a Cloudflare credential as not connected', async () => {
    const fetcher = vi.fn();

    const cloudflare = await collectCloudflare(fetcher, {
      CLOUDFLARE_API_TOKEN: 'cf-token',
    });

    expect(cloudflare).toMatchObject({
      status: 'unconfigured',
      costType: 'actual',
      message: 'Not connected',
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('keeps a Cloudflare row with no cost field collected but unpriced', async () => {
    const cloudflare = await collectCloudflare(
      vi
        .fn()
        .mockResolvedValue(
          cloudflareUsageResponse([
            cloudflareChargeRow({ EffectiveCost: null, ListCost: null }),
          ]),
        ),
    );

    expect(cloudflare.status).toBe('ok');
    expect(cloudflare.snapshot?.accruedCostUsd).toBeNull();
    expect(cloudflare.message).toBe(CLOUDFLARE_UNPRICED_MESSAGE);
  });
});
