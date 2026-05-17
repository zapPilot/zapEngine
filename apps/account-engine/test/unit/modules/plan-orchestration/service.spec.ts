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

function makeService(allowance: bigint) {
  const readContract = vi.fn().mockResolvedValue(allowance);
  const buildGmxV2Supply = vi.fn().mockResolvedValue(gmxPlan);
  const service = createPlanOrchestrationService({
    intentEngine: { buildGmxV2Supply },
    adapter: { getQuote: vi.fn(), getContractCallQuote: vi.fn() } as never,
    publicClients: {
      42161: { readContract },
    } as never,
  });

  return { service, readContract, buildGmxV2Supply };
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
      intentEngine: { buildGmxV2Supply: vi.fn() },
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
});
