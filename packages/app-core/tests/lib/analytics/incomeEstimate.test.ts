import {
  AVG_DAYS_PER_MONTH,
  estimateMonthlyIncomeUsd,
} from '@core/lib/analytics/incomeEstimate';
import { describe, expect, it } from 'vitest';

describe('income estimate', () => {
  it('converts a daily run rate to an average calendar month', () => {
    expect(AVG_DAYS_PER_MONTH).toBe(30.4);
    expect(estimateMonthlyIncomeUsd(10)).toBeCloseTo(304);
  });
});
