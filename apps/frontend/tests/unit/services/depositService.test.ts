import { BASE_USDC_ADDRESS, type DepositPlan } from '@zapengine/types/api';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getDepositPlan } from '@/services/depositService';

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

const validPlan: DepositPlan = {
  legs: [
    {
      chainId: 8453,
      kind: 'supply',
      protocol: 'morpho',
      toToken: BASE_USDC_ADDRESS,
      fromAmount: '6000',
      toAmountMin: '6000',
      gasUsd: '0.10',
      durationSec: 12,
    },
  ],
  approvals: [],
  calls: [
    {
      to: '0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE',
      data: '0x',
      value: '0',
      chainId: 8453,
      meta: { intentType: 'SUPPLY' },
    },
  ],
  totalGasUsd: '0.5',
  sourceChainId: 8453,
};

describe('getDepositPlan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('validates the request, posts to the user deposit-plan endpoint, and returns the parsed plan', async () => {
    mockPost.mockResolvedValueOnce(validPlan);

    const result = await getDepositPlan({
      userAddress: USER,
      fromToken: BASE_USDC_ADDRESS,
      fromAmount: '1000000',
      sourceChainId: 8453,
    });

    expect(mockPost).toHaveBeenCalledWith(`/users/${USER}/deposit-plan`, {
      userAddress: USER,
      fromToken: BASE_USDC_ADDRESS,
      fromAmount: '1000000',
      sourceChainId: 8453,
    });
    expect(result).toEqual(validPlan);
  });

  it('rejects an unsupported source chain before any HTTP call', async () => {
    await expect(
      getDepositPlan({
        userAddress: USER,
        fromToken: BASE_USDC_ADDRESS,
        fromAmount: '1000000',
        sourceChainId: 1,
      }),
    ).rejects.toThrow();

    expect(mockPost).not.toHaveBeenCalled();
  });

  it('throws when the backend returns a plan that fails schema validation', async () => {
    mockPost.mockResolvedValueOnce({ legs: [], approvals: [] });

    await expect(
      getDepositPlan({
        userAddress: USER,
        fromToken: BASE_USDC_ADDRESS,
        fromAmount: '1000000',
        sourceChainId: 8453,
      }),
    ).rejects.toThrow();

    expect(mockPost).toHaveBeenCalledTimes(1);
  });
});
