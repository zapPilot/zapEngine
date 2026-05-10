import analyticsSnapshot from '@/data/strategy-snapshot.json';
import { getBacktestSnapshot } from '@/data/snapshot';

describe('getBacktestSnapshot', () => {
  it('formats the pinned hierarchical minimum strategy metrics', () => {
    const snapshot = getBacktestSnapshot();

    expect(snapshot.strategyId).toBe('dma_fgi_hierarchical_minimum');
    expect(snapshot.referenceDate).toBe(analyticsSnapshot.reference_date);
    expect(snapshot.windowDays).toBe(analyticsSnapshot.window_days);
    expect(snapshot.windowStart).toBe(analyticsSnapshot.window_start);
    expect(snapshot.windowEnd).toBe(analyticsSnapshot.window_end);
    expect(snapshot.roiPercent).toBe('121.30%');
    expect(snapshot.maxDrawdownPercent).toBe('-16.97%');
    expect(snapshot.sharpeRatio).toBe('1.98');
    expect(snapshot.calmarRatio).toBe('4.63');
    expect(snapshot.tradeCount).toBe('81');
  });
});
