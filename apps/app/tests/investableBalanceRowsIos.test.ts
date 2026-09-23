import { describe, expect, it } from 'vitest';

import { buildInvestableBalanceRows } from '@/integration/investableBalanceRows.ios';

describe('investableBalanceRows.ios', () => {
  it('returns no invest funding rows on iOS', () => {
    expect(buildInvestableBalanceRows([])).toEqual([]);
  });

  it('ignores wallet assets including base-chain deposits', () => {
    expect(
      buildInvestableBalanceRows([
        {
          symbol: 'USDC',
          chains: ['base'],
          rawAmount: 2,
        } as never,
      ]),
    ).toEqual([]);
  });
});
