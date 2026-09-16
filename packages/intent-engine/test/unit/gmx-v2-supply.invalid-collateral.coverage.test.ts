import { describe, expect, it, vi } from 'vitest';
import type { Address, PublicClient } from 'viem';

import type { GmxV2PricingAdapter } from '../../src/adapters/gmx-v2-pricing.adapter.js';
import type { LiFiAdapter } from '../../src/adapters/lifi.adapter.js';
import { buildGmxV2SupplyTx } from '../../src/builders/gmx-v2-supply.builder.js';
import {
  GMX_V2_ARBITRUM_CHAIN_ID,
  GMX_V2_MARKETS,
  GMX_V2_TOKENS,
} from '../../src/protocols/gmx-v2/index.js';
import type { TransactionQuote } from '../../src/types/transaction.types.js';

vi.mock('../../src/protocols/gmx-v2/index.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../src/protocols/gmx-v2/index.js')>();
  const market = actual.GMX_V2_MARKETS['btc-usdc'];

  return {
    ...actual,
    GMX_V2_MARKETS: {
      ...actual.GMX_V2_MARKETS,
      'btc-usdc': {
        ...market,
        collateralToken: actual.GMX_V2_TOKENS.USDT.address,
      },
    },
  };
});

const USER = '0x1111111111111111111111111111111111111111' as Address;
const SWAP_TARGET = '0x3333333333333333333333333333333333333333' as Address;
const PUBLIC_CLIENT = {} as PublicClient;
const FROM_AMOUNT = '1000000';
const SWAP_AMOUNT = '1100000';
const SWAP_MIN_AMOUNT = '1000000';

function makeAdapter() {
  const getSwapQuote = vi.fn().mockImplementation(
    ({
      fromToken,
      toToken,
      fromAmount,
    }: {
      fromToken: Address;
      toToken: Address;
      fromAmount: string;
    }): Promise<TransactionQuote> =>
      Promise.resolve({
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
          fromAmount,
          toAmount: SWAP_AMOUNT,
          toAmountMin: SWAP_MIN_AMOUNT,
          gasCostUsd: '0.02',
          executionDuration: 30,
        },
        route: {
          action: {
            fromToken: { address: fromToken },
            toToken: { address: toToken },
          },
        },
      }),
  );

  return {
    adapter: { getSwapQuote } as unknown as LiFiAdapter,
    getSwapQuote,
  };
}

describe('buildGmxV2SupplyTx invalid collateral coverage', () => {
  it('rejects a non-single-collateral market whose collateral is neither long nor short', async () => {
    const market = GMX_V2_MARKETS['btc-usdc'];
    const { adapter, getSwapQuote } = makeAdapter();
    const pricingAdapter: GmxV2PricingAdapter = {
      getDepositAmountOut: vi.fn().mockResolvedValue(1_000_000n),
    };

    expect(market.longToken).not.toBe(market.shortToken);
    expect(market.collateralToken).toBe(GMX_V2_TOKENS.USDT.address);
    expect(market.collateralToken).not.toBe(market.longToken);
    expect(market.collateralToken).not.toBe(market.shortToken);

    await expect(
      buildGmxV2SupplyTx(
        {
          marketKey: 'btc-usdc',
          fromToken: GMX_V2_TOKENS.USDT.address,
          fromAmount: FROM_AMOUNT,
          userAddress: USER,
        },
        adapter,
        PUBLIC_CLIENT,
        pricingAdapter,
      ),
    ).rejects.toThrow(
      'GMX deposit token must match the market long or short token',
    );

    expect(getSwapQuote).toHaveBeenCalledWith({
      fromChain: GMX_V2_ARBITRUM_CHAIN_ID,
      toChain: GMX_V2_ARBITRUM_CHAIN_ID,
      fromToken: GMX_V2_TOKENS.USDT.address,
      toToken: GMX_V2_TOKENS.USDT.address,
      fromAmount: FROM_AMOUNT,
      fromAddress: USER,
      toAddress: USER,
      slippageBps: 50,
    });
    expect(pricingAdapter.getDepositAmountOut).not.toHaveBeenCalled();
  });
});
