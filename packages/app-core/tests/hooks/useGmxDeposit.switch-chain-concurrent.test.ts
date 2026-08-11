// @vitest-environment jsdom
import { useGmxDeposit } from '@core/hooks/useGmxDeposit';
import { act, renderHook } from '@testing-library/react';
import type { DepositPlan } from '@zapengine/types/api';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Hash } from 'viem';

const USER = '0x1111111111111111111111111111111111111111';
const NEW_HASH =
  '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Hash;

const mocks = vi.hoisted(() => ({
  useWalletProvider: vi.fn(),
  getPublicClient: vi.fn(),
  getGmxDepositPlan: vi.fn(),
  assertEIP7702DelegationCompatibility: vi.fn(),
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
  assertEIP7702DelegationCompatibility:
    mocks.assertEIP7702DelegationCompatibility,
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

describe('useGmxDeposit stale setup work', () => {
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
    mocks.useWalletProvider.mockReturnValue({
      account: { address: USER },
      chain: { id: 1 },
      executeAtomicBatch: undefined,
      getWalletClient: mocks.getWalletClient,
      switchChain: mocks.switchChain,
    });
  });

  it('does not continue wallet or network setup when an older chain switch resolves late', async () => {
    let resolveFirstSwitch!: () => void;
    mocks.switchChain
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolveFirstSwitch = resolve;
          }),
      )
      .mockResolvedValueOnce(undefined);

    const currentPlan = plan('CURRENT_GMX_DEPOSIT');
    mocks.getGmxDepositPlan.mockResolvedValue(currentPlan);
    mocks.executeDepositPlan.mockResolvedValue({
      kind: 'sequential',
      hashes: [NEW_HASH],
    });

    const { result } = renderHook(() => useGmxDeposit());
    let firstRun!: Promise<unknown>;

    await act(async () => {
      firstRun = result.current.run({
        marketKey: 'btc-usdc',
        amount: '1000000',
      });
      await vi.waitFor(() => {
        expect(mocks.switchChain).toHaveBeenCalledTimes(1);
      });
    });

    await act(async () => {
      await result.current.run({
        marketKey: 'eth-usdc',
        amount: '2000000',
      });
    });

    expect(mocks.switchChain).toHaveBeenCalledTimes(2);
    expect(mocks.getWalletClient).toHaveBeenCalledTimes(1);
    expect(mocks.readContract).toHaveBeenCalledTimes(1);
    expect(mocks.getBalance).toHaveBeenCalledTimes(1);
    expect(mocks.getGmxDepositPlan).toHaveBeenCalledTimes(1);
    expect(mocks.executeDepositPlan).toHaveBeenCalledTimes(1);
    expect(result.current.lastPlan).toBe(currentPlan);
    expect(result.current.lastTxHash).toBe(NEW_HASH);

    await act(async () => {
      resolveFirstSwitch();
      await expect(firstRun).rejects.toMatchObject({ name: 'AbortError' });
    });

    expect(mocks.getWalletClient).toHaveBeenCalledTimes(1);
    expect(mocks.readContract).toHaveBeenCalledTimes(1);
    expect(mocks.getBalance).toHaveBeenCalledTimes(1);
    expect(mocks.getGmxDepositPlan).toHaveBeenCalledTimes(1);
    expect(mocks.executeDepositPlan).toHaveBeenCalledTimes(1);
    expect(result.current.pending).toBe(false);
    expect(result.current.tier).toBe('sequential');
    expect(result.current.lastPlan).toBe(currentPlan);
    expect(result.current.lastTxHash).toBe(NEW_HASH);
    expect(result.current.steps).toEqual([
      { index: 0, label: 'GMX deposit', status: 'pending' },
    ]);
  });

  it('does not continue preflight or execution when an older wallet client resolves late', async () => {
    mocks.switchChain.mockResolvedValue(undefined);
    mocks.useWalletProvider.mockReturnValue({
      account: { address: USER },
      chain: { id: 42161 },
      executeAtomicBatch: undefined,
      getWalletClient: mocks.getWalletClient,
      switchChain: mocks.switchChain,
    });

    let resolveFirstWalletClient!: (client: {
      account: { address: typeof USER };
    }) => void;
    mocks.getWalletClient
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirstWalletClient = resolve;
          }),
      )
      .mockResolvedValueOnce({ account: { address: USER } });

    const currentPlan = plan('CURRENT_GMX_DEPOSIT');
    mocks.getGmxDepositPlan.mockResolvedValue(currentPlan);
    mocks.executeDepositPlan.mockResolvedValue({
      kind: 'sequential',
      hashes: [NEW_HASH],
    });

    const { result } = renderHook(() => useGmxDeposit());
    let firstRun!: Promise<unknown>;

    await act(async () => {
      firstRun = result.current.run({
        marketKey: 'btc-usdc',
        amount: '1000000',
      });
      await vi.waitFor(() => {
        expect(mocks.getWalletClient).toHaveBeenCalledTimes(1);
      });
    });

    await act(async () => {
      await result.current.run({
        marketKey: 'eth-usdc',
        amount: '2000000',
      });
    });

    expect(mocks.getWalletClient).toHaveBeenCalledTimes(2);
    expect(mocks.readContract).toHaveBeenCalledTimes(1);
    expect(mocks.getBalance).toHaveBeenCalledTimes(1);
    expect(mocks.getGmxDepositPlan).toHaveBeenCalledTimes(1);
    expect(mocks.executeDepositPlan).toHaveBeenCalledTimes(1);
    expect(result.current.lastPlan).toBe(currentPlan);
    expect(result.current.lastTxHash).toBe(NEW_HASH);

    await act(async () => {
      resolveFirstWalletClient({ account: { address: USER } });
      await expect(firstRun).rejects.toMatchObject({ name: 'AbortError' });
    });

    expect(mocks.readContract).toHaveBeenCalledTimes(1);
    expect(mocks.getBalance).toHaveBeenCalledTimes(1);
    expect(mocks.getGmxDepositPlan).toHaveBeenCalledTimes(1);
    expect(mocks.executeDepositPlan).toHaveBeenCalledTimes(1);
    expect(result.current.pending).toBe(false);
    expect(result.current.tier).toBe('sequential');
    expect(result.current.lastPlan).toBe(currentPlan);
    expect(result.current.lastTxHash).toBe(NEW_HASH);
  });

  it('does not continue planning or execution when an older balance preflight resolves late', async () => {
    mocks.switchChain.mockResolvedValue(undefined);
    mocks.useWalletProvider.mockReturnValue({
      account: { address: USER },
      chain: { id: 42161 },
      executeAtomicBatch: undefined,
      getWalletClient: mocks.getWalletClient,
      switchChain: mocks.switchChain,
    });

    let resolveFirstReadContract!: (balance: bigint) => void;
    mocks.readContract
      .mockImplementationOnce(
        () =>
          new Promise<bigint>((resolve) => {
            resolveFirstReadContract = resolve;
          }),
      )
      .mockResolvedValueOnce(10_000_000n);

    const currentPlan = plan('CURRENT_GMX_DEPOSIT');
    mocks.getGmxDepositPlan.mockResolvedValue(currentPlan);
    mocks.executeDepositPlan.mockResolvedValue({
      kind: 'sequential',
      hashes: [NEW_HASH],
    });

    const { result } = renderHook(() => useGmxDeposit());
    let firstRun!: Promise<unknown>;

    await act(async () => {
      firstRun = result.current.run({
        marketKey: 'btc-usdc',
        amount: '1000000',
      });
      await vi.waitFor(() => {
        expect(mocks.readContract).toHaveBeenCalledTimes(1);
      });
    });

    await act(async () => {
      await result.current.run({
        marketKey: 'eth-usdc',
        amount: '2000000',
      });
    });

    expect(mocks.getWalletClient).toHaveBeenCalledTimes(2);
    expect(mocks.readContract).toHaveBeenCalledTimes(2);
    expect(mocks.getBalance).toHaveBeenCalledTimes(2);
    expect(mocks.getGmxDepositPlan).toHaveBeenCalledTimes(1);
    expect(mocks.executeDepositPlan).toHaveBeenCalledTimes(1);
    expect(result.current.lastPlan).toBe(currentPlan);
    expect(result.current.lastTxHash).toBe(NEW_HASH);

    await act(async () => {
      resolveFirstReadContract(10_000_000n);
      await expect(firstRun).rejects.toMatchObject({ name: 'AbortError' });
    });

    expect(mocks.getGmxDepositPlan).toHaveBeenCalledTimes(1);
    expect(mocks.executeDepositPlan).toHaveBeenCalledTimes(1);
    expect(result.current.pending).toBe(false);
    expect(result.current.tier).toBe('sequential');
    expect(result.current.lastPlan).toBe(currentPlan);
    expect(result.current.lastTxHash).toBe(NEW_HASH);
  });
});
