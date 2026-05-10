import analyticsSnapshot from '@/data/strategy-snapshot.json';
import { getBacktestSnapshot } from '@/data/snapshot';

describe('getBacktestSnapshot', () => {
  it('formats the default strategy metrics from the snapshot', () => {
    const snapshot = getBacktestSnapshot();

    expect(snapshot.strategyId).toBe(analyticsSnapshot.default_strategy_id);
    expect(snapshot.referenceDate).toBe(analyticsSnapshot.reference_date);
    expect(snapshot.windowDays).toBe(analyticsSnapshot.window_days);
    expect(snapshot.windowStart).toBe(analyticsSnapshot.window_start);
    expect(snapshot.windowEnd).toBe(analyticsSnapshot.window_end);
    expect(snapshot.roiPercent).toBe('50.84%');
    expect(snapshot.maxDrawdownPercent).toBe('-9.32%');
    expect(snapshot.sharpeRatio).toBe('2.03');
    expect(snapshot.calmarRatio).toBe('3.75');
    expect(snapshot.tradeCount).toBe('49');
  });
});
