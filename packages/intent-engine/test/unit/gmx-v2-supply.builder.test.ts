import { describe, expect, it, vi } from 'vitest';
import { decodeFunctionData, erc20Abi, type Address, type Hex } from 'viem';

import type { LiFiAdapter } from '../../src/adapters/lifi.adapter.js';
import { buildGmxV2SupplyTx } from '../../src/builders/gmx-v2-supply.builder.js';
import {
  GMX_V2_ADDRESSES,
  GMX_V2_ARBITRUM_CHAIN_ID,
  GMX_V2_EXCHANGE_ROUTER_ABI,
  GMX_V2_EXECUTION_FEE_WEI,
  GMX_V2_MARKETS,
  GMX_V2_TOKENS,
  type GmxV2MarketKey,
} from '../../src/protocols/gmx-v2/gmx-v2.constants.js';
import {
  PreparedTransactionSchema,
  type TransactionQuote,
} from '../../src/types/transaction.types.js';

const USER = '0x1111111111111111111111111111111111111111' as Address;
const LIFI_APPROVAL = '0x2222222222222222222222222222222222222222' as Address;
const LIFI_TX_TARGET = '0x3333333333333333333333333333333333333333' as Address;
const USDC_AMOUNT = '1000000';
const SWAPPED_MIN = '12345';

function makeSwapQuote(params: {
  fromToken: Address;
  toToken: Address;
  fromAmount: string;
}): TransactionQuote {
  return {
    transaction: {
      to: LIFI_TX_TARGET,
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
      fromAmount: params.fromAmount,
      toAmount: '13000',
      toAmountMin: SWAPPED_MIN,
      gasCostUsd: '0.02',
      executionDuration: 30,
    },
    approval: {
      tokenAddress: params.fromToken,
      spenderAddress: LIFI_APPROVAL,
      amount: params.fromAmount,
    },
    route: {
      action: {
        fromToken: { address: params.fromToken },
        toToken: { address: params.toToken },
      },
    },
  };
}

function makeAdapter() {
  const getSwapQuote = vi
    .fn()
    .mockImplementation(
      ({
        fromToken,
        toToken,
        fromAmount,
      }: {
        fromToken: Address;
        toToken: Address;
        fromAmount: string;
      }) => Promise.resolve(makeSwapQuote({ fromToken, toToken, fromAmount })),
    );

  return {
    adapter: { getSwapQuote } as unknown as LiFiAdapter,
    getSwapQuote,
  };
}

function decodeApproval(data: Hex) {
  const decoded = decodeFunctionData({ abi: erc20Abi, data });
  expect(decoded.functionName).toBe('approve');
  return decoded.args;
}

function decodeMulticallSendTokens(data: Hex) {
  const decoded = decodeFunctionData({
    abi: GMX_V2_EXCHANGE_ROUTER_ABI,
    data,
  });
  expect(decoded.functionName).toBe('multicall');
  const calls = decoded.args[0] as Hex[];
  const sendTokens = decodeFunctionData({
    abi: GMX_V2_EXCHANGE_ROUTER_ABI,
    data: calls[1]!,
  });
  expect(sendTokens.functionName).toBe('sendTokens');
  return sendTokens.args;
}

describe('buildGmxV2SupplyTx', () => {
  it.each(['btc-usdc', 'eth-usdc'] as const)(
    'builds a direct USDC deposit plan for %s without a LiFi swap',
    async (marketKey) => {
      const { adapter, getSwapQuote } = makeAdapter();

      const plan = await buildGmxV2SupplyTx(
        {
          marketKey,
          fromToken: GMX_V2_TOKENS.USDC.address,
          fromAmount: USDC_AMOUNT,
          userAddress: USER,
        },
        adapter,
      );

      expect(getSwapQuote).not.toHaveBeenCalled();
      expect(plan.market.key).toBe(marketKey);
      expect(plan.executionFeeWei).toBe(GMX_V2_EXECUTION_FEE_WEI);
      expect(plan.approvals).toHaveLength(1);
      expect(plan.steps).toHaveLength(1);

      const [spender, amount] = decodeApproval(plan.approvals[0]!.data as Hex);
      expect(plan.approvals[0]!.to).toBe(GMX_V2_TOKENS.USDC.address);
      expect(spender).toBe(GMX_V2_ADDRESSES.router);
      expect(amount).toBe(BigInt(USDC_AMOUNT));

      const deposit = plan.steps[0]!;
      expect(deposit.to).toBe(GMX_V2_ADDRESSES.exchangeRouter);
      expect(deposit.value).toBe(GMX_V2_EXECUTION_FEE_WEI);

      const [fundedToken, receiver, fundedAmount] = decodeMulticallSendTokens(
        deposit.data as Hex,
      );
      expect(fundedToken).toBe(GMX_V2_TOKENS.USDC.address);
      expect(receiver).toBe(GMX_V2_ADDRESSES.depositVault);
      expect(fundedAmount).toBe(BigInt(USDC_AMOUNT));

      for (const tx of [...plan.approvals, ...plan.steps]) {
        expect(PreparedTransactionSchema.parse(tx)).toEqual(tx);
        expect(tx.chainId).toBe(GMX_V2_ARBITRUM_CHAIN_ID);
      }
      expect(plan.steps.filter((step) => step.value !== '0')).toHaveLength(1);
    },
  );

  it.each(['btc-btc', 'eth-eth'] as const)(
    'swaps USDC to collateral before building the %s deposit',
    async (marketKey) => {
      const { adapter, getSwapQuote } = makeAdapter();
      const market = GMX_V2_MARKETS[marketKey];

      const plan = await buildGmxV2SupplyTx(
        {
          marketKey,
          fromToken: GMX_V2_TOKENS.USDC.address,
          fromAmount: USDC_AMOUNT,
          userAddress: USER,
        },
        adapter,
      );

      expect(getSwapQuote).toHaveBeenCalledWith({
        fromChain: GMX_V2_ARBITRUM_CHAIN_ID,
        toChain: GMX_V2_ARBITRUM_CHAIN_ID,
        fromToken: GMX_V2_TOKENS.USDC.address,
        toToken: market.collateralToken,
        fromAmount: USDC_AMOUNT,
        fromAddress: USER,
        toAddress: USER,
        slippageBps: 50,
      });

      expect(plan.approvals).toHaveLength(2);
      expect(plan.steps).toHaveLength(2);
      expect(plan.steps[0]!.to).toBe(LIFI_TX_TARGET);
      expect(plan.steps[0]!.value).toBe('0');

      const [swapSpender, swapAmount] = decodeApproval(
        plan.approvals[0]!.data as Hex,
      );
      expect(plan.approvals[0]!.to).toBe(GMX_V2_TOKENS.USDC.address);
      expect(swapSpender).toBe(LIFI_APPROVAL);
      expect(swapAmount).toBe(BigInt(USDC_AMOUNT));

      const [gmxSpender, gmxAmount] = decodeApproval(
        plan.approvals[1]!.data as Hex,
      );
      expect(plan.approvals[1]!.to).toBe(market.collateralToken);
      expect(gmxSpender).toBe(GMX_V2_ADDRESSES.router);
      expect(gmxAmount).toBe(BigInt(SWAPPED_MIN));

      const deposit = plan.steps[1]!;
      expect(deposit.to).toBe(GMX_V2_ADDRESSES.exchangeRouter);
      expect(deposit.value).toBe(GMX_V2_EXECUTION_FEE_WEI);

      const [fundedToken, receiver, fundedAmount] = decodeMulticallSendTokens(
        deposit.data as Hex,
      );
      expect(fundedToken).toBe(market.collateralToken);
      expect(receiver).toBe(GMX_V2_ADDRESSES.depositVault);
      expect(fundedAmount).toBe(BigInt(SWAPPED_MIN));

      for (const tx of [...plan.approvals, ...plan.steps]) {
        expect(PreparedTransactionSchema.parse(tx)).toEqual(tx);
        expect(tx.chainId).toBe(GMX_V2_ARBITRUM_CHAIN_ID);
      }
      expect(plan.steps.filter((step) => step.value !== '0')).toHaveLength(1);
    },
  );

  it('rejects non-USDC source tokens for the dev-only GMX path', async () => {
    const { adapter } = makeAdapter();

    await expect(
      buildGmxV2SupplyTx(
        {
          marketKey: 'eth-usdc',
          fromToken: GMX_V2_TOKENS.WETH.address,
          fromAmount: USDC_AMOUNT,
          userAddress: USER,
        },
        adapter,
      ),
    ).rejects.toThrow('GMX v2 dev deposits require Arbitrum native USDC input');
  });

  it('rejects zero deposit amounts', async () => {
    const { adapter } = makeAdapter();

    await expect(
      buildGmxV2SupplyTx(
        {
          marketKey: 'eth-usdc' as GmxV2MarketKey,
          fromToken: GMX_V2_TOKENS.USDC.address,
          fromAmount: '0',
          userAddress: USER,
        },
        adapter,
      ),
    ).rejects.toThrow('GMX deposit amount must be greater than zero');
  });
});
