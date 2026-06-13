import { describe, expect, it, vi } from 'vitest';
import type { Address, PublicClient } from 'viem';

import type { LiFiAdapter } from '../../src/adapters/lifi.adapter.js';
import { buildWithdrawSwapTx } from '../../src/builders/withdraw-swap.builder.js';
import type { TransactionQuote } from '../../src/types/transaction.types.js';

const USER = '0x1111111111111111111111111111111111111111' as Address;
const VAULT = '0x2222222222222222222222222222222222222222' as Address;
const VAULT_ASSET = '0x3333333333333333333333333333333333333333' as Address;
const TARGET_TOKEN = '0x4444444444444444444444444444444444444444' as Address;
const SWAP_TARGET = '0x5555555555555555555555555555555555555555' as Address;
const SWAP_SPENDER = '0x6666666666666666666666666666666666666666' as Address;
const BASE_CHAIN = 8453;
const SHARES = '1000000000000000000';
const REDEEM_OUT = 990000n;

function makePublicClient(asset: Address): PublicClient {
  const readContract = vi
    .fn()
    .mockImplementation(({ functionName }: { functionName: string }) => {
      if (functionName === 'previewRedeem') {
        return Promise.resolve(REDEEM_OUT);
      }
      if (functionName === 'asset') {
        return Promise.resolve(asset);
      }
      throw new Error(`unexpected read ${functionName}`);
    });
  return { readContract } as unknown as PublicClient;
}

function makeAdapter() {
  const getSwapQuote = vi
    .fn()
    .mockImplementation(
      ({ fromToken, fromAmount }: { fromToken: Address; fromAmount: string }) =>
        Promise.resolve<TransactionQuote>({
          transaction: {
            to: SWAP_TARGET,
            data: '0xabcd',
            value: '0',
            chainId: BASE_CHAIN,
            gasLimit: '300000',
            meta: { intentType: 'SWAP' },
          },
          estimate: {
            fromAmount,
            toAmount: '12345',
            toAmountMin: '12000',
            gasCostUsd: '0.05',
            executionDuration: 25,
          },
          approval: {
            tokenAddress: fromToken,
            spenderAddress: SWAP_SPENDER,
            amount: fromAmount,
          },
          route: { tool: 'lifi' },
        }),
    );
  return { adapter: { getSwapQuote } as unknown as LiFiAdapter, getSwapQuote };
}

describe('buildWithdrawSwapTx', () => {
  it('redeems only (no swap) when the target token is the vault asset', async () => {
    const { adapter, getSwapQuote } = makeAdapter();
    const publicClient = makePublicClient(VAULT_ASSET);

    const plan = await buildWithdrawSwapTx(
      {
        vaultAddress: VAULT,
        shareAmount: SHARES,
        toToken: VAULT_ASSET,
        fromAddress: USER,
        chainId: BASE_CHAIN,
      },
      adapter,
      publicClient,
    );

    expect(getSwapQuote).not.toHaveBeenCalled();
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0]!.to).toBe(VAULT);
    expect(plan.steps[0]!.meta.intentType).toBe('WITHDRAW');
    expect(plan.approval).toBeUndefined();
    expect(plan.estimates.expectedOutput).toBe(REDEEM_OUT.toString());
  });

  it('redeems then swaps the underlying into the requested token', async () => {
    const { adapter, getSwapQuote } = makeAdapter();
    const publicClient = makePublicClient(VAULT_ASSET);

    const plan = await buildWithdrawSwapTx(
      {
        vaultAddress: VAULT,
        shareAmount: SHARES,
        toToken: TARGET_TOKEN,
        fromAddress: USER,
        chainId: BASE_CHAIN,
        slippageBps: 30,
      },
      adapter,
      publicClient,
    );

    // The swap is quoted against the previewed redeem output, delivered to the
    // user's own wallet (toAddress === fromAddress).
    expect(getSwapQuote).toHaveBeenCalledWith({
      fromChain: BASE_CHAIN,
      toChain: BASE_CHAIN,
      fromToken: VAULT_ASSET,
      toToken: TARGET_TOKEN,
      fromAmount: REDEEM_OUT.toString(),
      fromAddress: USER,
      toAddress: USER,
      slippageBps: 30,
    });

    expect(plan.steps).toHaveLength(2);
    expect(plan.steps[0]!.to).toBe(VAULT); // redeem
    expect(plan.steps[0]!.meta.intentType).toBe('WITHDRAW');
    expect(plan.steps[1]!.to).toBe(SWAP_TARGET); // LiFi swap
    expect(plan.approval).toEqual({
      tokenAddress: VAULT_ASSET,
      spenderAddress: SWAP_SPENDER,
      amount: REDEEM_OUT.toString(),
    });
    expect(plan.estimates.expectedOutput).toBe('12345');
  });
});
