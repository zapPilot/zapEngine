import type { DepositPlan } from '@zapengine/types/api';
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
  market: {
    key: 'eth-usdc',
    name: 'ETH/USDC',
    collateralToken: USDC,
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
  const buildGmxV2Supply = vi.fn().mockResolvedValue(gmxPlan);
  const buildGmxV2Withdraw = vi.fn().mockResolvedValue(gmxWithdrawPlan);
  const buildWithdrawSwap = vi.fn();
  const service = createPlanOrchestrationService({
    intentEngine: { buildGmxV2Supply, buildGmxV2Withdraw, buildWithdrawSwap },
    adapter: { getQuote: vi.fn(), getContractCallQuote: vi.fn() } as never,
    publicClients: {
      42161: { readContract },
      8453: { readContract },
    } as never,
  });

  return {
    service,
    readContract,
    buildGmxV2Supply,
    buildGmxV2Withdraw,
    buildWithdrawSwap,
  };
}

describe('plan-orchestration service', () => {
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
          toToken: USDC,
          fromAmount: '1000',
          toAmountMin: '1000',
          gasUsd: '0',
          durationSec: 60,
        },
      ],
      approvals: [],
      calls: gmxPlan.steps,
      totalGasUsd: '0',
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
