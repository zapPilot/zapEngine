import { describe, expect, it, vi } from 'vitest';

import { readControlCenterConfig } from '../config/env.js';
import type { CostRepository } from './cost-repository.js';
import { createOverviewService } from './overview.js';

const social = {
  status: 'ok' as const,
  message: null,
  window: 'latest' as const,
  generatedAt: '2026-08-22T12:00:00.000Z',
  accounts: [],
  decisions: [],
  episodes: [],
};

describe('createOverviewService', () => {
  it('reads persisted costs fresh even when an external process changes the ledger', async () => {
    const loadLatestProviders = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          provider: 'supabase',
          label: 'Supabase',
          status: 'ok',
          costType: 'fixed',
          message: null,
          snapshot: {
            provider: 'supabase',
            periodStart: '2026-08-01T00:00:00.000Z',
            periodEnd: '2026-08-22T12:00:00.000Z',
            accruedCostUsd: 25,
            projectedCostUsd: 25,
            costType: 'fixed',
            source: 'fixed',
            usage: [],
            fetchedAt: '2026-08-22T12:00:00.000Z',
          },
        },
      ]);
    const repository: CostRepository = {
      loadPricingRates: vi.fn(),
      upsertSnapshot: vi.fn(),
      loadLatestProviders,
      loadHistory: vi.fn().mockResolvedValue({
        currentMonthDaily: [],
        monthlyTotals: [],
        cashSpendUsd: null,
        previousMonthByProvider: [],
      }),
      insertTransaction: vi.fn(),
      upsertManualSnapshot: vi.fn(),
    };
    const loadSocial = vi.fn().mockResolvedValue(social);
    const service = createOverviewService({
      config: readControlCenterConfig({
        CONTROL_CENTER_CACHE_TTL_MS: '900000',
      }),
      repository,
      loadSocial,
      now: () => new Date('2026-08-22T12:00:00.000Z'),
    });

    expect((await service.getOverview()).accruedCostUsd).toBeNull();
    expect((await service.getOverview()).accruedCostUsd).toBe(25);
    expect(loadLatestProviders).toHaveBeenCalledTimes(2);
    expect(loadSocial).toHaveBeenCalledTimes(1);
  });
});
