import {
  AVG_DAYS_PER_MONTH,
  estimateMonthlyIncomeUsd,
} from '@core/lib/analytics/incomeEstimate';
import { describe, expect, it } from 'vitest';

describe('income estimate', () => {
  it('annualizes the daily run rate to an average calendar month', () => {
    expect(estimateMonthlyIncomeUsd(2)).toBe(2 * AVG_DAYS_PER_MONTH);
  });
});
