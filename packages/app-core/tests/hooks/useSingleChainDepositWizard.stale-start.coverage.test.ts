// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getDepositPlan: vi.fn(),
  useWalletProvider: vi.fn(),
}));

vi.mock('@core/services/planOrchestrationService', () => ({
  getDepositPlan: mocks.getDepositPlan,
}));

vi.mock('@core/providers/walletContext', () => ({
  useWalletProvider: mocks.useWalletProvider,
}));

import { useSingleChainDepositWizard } from '@core/hooks/useSingleChainDepositWizard';

const request = (amount: string) =>
  ({
    kind: 'invest',
    userAddress: '0x1111111111111111111111111111111111111111',
    fromToken: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    fromAmount: amount,
    sourceChainId: 8453,
    split: { '8453': 1 },
  }) as never;

const plan = (amount: string) =>
  ({
    legs: [
      {
        chainId: 8453,
        kind: 'supply',
        protocol: 'morpho',
        toToken: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        fromAmount: amount,
        toAmountMin: amount,
        gasUsd: '0.01',
        durationSec: 10,
      },
    ],
    approvals: [],
    calls: [],
    totalGasUsd: '0.01',
    sourceChainId: 8453,
  }) as never;

describe('useSingleChainDepositWizard stale start coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useWalletProvider.mockReturnValue({
      account: { address: '0x1111111111111111111111111111111111111111' },
      chain: { id: 8453 },
    });
  });

  it('ignores a plan that resolves after a newer start generation', async () => {
    let resolveFirst!: (value: ReturnType<typeof plan>) => void;
    const firstPlan = new Promise<ReturnType<typeof plan>>((resolve) => {
      resolveFirst = resolve;
    });
    mocks.getDepositPlan
      .mockReturnValueOnce(firstPlan)
      .mockResolvedValueOnce(plan('20000000'));

    const { result } = renderHook(() => useSingleChainDepositWizard());
    let staleStart!: Promise<void>;

    act(() => {
      staleStart = result.current.start(request('10000000'));
    });
    await act(async () => {
      await result.current.start(request('20000000'));
    });

    await act(async () => {
      resolveFirst(plan('10000000'));
      await staleStart;
    });

    expect(mocks.getDepositPlan).toHaveBeenCalledTimes(2);
    expect(mocks.getDepositPlan).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ fromAmount: '20000000' }),
    );
    const finalLegs = (
      result.current.wizard.plan as unknown as {
        legs?: Array<{ fromAmount?: string }>;
      } | null
    )?.legs;
    expect(finalLegs?.[0]?.fromAmount).toBe('20000000');
    expect(result.current.wizard.status).toBe('ready');
  });

  it('reports a plan load failure for the active generation', async () => {
    mocks.getDepositPlan.mockRejectedValueOnce(new Error('plan unavailable'));

    const { result } = renderHook(() => useSingleChainDepositWizard());

    await act(async () => {
      await expect(result.current.start(request('10000000'))).rejects.toThrow(
        'plan unavailable',
      );
    });

    expect(result.current.wizard).toMatchObject({
      status: 'failed',
      error: 'plan unavailable',
    });
  });
});