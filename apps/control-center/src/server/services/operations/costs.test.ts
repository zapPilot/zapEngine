import type { CostSnapshot } from '@zapengine/cost-observability';
import { describe, expect, it, vi } from 'vitest';

import type { CostProviderResult } from '../../../shared/types.js';
import { readControlCenterConfig } from '../../config/env.js';
import type { CostRepository } from '../cost-repository.js';
import { collectCostSignals } from './costs.js';

const config = readControlCenterConfig({
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
});
const now = new Date('2026-08-28T12:00:00.000Z');

function snapshot(fetchedAt: string): CostSnapshot {
  return {
    provider: 'supabase',
    periodStart: '2026-08-01T00:00:00.000Z',
    periodEnd: '2026-08-28T12:00:00.000Z',
    usage: [],
    accruedCostUsd: 25,
    projectedCostUsd: 25,
    costType: 'fixed',
    source: 'fixed',
    fetchedAt,
  };
}

function repositoryWith(
  loadLatestProviders: CostRepository['loadLatestProviders'],
): CostRepository {
  return {
    loadPricingRates: vi.fn(),
    upsertSnapshot: vi.fn(),
    loadLatestProviders,
    loadHistory: vi.fn(),
    insertTransaction: vi.fn(),
    upsertManualSnapshot: vi.fn(),
  };
}

describe('collectCostSignals', () => {
  it('reports unknown when Supabase is unconfigured', async () => {
    const signals = await collectCostSignals({
      config: readControlCenterConfig({}),
      now,
    });

    expect(signals).toHaveLength(1);
    expect(signals[0]?.fingerprint).toBe('cost-ledger:unconfigured/supabase');
    expect(signals[0]?.status).toBe('unknown');
  });

  it('emits one signal per provider plus a fresh ledger age', async () => {
    const providers: CostProviderResult[] = [
      {
        provider: 'supabase',
        label: 'Supabase',
        status: 'ok',
        costType: 'fixed',
        message: null,
        snapshot: snapshot('2026-08-28T06:00:00.000Z'),
      },
      {
        provider: 'debank',
        label: 'DeBank',
        status: 'error',
        costType: 'list-price-equivalent',
        message: 'DeBank responded 502',
        snapshot: null,
      },
    ];

    const signals = await collectCostSignals({
      config,
      now,
      repository: repositoryWith(vi.fn().mockResolvedValue(providers)),
    });

    expect(
      signals.map((signal) => [signal.fingerprint, signal.status]),
    ).toEqual([
      ['cost-ledger:provider/supabase', 'healthy'],
      ['cost-ledger:provider/debank', 'degraded'],
      ['cost-ledger:snapshot-age/ledger', 'healthy'],
    ]);
    expect(signals[0]?.evidence).toEqual({
      accruedCostUsd: 25,
      projectedCostUsd: 25,
      costType: 'fixed',
    });
    expect(signals[1]?.detail).toBe('DeBank responded 502');
    expect(signals[1]?.evidence).toEqual({
      accruedCostUsd: null,
      projectedCostUsd: null,
      costType: 'list-price-equivalent',
    });
    expect(signals[2]?.evidence).toEqual({ staleHours: 6 });
  });

  it('degrades the ledger age once the nightly sync stops landing', async () => {
    const signals = await collectCostSignals({
      config,
      now,
      repository: repositoryWith(
        vi.fn().mockResolvedValue([
          {
            provider: 'supabase',
            label: 'Supabase',
            status: 'ok',
            costType: 'fixed',
            message: null,
            snapshot: snapshot('2026-08-25T12:00:00.000Z'),
          },
        ] satisfies CostProviderResult[]),
      ),
    });

    expect(signals[1]?.status).toBe('degraded');
    expect(signals[1]?.evidence).toEqual({ staleHours: 72 });
    expect(signals[1]?.detail).toContain('72h old');
  });

  it('degrades the ledger age when nothing was ever persisted', async () => {
    const signals = await collectCostSignals({
      config,
      now,
      repository: repositoryWith(
        vi.fn().mockResolvedValue([
          {
            provider: 'fly',
            label: 'Fly.io',
            status: 'unconfigured',
            costType: 'estimated',
            message: 'FLY_COST_MODE=manual',
            snapshot: null,
          },
        ] satisfies CostProviderResult[]),
      ),
    });

    expect(signals[0]?.status).toBe('unknown');
    expect(signals[1]?.status).toBe('degraded');
    expect(signals[1]?.evidence).toEqual({ staleHours: null });
    expect(signals[1]?.detail).toContain('never landed');
  });

  it('turns a rejecting repository into a source failure', async () => {
    const signals = await collectCostSignals({
      config,
      now,
      repository: repositoryWith(
        vi.fn().mockRejectedValue(new Error('ops_cost_snapshots denied')),
      ),
    });

    expect(signals).toHaveLength(1);
    expect(signals[0]?.fingerprint).toBe('cost-ledger:source-failure/adapter');
    expect(signals[0]?.status).toBe('degraded');
    expect(signals[0]?.detail).toBe('ops_cost_snapshots denied');
  });
});
