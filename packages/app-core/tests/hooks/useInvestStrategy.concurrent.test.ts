// @vitest-environment jsdom
import { useInvestStrategy } from '@core/hooks/useInvestStrategy';
import { act, renderHook } from '@testing-library/react';
import type { DepositPlan } from '@zapengine/types/api';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Hash } from 'viem';

const USER = '0x1111111111111111111111111111111111111111';
const TOKEN = '0x2222222222222222222222222222222222222222';
const OLD_HASH =
  '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Hash;
const OLD_DESTINATION_HASH =
  '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc' as Hash;
const NEW_HASH =
  '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Hash;

type Eip7702Result = {
  kind: 'eip7702';
  callsId: string;
  transactionHash: Hash;
};

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

describe('useInvestStrategy concurrent executions', () => {
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
      getWalletClient: mocks.getWalletClient,
      switchChain: mocks.switchChain,
    });
  });

  it('ignores stale progress and result updates after a newer invest run completes', async () => {
    const firstPlan = plan('first');
    const secondPlan = plan('second');
    mocks.loadBaseInvestPlan
      .mockResolvedValueOnce({ userAddress: USER, plan: firstPlan })
      .mockResolvedValueOnce({ userAddress: USER, plan: secondPlan });

    let firstBundleSubmitted!: (callsId: string) => void;
    let resolveFirst!: (result: Eip7702Result) => void;
    mocks.executeDepositPlanWithWallet
      .mockImplementationOnce(
        (params: { onBundleSubmitted: (callsId: string) => void }) =>
          new Promise<Eip7702Result>((resolve) => {
            firstBundleSubmitted = params.onBundleSubmitted;
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValueOnce({ kind: 'sequential', hashes: [NEW_HASH] });

    const { result } = renderHook(() => useInvestStrategy());
    let firstRun!: Promise<unknown>;

    await act(async () => {
      firstRun = result.current.run({
        fromToken: TOKEN,
        fromAmount: '1000000',
      });
      await vi.waitFor(() => {
        expect(mocks.executeDepositPlanWithWallet).toHaveBeenCalledTimes(1);
      });
    });

    await act(async () => {
      await result.current.run({
        fromToken: TOKEN,
        fromAmount: '2000000',
      });
    });

    expect(result.current.pending).toBe(false);
    expect(result.current.tier).toBe('sequential');
    expect(result.current.lastTxHash).toBe(NEW_HASH);
    expect(result.current.lastCallsId).toBeNull();
    expect(result.current.lastPlan).toBe(secondPlan);
    expect(result.current.legs).toEqual([
      { chainId: 8453, kind: 'second', status: 'pending' },
    ]);

    act(() => {
      firstBundleSubmitted('stale-calls-id');
    });

    expect(result.current.tier).toBe('sequential');
    expect(result.current.lastTxHash).toBe(NEW_HASH);
    expect(result.current.lastCallsId).toBeNull();
    expect(result.current.legs).toEqual([
      { chainId: 8453, kind: 'second', status: 'pending' },
    ]);

    await act(async () => {
      resolveFirst({
        kind: 'eip7702',
        callsId: 'stale-calls-id',
        transactionHash: OLD_HASH,
      });
      await firstRun;
    });

    expect(result.current.pending).toBe(false);
    expect(result.current.tier).toBe('sequential');
    expect(result.current.lastTxHash).toBe(NEW_HASH);
    expect(result.current.lastCallsId).toBeNull();
    expect(result.current.lastPlan).toBe(secondPlan);
    expect(result.current.legs).toEqual([
      { chainId: 8453, kind: 'second', status: 'pending' },
    ]);
  });

  it('ignores a stale bridge completion after a newer invest run completes', async () => {
    const firstPlan = plan('bridge');
    const secondPlan = plan('second');
    mocks.loadBaseInvestPlan
      .mockResolvedValueOnce({ userAddress: USER, plan: firstPlan })
      .mockResolvedValueOnce({ userAddress: USER, plan: secondPlan });

    let resolveBridge!: (status: {
      receiving: { txHash: Hash };
    }) => void;
    mocks.waitForBridgeCompletion.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveBridge = resolve;
        }),
    );
    mocks.executeDepositPlanWithWallet
      .mockImplementationOnce(
        async (params: {
          onCallConfirmed: (index: number, tx: unknown, hash: Hash) => void;
        }) => {
          params.onCallConfirmed(0, {}, OLD_HASH);
          return { kind: 'sequential', hashes: [OLD_HASH] };
        },
      )
      .mockResolvedValueOnce({ kind: 'sequential', hashes: [NEW_HASH] });

    const { result } = renderHook(() => useInvestStrategy());

    await act(async () => {
      await result.current.run({
        fromToken: TOKEN,
        fromAmount: '1000000',
      });
      await vi.waitFor(() => {
        expect(mocks.waitForBridgeCompletion).toHaveBeenCalledTimes(1);
      });
    });

    expect(result.current.legs).toEqual([
      {
        chainId: 8453,
        kind: 'bridge',
        sourceTxHash: OLD_HASH,
        status: 'bridgePending',
      },
    ]);

    await act(async () => {
      await result.current.run({
        fromToken: TOKEN,
        fromAmount: '2000000',
      });
    });

    expect(result.current.pending).toBe(false);
    expect(result.current.tier).toBe('sequential');
    expect(result.current.lastTxHash).toBe(NEW_HASH);
    expect(result.current.lastPlan).toBe(secondPlan);
    expect(result.current.legs).toEqual([
      { chainId: 8453, kind: 'second', status: 'pending' },
    ]);

    await act(async () => {
      resolveBridge({ receiving: { txHash: OLD_DESTINATION_HASH } });
      await Promise.resolve();
    });

    expect(result.current.pending).toBe(false);
    expect(result.current.tier).toBe('sequential');
    expect(result.current.lastTxHash).toBe(NEW_HASH);
    expect(result.current.lastPlan).toBe(secondPlan);
    expect(result.current.legs).toEqual([
      { chainId: 8453, kind: 'second', status: 'pending' },
    ]);
  });

  it('ignores a stale bridge failure after a newer invest run completes', async () => {
    const firstPlan = plan('bridge');
    const secondPlan = plan('second');
    mocks.loadBaseInvestPlan
      .mockResolvedValueOnce({ userAddress: USER, plan: firstPlan })
      .mockResolvedValueOnce({ userAddress: USER, plan: secondPlan });

    let rejectBridge!: (error: Error) => void;
    mocks.waitForBridgeCompletion.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectBridge = reject;
        }),
    );
    mocks.executeDepositPlanWithWallet
      .mockImplementationOnce(
        async (params: {
          onCallConfirmed: (index: number, tx: unknown, hash: Hash) => void;
        }) => {
          params.onCallConfirmed(0, {}, OLD_HASH);
          return { kind: 'sequential', hashes: [OLD_HASH] };
        },
      )
      .mockResolvedValueOnce({ kind: 'sequential', hashes: [NEW_HASH] });

    const { result } = renderHook(() => useInvestStrategy());

    await act(async () => {
      await result.current.run({
        fromToken: TOKEN,
        fromAmount: '1000000',
      });
      await vi.waitFor(() => {
        expect(mocks.waitForBridgeCompletion).toHaveBeenCalledTimes(1);
      });
    });

    await act(async () => {
      await result.current.run({
        fromToken: TOKEN,
        fromAmount: '2000000',
      });
    });

    expect(result.current.pending).toBe(false);
    expect(result.current.tier).toBe('sequential');
    expect(result.current.lastTxHash).toBe(NEW_HASH);
    expect(result.current.lastPlan).toBe(secondPlan);
    expect(result.current.legs).toEqual([
      { chainId: 8453, kind: 'second', status: 'pending' },
    ]);

    await act(async () => {
      rejectBridge(new Error('stale bridge failure'));
      await Promise.resolve();
    });

    expect(result.current.pending).toBe(false);
    expect(result.current.tier).toBe('sequential');
    expect(result.current.lastTxHash).toBe(NEW_HASH);
    expect(result.current.lastPlan).toBe(secondPlan);
    expect(result.current.legs).toEqual([
      { chainId: 8453, kind: 'second', status: 'pending' },
    ]);
  });
});
