import { act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useGmxDeposit } from '@/hooks/useGmxDeposit';

import { renderHook } from '../../test-utils';

const USER = '0x1111111111111111111111111111111111111111';

const mocks = vi.hoisted(() => ({
  useWalletProvider: vi.fn(),
  getGmxDepositPlan: vi.fn(),
  executeDepositPlan: vi.fn(),
  getWalletClient: vi.fn(),
  switchChain: vi.fn(),
  walletClient: {
    account: { address: '0x1111111111111111111111111111111111111111' },
  },
}));

vi.mock('@/providers/WalletProvider', () => ({
  useWalletProvider: mocks.useWalletProvider,
}));

vi.mock('@/services/planOrchestrationService', () => ({
  getGmxDepositPlan: mocks.getGmxDepositPlan,
}));

vi.mock('@/lib/wallet/executeDepositPlan', () => ({
  executeDepositPlan: mocks.executeDepositPlan,
}));

vi.mock('@/utils/logger', () => ({
  logger: {
    createContextLogger: () => ({
      info: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

const plan = {
  legs: [
    {
      chainId: 42161,
      kind: 'supply',
      protocol: 'gmx-v2',
      toToken: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
      fromAmount: '1000',
      toAmountMin: '1000',
      gasUsd: '0',
      durationSec: 60,
    },
  ],
  approvals: [
    {
      to: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
      data: '0xaaaa',
      value: '0',
      chainId: 42161,
      meta: { intentType: 'ERC20_APPROVE' },
    },
  ],
  calls: [
    {
      to: '0x1C3fa76e6E1088bCE750f23a5BFcffa1efEF6A41',
      data: '0xbbbb',
      value: '1000',
      chainId: 42161,
      meta: { intentType: 'SUPPLY' },
    },
  ],
  totalGasUsd: '0',
  sourceChainId: 42161,
};

describe('useGmxDeposit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useWalletProvider.mockReturnValue({
      account: { address: USER },
      chain: { id: 42161 },
      getWalletClient: mocks.getWalletClient,
      switchChain: mocks.switchChain,
    });
    mocks.getWalletClient.mockResolvedValue(mocks.walletClient);
    mocks.switchChain.mockResolvedValue(undefined);
    mocks.getGmxDepositPlan.mockResolvedValue(plan);
    mocks.executeDepositPlan.mockResolvedValue({
      kind: 'eip7702',
      callsId: '0xbundle',
      transactionHash: '0xhash',
    });
  });

  it('requests the GMX plan and executes it through the shared atomic-first executor', async () => {
    const { result } = renderHook(() => useGmxDeposit());

    await act(async () => {
      await result.current.run({ marketKey: 'eth-usdc', amount: '1000' });
    });

    expect(mocks.switchChain).not.toHaveBeenCalled();
    expect(mocks.getGmxDepositPlan).toHaveBeenCalledWith({
      kind: 'gmx-v2',
      marketKey: 'eth-usdc',
      amount: '1000',
      userAddress: USER,
    });
    expect(mocks.getWalletClient).toHaveBeenCalledWith(42161);
    expect(mocks.executeDepositPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        plan,
        walletClient: mocks.walletClient,
        chainId: 42161,
      }),
    );
    expect(result.current.tier).toBe('eip7702');
    expect(result.current.lastCallsId).toBe('0xbundle');
    expect(result.current.lastTxHash).toBe('0xhash');
    expect(result.current.lastPlan).toBe(plan);
  });

  it('switches to Arbitrum before requesting the plan', async () => {
    mocks.useWalletProvider.mockReturnValue({
      account: { address: USER },
      chain: { id: 8453 },
      getWalletClient: mocks.getWalletClient,
      switchChain: mocks.switchChain,
    });

    const { result } = renderHook(() => useGmxDeposit());

    await act(async () => {
      await result.current.run({ marketKey: 'eth-usdc', amount: '1000' });
    });

    expect(mocks.switchChain).toHaveBeenCalledWith(42161);
    expect(mocks.getGmxDepositPlan).toHaveBeenCalledTimes(1);
  });
});
