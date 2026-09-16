import { describe, expect, it, vi } from 'vitest';

import { readControlCenterConfig } from '../config/env.js';
import { costRepositoryFake } from './__fixtures__/cost.js';
import type { CostRepository } from './cost-repository.js';
import { syncCosts } from './cost-sync.js';

const NOW = new Date('2026-08-22T12:00:00.000Z');

function flyctlFailure() {
  return Promise.reject(new Error('flyctl exited 1'));
}

describe('cost-sync coverage gaps', () => {
  it('throws when the repository is absent and cannot be created', async () => {
    await expect(
      syncCosts({ config: readControlCenterConfig({}) }),
    ).rejects.toThrow('Supabase ops repository is not configured');
  });

  it('reports a persistence failure as an error with the attempted cost', async () => {
    const upsertSnapshot = vi
      .fn<CostRepository['upsertSnapshot']>()
      .mockRejectedValue(new Error('write failed'));
    const repository = costRepositoryFake({ upsertSnapshot });

    const result = await syncCosts({
      config: readControlCenterConfig({
        OPENROUTER_API_KEY: 'openrouter-key',
      }),
      repository,
      fetch: vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              data: {
                usage: 1,
                usage_daily: 1,
                usage_weekly: 1,
                usage_monthly: 1,
                limit: null,
                limit_remaining: null,
              },
            }),
          ),
        ),
      ),
      now: NOW,
    });

    const openrouter = result.providers.find(
      (p) => p.provider === 'openrouter',
    );
    expect(openrouter).toMatchObject({ status: 'error' });
    expect(openrouter?.message).toBe('Snapshot persistence failed');
    expect(openrouter?.accruedCostUsd).toBe(1);
  });

  it('reports fly with neither collector nor recorded figure as an error when the collector fails', async () => {
    const upsertSnapshot = vi
      .fn<CostRepository['upsertSnapshot']>()
      .mockResolvedValue(undefined);
    const repository = costRepositoryFake({ upsertSnapshot });

    const result = await syncCosts({
      config: readControlCenterConfig({ FLY_COST_MODE: 'flyctl' }),
      repository,
      flyRun: flyctlFailure,
      now: NOW,
    });

    const fly = result.providers.find((p) => p.provider === 'fly');
    expect(fly).toMatchObject({ status: 'error', accruedCostUsd: null });
    expect(upsertSnapshot).not.toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'fly' }),
      expect.anything(),
    );
  });

  it('reports fly with neither source as skipped when the collector is unconfigured', async () => {
    const upsertSnapshot = vi
      .fn<CostRepository['upsertSnapshot']>()
      .mockResolvedValue(undefined);
    const repository = costRepositoryFake({ upsertSnapshot });

    const result = await syncCosts({
      config: readControlCenterConfig({}),
      repository,
      now: NOW,
    });

    expect(result.providers.find((p) => p.provider === 'fly')).toMatchObject({
      status: 'skipped',
      accruedCostUsd: null,
    });
  });

  it('persists a non-fly null snapshot as skipped without writing', async () => {
    const upsertSnapshot = vi
      .fn<CostRepository['upsertSnapshot']>()
      .mockResolvedValue(undefined);
    const repository = costRepositoryFake({ upsertSnapshot });

    const result = await syncCosts({
      config: readControlCenterConfig({}),
      repository,
      now: NOW,
    });

    // All providers unconfigured: every null snapshot is skipped, none
    // is persisted, and the summary counts zero writes.
    expect(result.persisted).toBe(0);
    expect(result.providers.length).toBeGreaterThan(0);
    expect(result.providers.every((p) => p.status === 'skipped')).toBe(true);
    expect(upsertSnapshot).not.toHaveBeenCalled();
  });
});
