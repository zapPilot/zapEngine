import { describe, expect, it } from 'vitest';
import type { Address } from 'viem';

import { encodeGmxV2CreateDepositMulticall } from '../../src/protocols/gmx-v2/gmx-v2.encoder.js';
import {
  GMX_V2_MARKETS,
  GMX_V2_TOKENS,
} from '../../src/protocols/gmx-v2/gmx-v2.constants.js';

const USER = '0x1111111111111111111111111111111111111111' as Address;

describe('GMX v2 deposit encoder native collateral coverage', () => {
  it('rejects non-WETH collateral when native WNT funding is enabled', () => {
    const market = GMX_V2_MARKETS['btc-usdc'];
    expect(market.shortToken).not.toBe(GMX_V2_TOKENS.WETH.address);

    expect(() =>
      encodeGmxV2CreateDepositMulticall({
        receiver: USER,
        market,
        initialToken: market.shortToken,
        amount: 1n,
        side: 'short',
        minMarketTokens: 1n,
        useNativeWntCollateral: true,
      }),
    ).toThrow('Native GMX collateral can only fund WETH');
  });
});
