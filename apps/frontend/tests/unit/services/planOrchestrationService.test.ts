import type { DepositPlan, WithdrawPlan } from '@zapengine/types/api';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getDepositPlan,
  getGmxDepositPlan,
  getWithdrawPlan,
} from '@/services/planOrchestrationService';

const { mockPost } = vi.hoisted(() => ({
  mockPost: vi.fn(),
}));

vi.mock('@/lib/http', () => ({
  httpUtils: {
    accountApi: {
      post: mockPost,
    },
  },
}));

const USER = '0x1111111111111111111111111111111111111111';

const plan: DepositPlan = {
  legs: [],
  approvals: [],
  calls: [],
  totalGasUsd: '0',
  sourceChainId: 42161,
};

describe('getGmxDepositPlan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('posts a GMX plan-orchestration request and validates the DepositPlan response', async () => {
    mockPost.mockResolvedValueOnce(plan);

    const result = await getGmxDepositPlan({
      kind: 'gmx-v2',
      marketKey: 'eth-usdc',
      amount: '1000',
      userAddress: USER,
    });

    expect(mockPost).toHaveBeenCalledWith('/plan-orchestration/deposit', {
      kind: 'gmx-v2',
      marketKey: 'eth-usdc',
      amount: '1000',
      userAddress: USER,
    });
    expect(result).toEqual(plan);
  });
});

describe('getDepositPlan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('posts an Invest plan-orchestration request and validates the DepositPlan response', async () => {
    mockPost.mockResolvedValueOnce(plan);

    const result = await getDepositPlan({
      kind: 'invest',
      userAddress: USER,
      fromToken: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      fromAmount: '1000',
      sourceChainId: 8453,
    });

    expect(mockPost).toHaveBeenCalledWith('/plan-orchestration/deposit', {
      kind: 'invest',
      userAddress: USER,
      fromToken: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      fromAmount: '1000',
      sourceChainId: 8453,
    });
    expect(result).toEqual(plan);
  });
});

describe('getWithdrawPlan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('posts a Morpho withdraw request and validates the WithdrawPlan response', async () => {
    const withdrawPlan: WithdrawPlan = {
      approvals: [],
      calls: [],
      totalGasUsd: '5.50',
      sourceChainId: 1,
      legs: [
        {
          chainId: 1,
          kind: 'withdraw',
          toToken: '0x1234567890123456789012345678901234567890',
          fromAmount: '1000000',
          toAmountMin: '990000',
          gasUsd: '1.00',
          durationSec: 120,
        },
      ],
    };

    mockPost.mockResolvedValueOnce(withdrawPlan);

    const result = await getWithdrawPlan({
      kind: 'morpho',
      userAddress: USER,
      vaultAddress: '0x1234567890123456789012345678901234567890',
      shareAmount: '1000000',
      chainId: 1,
    });

    expect(mockPost).toHaveBeenCalledWith('/plan-orchestration/withdraw', {
      kind: 'morpho',
      userAddress: USER,
      vaultAddress: '0x1234567890123456789012345678901234567890',
      shareAmount: '1000000',
      chainId: 1,
    });
    expect(result).toEqual(withdrawPlan);
  });

  it('posts a GMX withdraw request and validates the WithdrawPlan response', async () => {
    const withdrawPlan: WithdrawPlan = {
      approvals: [],
      calls: [],
      totalGasUsd: '3.25',
      sourceChainId: 42161,
      legs: [
        {
          chainId: 42161,
          kind: 'withdraw',
          protocol: 'GMX',
          toToken: '0x1234567890123456789012345678901234567890',
          fromAmount: '500000',
          toAmountMin: '490000',
          gasUsd: '0.50',
          durationSec: 60,
        },
      ],
    };

    mockPost.mockResolvedValueOnce(withdrawPlan);

    const result = await getWithdrawPlan({
      kind: 'gmx-v2',
      userAddress: USER,
      marketKey: 'eth-usdc',
      gmAmount: '500000',
    });

    expect(mockPost).toHaveBeenCalledWith('/plan-orchestration/withdraw', {
      kind: 'gmx-v2',
      userAddress: USER,
      marketKey: 'eth-usdc',
      gmAmount: '500000',
    });
    expect(result).toEqual(withdrawPlan);
  });
});
