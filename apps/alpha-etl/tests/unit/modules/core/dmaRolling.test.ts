import { describe, expect, it } from 'vitest';

import {
  buildRollingDmaSnapshots,
  mapRollingMetric,
} from '../../../../src/modules/core/dmaRolling.js';

describe('dmaRolling', () => {
  it('maps a missing rolling metric to empty defaults', () => {
    expect(mapRollingMetric(undefined, 'price_vs_dma_ratio')).toEqual({
      dma_200: null,
      price_vs_dma_ratio: null,
      is_above_dma: null,
      days_available: 0,
    });
  });

  it('projects partial and complete rolling windows', () => {
    const rows = [
      { snapshot_date: '2026-01-01', value: 10 },
      { snapshot_date: '2026-01-02', value: 20 },
    ];

    const snapshots = buildRollingDmaSnapshots(
      rows,
      2,
      (row) => row.value,
      (row, metric) => ({ row, metric }),
    );

    expect(snapshots[0]?.metric).toEqual({
      dma200: null,
      ratioVsDma: null,
      isAboveDma: null,
      daysAvailable: 1,
    });
    expect(snapshots[1]?.metric).toEqual({
      dma200: 15,
      ratioVsDma: 20 / 15,
      isAboveDma: true,
      daysAvailable: 2,
    });
  });
});
