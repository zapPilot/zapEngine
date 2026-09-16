import { beforeEach, describe, expect, it, vi } from 'vitest';

const createServiceRoleClient = vi.hoisted(() => vi.fn());

vi.mock('./supabase.js', () => ({ createServiceRoleClient }));

import { readControlCenterConfig } from '../config/env.js';
import { createCostRepository } from './cost-repository.js';

function chain(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'order', 'limit', 'gte', 'lt']) {
    builder[method] = vi.fn(() => builder);
  }
  builder['then'] = (
    resolve: (v: unknown) => unknown,
    reject?: (e: unknown) => unknown,
  ) => Promise.resolve(result).then(resolve, reject);
  return builder;
}

const config = readControlCenterConfig({
  SUPABASE_URL: 'https://db.example',
  SUPABASE_SERVICE_ROLE_KEY: 'service-key',
  SUPABASE_DB_SCHEMA: 'ops',
});

describe('cost repository null-payload branches', () => {
  beforeEach(() => createServiceRoleClient.mockReset());

  it('treats a null snapshot payload as an empty ledger', async () => {
    const snapshots = chain({ data: null, error: null });
    const transactions = chain({
      data: [{ amount_usd: 2, charged_at: '2026-09-03T00:00:00Z' }],
      error: null,
    });
    const from = vi.fn((table: string) =>
      table === 'ops_cost_snapshots' ? snapshots : transactions,
    );
    createServiceRoleClient.mockReturnValue({ from });

    const history = await createCostRepository(config)!.loadHistory(
      new Date('2026-09-15T12:00:00.000Z'),
    );
    expect(history.currentMonthDaily).toEqual([]);
    expect(history.monthlyTotals).toEqual([]);
    expect(history.cashSpendUsd).toBe(2);
    expect(history.previousMonthByProvider).toHaveLength(5);
    expect(
      history.previousMonthByProvider.every(
        (entry) => entry.accruedCostUsd === null,
      ),
    ).toBe(true);
  });

  it('treats a null transaction payload as no cash spend', async () => {
    const snapshots = chain({ data: [], error: null });
    const transactions = chain({ data: null, error: null });
    const from = vi.fn((table: string) =>
      table === 'ops_cost_snapshots' ? snapshots : transactions,
    );
    createServiceRoleClient.mockReturnValue({ from });

    const history = await createCostRepository(config)!.loadHistory(
      new Date('2026-09-15T12:00:00.000Z'),
    );
    expect(history.cashSpendUsd).toBeNull();
    expect(history.currentMonthDaily).toEqual([]);
  });
});
