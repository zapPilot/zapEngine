import { describe, expect, it } from 'vitest';

import {
  amountUsdFromInput,
  depositSupportLabel,
  normalizeAmountInput,
} from '@/integration/investAmountModel';

describe('Invest amount helpers', () => {
  it('generates deposit support copy from supported Base tokens', () => {
    expect(depositSupportLabel([{ symbol: 'USDC' }, { symbol: 'ETH' }])).toBe(
      'Deposit v1 supports Base USDC and Base ETH',
    );
  });

  it('keeps USD mode as USD and converts token mode through selected price', () => {
    expect(amountUsdFromInput('1,000', 'USD', null)).toBe(1000);
    expect(amountUsdFromInput('2.5', 'Token', 3000)).toBe(7500);
    expect(amountUsdFromInput('2.5', 'Token', null)).toBeNull();
    expect(amountUsdFromInput('0', 'USD', 1)).toBeNull();
  });

  it('normalizes direct keyboard amount input while preserving decimals', () => {
    expect(normalizeAmountInput('$1000111')).toBe('1,000,111');
    expect(normalizeAmountInput('001234.50')).toBe('1,234.50');
    expect(normalizeAmountInput('12.3.4')).toBe('12.34');
    expect(normalizeAmountInput('')).toBe('');
  });
});
