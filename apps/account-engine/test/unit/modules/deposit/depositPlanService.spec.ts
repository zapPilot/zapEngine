import type { DepositPlan } from '@zapengine/types/api';
import { describe, expect, it, vi } from 'vitest';

import { createDepositPlanService } from '../../../../src/modules/deposit/depositPlanService';

const USER_ID = 'user-123';
const USER_ADDRESS = '0x1111111111111111111111111111111111111111';
const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

const depositPlan: DepositPlan = {
  legs: [
    {
      chainId: 8453,
      kind: 'supply',
      protocol: 'morpho',
      toToken: BASE_USDC,
      fromAmount: '6000',
      toAmountMin: '6000',
      gasUsd: '0.10',
      durationSec: 12,
    },
    {
      chainId: 1,
      kind: 'bridge',
      toToken: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
      fromAmount: '2000',
      toAmountMin: '2000',
      bridge: 'across',
      gasUsd: '0.20',
      durationSec: 3,
    },
    {
      chainId: 42161,
      kind: 'bridge',
      toToken: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
      fromAmount: '2000',
      toAmountMin: '2000',
      bridge: 'relaydepository',
      gasUsd: '0.20',
      durationSec: 1,
    },
  ],
  approvals: [],
  calls: [
    {
      to: '0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE',
      data: '0xabcdef',
      value: '0',
      chainId: 8453,
      gasLimit: '300000',
      meta: { intentType: 'SUPPLY' },
    },
  ],
  totalGasUsd: '0.5',
  sourceChainId: 8453,
};

describe('depositPlanService.build', () => {
  it('delegates v1 hardcoded split composition to intent-engine without fetching analytics allocation', async () => {
    const getDailySuggestion = vi.fn();
    const composeDeposit = vi.fn().mockResolvedValue(depositPlan);
    const publicClients = {
      1: { chain: { id: 1 } },
      8453: { chain: { id: 8453 } },
      42161: { chain: { id: 42161 } },
    };
    const publicClientsForDeposit = vi.fn().mockReturnValue(publicClients);
    const adapter = { getQuote: vi.fn(), getContractCallQuote: vi.fn() };

    const service = createDepositPlanService({
      analyticsClientService: { getDailySuggestion },
      adapter: adapter as never,
      publicClientsForDeposit,
      composeDeposit,
    });

    const result = await service.build(USER_ID, {
      userAddress: USER_ADDRESS,
      fromToken: BASE_USDC,
      fromAmount: '10000',
      sourceChainId: 8453,
    });

    expect(result).toEqual(depositPlan);
    expect(getDailySuggestion).not.toHaveBeenCalled();
    expect(publicClientsForDeposit).toHaveBeenCalled();
    expect(composeDeposit).toHaveBeenCalledWith(
      {
        userAddress: USER_ADDRESS,
        fromToken: BASE_USDC,
        fromAmount: '10000',
        sourceChainId: 8453,
      },
      { adapter, publicClients },
    );
  });
});
