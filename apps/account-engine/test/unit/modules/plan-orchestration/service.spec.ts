import { type DepositPlan, NATIVE_TOKEN_ADDRESS } from '@zapengine/types/api';
import {
  type Address,
  decodeFunctionData,
  encodeFunctionData,
  erc20Abi,
} from 'viem';
import { describe, expect, it, vi } from 'vitest';

import { createPlanOrchestrationService } from '../../../../src/modules/plan-orchestration/service';

const USER = '0x1111111111111111111111111111111111111111' as Address;
const USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as Address;
const GMX_ROUTER = '0x7452c558d45f8afC8c83dAe62C3f8A5BE19c71f6' as Address;
const EXCHANGE_ROUTER = '0x1C3fa76e6E1088bCE750f23a5BFcffa1efEF6A41' as Address;
const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address;

function approveData(spender: Address, amount: bigint) {
  return encodeFunctionData({
    abi: erc20Abi,
    functionName: 'approve',
    args: [spender, amount],
  });
}

const GM_TOKEN = '0x70d95587d40A2caf56bd97485aB3Eec10Bee6336' as Address;
const VAULT = '0x4444444444444444444444444444444444444444' as Address;
const TARGET_TOKEN = '0x5555555555555555555555555555555555555555' as Address;
const LIFI_SPENDER = '0x6666666666666666666666666666666666666666' as Address;

const gmxPlan = {
  approvals: [
    {
      to: USDC,
      data: approveData(GMX_ROUTER, 1000n),
      value: '0',
      chainId: 42161,
      gasLimit: '60000',
      meta: { intentType: 'APPROVAL' },
    },
  ],
  steps: [
    {
      to: EXCHANGE_ROUTER,
      data: '0x1234',
      value: '1000000000000000',
      chainId: 42161,
      gasLimit: '800000',
      meta: { intentType: 'SUPPLY' },
    },
  ],
  executionFeeWei: '1000000000000000',
  estimatedMarketTokens: '1000',
  minMarketTokens: '900',
  market: {
    key: 'eth-usdc',
    name: 'ETH/USDC',
    collateralToken: USDC,
    marketToken: GM_TOKEN,
  },
};

const gmxWithdrawPlan = {
  approvals: [
    {
      to: GM_TOKEN,
      data: approveData(GMX_ROUTER, 5000n),
      value: '0',
      chainId: 42161,
      gasLimit: '60000',
      meta: { intentType: 'APPROVAL' },
    },
  ],
  steps: [
    {
      to: EXCHANGE_ROUTER,
      data: '0x5678',
      value: '1000000000000000',
      chainId: 42161,
      gasLimit: '1200000',
      meta: { intentType: 'WITHDRAW' },
    },
  ],
  executionFeeWei: '1000000000000000',
  market: {
    key: 'eth-usdc',
    name: 'ETH/USDC',
    collateralToken: USDC,
  },
};

function makeService(allowance: bigint) {
  const readContract = vi.fn().mockResolvedValue(allowance);
  const getGasPrice = vi.fn().mockResolvedValue(100_000_000n);
  const getTokenPrice = vi.fn().mockResolvedValue({
    address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
    symbol: 'ETH',
    decimals: 18,
    priceUSD: '3000',
  });
  const buildGmxV2Supply = vi.fn().mockResolvedValue(gmxPlan);
  const buildGmxV2Withdraw = vi.fn().mockResolvedValue(gmxWithdrawPlan);
  const buildWithdrawSwap = vi.fn();
  const service = createPlanOrchestrationService({
    intentEngine: {
      buildGmxV2Supply,
      buildGmxV2Withdraw,
      buildWithdrawSwap,
      getTokenPrice,
    },
    adapter: { getQuote: vi.fn(), getContractCallQuote: vi.fn() } as never,
    publicClients: {
      42161: { readContract, getGasPrice },
      8453: { readContract },
    } as never,
  });

  return {
    service,
    readContract,
    getGasPrice,
    getTokenPrice,
    buildGmxV2Supply,
    buildGmxV2Withdraw,
    buildWithdrawSwap,
  };
}

function makeInvestService({
  defaultSplit,
}: {
  defaultSplit?: Partial<Record<number, number>>;
} = {}) {
  const composeDeposit = vi.fn().mockResolvedValue({
    legs: [],
    approvals: [],
    calls: [],
    totalGasUsd: '0',
    sourceChainId: 8453,
  } satisfies DepositPlan);
  const service = createPlanOrchestrationService({
    intentEngine: {
      buildGmxV2Supply: vi.fn(),
      buildGmxV2Withdraw: vi.fn(),
      buildWithdrawSwap: vi.fn(),
    },
    adapter: { getQuote: vi.fn(), getContractCallQuote: vi.fn() } as never,
    publicClients: {
      8453: { readContract: vi.fn() },
      42161: { readContract: vi.fn() },
    } as never,
    composeDeposit,
    ...(defaultSplit ? { defaultSplit } : {}),
  });

  return { composeDeposit, service };
}

describe('plan-orchestration service', () => {
  it('builds fixed 40/30/30 groups and splits Base ETH into manual swap and supply calls', async () => {
    const buildSupply = vi.fn().mockImplementation(({ fromAmount }) => ({
      transaction: {
        to: '0x7BfA7C4f149E7415b73bdeDfe609237e29CBF34A',
        data: '0x1234',
        value: '0',
        chainId: 8453,
        gasLimit: '150000',
        meta: { intentType: 'SUPPLY', route: { tool: 'direct' } },
      },
      estimate: {
        fromAmount,
        toAmount: fromAmount,
        toAmountMin: fromAmount,
        gasCostUsd: '0.03',
        executionDuration: 12,
      },
      route: { tool: 'direct' },
    }));
    const buildSwap = vi
      .fn()
      .mockImplementation(({ fromAmount }: { fromAmount: string }) => ({
        transaction: {
          to: '0x2222222222222222222222222222222222222222',
          data: '0x9876',
          value: fromAmount,
          chainId: 8453,
          gasLimit: '250000',
          meta: {
            intentType: 'SWAP',
            route: {
              action: {
                fromToken: { symbol: 'ETH' },
                toToken: { symbol: 'USDC' },
              },
              estimate: {
                toAmount: '40000000',
                toAmountMin: '39800000',
              },
            },
          },
        },
        estimate: {
          fromAmount,
          toAmount: '40000000',
          toAmountMin: '39800000',
          gasCostUsd: '0.05',
          executionDuration: 10,
        },
      }));
    const buildGmxV2Supply = vi
      .fn()
      .mockImplementation(
        ({
          marketKey,
          fromAmount,
        }: {
          marketKey: string;
          fromAmount: string;
        }) => ({
          approvals: [
            {
              to: USDC,
              data: approveData(GMX_ROUTER, BigInt(fromAmount)),
              value: '0',
              chainId: 42161,
              gasLimit: '60000',
              meta: { intentType: 'APPROVAL' },
            },
          ],
          steps: [
            {
              to: EXCHANGE_ROUTER,
              data: marketKey === 'btc-usdc' ? '0x1234' : '0x5678',
              value: '1000000000000000',
              chainId: 42161,
              gasLimit: '1200000',
              meta: {
                intentType: 'SUPPLY',
                route: { tool: 'gmx-v2-direct', marketKey },
              },
            },
          ],
          executionFeeWei: '1000000000000000',
          estimatedMarketTokens:
            marketKey === 'btc-usdc'
              ? '25000000000000000000'
              : '20000000000000000000',
          minMarketTokens:
            marketKey === 'btc-usdc'
              ? '24750000000000000000'
              : '19800000000000000000',
          market: {
            key: marketKey,
            collateralToken: USDC,
            marketToken:
              marketKey === 'btc-usdc'
                ? '0x47c031236e19d024b42f8AE6780E44A573170703'
                : GM_TOKEN,
          },
        }),
      );
    const getTokenPrice = vi
      .fn()
      .mockImplementation((_chainId: number, tokenAddress: string) =>
        Promise.resolve(
          tokenAddress.toLowerCase() ===
            '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
            ? {
                address: tokenAddress,
                symbol: 'ETH',
                decimals: 18,
                priceUSD: '3000',
              }
            : {
                address: tokenAddress,
                symbol: 'USDC',
                decimals: 6,
                priceUSD: '1',
              },
        ),
      );
    const readContract = vi.fn().mockResolvedValue(0n);
    const getGasPrice = vi.fn().mockResolvedValue(100_000_000n);
    const service = createPlanOrchestrationService({
      intentEngine: {
        buildSupply,
        buildSwap,
        buildGmxV2Supply,
        getTokenPrice,
        buildGmxV2Withdraw: vi.fn(),
        buildWithdrawSwap: vi.fn(),
      },
      adapter: { getQuote: vi.fn(), getContractCallQuote: vi.fn() } as never,
      publicClients: {
        8453: { readContract, getGasPrice },
        42161: { readContract, getGasPrice },
      } as never,
    });

    const plan = await service.buildDeposit({
      kind: 'strategy',
      strategyId: 'zap-morpho-gmx-v1',
      userAddress: USER,
      totalUsd6: '100000000',
      fundingSources: [
        { chainId: 8453, fromToken: BASE_USDC },
        { chainId: 42161, fromToken: USDC },
      ],
    });

    expect(plan.allocations.map((allocation) => allocation.weightBps)).toEqual([
      4000, 3000, 3000,
    ]);
    expect(plan.executionGroups.map((group) => group.fromAmount)).toEqual([
      '40000000',
      '60000000',
    ]);
    expect(plan.executionGroups[1]!.approvals).toHaveLength(1);
    const mergedApproval = decodeFunctionData({
      abi: erc20Abi,
      data: plan.executionGroups[1]!.approvals[0]!.data as `0x${string}`,
    });
    expect(mergedApproval.args).toEqual([GMX_ROUTER, 60000000n]);
    expect(plan.allocations[1]).toMatchObject({
      toToken: '0x47c031236e19d024b42f8AE6780E44A573170703',
      toAmountMin: '24750000000000000000',
      gasUsd: '0.369',
    });
    expect(plan.allocations[2]).toMatchObject({
      toToken: GM_TOKEN,
      toAmountMin: '19800000000000000000',
      gasUsd: '0.369',
    });
    expect(plan.allocations[0]).toMatchObject({ gasUsd: '0.063' });
    expect(plan.executionGroups[1]!.gasUsd).toBe('0.738');
    expect(plan.totalGasUsd).toBe('0.801');
    expect(plan.checkpoints).toHaveLength(1);
    expect(
      plan.executionGroups.flatMap((group) => [
        ...group.approvals,
        ...group.calls,
      ]),
    ).not.toContainEqual(expect.objectContaining({ chainId: 1 }));
    expect(buildSwap).not.toHaveBeenCalled();

    const nativePlan = await service.buildDeposit({
      kind: 'strategy',
      strategyId: 'zap-morpho-gmx-v1',
      userAddress: USER,
      totalUsd6: '100000000',
      fundingSources: [
        { chainId: 8453, fromToken: NATIVE_TOKEN_ADDRESS },
        { chainId: 42161, fromToken: USDC },
      ],
    });

    expect(buildSwap).toHaveBeenCalledWith({
      type: 'SWAP',
      chainId: 8453,
      fromAddress: USER,
      fromToken: NATIVE_TOKEN_ADDRESS,
      toToken: BASE_USDC,
      fromAmount: '13333333333333333',
    });
    expect(buildSupply).toHaveBeenLastCalledWith(
      expect.objectContaining({
        fromToken: BASE_USDC,
        fromAmount: '39800000',
      }),
      expect.anything(),
    );
    expect(nativePlan.executionGroups[0]).toMatchObject({
      fromToken: NATIVE_TOKEN_ADDRESS,
      fromAmount: '13333333333333333',
    });
    expect(
      nativePlan.executionGroups[0]!.calls.map(
        (transaction) => transaction.meta.intentType,
      ),
    ).toEqual(['SWAP', 'SUPPLY']);
    const baseVaultApproval = decodeFunctionData({
      abi: erc20Abi,
      data: nativePlan.executionGroups[0]!.approvals[0]!.data as `0x${string}`,
    });
    expect(baseVaultApproval.args).toEqual([
      '0x7BfA7C4f149E7415b73bdeDfe609237e29CBF34A',
      39800000n,
    ]);
  });

  it('delegates Invest deposits to composeDeposit and validates the returned DepositPlan', async () => {
    const composeDeposit = vi.fn().mockResolvedValue({
      legs: [
        {
          chainId: 8453,
          kind: 'supply',
          protocol: 'morpho',
          toToken: BASE_USDC,
          fromAmount: '1000',
          toAmountMin: '1000',
          gasUsd: '0',
          durationSec: 12,
        },
      ],
      approvals: [],
      calls: [
        {
          to: '0x2222222222222222222222222222222222222222',
          data: '0x1234',
          value: '0',
          chainId: 8453,
          meta: { intentType: 'SUPPLY' },
        },
      ],
      totalGasUsd: '0',
      sourceChainId: 8453,
    } satisfies DepositPlan);
    const adapter = { getQuote: vi.fn(), getContractCallQuote: vi.fn() };
    const publicClients = {
      8453: { readContract: vi.fn() },
    } as never;
    const service = createPlanOrchestrationService({
      intentEngine: {
        buildGmxV2Supply: vi.fn(),
        buildGmxV2Withdraw: vi.fn(),
        buildWithdrawSwap: vi.fn(),
      },
      adapter: adapter as never,
      publicClients,
      composeDeposit,
    });

    const plan = await service.buildDeposit({
      kind: 'invest',
      userAddress: USER,
      fromToken: BASE_USDC,
      fromAmount: '1000',
      sourceChainId: 8453,
    });

    expect(composeDeposit).toHaveBeenCalledWith(
      {
        userAddress: USER,
        fromToken: BASE_USDC,
        fromAmount: '1000',
        sourceChainId: 8453,
      },
      { adapter, publicClients },
    );
    expect(plan.sourceChainId).toBe(8453);
    expect(plan.legs[0]?.protocol).toBe('morpho');
  });

  it('forwards a request split to composeDeposit with numeric chain keys', async () => {
    const { composeDeposit, service } = makeInvestService();

    await service.buildDeposit({
      kind: 'invest',
      userAddress: USER,
      fromToken: BASE_USDC,
      fromAmount: '1000',
      sourceChainId: 8453,
      split: { '8453': 0.7, '1337': 0.3 },
    });

    expect(composeDeposit).toHaveBeenCalledWith(
      expect.objectContaining({ split: { 8453: 0.7, 1337: 0.3 } }),
      expect.anything(),
    );
  });

  it('falls back to the configured default split for Base-source requests', async () => {
    const { composeDeposit, service } = makeInvestService({
      defaultSplit: { 8453: 0.9, 1337: 0.1 },
    });

    await service.buildDeposit({
      kind: 'invest',
      userAddress: USER,
      fromToken: BASE_USDC,
      fromAmount: '1000',
      sourceChainId: 8453,
    });

    expect(composeDeposit).toHaveBeenCalledWith(
      expect.objectContaining({ split: { 8453: 0.9, 1337: 0.1 } }),
      expect.anything(),
    );
  });

  it('does not apply the default split to non-Base source re-quotes', async () => {
    const { composeDeposit, service } = makeInvestService({
      defaultSplit: { 8453: 0.9, 1337: 0.1 },
    });

    await service.buildDeposit({
      kind: 'invest',
      userAddress: USER,
      fromToken: USDC,
      fromAmount: '1000',
      sourceChainId: 42161,
    });

    const [input] = composeDeposit.mock.calls[0]!;
    expect(input).not.toHaveProperty('split');
    expect(input.sourceChainId).toBe(42161);
  });

  it('skips GMX approval when Arbitrum allowance covers the exact collateral amount', async () => {
    const { service, readContract, buildGmxV2Supply } = makeService(1000n);

    const plan = await service.buildDeposit({
      kind: 'gmx-v2',
      marketKey: 'eth-usdc',
      amount: '1000',
      userAddress: USER,
    });

    expect(buildGmxV2Supply).toHaveBeenCalledWith({
      marketKey: 'eth-usdc',
      fromToken: USDC,
      fromAmount: '1000',
      userAddress: USER,
    });
    expect(readContract).toHaveBeenCalled();
    expect(plan.approvals).toEqual([]);
    expect(plan.calls).toEqual(gmxPlan.steps);
    expect(plan).toMatchObject<DepositPlan>({
      legs: [
        {
          chainId: 42161,
          kind: 'supply',
          protocol: 'gmx-v2',
          toToken: GM_TOKEN,
          fromAmount: '1000',
          toAmountMin: '900',
          gasUsd: '0.24',
          durationSec: 60,
        },
      ],
      approvals: [],
      calls: gmxPlan.steps,
      totalGasUsd: '0.24',
      sourceChainId: 42161,
    });
  });

  it('adds exact GMX approval when Arbitrum allowance is insufficient', async () => {
    const { service } = makeService(999n);

    const plan = await service.buildDeposit({
      kind: 'gmx-v2',
      marketKey: 'eth-usdc',
      amount: '1000',
      userAddress: USER,
    });

    expect(plan.approvals).toHaveLength(1);
    const decoded = decodeFunctionData({
      abi: erc20Abi,
      data: plan.approvals[0]!.data as `0x${string}`,
    });
    expect(plan.approvals[0]!.to).toBe(USDC);
    expect(decoded.functionName).toBe('approve');
    expect(decoded.args).toEqual([GMX_ROUTER, 1000n]);
  });

  it('builds a GMX withdraw plan with a GM-token approval to the router', async () => {
    const { service, buildGmxV2Withdraw } = makeService(0n);

    const plan = await service.buildWithdraw({
      kind: 'gmx-v2',
      marketKey: 'eth-usdc',
      gmAmount: '5000',
      userAddress: USER,
    });

    expect(buildGmxV2Withdraw).toHaveBeenCalledWith({
      marketKey: 'eth-usdc',
      gmAmount: '5000',
      userAddress: USER,
    });
    expect(plan.calls).toEqual(gmxWithdrawPlan.steps);
    expect(plan.legs[0]).toMatchObject({
      chainId: 42161,
      kind: 'withdraw',
      protocol: 'gmx-v2',
      toToken: USDC,
    });
    expect(plan.approvals).toHaveLength(1);
    const decoded = decodeFunctionData({
      abi: erc20Abi,
      data: plan.approvals[0]!.data as `0x${string}`,
    });
    expect(plan.approvals[0]!.to).toBe(GM_TOKEN);
    expect(decoded.args).toEqual([GMX_ROUTER, 5000n]);
  });

  it('builds a Morpho withdraw+swap plan with redeem and swap legs', async () => {
    const { service, buildWithdrawSwap } = makeService(0n);
    buildWithdrawSwap.mockResolvedValue({
      steps: [
        {
          to: VAULT,
          data: '0xabcd',
          value: '0',
          chainId: 8453,
          gasLimit: '200000',
          meta: { intentType: 'WITHDRAW' },
        },
        {
          to: '0x7777777777777777777777777777777777777777',
          data: '0x1234',
          value: '0',
          chainId: 8453,
          gasLimit: '300000',
          meta: { intentType: 'SWAP' },
        },
      ],
      estimates: {
        totalGasUsd: '0.05',
        totalDuration: 25,
        expectedOutput: '12345',
      },
      approval: {
        tokenAddress: BASE_USDC,
        spenderAddress: LIFI_SPENDER,
        amount: '990000',
      },
      assetToken: BASE_USDC,
      redeemAmount: '990000',
    });

    const plan = await service.buildWithdraw({
      kind: 'morpho',
      userAddress: USER,
      vaultAddress: VAULT,
      shareAmount: '1000000000000000000',
      chainId: 8453,
      toToken: TARGET_TOKEN,
    });

    expect(buildWithdrawSwap).toHaveBeenCalledWith(
      {
        vaultAddress: VAULT,
        shareAmount: '1000000000000000000',
        toToken: TARGET_TOKEN,
        fromAddress: USER,
        chainId: 8453,
      },
      expect.anything(),
    );
    expect(plan.sourceChainId).toBe(8453);
    expect(plan.calls).toHaveLength(2);
    expect(plan.legs.map((leg) => leg.kind)).toEqual(['withdraw', 'swap']);
    expect(plan.legs[1]).toMatchObject({ kind: 'swap', toToken: TARGET_TOKEN });

    // Insufficient allowance (0) → the LiFi approval is materialised.
    expect(plan.approvals).toHaveLength(1);
    const decoded = decodeFunctionData({
      abi: erc20Abi,
      data: plan.approvals[0]!.data as `0x${string}`,
    });
    expect(plan.approvals[0]!.to).toBe(BASE_USDC);
    expect(decoded.args).toEqual([LIFI_SPENDER, 990000n]);
  });

  it('builds a Morpho redeem-only plan (no swap) when toToken is omitted', async () => {
    const { service, buildWithdrawSwap } = makeService(0n);
    buildWithdrawSwap.mockResolvedValue({
      steps: [
        {
          to: VAULT,
          data: '0xabcd',
          value: '0',
          chainId: 8453,
          gasLimit: '200000',
          meta: { intentType: 'WITHDRAW' },
        },
      ],
      estimates: {
        totalGasUsd: '0',
        totalDuration: 0,
        expectedOutput: '990000',
      },
      assetToken: BASE_USDC,
      redeemAmount: '990000',
    });

    const plan = await service.buildWithdraw({
      kind: 'morpho',
      userAddress: USER,
      vaultAddress: VAULT,
      shareAmount: '1000000000000000000',
      chainId: 8453,
    });

    expect(buildWithdrawSwap).toHaveBeenCalledWith(
      {
        vaultAddress: VAULT,
        shareAmount: '1000000000000000000',
        fromAddress: USER,
        chainId: 8453,
      },
      expect.anything(),
    );
    expect(plan.legs).toHaveLength(1);
    expect(plan.legs[0]).toMatchObject({
      kind: 'withdraw',
      toToken: BASE_USDC,
    });
    expect(plan.approvals).toEqual([]);
    expect(plan.calls).toHaveLength(1);
  });
});
