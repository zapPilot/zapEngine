import { describe, expect, it, vi } from 'vitest';

import type { ProductHealthResponse } from '../../../shared/types.js';
import { readControlCenterConfig } from '../../config/env.js';
import {
  FRESH_WINDOW_HOURS,
  type WalletCoverage,
} from '../wallet-freshness.js';
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
    activePortfolios7d: 18,
    ...overrides,
  };
}

/** Defaults to the current fleet size, fully covered. */
function coverage(overrides: Partial<WalletCoverage> = {}): WalletCoverage {
  const expected = overrides.expected ?? 23;
  const fresh = overrides.fresh ?? expected;
  return {
    expected,
    fresh,
    stale: expected - fresh,
    neverRefreshed: 0,
    ...overrides,
  };
}

function collect(input: {
  health?: ProductHealthResponse;
  coverage?: WalletCoverage | null;
}) {
  return collectProductSignals({
    config: configured,
    now,
    load: vi.fn().mockResolvedValue(input.health ?? health()),
    // `??` would swallow the unreadable-coverage case, which is a null answer
    // rather than an absent argument.
    loadCoverage: vi
      .fn()
      .mockResolvedValue('coverage' in input ? input.coverage : coverage()),
  });
}

describe('collectProductSignals', () => {
  it('reports unknown without querying when Supabase is unconfigured', async () => {
    const load = vi.fn();
    const loadCoverage = vi.fn();

    const signals = await collectProductSignals({
      config: readControlCenterConfig({}),
      now,
      load,
      loadCoverage,
    });

    expect(signals).toHaveLength(1);
    expect(signals[0]?.fingerprint).toBe(
      'product-health:unconfigured/supabase',
    );
    expect(signals[0]?.status).toBe('unknown');
    expect(load).not.toHaveBeenCalled();
    expect(loadCoverage).not.toHaveBeenCalled();
  });

  it('reports healthy when the whole priority fleet is current', async () => {
    const signals = await collect({ coverage: coverage({ fresh: 23 }) });

    expect(
      signals.map((signal) => [signal.fingerprint, signal.status]),
    ).toEqual([
      ['product-health:portfolio-freshness/priority-coverage', 'healthy'],
      ['product-health:engagement/active', 'healthy'],
    ]);
    expect(signals[0]?.evidence).toEqual({
      expectedWallets: 23,
      freshWallets: 23,
      staleWallets: 0,
      neverRefreshedWallets: 0,
      coverageRatio: 1,
      freshWindowHours: FRESH_WINDOW_HOURS,
    });
    expect(signals[0]?.detail).toBeNull();
    expect(signals[1]?.evidence).toEqual({
      wau: 25,
      mau: 60,
      registeredUsers: 120,
    });
    expect(signals[0]?.observedAt).toBe('2026-08-28T12:00:00.000Z');
  });

  it('tolerates a single straggler, which the customers domain already names', async () => {
    const signals = await collect({ coverage: coverage({ fresh: 22 }) });

    expect(signals[0]?.status).toBe('healthy');
    expect(signals[0]?.evidence['coverageRatio']).toBe(0.957);
  });

  it('degrades once several wallets are behind', async () => {
    const signals = await collect({
      coverage: coverage({ fresh: 20, neverRefreshed: 1 }),
    });

    expect(signals[0]?.status).toBe('degraded');
    expect(signals[0]?.detail).toContain('20 of 23 priority wallets');
    expect(signals[0]?.evidence).toEqual({
      expectedWallets: 23,
      freshWallets: 20,
      staleWallets: 3,
      neverRefreshedWallets: 1,
      coverageRatio: 0.87,
      freshWindowHours: FRESH_WINDOW_HOURS,
    });
    expect(signals[1]?.status).toBe('healthy');
  });

  it('is critical when one fresh wallet is all that is left', async () => {
    const signals = await collect({
      coverage: coverage({ fresh: 1, neverRefreshed: 22 }),
    });

    expect(signals[0]?.status).toBe('critical');
    expect(signals[0]?.evidence['freshWallets']).toBe(1);
    expect(signals[0]?.evidence['coverageRatio']).toBe(0.043);
  });

  it('stays healthy when nothing is supposed to refresh yet', async () => {
    const signals = await collect({ coverage: coverage({ expected: 0 }) });

    expect(signals[0]?.status).toBe('healthy');
    expect(signals[0]?.title).toBe('No priority wallets to refresh');
    expect(signals[0]?.evidence).toEqual({
      expectedWallets: 0,
      freshWallets: 0,
      staleWallets: 0,
      neverRefreshedWallets: 0,
      coverageRatio: null,
      freshWindowHours: FRESH_WINDOW_HOURS,
    });
  });

  it('degrades when coverage cannot be read at all', async () => {
    const signals = await collect({ coverage: null });

    expect(signals[0]?.status).toBe('degraded');
    expect(signals[0]?.title).toBe('Priority wallet coverage unreadable');
    expect(signals[0]?.evidence).toEqual({
      expectedWallets: null,
      freshWallets: null,
      staleWallets: null,
      neverRefreshedWallets: null,
      coverageRatio: null,
      freshWindowHours: FRESH_WINDOW_HOURS,
    });
  });

  it('reads an all-null response as an unreachable Supabase, not an empty product', async () => {
    const signals = await collect({
      health: health({
        registeredUsers: null,
        portfolioUsers: null,
        wau: null,
        mau: null,
        portfolioFresh24h: null,
        portfolioFresh7d: null,
      }),
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
      loadCoverage: vi.fn().mockResolvedValue(coverage()),
    });

    expect(signals).toHaveLength(1);
    expect(signals[0]?.fingerprint).toBe(
      'product-health:source-failure/adapter',
    );
    expect(signals[0]?.status).toBe('degraded');
    expect(signals[0]?.detail).toBe('Invalid supabaseUrl');
  });
});
