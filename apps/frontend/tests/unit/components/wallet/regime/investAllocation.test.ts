import { describe, expect, it } from 'vitest';

import {
  buildInvestAllocationComparison,
  buildInvestAllocationEntries,
  EMPTY_INVEST_ALLOCATION,
  INVEST_ALLOCATION_BUCKETS,
  toInvestCompositionTarget,
} from '@/components/wallet/regime/investAllocation';

describe('investAllocation', () => {
  it('defines a canonical two-bucket invest allocation', () => {
    expect(INVEST_ALLOCATION_BUCKETS).toEqual(['spot', 'stable']);
    expect(EMPTY_INVEST_ALLOCATION).toEqual({ spot: 0, stable: 0 });
  });

  it('builds invest allocation entries in canonical order', () => {
    expect(buildInvestAllocationEntries({ spot: 70, stable: 30 })).toEqual([
      expect.objectContaining({
        key: 'spot',
        label: 'Spot',
        progressLabel: 'Target Spot',
        value: 70,
      }),
      expect.objectContaining({
        key: 'stable',
        label: 'Stable',
        progressLabel: 'Target Stable',
        value: 30,
      }),
    ]);
  });

  it('builds comparison rows without introducing extra buckets', () => {
    const rows = buildInvestAllocationComparison(
      { spot: 45, stable: 55 },
      { spot: 70, stable: 30 },
    );

    expect(rows).toEqual([
      expect.objectContaining({
        key: 'spot',
        label: 'Spot',
        current: 45,
        target: 70,
      }),
      expect.objectContaining({
        key: 'stable',
        label: 'Stable',
        current: 55,
        target: 30,
      }),
    ]);
  });

  it('maps invest allocation directly to composition target', () => {
    expect(toInvestCompositionTarget({ spot: 45, stable: 55 })).toEqual({
      crypto: 45,
      stable: 55,
    });
  });
});
