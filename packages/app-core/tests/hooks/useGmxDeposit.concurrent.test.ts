// @vitest-environment jsdom
import { useGmxDeposit } from '@core/hooks/useGmxDeposit';
import { act, renderHook } from '@testing-library/react';
import type { DepositPlan } from '@zapengine/types/api';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Hash } from 'viem';

const USER = '0x1111111111111111111111111111111111111111';
const OLD_HASH = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Hash;
const NEW_HASH = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Hash;

const mocks = vi.hoisted(() => ({
  useWalletProvider: vi.fn(),
  getPublicClient: vi.fn(),
  getGmxDepositPlan: vi.fn(),
  executeDepositPlan: vi.fn(),
  readContract: vi.fn(),
  getBalance: vi.fn(),
  getWalletClient: vi.fn(),
  switchChain: vi.fn(),
}));

vi.mock('@core/providers/walletContext', () => ({
  useWalletProvider: mocks.useWalletProvider,
}));

vi.mock('@core/services/intentClient', () => ({
  getPublicClient: mocks.getPublicClient,
}));

vi.mock('@core/services/planOrchestrationService', () => ({
  getGmxDepositPlan: mocks.getGmxDepositPlan,
}));

vi.mock('@core/lib/wallet/executeDepositPlan', () => ({
  executeDepositPlan: mocks.executeDepositPlan,
}));

function plan(intentType: string): DepositPlan {
  return {
    approvals: [],
    calls: [
      {
        meta: { intentType },
      },
    ],
  } as unknown as DepositPlan;
}

describe('useGmxDeposit concurrent executions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readContract.mockResolvedValue(10_000_000n);
    mocks.getBalance.mockResolvedValue(10n ** 18n);
    mocks.getPublicClient.mockReturnValue({
      readContract: mocks.readContract,
      getBalance: mocks.getBalance,
    });
    mocks.getWalletClient.mockResolvedValue({
      account: { address: USER },
    });
    mocks.switchChain.mockResolvedValue(undefined);
    mocks.useWalletProvider.mockReturnValue({
      account: { address: USER },
      chain: { id: 42161 },
      executeAtomicBatch: undefined,
      getWalletClient: mocks.getWalletClient,
      switchChain: mocks.switchChain,
    });
  });

  it('ignores stale progress and result updates after a newer deposit completes', async () => {
    const firstPlan = plan('FIRST_GMX_DEPOSIT');
    const secondPlan = plan('SECOND_GMX_DEPOSIT');
    mocks.getGmxDepositPlan
      .mockResolvedValueOnce(firstPlan)
      .mockResolvedValueOnce(secondPlan);

    let firstBundleSubmitted!: (callsId: string) => void;
    let resolveFirst!: (result: {
      kind: 'eip7702';
      callsId: string;
      transactionHash: Hash;
    }) => void;
    mocks.executeDepositPlan
      .mockImplementationOnce(
        (params: { onBundleSubmitted: (callsId: string) => void }) =>
          new Promise((resolve) => {
            firstBundleSubmitted = params.onBundleSubmitted;
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValueOnce({ kind: 'sequential', hashes: [NEW_HASH] });

    const { result } = renderHook(() => useGmxDeposit());
    let firstRun!: Promise<unknown>;

    await act(async () => {
      firstRun = result.current.run({ marketKey: 'btc-usdc', amount: '1000000' });
      await vi.waitFor(() => {
        expect(mocks.executeDepositPlan).toHaveBeenCalledTimes(1);
      });
    });

    await act(async () => {
      await result.current.run({ marketKey: 'eth-usdc', amount: '2000000' });
    });

    expect(result.current.pending).toBe(false);
    expect(result.current.tier).toBe('sequential');
    expect(result.current.lastTxHash).toBe(NEW_HASH);
    expect(result.current.lastCallsId).toBeNull();
    expect(result.current.lastPlan).toBe(secondPlan);
    expect(result.current.steps).toEqual([
      { index: 0, label: 'GMX deposit', status: 'pending' },
    ]);

    act(() => {
      firstBundleSubmitted('stale-calls-id');
    });

    expect(result.current.tier).toBe('sequential');
    expect(result.current.lastTxHash).toBe(NEW_HASH);
    expect(result.current.lastCallsId).toBeNull();
    expect(result.current.steps[0]?.status).toBe('pending');

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
    expect(result.current.steps).toEqual([
      { index: 0, label: 'GMX deposit', status: 'pending' },
    ]);
  });
});
