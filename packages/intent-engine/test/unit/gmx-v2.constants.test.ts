import { describe, expect, it } from 'vitest';

import { GMX_V2_TOKENS } from '../../src/protocols/gmx-v2/gmx-v2.constants.js';

describe('GMX v2 token constants', () => {
  it('keeps registry-derived token values byte-identical', () => {
    expect(GMX_V2_TOKENS).toEqual({
      USDC: {
        address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
        symbol: 'USDC',
        decimals: 6,
      },
      USDT: {
        address: '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9',
        symbol: 'USDT',
        decimals: 6,
      },
      ETH: {
        address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
        symbol: 'ETH',
        decimals: 18,
      },
      WETH: {
        address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
        symbol: 'WETH',
        decimals: 18,
      },
      WBTC_B: {
        address: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f',
        symbol: 'WBTC.b',
        decimals: 8,
      },
    });
  });
});
