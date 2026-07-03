import { describe, expect, it } from 'vitest';

import { strategyBacktestDaysForRange } from '@/integration/strategyRanges';

describe('Strategy range mapping', () => {
  it('maps strategy tabs to backtest windows', () => {
    expect(strategyBacktestDaysForRange('3M')).toBe(90);
    expect(strategyBacktestDaysForRange('6M')).toBe(180);
    expect(strategyBacktestDaysForRange('1Y')).toBe(365);
    expect(strategyBacktestDaysForRange('ALL')).toBeUndefined();
  });
});
