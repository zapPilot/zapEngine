import type { DepositPlan } from '@zapengine/types/api';
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
        intentType,
      }: {
        fromToken: Address;
        toToken: Address;
        toChain: number;
        fromAmount: string;
        intentType?: 'SUPPLY' | 'BRIDGE';
      }) =>
        Promise.resolve(
          makeQuote({
            kind: intentType ?? 'BRIDGE',
            fromAmount,
            toAmountMin: fromAmount,
            gasCostUsd: intentType === 'SUPPLY' ? '0.10' : '0.20',
            executionDuration:
              intentType === 'SUPPLY' ? 12 : toChain === 1 ? 3 : 1,
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

function makePublicClients({
  allowance = 0n,
  failAllowanceRead = false,
}: {
  allowance?: bigint;
  failAllowanceRead?: boolean;
} = {}) {
  const readContract = vi.fn().mockImplementation(({ functionName }) => {
    if (functionName === 'asset') {
      return Promise.resolve(BASE_USDC);
    }
    if (functionName === 'allowance') {
      if (failAllowanceRead) {
        return Promise.reject(new Error('allowance rpc failed'));
      }
      return Promise.resolve(allowance);
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
  it('builds a Base-only direct Morpho deposit plan with vault approval', async () => {
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
    expect(readContract).toHaveBeenCalledWith({
      address: BASE_USDC,
      abi: erc20Abi,
      functionName: 'allowance',
      args: [USER, MORPHO_BASE_USDC],
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

    expect(plan).not.toHaveProperty('permitRequest');
  });

  it('skips ERC20 approval when allowance already covers the deposit amount', async () => {
    const { adapter } = makeAdapter();
    const { publicClients } = makePublicClients({ allowance: 10000n });

    const plan = await composeDeposit(
      {
        fromToken: BASE_USDC,
        fromAmount: '10000',
        sourceChainId: 8453,
        userAddress: USER,
      },
      { adapter, publicClients: publicClients as never },
    );

    expect(plan.approvals).toEqual([]);
  });

  it('approves the full required amount when existing allowance is insufficient', async () => {
    const { adapter } = makeAdapter();
    const { publicClients } = makePublicClients({ allowance: 9999n });

    const plan = await composeDeposit(
      {
        fromToken: BASE_USDC,
        fromAmount: '10000',
        sourceChainId: 8453,
        userAddress: USER,
      },
      { adapter, publicClients: publicClients as never },
    );

    expect(plan.approvals).toHaveLength(1);
    const decodedApproval = decodeFunctionData({
      abi: erc20Abi,
      data: plan.approvals[0]!.data as `0x${string}`,
    });
    expect(decodedApproval.functionName).toBe('approve');
    expect(decodedApproval.args).toEqual([MORPHO_BASE_USDC, 10000n]);
  });

  it('creates approval when allowance lookup fails', async () => {
    const { adapter } = makeAdapter();
    const { publicClients, readContract } = makePublicClients({
      failAllowanceRead: true,
    });

    const plan = await composeDeposit(
      {
        fromToken: BASE_USDC,
        fromAmount: '10000',
        sourceChainId: 8453,
        userAddress: USER,
      },
      { adapter, publicClients: publicClients as never },
    );

    expect(readContract).toHaveBeenCalledWith({
      address: BASE_USDC,
      abi: erc20Abi,
      functionName: 'allowance',
      args: [USER, MORPHO_BASE_USDC],
    });
    expect(plan.approvals).toHaveLength(1);
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

  it('does not create ERC20 approvals for native ETH source deposits', async () => {
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
    expect(plan).not.toHaveProperty('permitRequest');
    expect(plan.legs).toHaveLength(1);
    expect(plan.legs[0]).toMatchObject({
      chainId: 8453,
      kind: 'supply',
      fromAmount: '10000000000000000',
    });
    expect(getContractCallQuote).not.toHaveBeenCalled();
    expect(getQuote).toHaveBeenCalledWith(
      expect.objectContaining({
        fromToken: NATIVE_ETH,
        fromAmount: '10000000000000000',
        toToken: MORPHO_BASE_USDC,
        intentType: 'SUPPLY',
      }),
    );
  });

  it('uses LI.FI Earn quote for non-vault-asset source deposits', async () => {
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

    expect(plan.calls[0]?.to).toBe(LIFI_DIAMOND);
    expect(getContractCallQuote).not.toHaveBeenCalled();
    expect(getQuote).toHaveBeenCalledWith({
      fromChain: 8453,
      toChain: 8453,
      fromToken: NATIVE_ETH,
      toToken: MORPHO_BASE_USDC,
      fromAmount: '10000000000000000',
      fromAddress: USER,
      slippageBps: 50,
      intentType: 'SUPPLY',
    });
  });
});

describe('composeDeposit error cases', () => {
  it('throws when sourceChainId is not Base', async () => {
    const { adapter } = makeAdapter();
    const { publicClients } = makePublicClients();

    await expect(
      composeDeposit(
        {
          fromToken: BASE_USDC,
          fromAmount: '1000000',
          sourceChainId: 1, // Ethereum, not Base
          userAddress: USER,
        },
        { adapter, publicClients: publicClients as never },
      ),
    ).rejects.toThrow('Deposit v1 supports Base as the source chain');
  });
});
