import { act } from '@testing-library/react';
import {
  assertGmxDepositPreflight,
  formatEth,
  formatUsdc,
  initialSteps,
  stepLabel,
  useGmxDeposit,
  walletClientAddress,
} from '@zapengine/app-core/hooks/useGmxDeposit';
import type { PreparedTransaction } from '@zapengine/types/api';
import { type Address } from 'viem';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderHook } from '../../test-utils';

const USER = '0x1111111111111111111111111111111111111111';

const mocks = vi.hoisted(() => ({
  useWalletProvider: vi.fn(),
  getGmxDepositPlan: vi.fn(),
  getPublicClient: vi.fn(),
  executeDepositPlan: vi.fn(),
  getWalletClient: vi.fn(),
  switchChain: vi.fn(),
  readContract: vi.fn(),
  getBalance: vi.fn(),
  walletClient: {
    account: { address: '0x1111111111111111111111111111111111111111' },
  },
}));

vi.mock('@zapengine/app-core/providers/WalletProvider', () => ({
  useWalletProvider: mocks.useWalletProvider,
}));

vi.mock('@zapengine/app-core/services/planOrchestrationService', () => ({
  getGmxDepositPlan: mocks.getGmxDepositPlan,
}));

vi.mock('@zapengine/app-core/services/intentClient', () => ({
  getPublicClient: mocks.getPublicClient,
}));

vi.mock('@zapengine/app-core/lib/wallet/executeDepositPlan', () => ({
  executeDepositPlan: mocks.executeDepositPlan,
}));

vi.mock('@zapengine/app-core/utils/logger', () => ({
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
    mocks.getPublicClient.mockReturnValue({
      readContract: mocks.readContract,
      getBalance: mocks.getBalance,
    });
    mocks.readContract.mockResolvedValue(10_000_000n);
    mocks.getBalance.mockResolvedValue(2_000_000_000_000_000n);
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

  it('fails before execution when Arbitrum USDC balance is below the GMX deposit amount', async () => {
    mocks.readContract.mockResolvedValue(999n);

    const { result } = renderHook(() => useGmxDeposit());

    await act(async () => {
      await expect(
        result.current.run({ marketKey: 'btc-usdc', amount: '1000' }),
      ).rejects.toThrow('GMX Arbitrum USDC balance too low');
    });

    expect(mocks.getPublicClient).toHaveBeenCalledWith(42161);
    expect(mocks.getGmxDepositPlan).not.toHaveBeenCalled();
    expect(mocks.executeDepositPlan).not.toHaveBeenCalled();
  });

  it('fails before execution when Arbitrum ETH cannot cover the GMX execution fee', async () => {
    mocks.getBalance.mockResolvedValue(999_999_999_999_999n);

    const { result } = renderHook(() => useGmxDeposit());

    await act(async () => {
      await expect(
        result.current.run({ marketKey: 'btc-usdc', amount: '1000' }),
      ).rejects.toThrow('GMX execution fee requires 0.001 ETH on Arbitrum');
    });

    expect(mocks.getPublicClient).toHaveBeenCalledWith(42161);
    expect(mocks.getGmxDepositPlan).not.toHaveBeenCalled();
    expect(mocks.executeDepositPlan).not.toHaveBeenCalled();
  });
});

describe('useGmxDeposit helper functions', () => {
  const FALLBACK = '0x9999999999999999999999999999999999999999' as Address;

  describe('walletClientAddress', () => {
    it('returns account address when account exists', () => {
      const walletClient = {
        account: { address: '0x1111111111111111111111111111111111111111' },
      };
      expect(
        walletClientAddress(
          walletClient as Parameters<typeof walletClientAddress>[0],
          FALLBACK,
        ),
      ).toBe('0x1111111111111111111111111111111111111111');
    });

    it('returns fallback when account is null', () => {
      const walletClient = { account: null };
      expect(
        walletClientAddress(
          walletClient as Parameters<typeof walletClientAddress>[0],
          FALLBACK,
        ),
      ).toBe(FALLBACK);
    });

    it('returns fallback when account is undefined', () => {
      const walletClient = { account: undefined } as Parameters<
        typeof walletClientAddress
      >[0];
      expect(walletClientAddress(walletClient, FALLBACK)).toBe(FALLBACK);
    });
  });

  describe('formatEth', () => {
    it('formats wei to ETH string', () => {
      expect(formatEth(1_000_000_000_000_000n)).toBe('0.001');
      expect(formatEth(1_000_000_000_000_000_000n)).toBe('1');
    });
  });

  describe('formatUsdc', () => {
    it('formats USDC with 6 decimals', () => {
      expect(formatUsdc(1_000_000n)).toBe('1');
      expect(formatUsdc(15_000_000n)).toBe('15');
    });
  });

  describe('stepLabel', () => {
    it('returns "Approval" for ERC20_APPROVE', () => {
      const tx = {
        meta: { intentType: 'ERC20_APPROVE' },
      } as PreparedTransaction;
      expect(stepLabel(tx)).toBe('Approval');
    });

    it('returns "Approval" for APPROVAL', () => {
      const tx = { meta: { intentType: 'APPROVAL' } } as PreparedTransaction;
      expect(stepLabel(tx)).toBe('Approval');
    });

    it('returns "Swap" for SWAP', () => {
      const tx = { meta: { intentType: 'SWAP' } } as PreparedTransaction;
      expect(stepLabel(tx)).toBe('Swap');
    });

    it('returns "GMX deposit" for other intents', () => {
      const tx = { meta: { intentType: 'SUPPLY' } } as PreparedTransaction;
      expect(stepLabel(tx)).toBe('GMX deposit');
    });
  });

  describe('initialSteps', () => {
    it('maps approvals then calls to steps with pending status', () => {
      const plan = {
        approvals: [
          { meta: { intentType: 'ERC20_APPROVE' } } as PreparedTransaction,
        ],
        calls: [
          { meta: { intentType: 'SUPPLY' } } as PreparedTransaction,
          { meta: { intentType: 'SWAP' } } as PreparedTransaction,
        ],
      };
      const steps = initialSteps(plan as Parameters<typeof initialSteps>[0]);
      expect(steps).toEqual([
        { index: 0, label: 'Approval', status: 'pending' },
        { index: 1, label: 'GMX deposit', status: 'pending' },
        { index: 2, label: 'Swap', status: 'pending' },
      ]);
    });

    it('handles empty plan', () => {
      const plan = { approvals: [], calls: [] };
      const steps = initialSteps(plan as Parameters<typeof initialSteps>[0]);
      expect(steps).toEqual([]);
    });
  });

  describe('assertGmxDepositPreflight', () => {
    const ADDRESS = '0x1111111111111111111111111111111111111111' as Address;

    beforeEach(() => {
      vi.clearAllMocks();
      mocks.getPublicClient.mockReturnValue({
        readContract: mocks.readContract,
        getBalance: mocks.getBalance,
      });
    });

    it('resolves when USDC and ETH balances are sufficient', async () => {
      mocks.readContract.mockResolvedValue(10_000_000_000n);
      mocks.getBalance.mockResolvedValue(2_000_000_000_000_000n);

      await expect(
        assertGmxDepositPreflight({ address: ADDRESS, amount: 1_000_000n }),
      ).resolves.toBeUndefined();
    });

    it('throws when USDC balance is insufficient', async () => {
      mocks.readContract.mockResolvedValue(999n);
      mocks.getBalance.mockResolvedValue(2_000_000_000_000_000n);

      await expect(
        assertGmxDepositPreflight({ address: ADDRESS, amount: 1_000_000n }),
      ).rejects.toThrow('GMX Arbitrum USDC balance too low');
    });

    it('throws when ETH balance is below execution fee', async () => {
      mocks.readContract.mockResolvedValue(10_000_000_000n);
      mocks.getBalance.mockResolvedValue(999_999_999_999_999n);

      await expect(
        assertGmxDepositPreflight({ address: ADDRESS, amount: 1_000_000n }),
      ).rejects.toThrow('GMX execution fee requires 0.001 ETH on Arbitrum');
    });
  });
});
