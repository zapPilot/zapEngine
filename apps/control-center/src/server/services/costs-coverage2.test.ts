import { describe, expect, it, vi } from 'vitest';

import { readControlCenterConfig } from '../config/env.js';
import { collectCostProviders } from './costs.js';

const NOW = new Date('2026-09-11T09:00:00.000Z');

describe('costs missing branches', () => {
  it('defaults now to the current time when omitted', async () => {
    const providers = await collectCostProviders({
      config: readControlCenterConfig({}),
      pricingRates: [],
    });

    expect(providers).toHaveLength(6);
    expect(providers.every((p) => p.status === 'unconfigured')).toBe(true);
  });

  it('masks a non-Error provider failure', async () => {
    const providers = await collectCostProviders({
      config: readControlCenterConfig({ OPENROUTER_API_KEY: 'k' }),
      pricingRates: [],
      fetch: vi.fn().mockRejectedValue('string-boom'),
      now: NOW,
    });

    expect(providers.find((p) => p.provider === 'openrouter')).toMatchObject({
      status: 'error',
      message: 'Provider request failed',
    });
  });
});
