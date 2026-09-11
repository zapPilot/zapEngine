import type { CostPricingRate, FetchLike } from '@zapengine/cost-observability';
import { describe, expect, it, vi } from 'vitest';

import { readControlCenterConfig } from '../config/env.js';
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

/**
 * Only Brave carries a credential, so every other source reports itself
 * unconfigured without reaching the network. `FLY_COST_MODE` is left at its
 * `manual` default for the same reason -- this file is about how a collector
 * failure is classified, not about the roster.
 */
async function collectBrave(fetcher: FetchLike) {
  const providers = await collectCostProviders({
    config: readControlCenterConfig({ BRAVE_SEARCH_API_KEY: 'brave-key' }),
    pricingRates: [BRAVE_RATE],
    fetch: fetcher,
    now: NOW,
  });
  const brave = providers.find((provider) => provider.provider === 'brave');
  expect(brave).toBeDefined();
  return brave!;
}

function braveResponse(headers: Record<string, string>) {
  return new Response(JSON.stringify({ results: [] }), { headers });
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
});
