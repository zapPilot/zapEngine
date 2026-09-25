import { describe, expect, it, vi } from 'vitest';
import type { Address, PublicClient } from 'viem';

import type { GmxV2PricingAdapter } from '../../src/adapters/gmx-v2-pricing.adapter.js';
import type { LiFiAdapter } from '../../src/adapters/lifi.adapter.js';
import { GMX_V2_TOKENS } from '../../src/protocols/gmx-v2/gmx-v2.constants.js';

vi.mock('../../src/protocols/gmx-v2/index.js', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../../src/protocols/gmx-v2/index.js')
    >();

  return { ...actual, GMX_V2_SWAP_PATHS: [] };
});

import { buildGmxV2SupplyTx } from '../../src/builders/gmx-v2-supply.builder.js';

const USER = '0x1111111111111111111111111111111111111111' as Address;
const PUBLIC_CLIENT = {} as PublicClient;

describe('buildGmxV2SupplyTx without a configured swap path', () => {
  it('refuses a funding token it cannot turn into either pool token', async () => {
    const getSwapQuote = vi.fn();
    const getDepositAmountOut = vi.fn();

    await expect(
      buildGmxV2SupplyTx(
        {
          marketKey: 'btc-btc',
          fromToken: GMX_V2_TOKENS.USDC.address,
          fromAmount: '1000000',
          userAddress: USER,
        },
        { getSwapQuote } as unknown as LiFiAdapter,
        PUBLIC_CLIENT,
        { getDepositAmountOut } as unknown as GmxV2PricingAdapter,
      ),
    ).rejects.toThrow('GMX v2 has no swap path from');

    expect(getSwapQuote).not.toHaveBeenCalled();
    expect(getDepositAmountOut).not.toHaveBeenCalled();
  });
});
