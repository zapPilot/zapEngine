// @vitest-environment jsdom
import { useSingleChainDepositWizard } from '@core/hooks/useSingleChainDepositWizard';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getDepositPlan: vi.fn(),
  useWalletProvider: vi.fn(),
  executeDepositPlanWithWallet: vi.fn(),
  getPublicClient: vi.fn(),
  pollUntil: vi.fn(),
  readContract: vi.fn(),
  getBalance: vi.fn(),
  switchChain: vi.fn(),
  getWalletClient: vi.fn(),
}));

vi.mock('@core/providers/walletContext', () => ({
  useWalletProvider: mocks.useWalletProvider,
}));

vi.mock('@core/services/planOrchestrationService', () => ({
  getDepositPlan: mocks.getDepositPlan,
}));

vi.mock('@core/lib/wallet/executeDepositPlan', () => ({
  executeDepositPlanWithWallet: mocks.executeDepositPlanWithWallet,
  isEIP7702WalletRecoveryError: (error: unknown) =>
    error instanceof Error && error.name === 'EIP7702WalletRecoveryError',
}));

vi.mock('@core/services/intentClient', () => ({
  getPublicClient: mocks.getPublicClient,
}));

vi.mock('@core/lib/polling', () => ({
  pollUntil: mocks.pollUntil,
}));

const USER = '0x1111111111111111111111111111111111111111';
const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const MORPHO_VAULT = '0x7BfA7C4f149E7415b73bdeDfe609237e29CBF34A';

const request = {
  kind: 'invest',
  userAddress: USER,
  fromToken: BASE_USDC,
  fromAmount: '10000000',
  sourceChainId: 8453,
  split: { '8453': 1 },
} as never;

const plan = {
  legs: [
    {
      chainId: 8453,
      kind: 'supply',
      protocol: 'morpho',
      toToken: BASE_USDC,
      fromAmount: '10000000',
      toAmountMin: '10000000',
      gasUsd: '0.01',
      durationSec: 10,
    },
  ],
  approvals: [
    {
      to: BASE_USDC,
      data: '0x01',
      value: '0',
      chainId: 8453,
      meta: { intentType: 'APPROVAL' },
    },
  ],
  calls: [
    {
      to: MORPHO_VAULT,
      data: '0x02',
      value: '0',
      chainId: 8453,
      meta: { intentType: 'SUPPLY' },
    },
  ],
  totalGasUsd: '0.01',
  sourceChainId: 8453,
} as never;

describe('useSingleChainDepositWizard baseline stale coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useWalletProvider.mockReturnValue({
      account: { address: USER },
      chain: { id: 8453 },
      switchChain: mocks.switchChain,
      getWalletClient: mocks.getWalletClient,
    });
    mocks.getPublicClient.mockReturnValue({
      readContract: mocks.readContract,
      getBalance: mocks.getBalance,
    });
    mocks.getBalance.mockResolvedValue(1_000_000_000_000_000_000n);
    mocks.switchChain.mockResolvedValue(undefined);
  });

  it('drops baseline work superseded by reset before execution', async () => {
    mocks.getDepositPlan.mockResolvedValue(plan);

    let resolveBaseline!: (value: bigint) => void;
    const baselinePromise = new Promise<bigint>((resolve) => {
      resolveBaseline = resolve;
    });
    mocks.readContract
      .mockResolvedValueOnce(100_000_000n)
      .mockReturnValueOnce(baselinePromise);

    const { result } = renderHook(() => useSingleChainDepositWizard());
    await act(async () => {
      await result.current.start(request);
    });

    let advancePromise: Promise<void> | undefined;
    act(() => {
      advancePromise = result.current.advance();
    });
    await waitFor(() => expect(mocks.readContract).toHaveBeenCalledTimes(2));

    act(() => result.current.reset());
    await act(async () => {
      resolveBaseline(4n);
      await advancePromise;
    });

    expect(mocks.executeDepositPlanWithWallet).not.toHaveBeenCalled();
    expect(result.current.wizard).toMatchObject({ status: 'idle', steps: [] });
  });
});
