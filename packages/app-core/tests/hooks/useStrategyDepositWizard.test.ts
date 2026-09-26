// @vitest-environment jsdom
import { useStrategyDepositWizard } from '@core/hooks/useStrategyDepositWizard';
import { act, renderHook, waitFor } from '@testing-library/react';
import { MORPHO_VAULTS } from '@zapengine/intent-engine';
import {
  NATIVE_TOKEN_ADDRESS,
  type StrategyDepositPlan,
} from '@zapengine/types/api';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const USER = '0x1111111111111111111111111111111111111111';
const OTHER_USER = '0x2222222222222222222222222222222222222222';
const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const ARBITRUM_USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
const HASH_A = `0x${'a'.repeat(64)}` as const;
const HASH_B = `0x${'b'.repeat(64)}` as const;

const mocks = vi.hoisted(() => ({
  useWalletProvider: vi.fn(),
  getStrategyDepositPlan: vi.fn(),
  getPublicClient: vi.fn(),
  getBalance: vi.fn(),
  readContract: vi.fn(),
  waitForTransactionReceipt: vi.fn(),
  sendTransaction: vi.fn(),
  switchChain: vi.fn(),
}));

vi.mock('@core/providers/walletContext', () => ({
  useWalletProvider: mocks.useWalletProvider,
}));

vi.mock('@core/services/planOrchestrationService', () => ({
  getStrategyDepositPlan: mocks.getStrategyDepositPlan,
}));

vi.mock('@core/services/intentClient', () => ({
  getPublicClient: mocks.getPublicClient,
}));

const PLAN: StrategyDepositPlan = {
  kind: 'strategy',
  strategyId: 'zap-morpho-gmx-v1',
  totalUsd6: '100000000',
  allocations: [
    {
      id: 'morpho-base-usdc',
      label: 'Morpho Spark USDC',
      weightBps: 4000,
      chainId: 8453,
      protocol: 'morpho',
      fromToken: BASE_USDC,
      fromAmount: '40000000',
      toToken: BASE_USDC,
      toAmountMin: '40000000',
      gasUsd: '0.03',
      durationSec: 12,
    },
    {
      id: 'gmx-btc-usdc',
      label: 'GMX BTC/USDC',
      weightBps: 3000,
      chainId: 42161,
      protocol: 'gmx-v2',
      marketKey: 'btc-usdc',
      fromToken: ARBITRUM_USDC,
      fromAmount: '30000000',
      toToken: '0x3333333333333333333333333333333333333333',
      toAmountMin: '1',
      gasUsd: '0',
      durationSec: 60,
    },
    {
      id: 'gmx-eth-usdc',
      label: 'GMX ETH/USDC',
      weightBps: 3000,
      chainId: 42161,
      protocol: 'gmx-v2',
      marketKey: 'eth-usdc',
      fromToken: ARBITRUM_USDC,
      fromAmount: '30000000',
      toToken: '0x4444444444444444444444444444444444444444',
      toAmountMin: '1',
      gasUsd: '0',
      durationSec: 60,
    },
  ],
  executionGroups: [
    {
      id: 'base-morpho',
      chainId: 8453,
      fromToken: BASE_USDC,
      fromAmount: '40000000',
      approvals: [],
      calls: [
        {
          to: MORPHO_VAULTS[8453].SPARK_USDC,
          data: '0x1234',
          value: '0',
          chainId: 8453,
          meta: { intentType: 'SUPPLY', route: { tool: 'direct' } },
        },
      ],
      allocationIds: ['morpho-base-usdc'],
      gasUsd: '0.03',
    },
    {
      id: 'arbitrum-gmx',
      chainId: 42161,
      fromToken: ARBITRUM_USDC,
      fromAmount: '60000000',
      approvals: [],
      calls: [],
      allocationIds: ['gmx-btc-usdc', 'gmx-eth-usdc'],
      gasUsd: '0',
    },
  ],
  checkpoints: [
    {
      kind: 'mock-bridge',
      id: 'base-to-arbitrum',
      fromChainId: 8453,
      toChainId: 42161,
      afterGroupId: 'base-morpho',
      beforeGroupId: 'arbitrum-gmx',
      amountUsd6: '60000000',
      disclosure: 'No funds move.',
    },
  ],
  totalGasUsd: '0.03',
};

function walletValue(address = USER) {
  return {
    account: { address },
    chain: { id: 8453 },
    sendTransaction: mocks.sendTransaction,
    switchChain: mocks.switchChain,
  };
}

describe('useStrategyDepositWizard', () => {
  let morphoBalances: bigint[];

  beforeEach(() => {
    vi.clearAllMocks();
    morphoBalances = [0n, 1n];
    mocks.useWalletProvider.mockReset().mockReturnValue(walletValue());
    mocks.getStrategyDepositPlan.mockReset().mockResolvedValue(PLAN);
    mocks.getBalance.mockReset().mockResolvedValue(1_000_000_000_000_000_000n);
    mocks.readContract
      .mockReset()
      .mockImplementation(({ address }: { address: string }) => {
        if (address.toLowerCase() === BASE_USDC.toLowerCase()) {
          return Promise.resolve(1_000_000_000n);
        }
        return Promise.resolve(morphoBalances.shift() ?? 1n);
      });
    mocks.waitForTransactionReceipt
      .mockReset()
      .mockResolvedValue({ status: 'success' });
    mocks.sendTransaction.mockReset().mockResolvedValue(HASH_A);
    mocks.switchChain.mockReset().mockResolvedValue(undefined);
    mocks.getPublicClient.mockReset().mockReturnValue({
      getBalance: mocks.getBalance,
      readContract: mocks.readContract,
      waitForTransactionReceipt: mocks.waitForTransactionReceipt,
    });
  });

  async function reachBaseDeposit(result: {
    current: ReturnType<typeof useStrategyDepositWizard>;
  }) {
    await act(async () => {
      await result.current.start({
        userAddress: USER,
        totalUsd6: PLAN.totalUsd6,
        fundingSources: [
          { chainId: 8453, fromToken: BASE_USDC },
          { chainId: 42161, fromToken: ARBITRUM_USDC },
        ],
      });
    });
    await act(async () => {
      await result.current.advance();
    });
    expect(result.current.wizard.steps[1]?.kind).toBe('transaction');
  }

  it('surfaces plan preparation failures and rethrows them', async () => {
    const failure = new Error('planner offline');
    mocks.getStrategyDepositPlan.mockRejectedValueOnce(failure);
    const { result } = renderHook(() => useStrategyDepositWizard());

    await act(async () => {
      await expect(
        result.current.start({
          userAddress: USER,
          totalUsd6: PLAN.totalUsd6,
          fundingSources: [],
        }),
      ).rejects.toBe(failure);
    });
    expect(result.current.wizard.error).toBe('planner offline');
  });

  it('fails safely when the refreshed execution group disappears', async () => {
    mocks.getStrategyDepositPlan
      .mockResolvedValueOnce(PLAN)
      .mockResolvedValueOnce({ ...PLAN, executionGroups: [] });
    const { result } = renderHook(() => useStrategyDepositWizard());
    await act(async () => {
      await result.current.start({
        userAddress: USER,
        totalUsd6: PLAN.totalUsd6,
        fundingSources: [],
      });
    });
    await act(async () => {
      await result.current.advance();
    });
    expect(result.current.wizard.error).toContain('Execution group is missing');
  });

  it('checks token and native gas funding failures during group preflight', async () => {
    const input = {
      userAddress: USER,
      totalUsd6: PLAN.totalUsd6,
      fundingSources: [{ chainId: 8453, fromToken: BASE_USDC }],
    };

    mocks.readContract.mockResolvedValueOnce(1n);
    const tokenLow = renderHook(() => useStrategyDepositWizard());
    await act(async () => {
      await tokenLow.result.current.start(input);
    });
    await act(async () => {
      await tokenLow.result.current.advance();
    });
    expect(tokenLow.result.current.wizard.error).toContain(
      'Funding balance too low',
    );
    tokenLow.unmount();

    mocks.getStrategyDepositPlan.mockResolvedValue(PLAN);
    mocks.readContract.mockResolvedValueOnce(1_000_000_000n);
    mocks.getBalance.mockResolvedValueOnce(1n);
    const gasLow = renderHook(() => useStrategyDepositWizard());
    await act(async () => {
      await gasLow.result.current.start(input);
    });
    await act(async () => {
      await gasLow.result.current.advance();
    });
    expect(gasLow.result.current.wizard.error).toContain('ETH balance too low');
  });

  it('checks native funding and switches chain when required', async () => {
    const nativePlan: StrategyDepositPlan = {
      ...PLAN,
      executionGroups: [
        {
          ...PLAN.executionGroups[0]!,
          fromToken: NATIVE_TOKEN_ADDRESS,
          approvals: [],
          calls: [{ ...PLAN.executionGroups[0]!.calls[0]!, value: '1000' }],
        },
      ],
      checkpoints: [PLAN.checkpoints[0]!],
    };
    mocks.getStrategyDepositPlan.mockResolvedValue(nativePlan);
    mocks.getBalance.mockResolvedValueOnce(1n);
    const low = renderHook(() => useStrategyDepositWizard());
    await act(async () => {
      await low.result.current.start({
        userAddress: USER,
        totalUsd6: nativePlan.totalUsd6,
        fundingSources: [],
      });
    });
    await act(async () => {
      await low.result.current.advance();
    });
    expect(low.result.current.wizard.error).toContain('Native balance too low');
    low.unmount();

    mocks.getStrategyDepositPlan.mockResolvedValue(nativePlan);
    mocks.getBalance.mockResolvedValue(10n ** 18n);
    mocks.useWalletProvider.mockReturnValue({
      ...walletValue(),
      chain: { id: 1 },
    });
    const switched = renderHook(() => useStrategyDepositWizard());
    await act(async () => {
      await switched.result.current.start({
        userAddress: USER,
        totalUsd6: nativePlan.totalUsd6,
        fundingSources: [],
      });
    });
    await act(async () => {
      await switched.result.current.advance();
    });
    expect(mocks.switchChain).toHaveBeenCalledWith(8453);
  });

  it('handles a GMX market transaction, position polling, and mock bridge', async () => {
    const gmxTx = {
      to: '0x3333333333333333333333333333333333333333',
      data: '0x1234',
      value: '0',
      chainId: 42161,
      meta: {
        intentType: 'SUPPLY',
        route: { marketKey: 'btc-usdc' },
      },
    } as const;
    const gmxPlan: StrategyDepositPlan = {
      ...PLAN,
      executionGroups: [
        {
          id: 'arbitrum-gmx',
          chainId: 42161,
          fromToken: ARBITRUM_USDC,
          fromAmount: '1000000',
          approvals: [],
          calls: [gmxTx],
          allocationIds: ['gmx-btc-usdc'],
          gasUsd: '0',
        },
      ],
      checkpoints: [PLAN.checkpoints[0]!],
    };
    mocks.getStrategyDepositPlan.mockResolvedValue(gmxPlan);
    mocks.readContract
      .mockReset()
      .mockResolvedValueOnce(10_000_000n)
      .mockResolvedValueOnce(1n)
      .mockResolvedValueOnce(2n);
    const { result } = renderHook(() => useStrategyDepositWizard());
    await act(async () => {
      await result.current.start({
        userAddress: USER,
        totalUsd6: gmxPlan.totalUsd6,
        fundingSources: [],
      });
    });
    await act(async () => {
      await result.current.advance();
    });
    expect(mocks.switchChain).toHaveBeenCalledWith(42161);

    await act(async () => result.current.advance());
    expect(result.current.wizard.steps[1]?.status).toBe('confirmed');
    expect(mocks.waitForTransactionReceipt).toHaveBeenCalled();

    await act(async () => result.current.advance());
    expect(result.current.wizard.steps[2]?.kind).toBe('mock-bridge');
    expect(result.current.wizard.steps[2]?.status).toBe('confirmed');
  });

  it('covers malformed internal transaction guards and resumes an existing hash', async () => {
    const missingTx = renderHook(() => useStrategyDepositWizard());
    await reachBaseDeposit(missingTx.result);
    const originalTransaction =
      missingTx.result.current.wizard.steps[1]!.transaction;
    missingTx.result.current.wizard.steps[1]!.transaction = undefined;
    await act(async () => missingTx.result.current.advance());
    expect(missingTx.result.current.wizard.error).toContain(
      'Prepared transaction is missing',
    );
    missingTx.result.current.wizard.steps[1]!.transaction = originalTransaction;
    missingTx.unmount();

    mocks.getStrategyDepositPlan.mockResolvedValue(PLAN);
    const missingChain = renderHook(() => useStrategyDepositWizard());
    await reachBaseDeposit(missingChain.result);
    missingChain.result.current.wizard.steps[1]!.chainId = undefined;
    await act(async () => missingChain.result.current.advance());
    expect(missingChain.result.current.wizard.error).toContain(
      'Prepared transaction is missing',
    );
    missingChain.unmount();

    mocks.getStrategyDepositPlan.mockResolvedValue(PLAN);
    const existingHash = renderHook(() => useStrategyDepositWizard());
    await reachBaseDeposit(existingHash.result);
    existingHash.result.current.wizard.steps[1]!.transactionHash = HASH_A;
    await act(async () => existingHash.result.current.advance());
    expect(mocks.sendTransaction).not.toHaveBeenCalled();
    expect(existingHash.result.current.wizard.steps[1]?.status).toBe(
      'confirmed',
    );
  });

  it('allows only one transaction submission while advance is in flight', async () => {
    let releaseSend: ((hash: typeof HASH_A) => void) | undefined;
    mocks.sendTransaction.mockReturnValue(
      new Promise<typeof HASH_A>((resolve) => {
        releaseSend = resolve;
      }),
    );
    const { result } = renderHook(() => useStrategyDepositWizard());
    await reachBaseDeposit(result);

    let firstAdvance: Promise<void> | undefined;
    let duplicateAdvance: Promise<void> | undefined;
    act(() => {
      firstAdvance = result.current.advance();
      duplicateAdvance = result.current.advance();
    });

    await waitFor(() => {
      expect(mocks.sendTransaction).toHaveBeenCalledTimes(1);
    });
    releaseSend?.(HASH_A);
    await act(async () => {
      await Promise.all([firstAdvance, duplicateAdvance]);
    });

    expect(mocks.sendTransaction).toHaveBeenCalledTimes(1);
    expect(result.current.wizard.steps[1]?.status).toBe('confirmed');
  });

  it('refuses to execute when the connected account differs from the plan owner', async () => {
    const { result, rerender } = renderHook(() => useStrategyDepositWizard());
    await reachBaseDeposit(result);

    mocks.useWalletProvider.mockReturnValue(walletValue(OTHER_USER));
    rerender();
    await act(async () => {
      await result.current.advance();
    });

    expect(mocks.sendTransaction).not.toHaveBeenCalled();
    expect(result.current.wizard.error).toMatch(/connected wallet changed/i);
    expect(result.current.wizard.steps[1]?.status).toBe('failed');
  });

  it('resets wizard state and internal request/baseline state', async () => {
    const { result } = renderHook(() => useStrategyDepositWizard());
    await reachBaseDeposit(result);

    act(() => result.current.reset());

    expect(result.current.wizard).toMatchObject({
      plan: null,
      steps: [],
      currentIndex: 0,
      status: 'idle',
      error: null,
    });
    await act(async () => result.current.advance());
    expect(mocks.sendTransaction).not.toHaveBeenCalled();
  });

  it('clears a reverted hash and submits a replacement on retry', async () => {
    mocks.sendTransaction
      .mockResolvedValueOnce(HASH_A)
      .mockResolvedValueOnce(HASH_B);
    mocks.waitForTransactionReceipt
      .mockResolvedValueOnce({ status: 'reverted' })
      .mockResolvedValueOnce({ status: 'success' });
    const { result } = renderHook(() => useStrategyDepositWizard());
    await reachBaseDeposit(result);

    await act(async () => {
      await result.current.advance();
    });
    expect(result.current.wizard.error).toBe('Transaction reverted on-chain');
    expect(result.current.wizard.steps[1]?.status).toBe('failed');
    expect(result.current.wizard.steps[1]?.transactionHash).toBeUndefined();

    act(() => result.current.retry());
    await act(async () => {
      await result.current.advance();
    });

    expect(mocks.sendTransaction).toHaveBeenCalledTimes(2);
    expect(result.current.wizard.steps[1]?.transactionHash).toBe(HASH_B);
    expect(result.current.wizard.steps[1]?.status).toBe('confirmed');
  });
});
