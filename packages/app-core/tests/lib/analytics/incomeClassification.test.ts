import {
  AVG_DAYS_PER_MONTH,
  classifyIncomeProtocol,
  estimateMonthlyIncomeUsd,
} from '@core/lib/analytics/incomeClassification';
import { describe, expect, it } from 'vitest';

describe('income protocol classification', () => {
  it.each(['GMX V2', 'gmx v2', 'Hyperliquid'])(
    'classifies %s as strategy income',
    (protocol) => expect(classifyIncomeProtocol(protocol)).toBe('strategy'),
  );

  it.each(['morpho', 'Aave V3', 'unknown protocol'])(
    'classifies %s as passive income',
    (protocol) => expect(classifyIncomeProtocol(protocol)).toBe('passive'),
  );

  it('annualizes the daily run rate to an average calendar month', () => {
    expect(estimateMonthlyIncomeUsd(2)).toBe(2 * AVG_DAYS_PER_MONTH);
  });
});
