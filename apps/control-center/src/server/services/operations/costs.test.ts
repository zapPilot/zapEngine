import { describe, expect, it, vi } from 'vitest';

import type { CostProviderResult } from '../../../shared/types.js';
import { readControlCenterConfig } from '../../config/env.js';
import {
  costRepositoryFake,
  flyRunRateOnlyRow,
  ledgerRow,
  supabaseFixedRow,
} from '../__fixtures__/cost.js';
import {
  FLY_RUN_RATE_ONLY_MESSAGE,
  toProviderResults,
} from '../cost-history-aggregate.js';
import { collectCostSignals } from './costs.js';

const config = readControlCenterConfig({
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
});
const now = new Date('2026-08-28T12:00:00.000Z');
const SIX_HOURS_AGO = '2026-08-28T06:00:00.000Z';
const THREE_DAYS_AGO = '2026-08-25T12:00:00.000Z';

/**
 * A row the nightly sync never managed to persist anything for. The age signal
 * reads `fetchedAt`, so a missing snapshot is its own case rather than an old
 * one — and it is the only shape a failed or unconfigured provider can have.
 */
function unpersistedRow(
  row: Omit<CostProviderResult, 'snapshot'>,
): CostProviderResult {
  return { ...row, snapshot: null };
}

function signalsFor(providers: CostProviderResult[]) {
  return collectCostSignals({
    config,
    now,
    repository: costRepositoryFake({
      loadLatestProviders: vi.fn().mockResolvedValue(providers),
    }),
  });
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
    const signals = await signalsFor([
      supabaseFixedRow({ fetchedAt: SIX_HOURS_AGO }),
      unpersistedRow({
        provider: 'debank',
        label: 'DeBank',
        status: 'error',
        costType: 'list-price-equivalent',
        message: 'DeBank responded 502',
      }),
    ]);

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

  it('keeps an unpriced Fly run-rate row healthy and names what is missing', async () => {
    const signals = await signalsFor([
      flyRunRateOnlyRow({ fetchedAt: SIX_HOURS_AGO }),
    ]);

    // Collection worked and only the billed figure is absent, so the signal
    // stays green: "needs attention" belongs to providers that actually fail.
    expect(signals[0]?.status).toBe('healthy');
    expect(signals[0]?.detail).toBe(FLY_RUN_RATE_ONLY_MESSAGE);
    expect(signals[0]?.evidence).toEqual({
      accruedCostUsd: null,
      projectedCostUsd: null,
      costType: 'estimated',
    });
    expect(signals[1]?.status).toBe('healthy');
  });

  it('degrades the ledger age once the nightly sync stops landing', async () => {
    const signals = await signalsFor([
      supabaseFixedRow({ fetchedAt: THREE_DAYS_AGO }),
    ]);

    expect(signals[1]?.status).toBe('degraded');
    expect(signals[1]?.evidence).toEqual({ staleHours: 72 });
    expect(signals[1]?.detail).toContain('72h old');
  });

  it('degrades the ledger age when nothing was ever persisted', async () => {
    const signals = await signalsFor([
      unpersistedRow({
        provider: 'fly',
        label: 'Fly.io',
        status: 'unconfigured',
        costType: 'estimated',
        message: 'FLY_COST_MODE=manual',
      }),
    ]);

    expect(signals[0]?.status).toBe('unknown');
    expect(signals[1]?.status).toBe('degraded');
    expect(signals[1]?.evidence).toEqual({ staleHours: null });
    expect(signals[1]?.detail).toContain('never landed');
  });

  it('reports a provider whose newest reading predates this month as unknown', async () => {
    const signals = await collectCostSignals({
      config,
      now,
      repository: costRepositoryFake({
        loadLatestProviders: vi.fn((at: Date) =>
          Promise.resolve(
            toProviderResults(
              [
                ledgerRow({
                  provider: 'fly',
                  snapshot_date: '2026-07-31',
                  accrued_cost_usd: 14.02,
                  projected_cost_usd: 14.02,
                  cost_type: 'estimated',
                  source: 'manual',
                }),
              ],
              at,
            ),
          ),
        ),
      }),
    });
    const fly = signals.find(
      (signal) => signal.fingerprint === 'cost-ledger:provider/fly',
    );

    // A July reading says nothing about August, so the signal reports a gap
    // and names the date it does have rather than passing $14.02 off as now.
    expect(fly?.status).toBe('unknown');
    expect(fly?.detail).toContain('2026-07-31');
    expect(fly?.evidence).toEqual({
      accruedCostUsd: null,
      projectedCostUsd: null,
      costType: 'estimated',
    });
  });

  it('turns a rejecting repository into a source failure', async () => {
    const signals = await collectCostSignals({
      config,
      now,
      repository: costRepositoryFake({
        loadLatestProviders: vi
          .fn()
          .mockRejectedValue(new Error('ops_cost_snapshots denied')),
      }),
    });

    expect(signals).toHaveLength(1);
    expect(signals[0]?.fingerprint).toBe('cost-ledger:source-failure/adapter');
    expect(signals[0]?.status).toBe('degraded');
    expect(signals[0]?.detail).toBe('ops_cost_snapshots denied');
  });
});
