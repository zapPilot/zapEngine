import { describe, expect, it, vi } from 'vitest';

import { readControlCenterConfig } from '../config/env.js';
import { costRepositoryFake } from './__fixtures__/cost.js';
import { createOverviewService } from './overview.js';
import type { loadSocialPerformance } from './social.js';

const NOW = new Date('2026-09-02T06:55:34.382Z');
const social = {
  status: 'ok' as const,
  message: null,
  window: 'latest' as const,
  generatedAt: NOW.toISOString(),
  accounts: [{ platform: 'x', followers: 10, capturedAt: NOW.toISOString() }],
  decisions: [],
  episodes: [],
};

function loadSocialMock() {
  return vi.fn().mockResolvedValue(social) as unknown as typeof loadSocialPerformance;
}

describe('overview coverage', () => {
  it('serves unconfigured providers and empty history without a repository', async () => {
    const loadSocial = loadSocialMock();
    const service = createOverviewService({
      config: readControlCenterConfig({}),
      repository: null,
      loadSocial,
      now: () => NOW,
    });
    const result = await service.getOverview();
    expect(result.providers.every((p) => p.status === 'unconfigured')).toBe(true);
    expect(result.providers).toHaveLength(5);
    expect(result.accruedCostUsd).toBeNull();
    expect(result.socialReach).toBe(10);
    await expect(service.getCostHistory()).resolves.toMatchObject({
      currentMonthDaily: [],
    });
  });

  it('maps a repository rejection to error providers', async () => {
    const service = createOverviewService({
      config: readControlCenterConfig({}),
      repository: costRepositoryFake({
        loadLatestProviders: vi.fn().mockRejectedValue({ message: 'ledger down' }),
      }),
      loadSocial: loadSocialMock(),
      now: () => NOW,
    });
    const result = await service.getOverview();
    expect(result.providers.every((p) => p.status === 'error')).toBe(true);
    expect(result.providers[0]?.message).toBe('ledger down');
  });

  it('falls back to empty history when the ledger read rejects', async () => {
    const service = createOverviewService({
      config: readControlCenterConfig({}),
      repository: costRepositoryFake({
        loadHistory: vi.fn().mockRejectedValue(new Error('history boom')),
      }),
      loadSocial: loadSocialMock(),
      now: () => NOW,
    });
    const result = await service.getOverview();
    expect(result.cashInvoiceSpendUsd).toBeNull();
    await expect(service.getCostHistory()).resolves.toMatchObject({
      monthlyTotals: [],
    });
  });

  it('syncCosts throws without a repository', async () => {
    const service = createOverviewService({
      config: readControlCenterConfig({}),
      repository: null,
      now: () => NOW,
    });
    await expect(service.syncCosts()).rejects.toThrow(
      'Supabase ops repository is not configured',
    );
  });

  it('syncCosts runs sync and refreshes the social cache', async () => {
    const loadSocial = loadSocialMock();
    const sync = vi.fn().mockResolvedValue({ ok: true });
    const service = createOverviewService({
      config: readControlCenterConfig({}),
      repository: costRepositoryFake(),
      loadSocial,
      sync: sync as never,
      now: () => NOW,
    });
    await service.getOverview();
    expect(loadSocial).toHaveBeenCalledTimes(1);
    await service.syncCosts();
    expect(sync).toHaveBeenCalledTimes(1);
    // forced refresh bypasses the cache
    expect(loadSocial).toHaveBeenCalledTimes(2);
  });

  it('getSocial forwards the requested window', async () => {
    const loadSocial = loadSocialMock();
    const service = createOverviewService({
      config: readControlCenterConfig({}),
      repository: null,
      loadSocial,
      now: () => NOW,
    });
    await service.getSocial('24h');
    expect(loadSocial).toHaveBeenCalledWith(
      expect.objectContaining({ window: '24h' }),
    );
  });

  it('defaults now to the current time when omitted', async () => {
    const service = createOverviewService({
      config: readControlCenterConfig({}),
      repository: null,
      loadSocial: loadSocialMock(),
    });
    const result = await service.getOverview();
    expect(result.providers).toHaveLength(5);
    expect(Date.parse(result.generatedAt)).not.toBeNaN();
  });
});
