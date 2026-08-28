import { describe, expect, it, vi } from 'vitest';

import type { ProductHealthResponse } from '../../../shared/types.js';
import { readControlCenterConfig } from '../../config/env.js';
import { collectProductSignals } from './product.js';

const configured = readControlCenterConfig({
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
});
const now = new Date('2026-08-28T12:00:00.000Z');

function health(
  overrides: Partial<ProductHealthResponse> = {},
): ProductHealthResponse {
  return {
    registeredUsers: 120,
    verifiedWallets: 80,
    portfolioUsers: 40,
    wau: 25,
    mau: 60,
    observedPortfolioUsd: 1_250_000,
    portfolioFresh24h: 31,
    portfolioFresh7d: 40,
    top1PortfolioShare: 0.2,
    top3PortfolioShare: 0.5,
    ...overrides,
  };
}

describe('collectProductSignals', () => {
  it('reports unknown without querying when Supabase is unconfigured', async () => {
    const load = vi.fn();

    const signals = await collectProductSignals({
      config: readControlCenterConfig({}),
      now,
      load,
    });

    expect(signals).toHaveLength(1);
    expect(signals[0]?.fingerprint).toBe(
      'product-health:unconfigured/supabase',
    );
    expect(signals[0]?.status).toBe('unknown');
    expect(load).not.toHaveBeenCalled();
  });

  it('reports the healthy counters when every query answered', async () => {
    const signals = await collectProductSignals({
      config: configured,
      now,
      load: vi.fn().mockResolvedValue(health()),
    });

    expect(
      signals.map((signal) => [signal.fingerprint, signal.status]),
    ).toEqual([
      ['product-health:portfolio-freshness/observed', 'healthy'],
      ['product-health:engagement/active', 'healthy'],
    ]);
    expect(signals[0]?.evidence).toEqual({
      portfolioUsers: 40,
      portfolioFresh24h: 31,
      portfolioFresh7d: 40,
    });
    expect(signals[1]?.evidence).toEqual({
      wau: 25,
      mau: 60,
      registeredUsers: 120,
    });
    expect(signals[0]?.observedAt).toBe('2026-08-28T12:00:00.000Z');
  });

  it('degrades when tracked portfolios stopped refreshing', async () => {
    const signals = await collectProductSignals({
      config: configured,
      now,
      load: vi
        .fn()
        .mockResolvedValue(
          health({ portfolioFresh24h: 0, portfolioFresh7d: 12 }),
        ),
    });

    expect(signals[0]?.status).toBe('degraded');
    expect(signals[0]?.detail).toContain('40 tracked portfolios');
    expect(signals[1]?.status).toBe('healthy');
  });

  it('reads an all-null response as an unreachable Supabase, not an empty product', async () => {
    const signals = await collectProductSignals({
      config: configured,
      now,
      load: vi.fn().mockResolvedValue(
        health({
          registeredUsers: null,
          portfolioUsers: null,
          wau: null,
          mau: null,
          portfolioFresh24h: null,
          portfolioFresh7d: null,
        }),
      ),
    });

    expect(signals).toHaveLength(1);
    expect(signals[0]?.fingerprint).toBe(
      'product-health:reachability/supabase',
    );
    expect(signals[0]?.status).toBe('degraded');
  });

  it('turns a throwing loader into a source failure', async () => {
    const signals = await collectProductSignals({
      config: configured,
      now,
      load: vi.fn().mockRejectedValue(new Error('Invalid supabaseUrl')),
    });

    expect(signals).toHaveLength(1);
    expect(signals[0]?.fingerprint).toBe(
      'product-health:source-failure/adapter',
    );
    expect(signals[0]?.status).toBe('degraded');
    expect(signals[0]?.detail).toBe('Invalid supabaseUrl');
  });
});
