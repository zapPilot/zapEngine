import type { DepositPlan, PermitRequest } from '@zapengine/types/api';
import { describe, expect, it, vi } from 'vitest';
import { decodeFunctionData, erc20Abi, type Address } from 'viem';

import type { LiFiAdapter } from '../../src/adapters/lifi.adapter.js';
import { MORPHO_VAULT_ABI } from '../../src/protocols/morpho/morpho.constants.js';
import { composeDeposit } from '../../src/strategies/composeDeposit.js';
import type { TransactionQuote } from '../../src/types/transaction.types.js';

const USER = '0x1111111111111111111111111111111111111111' as Address;
const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address;
const ETHEREUM_USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' as Address;
const ARBITRUM_USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as Address;
const NATIVE_ETH = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' as Address;
const MORPHO_BASE_USDC =
  '0x7BfA7C4f149E7415b73bdeDfe609237e29CBF34A' as Address;
const LIFI_DIAMOND = '0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE' as Address;

function makeQuote({
  kind,
  fromAmount,
  toAmountMin,
  gasCostUsd,
  executionDuration,
  toChainId = 8453,
  bridge,
  fromToken = BASE_USDC,
  toToken = BASE_USDC,
}: {
  kind: 'SUPPLY' | 'BRIDGE';
  fromAmount: string;
  toAmountMin: string;
  gasCostUsd: string;
  executionDuration: number;
  toChainId?: number;
  bridge?: string;
  fromToken?: Address;
  toToken?: Address;
}): TransactionQuote {
  return {
    transaction: {
      to: LIFI_DIAMOND,
      data:
        kind === 'SUPPLY'
          ? '0x1111'
          : (`0x${toChainId.toString(16).padStart(4, '0')}` as `0x${string}`),
      value: fromToken === NATIVE_ETH ? fromAmount : '0',
      chainId: 8453,
      gasLimit: kind === 'SUPPLY' ? '300000' : '450000',
      meta: { intentType: kind },
    },
    estimate: {
      fromAmount,
      toAmount: fromAmount,
      toAmountMin,
      gasCostUsd,
      executionDuration,
    },
    approval:
      fromToken === NATIVE_ETH
        ? undefined
        : {
            tokenAddress: fromToken,
            spenderAddress: LIFI_DIAMOND,
            amount: fromAmount,
          },
    route: {
      tool: bridge ?? 'lifi',
      action: {
        fromChainId: 8453,
        toChainId,
        fromToken: { address: fromToken },
        toToken: { address: toToken },
      },
      includedSteps:
        fromToken.toLowerCase() === BASE_USDC.toLowerCase()
          ? []
          : [{ type: 'swap' }],
    },
  };
}

function makeAdapter() {
  const getContractCallQuote = vi
    .fn()
    .mockImplementation(
      ({
        fromToken,
        contractCalls,
      }: {
        fromToken: Address;
        contractCalls: Array<{ fromAmount: string }>;
      }) =>
        Promise.resolve(
          makeQuote({
            kind: 'SUPPLY',
            fromAmount: contractCalls[0]!.fromAmount,
            toAmountMin: contractCalls[0]!.fromAmount,
            gasCostUsd: '0.10',
            executionDuration: 12,
            fromToken,
          }),
        ),
    );
  const getQuote = vi
    .fn()
    .mockImplementation(
      ({
        fromToken,
        toToken,
        toChain,
        fromAmount,
      }: {
        fromToken: Address;
        toToken: Address;
        toChain: number;
        fromAmount: string;
      }) =>
        Promise.resolve(
          makeQuote({
            kind: 'BRIDGE',
            fromAmount,
            toAmountMin: fromAmount,
            gasCostUsd: '0.20',
            executionDuration: toChain === 1 ? 3 : 1,
            toChainId: toChain,
            bridge: toChain === 1 ? 'across' : 'relaydepository',
            fromToken,
            toToken,
          }),
        ),
    );

  return {
    adapter: { getContractCallQuote, getQuote } as unknown as LiFiAdapter,
    getContractCallQuote,
    getQuote,
  };
}

function makePublicClients() {
  const readContract = vi.fn().mockImplementation(({ functionName }) => {
    if (functionName === 'asset') {
      return Promise.resolve(BASE_USDC);
    }
    if (functionName === 'name') {
      return Promise.resolve('USD Coin');
    }
    if (functionName === 'version') {
      return Promise.resolve('2');
    }
    if (functionName === 'nonces') {
      return Promise.resolve(7n);
    }
    throw new Error(`Unexpected readContract function ${String(functionName)}`);
  });

  const baseClient = {
    chain: { id: 8453 },
    readContract,
  };

  return {
    publicClients: {
      1: { chain: { id: 1 }, readContract },
      8453: baseClient,
      42161: { chain: { id: 42161 }, readContract },
    },
    readContract,
  };
}

describe('composeDeposit', () => {
  it('builds a Base-only direct Morpho deposit plan with vault approval and permit spender', async () => {
    const { adapter, getContractCallQuote, getQuote } = makeAdapter();
    const { publicClients, readContract } = makePublicClients();

    const plan: DepositPlan = await composeDeposit(
      {
        fromToken: BASE_USDC,
        fromAmount: '10000',
        sourceChainId: 8453,
        userAddress: USER,
      },
      {
        adapter,
        publicClients: publicClients as never,
        now: () => 1_700_000_000_000,
      },
    );

    expect(plan.sourceChainId).toBe(8453);
    expect(plan.legs).toEqual([
      {
        chainId: 8453,
        kind: 'supply',
        protocol: 'morpho',
        toToken: BASE_USDC,
        fromAmount: '10000',
        toAmountMin: '10000',
        gasUsd: '0',
        durationSec: 0,
      },
    ]);
    expect(plan.calls).toHaveLength(1);
    expect(plan.calls.every((call) => call.chainId === 8453)).toBe(true);
    expect(plan.calls[0]!.to).toBe(MORPHO_BASE_USDC);
    expect(plan.calls[0]!.value).toBe('0');
    expect(plan.calls[0]!.gasLimit).toBe('150000');
    expect(plan.totalGasUsd).toBe('0');

    expect(readContract).toHaveBeenCalledWith({
      address: MORPHO_BASE_USDC,
      abi: MORPHO_VAULT_ABI,
      functionName: 'asset',
    });
    expect(getContractCallQuote).not.toHaveBeenCalled();
    expect(getQuote).not.toHaveBeenCalled();

    expect(plan.approvals).toHaveLength(1);
    const decodedApproval = decodeFunctionData({
      abi: erc20Abi,
      data: plan.approvals[0]!.data as `0x${string}`,
    });
    expect(plan.approvals[0]!.to).toBe(BASE_USDC);
    expect(decodedApproval.functionName).toBe('approve');
    expect(decodedApproval.args).toEqual([MORPHO_BASE_USDC, 10000n]);

    const permit = plan.permitRequest as PermitRequest;
    expect(permit).toMatchObject({
      token: BASE_USDC,
      owner: USER,
      spender: MORPHO_BASE_USDC,
      value: '10000',
      nonce: '7',
      deadline: '1700001800',
    });
    expect(permit.typedData.message).toMatchObject({
      owner: USER,
      spender: MORPHO_BASE_USDC,
      value: '10000',
      nonce: '7',
      deadline: '1700001800',
    });
    expect(permit.typedData.domain).toEqual({
      name: 'USD Coin',
      version: '2',
      chainId: 8453,
      verifyingContract: BASE_USDC,
    });
  });

  it('assigns rounding dust to the final leg so split amounts sum exactly', async () => {
    const { adapter } = makeAdapter();
    const { publicClients } = makePublicClients();

    const plan = await composeDeposit(
      {
        fromToken: BASE_USDC,
        fromAmount: '10001',
        sourceChainId: 8453,
        userAddress: USER,
        split: {
          8453: 0.6,
          1: 0.2,
          42161: 0.2,
        },
      },
      { adapter, publicClients: publicClients as never },
    );

    expect(plan.legs.map((leg) => leg.fromAmount)).toEqual([
      '6000',
      '2000',
      '2001',
    ]);
    expect(plan.legs[1]).toMatchObject({
      chainId: 1,
      kind: 'bridge',
      toToken: ETHEREUM_USDC,
      bridge: 'across',
    });
    expect(plan.legs[2]).toMatchObject({
      chainId: 42161,
      kind: 'bridge',
      toToken: ARBITRUM_USDC,
      bridge: 'relaydepository',
    });
    expect(
      plan.legs.reduce((sum, leg) => sum + BigInt(leg.fromAmount), 0n),
    ).toBe(10001n);
  });

  it('does not create ERC20 approvals or permit data for native ETH source deposits', async () => {
    const { adapter, getContractCallQuote, getQuote } = makeAdapter();
    const { publicClients } = makePublicClients();

    const plan = await composeDeposit(
      {
        fromToken: NATIVE_ETH,
        fromAmount: '10000000000000000',
        sourceChainId: 8453,
        userAddress: USER,
      },
      { adapter, publicClients: publicClients as never },
    );

    expect(plan.approvals).toEqual([]);
    expect(plan.permitRequest).toBeUndefined();
    expect(plan.legs).toHaveLength(1);
    expect(plan.legs[0]).toMatchObject({
      chainId: 8453,
      kind: 'supply',
      fromAmount: '10000000000000000',
    });
    expect(getContractCallQuote).toHaveBeenCalledWith(
      expect.objectContaining({ fromToken: NATIVE_ETH }),
    );
    expect(getQuote).not.toHaveBeenCalled();
  });
});
