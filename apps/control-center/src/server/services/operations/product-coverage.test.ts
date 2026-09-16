import { describe, expect, it, vi } from 'vitest';

import { readControlCenterConfig } from '../../config/env.js';
import { FRESH_WINDOW_HOURS } from '../wallet-freshness.js';
import { collectProductSignals } from './product.js';

vi.mock('../product-health.js', () => ({
  loadProductHealth: vi.fn().mockResolvedValue({
    registeredUsers: 10,
    verifiedWallets: 8,
    portfolioUsers: 5,
    wau: 4,
    mau: 9,
    observedPortfolioUsd: 1000,
    portfolioFresh24h: 5,
    portfolioFresh7d: 5,
    top1PortfolioShare: 0.2,
    top3PortfolioShare: 0.5,
    activePortfolios7d: 3,
  }),
}));

vi.mock('../wallet-freshness.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../wallet-freshness.js')>();
  return {
    ...actual,
    loadPriorityWalletCoverage: vi.fn().mockResolvedValue({
      expected: 23,
      fresh: 23,
      stale: 0,
      neverRefreshed: 0,
    }),
  };
});

const configured = readControlCenterConfig({
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
});
const now = new Date('2026-08-28T12:00:00.000Z');

describe('collectProductSignals default loaders', () => {
  it('uses the built-in loaders when no override is supplied', async () => {
    const signals = await collectProductSignals({ config: configured, now });

    expect(signals.map((signal) => signal.fingerprint)).toEqual([
      'product-health:portfolio-freshness/priority-coverage',
      'product-health:engagement/active',
    ]);
    expect(signals[0]?.status).toBe('healthy');
    expect(signals[0]?.evidence).toMatchObject({
      expectedWallets: 23,
      freshWallets: 23,
      freshWindowHours: FRESH_WINDOW_HOURS,
    });
  });

  it('uses the built-in coverage loader when only the health loader is overridden', async () => {
    const signals = await collectProductSignals({
      config: configured,
      now,
      load: vi.fn().mockResolvedValue({
        registeredUsers: 10,
        verifiedWallets: 8,
        portfolioUsers: 5,
        wau: 4,
        mau: 9,
        observedPortfolioUsd: 1000,
        portfolioFresh24h: 5,
        portfolioFresh7d: 5,
        top1PortfolioShare: 0.2,
        top3PortfolioShare: 0.5,
        activePortfolios7d: 3,
      }),
    });

    expect(signals[0]?.fingerprint).toBe(
      'product-health:portfolio-freshness/priority-coverage',
    );
    expect(signals[0]?.status).toBe('healthy');
  });
});
