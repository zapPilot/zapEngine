import type { CostPricingRate } from '@zapengine/cost-observability';
import { describe, expect, it, vi } from 'vitest';

import { readControlCenterConfig } from '../config/env.js';
import { collectCostProviders } from './costs.js';
import { CLOUDFLARE_UNPRICED_MESSAGE } from './cost-history-aggregate.js';

const NOW = new Date('2026-09-11T09:00:00.000Z');

function config(env: Record<string, string>) {
  return readControlCenterConfig(env);
}

describe('costs coverage', () => {
  it('marks every source unconfigured without credentials', async () => {
    const providers = await collectCostProviders({
      config: config({}),
      pricingRates: [],
      now: NOW,
    });
    expect(providers).toHaveLength(6);
    expect(providers.every((p) => p.status === 'unconfigured')).toBe(true);
    expect(providers.find((p) => p.provider === 'fly')?.message).toBe(
      'Not connected',
    );
  });

  it('reports usage-without-rate for metered providers missing a pricing rate', async () => {
    const providers = await collectCostProviders({
      config: config({}),
      pricingRates: [],
      fetch: vi.fn().mockRejectedValue(new Error('must not fetch')),
      now: NOW,
    });
    expect(providers.find((p) => p.provider === 'debank')?.message).toBe(
      'Usage available; pricing rate missing',
    );
    expect(providers.find((p) => p.provider === 'brave')?.message).toBe(
      'Usage available; pricing rate missing',
    );
  });

  it('collects a fixed Supabase snapshot when a rate exists', async () => {
    const rate: CostPricingRate = {
      id: 'rate-supabase',
      provider: 'supabase',
      metricKey: 'pro_plan',
      unit: 'plan',
      priceUsd: 25,
      effectiveFrom: '2026-01-01T00:00:00.000Z',
      effectiveTo: null,
    };
    const providers = await collectCostProviders({
      config: config({}),
      pricingRates: [rate],
      now: NOW,
    });
    expect(providers.find((p) => p.provider === 'supabase')).toMatchObject({
      status: 'ok',
      pricingRateId: 'rate-supabase',
    });
  });

  it('anchors metered loaders to a null prior month without fabricating zero', async () => {
    const rate: CostPricingRate = {
      id: 'rate-debank',
      provider: 'debank',
      metricKey: 'api_unit',
      unit: 'unit',
      priceUsd: 0.001,
      effectiveFrom: '2026-01-01T00:00:00.000Z',
      effectiveTo: null,
    };
    const fetchImpl = vi.fn().mockRejectedValue(new Error('boom (500)'));
    const providers = await collectCostProviders({
      config: config({ DEBANK_API_KEY: 'k' }),
      pricingRates: [rate],
      fetch: fetchImpl,
      now: NOW,
      priorMonthTotals: null,
    });
    // suffixed status code passes through; anything else is sanitized
    expect(providers.find((p) => p.provider === 'debank')?.message).toBe(
      'boom (500)',
    );
  });

  it('sanitizes unexpected provider errors', async () => {
    const providers = await collectCostProviders({
      config: config({ OPENROUTER_API_KEY: 'k' }),
      pricingRates: [],
      fetch: vi.fn().mockRejectedValue(new Error('secret-token-leak')),
      now: NOW,
    });
    expect(providers.find((p) => p.provider === 'openrouter')?.message).toBe(
      'Provider request failed',
    );
  });

  it('passes Brave Search prefixed errors through unsanitized', async () => {
    const rate: CostPricingRate = {
      id: 'rate-brave',
      provider: 'brave',
      metricKey: 'search_request',
      unit: 'request',
      priceUsd: 0.001,
      effectiveFrom: '2026-01-01T00:00:00.000Z',
      effectiveTo: null,
    };
    const providers = await collectCostProviders({
      config: config({ BRAVE_SEARCH_API_KEY: 'k' }),
      pricingRates: [rate],
      fetch: vi.fn().mockRejectedValue(new Error('Brave Search quota down')),
      now: NOW,
    });
    expect(providers.find((p) => p.provider === 'brave')?.message).toContain(
      'Brave Search',
    );
  });

  it('uses the flyctl runner when FLY_COST_MODE is flyctl', async () => {
    const providers = await collectCostProviders({
      config: config({ FLY_COST_MODE: 'flyctl' }),
      pricingRates: [],
      now: NOW,
      flyRun: vi.fn().mockResolvedValue({ stdout: '{}', stderr: '' }) as never,
    });
    const fly = providers.find((p) => p.provider === 'fly');
    expect(fly?.status).not.toBe('unconfigured');
  });

  it('explains a Cloudflare sync whose charge rows carry no cost field', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      Response.json({
        success: true,
        errors: [],
        result: [
          {
            ServiceName: 'R2 Data Storage',
            ConsumedQuantity: 12.5,
            BillingCurrency: 'USD',
          },
        ],
      }),
    );
    const providers = await collectCostProviders({
      config: config({
        CLOUDFLARE_API_TOKEN: 'cf-token',
        CLOUDFLARE_ACCOUNT_ID: 'acct-1',
      }),
      pricingRates: [],
      fetch: fetchImpl,
      now: NOW,
    });
    expect(providers.find((p) => p.provider === 'cloudflare')).toMatchObject({
      status: 'ok',
      message: CLOUDFLARE_UNPRICED_MESSAGE,
    });
  });

  it('reports unknown USD cost for metered usage collected without a rate', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      Response.json({
        balance: 100,
        stats: [{ usage: 7, remains: 93, date: '2026-09-11' }],
      }),
    );
    const providers = await collectCostProviders({
      config: config({ DEBANK_API_KEY: 'k' }),
      pricingRates: [],
      fetch: fetchImpl,
      now: NOW,
    });
    expect(providers.find((p) => p.provider === 'debank')).toMatchObject({
      status: 'ok',
      message: 'Usage synced; USD cost unknown',
    });
  });
});
