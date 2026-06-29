import { describe, expect, it } from 'vitest';

import {
  amountUsdFromInput,
  depositSupportLabel,
} from '../src/routes/InvestAmountScreen';

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
});
