// @vitest-environment jsdom
import { useInvestStrategy } from '@core/hooks/useInvestStrategy';
import { act, renderHook } from '@testing-library/react';
import type { DepositPlan } from '@zapengine/types/api';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Hash } from 'viem';

const USER = '0x1111111111111111111111111111111111111111';
const TOKEN = '0x2222222222222222222222222222222222222222';
const NEW_HASH =
  '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Hash;

const mocks = vi.hoisted(() => ({
  useWalletProvider: vi.fn(),
  loadBaseInvestPlan: vi.fn(),
  executeDepositPlanWithWallet: vi.fn(),
  waitForBridgeCompletion: vi.fn(),
  getWalletClient: vi.fn(),
  switchChain: vi.fn(),
}));

vi.mock('@core/providers/walletContext', () => ({
  useWalletProvider: mocks.useWalletProvider,
}));

vi.mock('@core/lib/wallet/loadBaseInvestPlan', () => ({
  loadBaseInvestPlan: mocks.loadBaseInvestPlan,
}));

vi.mock('@core/lib/wallet/executeDepositPlan', () => ({
  executeDepositPlanWithWallet: mocks.executeDepositPlanWithWallet,
}));

vi.mock('@core/services/intentClient', () => ({
  waitForBridgeCompletion: mocks.waitForBridgeCompletion,
}));

function plan(kind: string): DepositPlan {
  return {
    approvals: [],
    calls: [],
    legs: [{ chainId: 8453, kind }],
  } as unknown as DepositPlan;
}

describe('useInvestStrategy stale plan loading', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getWalletClient.mockResolvedValue({
      account: { address: USER },
    });
    mocks.switchChain.mockResolvedValue(undefined);
    mocks.useWalletProvider.mockReturnValue({
      account: { address: USER },
      chain: { id: 8453 },
      executeAtomicBatch: undefined,
      externalWalletBrand: undefined,
      getWalletClient: mocks.getWalletClient,
      switchChain: mocks.switchChain,
    });
  });

  it('does not execute a stale plan after a newer invest run starts', async () => {
    const firstPlan = plan('first');
    const secondPlan = plan('second');
    let resolveFirstPlan!: (value: {
      userAddress: string;
      plan: DepositPlan;
    }) => void;

    mocks.loadBaseInvestPlan
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirstPlan = resolve;
          }),
      )
      .mockResolvedValueOnce({ userAddress: USER, plan: secondPlan });
    mocks.executeDepositPlanWithWallet.mockResolvedValue({
      kind: 'sequential',
      hashes: [NEW_HASH],
    });

    const { result } = renderHook(() => useInvestStrategy());
    let firstRun!: Promise<unknown>;

    await act(async () => {
      firstRun = result.current.run({
        fromToken: TOKEN,
        fromAmount: '1000000',
      });
      await vi.waitFor(() => {
        expect(mocks.loadBaseInvestPlan).toHaveBeenCalledTimes(1);
      });
    });

    await act(async () => {
      await result.current.run({
        fromToken: TOKEN,
        fromAmount: '2000000',
      });
    });

    expect(mocks.executeDepositPlanWithWallet).toHaveBeenCalledTimes(1);
    expect(
      mocks.executeDepositPlanWithWallet.mock.calls[0]?.[0]?.plan,
    ).toBe(secondPlan);
    expect(result.current.pending).toBe(false);
    expect(result.current.lastPlan).toBe(secondPlan);
    expect(result.current.lastTxHash).toBe(NEW_HASH);

    await act(async () => {
      resolveFirstPlan({ userAddress: USER, plan: firstPlan });
      await expect(firstRun).rejects.toMatchObject({ name: 'AbortError' });
    });

    expect(mocks.executeDepositPlanWithWallet).toHaveBeenCalledTimes(1);
    expect(result.current.pending).toBe(false);
    expect(result.current.lastPlan).toBe(secondPlan);
    expect(result.current.lastTxHash).toBe(NEW_HASH);
    expect(result.current.legs).toEqual([
      { chainId: 8453, kind: 'second', status: 'pending' },
    ]);
  });
});
