import type { DepositPlan } from '@zapengine/types/api';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getDepositPlan,
  getGmxDepositPlan,
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
