import { describe, expect, it, vi } from 'vitest';
import type { Address, PublicClient } from 'viem';

import type {
  GmxV2PricingAdapter,
} from '../../src/adapters/gmx-v2-pricing.adapter.js';
import type { LiFiAdapter } from '../../src/adapters/lifi.adapter.js';
import {
  GMX_V2_ARBITRUM_CHAIN_ID,
  GMX_V2_TOKENS,
} from '../../src/protocols/gmx-v2/gmx-v2.constants.js';
import type { TransactionQuote } from '../../src/types/transaction.types.js';

vi.mock('../../src/protocols/gmx-v2/index.js', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('../../src/protocols/gmx-v2/index.js')
  >();

  return {
    ...actual,
    GMX_V2_MARKETS: {
      ...actual.GMX_V2_MARKETS,
      'btc-btc': {
        ...actual.GMX_V2_MARKETS['btc-btc'],
        collateralToken: actual.GMX_V2_TOKENS.WETH.address,
      },
    },
  };
});

import {
  buildGmxV2SupplyTx,
} from '../../src/builders/gmx-v2-supply.builder.js';

const USER = '0x1111111111111111111111111111111111111111' as Address;
const SWAP_TARGET = '0x2222222222222222222222222222222222222222' as Address;
const PUBLIC_CLIENT = {} as PublicClient;

function makeSwapQuote(): TransactionQuote {
  return {
    transaction: {
      to: SWAP_TARGET,
      data: '0x1234',
      value: '0',
      chainId: GMX_V2_ARBITRUM_CHAIN_ID,
      gasLimit: '300000',
      meta: {
        intentType: 'SWAP',
        route: { tool: 'lifi' },
      },
    },
    estimate: {
      fromAmount: '1000000',
      toAmount: '13000',
      toAmountMin: '12345',
      gasCostUsd: '0.02',
      feeCostUsd: '0',
      executionDuration: 30,
      tool: 'lifi',
    },
  };
}

describe('buildGmxV2SupplyTx single-collateral coverage', () => {
  it(
    'rejects collateral that does not match the single-collateral pool token',
    async () => {
      const getSwapQuote = vi.fn().mockResolvedValue(makeSwapQuote());
      const adapter = { getSwapQuote } as unknown as LiFiAdapter;
      const getDepositAmountOut = vi
        .fn()
        .mockResolvedValue(500000000000000000n);
      const pricingAdapter = {
        getDepositAmountOut,
      } as unknown as GmxV2PricingAdapter;

      await expect(
        buildGmxV2SupplyTx(
          {
            marketKey: 'btc-btc',
            fromToken: GMX_V2_TOKENS.USDC.address,
            fromAmount: '1000000',
            userAddress: USER,
          },
          adapter,
          PUBLIC_CLIENT,
          pricingAdapter,
        ),
      ).rejects.toThrow(
        'GMX single-collateral deposit token must match the pool token',
      );

      expect(getSwapQuote).toHaveBeenCalledWith(
        expect.objectContaining({
          fromToken: GMX_V2_TOKENS.USDC.address,
          toToken: GMX_V2_TOKENS.WETH.address,
        }),
      );
      expect(getDepositAmountOut).not.toHaveBeenCalled();
    },
  );
});
