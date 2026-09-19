// @vitest-environment jsdom
import { useStrategyDepositWizard } from '@core/hooks/useStrategyDepositWizard';
import { act, renderHook, waitFor } from '@testing-library/react';
import { MORPHO_VAULTS } from '@zapengine/intent-engine';
import type { StrategyDepositPlan } from '@zapengine/types/api';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const USER = '0x1111111111111111111111111111111111111111';
const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const HASH = `0x${'a'.repeat(64)}` as const;

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
  totalUsd6: '40000000',
  allocations: [
    {
      id: 'morpho-base-usdc',
      label: 'Morpho Moonwell USDC',
      weightBps: 10000,
      chainId: 8453,
      protocol: 'morpho',
      fromToken: BASE_USDC,
      fromAmount: '40000000',
      toToken: BASE_USDC,
      toAmountMin: '40000000',
      gasUsd: '0.03',
      durationSec: 12,
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
          to: MORPHO_VAULTS[8453].MOONWELL_USDC,
          data: '0x1234',
          value: '0',
          chainId: 8453,
          meta: { intentType: 'SUPPLY', route: { tool: 'direct' } },
        },
      ],
      allocationIds: ['morpho-base-usdc'],
      gasUsd: '0.03',
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
      amountUsd6: '0',
      disclosure: 'No funds move.',
    },
  ],
  totalGasUsd: '0.03',
};

describe('useStrategyDepositWizard confirmation coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useWalletProvider.mockReturnValue({
      account: { address: USER },
      chain: { id: 8453 },
      sendTransaction: mocks.sendTransaction,
      switchChain: mocks.switchChain,
    });
    mocks.getStrategyDepositPlan.mockResolvedValue(PLAN);
    mocks.getBalance.mockResolvedValue(1_000_000_000_000_000_000n);
    mocks.readContract.mockImplementation(({ address }: { address: string }) =>
      Promise.resolve(
        address.toLowerCase() === BASE_USDC.toLowerCase() ? 1_000_000_000n : 0n,
      ),
    );
    mocks.waitForTransactionReceipt.mockResolvedValue({ status: 'success' });
    mocks.switchChain.mockResolvedValue(undefined);
    mocks.getPublicClient.mockReturnValue({
      getBalance: mocks.getBalance,
      readContract: mocks.readContract,
      waitForTransactionReceipt: mocks.waitForTransactionReceipt,
    });
  });

  it('fails safely if a submitted transaction loses its chain id before confirmation', async () => {
    let releaseSend: ((hash: typeof HASH) => void) | undefined;
    mocks.sendTransaction.mockReturnValue(
      new Promise<typeof HASH>((resolve) => {
        releaseSend = resolve;
      }),
    );
    const { result } = renderHook(() => useStrategyDepositWizard());

    await act(async () => {
      await result.current.start({
        userAddress: USER,
        totalUsd6: PLAN.totalUsd6,
        fundingSources: [{ chainId: 8453, fromToken: BASE_USDC }],
      });
      await result.current.advance();
    });
    expect(result.current.wizard.steps[1]?.kind).toBe('transaction');

    let advancePromise: Promise<void> | undefined;
    act(() => {
      advancePromise = result.current.advance();
    });
    await waitFor(() => expect(mocks.sendTransaction).toHaveBeenCalledOnce());

    result.current.wizard.steps[1]!.chainId = undefined;
    releaseSend?.(HASH);
    await act(async () => {
      await advancePromise;
    });

    expect(result.current.wizard.error).toContain(
      'Transaction step is missing chain id',
    );
    expect(mocks.waitForTransactionReceipt).not.toHaveBeenCalled();
  });
});
