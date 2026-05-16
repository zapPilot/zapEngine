import { act } from '@testing-library/react';
import type { DepositPlan } from '@zapengine/types/api';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useInvestStrategy } from '@/hooks/useInvestStrategy';

import { renderHook } from '../../test-utils';

const USER = '0x1111111111111111111111111111111111111111';
const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

const mocks = vi.hoisted(() => {
  const walletClient = {
    account: { address: '0x1111111111111111111111111111111111111111' },
    sendTransaction: vi.fn(),
  };

  return {
    useWalletProvider: vi.fn(),
    getDepositPlan: vi.fn(),
    getWalletClient: vi.fn(),
    switchChain: vi.fn(),
    getExecutionStrategy: vi.fn(),
    executeWithEIP7702: vi.fn(),
    getPublicClient: vi.fn(),
    waitForTransactionReceipt: vi.fn(),
    getBridgeStatus: vi.fn(),
    walletClient,
  };
});

vi.mock('@/providers/WalletProvider', () => ({
  useWalletProvider: mocks.useWalletProvider,
}));

vi.mock('@/services/depositService', () => ({
  getDepositPlan: mocks.getDepositPlan,
}));

vi.mock('@/services/intentClient', () => ({
  getBridgeStatus: mocks.getBridgeStatus,
  getPublicClient: mocks.getPublicClient,
  intentEngine: {
    getExecutionStrategy: mocks.getExecutionStrategy,
    executeWithEIP7702: mocks.executeWithEIP7702,
  },
}));

vi.mock('@/utils/logger', () => ({
  logger: {
    createContextLogger: () => ({
      info: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

const approveTx = {
  to: BASE_USDC,
  data: '0xaaaa',
  value: '0',
  chainId: 8453,
  gasLimit: '50000',
  meta: { intentType: 'ERC20_APPROVE' },
} as const;

const supplyTx = {
  to: '0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE',
  data: '0x1111',
  value: '0',
  chainId: 8453,
  gasLimit: '300000',
  meta: { intentType: 'SUPPLY' },
} as const;

const ethereumBridgeTx = {
  to: '0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE',
  data: '0x2222',
  value: '0',
  chainId: 8453,
  gasLimit: '450000',
  meta: { intentType: 'BRIDGE' },
} as const;

const arbitrumBridgeTx = {
  to: '0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE',
  data: '0x3333',
  value: '0',
  chainId: 8453,
  gasLimit: '450000',
  meta: { intentType: 'BRIDGE' },
} as const;

const plan: DepositPlan = {
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
  approvals: [approveTx],
  calls: [supplyTx, ethereumBridgeTx, arbitrumBridgeTx],
  totalGasUsd: '0.5',
  sourceChainId: 8453,
};

describe('useInvestStrategy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useWalletProvider.mockReturnValue({
      account: { address: USER },
      chain: { id: 8453 },
      switchChain: mocks.switchChain,
      getWalletClient: mocks.getWalletClient,
    });
    mocks.getWalletClient.mockResolvedValue(mocks.walletClient);
    mocks.switchChain.mockResolvedValue(undefined);
    mocks.getDepositPlan.mockResolvedValue(plan);
    mocks.getPublicClient.mockReturnValue({
      waitForTransactionReceipt: mocks.waitForTransactionReceipt,
    });
    mocks.waitForTransactionReceipt.mockResolvedValue({
      status: 'success',
      transactionHash: '0xsource',
    });
    mocks.getBridgeStatus.mockResolvedValue({ status: 'DONE' });
  });

  it('executes backend-provided approvals and three leg calls as one EIP-7702 bundle', async () => {
    mocks.getExecutionStrategy.mockResolvedValue('eip7702');
    mocks.executeWithEIP7702.mockResolvedValue({
      success: true,
      callsId: '0xbundle',
    });

    const { result } = renderHook(() => useInvestStrategy());

    await act(async () => {
      await result.current.run({ fromToken: BASE_USDC, fromAmount: '10000' });
    });

    expect(mocks.getDepositPlan).toHaveBeenCalledWith({
      userAddress: USER,
      fromToken: BASE_USDC,
      fromAmount: '10000',
      sourceChainId: 8453,
    });
    expect(mocks.executeWithEIP7702).toHaveBeenCalledWith(
      [approveTx, supplyTx, ethereumBridgeTx, arbitrumBridgeTx],
      mocks.walletClient,
    );
    expect(result.current.tier).toBe('eip7702');
    expect(result.current.lastCallsId).toBe('0xbundle');
    expect(result.current.legs.map((leg) => leg.status)).toEqual([
      'submitted',
      'submitted',
      'submitted',
    ]);
  });

  it('falls back to sequential approval then three leg transactions when atomic batching is unavailable', async () => {
    mocks.getExecutionStrategy.mockResolvedValue('sequential');
    mocks.walletClient.sendTransaction
      .mockResolvedValueOnce('0xapprovehash')
      .mockResolvedValueOnce('0xsupplyhash')
      .mockResolvedValueOnce('0xethbridgehash')
      .mockResolvedValueOnce('0xarbbridgehash');

    const { result } = renderHook(() => useInvestStrategy());

    await act(async () => {
      await result.current.run({ fromToken: BASE_USDC, fromAmount: '10000' });
    });

    expect(mocks.walletClient.sendTransaction).toHaveBeenCalledTimes(4);
    expect(mocks.waitForTransactionReceipt).toHaveBeenCalledTimes(4);
    expect(result.current.tier).toBe('sequential');
    expect(result.current.lastTxHashes).toEqual([
      '0xapprovehash',
      '0xsupplyhash',
      '0xethbridgehash',
      '0xarbbridgehash',
    ]);
  });

  it('switches to Base before fetching the plan when the connected wallet is on another chain', async () => {
    mocks.useWalletProvider.mockReturnValue({
      account: { address: USER },
      chain: { id: 1 },
      switchChain: mocks.switchChain,
      getWalletClient: mocks.getWalletClient,
    });

    const { result } = renderHook(() => useInvestStrategy());

    await act(async () => {
      await result.current.run({ fromToken: BASE_USDC, fromAmount: '10000' });
    });

    expect(mocks.switchChain).toHaveBeenCalledWith(8453);
    expect(mocks.getDepositPlan).toHaveBeenCalledWith({
      userAddress: USER,
      fromToken: BASE_USDC,
      fromAmount: '10000',
      sourceChainId: 8453,
    });
  });

  it('does not fetch a plan or submit transactions when switching to Base fails', async () => {
    const switchError = new Error('User rejected chain switch');
    mocks.useWalletProvider.mockReturnValue({
      account: { address: USER },
      chain: { id: 1 },
      switchChain: mocks.switchChain,
      getWalletClient: mocks.getWalletClient,
    });
    mocks.switchChain.mockRejectedValueOnce(switchError);

    const { result } = renderHook(() => useInvestStrategy());

    await act(async () => {
      await expect(
        result.current.run({ fromToken: BASE_USDC, fromAmount: '10000' }),
      ).rejects.toThrow('User rejected chain switch');
    });

    expect(mocks.getDepositPlan).not.toHaveBeenCalled();
    expect(mocks.walletClient.sendTransaction).not.toHaveBeenCalled();
    expect(result.current.lastError).toBe(switchError);
  });
});
