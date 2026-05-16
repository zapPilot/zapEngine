import { act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useGmxV2Deposit } from '@/hooks/useGmxV2Deposit';

import { renderHook } from '../../test-utils';

const USER = '0x1111111111111111111111111111111111111111';

const mocks = vi.hoisted(() => {
  const walletClient = {
    account: { address: '0x1111111111111111111111111111111111111111' },
    sendTransaction: vi.fn(),
  };
  return {
    useWalletProvider: vi.fn(),
    buildGmxV2Deposit: vi.fn(),
    getPublicClient: vi.fn(),
    getWalletClient: vi.fn(),
    switchChain: vi.fn(),
    waitForTransactionReceipt: vi.fn(),
    walletClient,
  };
});

vi.mock('@/providers/WalletProvider', () => ({
  useWalletProvider: mocks.useWalletProvider,
}));

vi.mock('@/services/intentClient', () => ({
  buildGmxV2Deposit: mocks.buildGmxV2Deposit,
  getPublicClient: mocks.getPublicClient,
}));

vi.mock('@/utils/logger', () => ({
  logger: {
    createContextLogger: () => ({
      info: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

const approvalTx = {
  to: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  data: '0xaaaa',
  value: '0',
  chainId: 42161,
  gasLimit: '50000',
  meta: { intentType: 'APPROVAL' },
} as const;

const depositTx = {
  to: '0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE',
  data: '0xbbbb',
  value: '0',
  chainId: 42161,
  meta: { intentType: 'GMX_DEPOSIT' },
} as const;

const plan = {
  approvals: [approvalTx],
  steps: [depositTx],
  executionFeeWei: '1000',
  market: { key: 'eth-usdc' },
};

describe('useGmxV2Deposit', () => {
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
    mocks.buildGmxV2Deposit.mockResolvedValue(plan);
    mocks.getPublicClient.mockReturnValue({
      waitForTransactionReceipt: mocks.waitForTransactionReceipt,
    });
    mocks.waitForTransactionReceipt.mockResolvedValue({ status: 'success' });
    mocks.walletClient.sendTransaction
      .mockResolvedValueOnce('0xapprovehash')
      .mockResolvedValueOnce('0xdeposithash');
  });

  it('runs approval then deposit on Arbitrum and tracks step + hash state', async () => {
    const { result } = renderHook(() => useGmxV2Deposit());

    let output: { hashes: string[] } | undefined;
    await act(async () => {
      output = (await result.current.run({
        marketKey: 'eth-usdc',
        amount: '1000000',
      })) as { hashes: string[] };
    });

    expect(mocks.switchChain).not.toHaveBeenCalled();
    expect(mocks.buildGmxV2Deposit).toHaveBeenCalledWith({
      marketKey: 'eth-usdc',
      amount: '1000000',
      userAddress: USER,
    });
    expect(mocks.walletClient.sendTransaction).toHaveBeenCalledTimes(2);
    expect(mocks.waitForTransactionReceipt).toHaveBeenCalledTimes(2);
    expect(output?.hashes).toEqual(['0xapprovehash', '0xdeposithash']);
    expect(result.current.lastTxHashes).toEqual([
      '0xapprovehash',
      '0xdeposithash',
    ]);
    expect(result.current.lastTxHash).toBe('0xdeposithash');
    expect(result.current.lastPlan).toBe(plan);
    expect(result.current.steps.map((s) => s.status)).toEqual([
      'confirmed',
      'confirmed',
    ]);
    expect(result.current.steps.map((s) => s.label)).toEqual([
      'Approval',
      'GMX deposit',
    ]);
    expect(result.current.pending).toBe(false);
    expect(result.current.lastError).toBeNull();
  });

  it('switches to Arbitrum before building the plan when on another chain', async () => {
    mocks.useWalletProvider.mockReturnValue({
      account: { address: USER },
      chain: { id: 1 },
      getWalletClient: mocks.getWalletClient,
      switchChain: mocks.switchChain,
    });

    const { result } = renderHook(() => useGmxV2Deposit());

    await act(async () => {
      await result.current.run({ marketKey: 'eth-usdc', amount: '1000000' });
    });

    expect(mocks.switchChain).toHaveBeenCalledWith(42161);
    expect(mocks.buildGmxV2Deposit).toHaveBeenCalledTimes(1);
  });

  it('throws when no wallet is connected and does not build a plan', async () => {
    mocks.useWalletProvider.mockReturnValue({
      account: undefined,
      chain: { id: 42161 },
      getWalletClient: mocks.getWalletClient,
      switchChain: mocks.switchChain,
    });

    const { result } = renderHook(() => useGmxV2Deposit());

    await act(async () => {
      await expect(
        result.current.run({ marketKey: 'eth-usdc', amount: '1000000' }),
      ).rejects.toThrow('Connect wallet first');
    });

    expect(mocks.buildGmxV2Deposit).not.toHaveBeenCalled();
    expect(result.current.pending).toBe(false);
    expect(result.current.lastError).toBeInstanceOf(Error);
  });

  it('records and rethrows a build failure, and getErrorMessage normalizes errors', async () => {
    const failure = new Error('intent engine down');
    mocks.buildGmxV2Deposit.mockReset().mockRejectedValueOnce(failure);

    const { result } = renderHook(() => useGmxV2Deposit());

    await act(async () => {
      await expect(
        result.current.run({ marketKey: 'eth-usdc', amount: '1000000' }),
      ).rejects.toThrow('intent engine down');
    });

    expect(result.current.lastError).toBe(failure);
    expect(result.current.pending).toBe(false);
    expect(result.current.getErrorMessage(failure)).toBe('intent engine down');
    expect(result.current.getErrorMessage('plain string')).toBe('plain string');
  });
});
