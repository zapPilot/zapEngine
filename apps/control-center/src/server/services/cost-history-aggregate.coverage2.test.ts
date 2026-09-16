import { describe, expect, it } from 'vitest';

import { ledgerRow } from './__fixtures__/cost.js';
import {
  aggregateMonthly,
  describeSnapshot,
  type SnapshotRow,
} from './cost-history-aggregate.js';

function row(overrides: Partial<SnapshotRow> = {}): SnapshotRow {
  return ledgerRow({
    snapshot_date: '2026-09-01',
    period_start: '2026-09-01T00:00:00.000Z',
    period_end: '2026-09-01T09:31:28.411Z',
    fetched_at: '2026-09-01T09:31:28.411Z',
    ...overrides,
  });
}

describe('cost-history-aggregate coverage gaps', () => {
  it('returns null for a priced-but-unpriced non-metered provider', () => {
    expect(
      describeSnapshot(row({ provider: 'openrouter', accrued_cost_usd: null })),
    ).toBeNull();
    expect(
      describeSnapshot(row({ provider: 'supabase', accrued_cost_usd: null })),
    ).toBeNull();
  });

  it('keeps the newest row when an older row arrives later', () => {
    const monthly = aggregateMonthly([
      row({ snapshot_date: '2026-09-02', accrued_cost_usd: 9 }),
      row({ snapshot_date: '2026-08-05', accrued_cost_usd: 1 }),
    ]);

    // The September bucket keeps 9; the August bucket keeps 1. The second row
    // exercises the `previous.snapshot_date <= row.snapshot_date` false path
    // for September (older August row must not overwrite the newer one).
    expect(monthly).toEqual([
      { month: '2026-08', accruedCostUsd: 1 },
      { month: '2026-09', accruedCostUsd: 9 },
    ]);
  });

  it('does not overwrite a newer row with an older duplicate month', () => {
    const monthly = aggregateMonthly([
      row({ snapshot_date: '2026-09-10', accrued_cost_usd: 5 }),
      row({ snapshot_date: '2026-09-01', accrued_cost_usd: 1 }),
    ]);

    expect(monthly).toEqual([{ month: '2026-09', accruedCostUsd: 5 }]);
  });
});
