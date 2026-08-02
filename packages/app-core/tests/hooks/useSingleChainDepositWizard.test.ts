// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { useSingleChainDepositWizard } from '@core/hooks/useSingleChainDepositWizard';
import {
  type DepositPlan,
  NATIVE_TOKEN_ADDRESS,
  type PlanOrchestrationDepositRequest,
} from '@zapengine/types/api';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const USER = '0x1111111111111111111111111111111111111111';
const OTHER_USER = '0x2222222222222222222222222222222222222222';
const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const ARBITRUM_USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
const MORPHO_VAULT = '0x7BfA7C4f149E7415b73bdeDfe609237e29CBF34A';
const GMX_MARKET = '0x47c031236e19d024b42f8AE6780E44A573170703';

const mocks = vi.hoisted(() => ({
  useWalletProvider: vi.fn(),
  getDepositPlan: vi.fn(),
  executeDepositPlanWithWallet: vi.fn(),
  getPublicClient: vi.fn(),
  pollUntil: vi.fn(),
  switchChain: vi.fn(),
  getWalletClient: vi.fn(),
  executeAtomicBatch: vi.fn(),
  readContract: vi.fn(),
  getBalance: vi.fn(),
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

const baseRequest: Exclude<
  PlanOrchestrationDepositRequest,
  { kind: 'strategy' }
> = {
  kind: 'invest',
  userAddress: USER,
  fromToken: BASE_USDC,
  fromAmount: '10000000',
  sourceChainId: 8453,
  split: { '8453': 1 },
};

const gmxRequest: Exclude<
  PlanOrchestrationDepositRequest,
  { kind: 'strategy' }
> = {
  kind: 'gmx-v2',
  marketKey: 'btc-usdc',
  amount: '10000000',
  userAddress: USER,
};

const baseEthRequest = {
  ...baseRequest,
  fromToken: NATIVE_TOKEN_ADDRESS,
  fromAmount: '1000000000000000000',
};

const basePlan: DepositPlan = {
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
};

const gmxPlan: DepositPlan = {
  legs: [
    {
      chainId: 42161,
      kind: 'supply',
      protocol: 'gmx-v2',
      toToken: GMX_MARKET,
      fromAmount: '10000000',
      toAmountMin: '1',
      gasUsd: '0.02',
      durationSec: 60,
    },
  ],
  approvals: [
    {
      to: ARBITRUM_USDC,
      data: '0x03',
      value: '0',
      chainId: 42161,
      meta: { intentType: 'APPROVAL' },
    },
  ],
  calls: [
    {
      to: GMX_MARKET,
      data: '0x04',
      value: '1000000000000000',
      chainId: 42161,
      meta: {
        intentType: 'SUPPLY',
        route: { marketKey: 'btc-usdc' },
      },
    },
  ],
  totalGasUsd: '0.02',
  sourceChainId: 42161,
};

const baseEthPlan: DepositPlan = {
  ...basePlan,
  approvals: [],
  calls: [
    {
      ...basePlan.calls[0]!,
      value: baseEthRequest.fromAmount,
    },
  ],
};

describe('useSingleChainDepositWizard', () => {
  let wallet: {
    account: { address: string };
    chain: { id: number };
    switchChain: typeof mocks.switchChain;
    getWalletClient: typeof mocks.getWalletClient;
    executeAtomicBatch?: typeof mocks.executeAtomicBatch;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    wallet = {
      account: { address: USER },
      chain: { id: 8453 },
      switchChain: mocks.switchChain,
      getWalletClient: mocks.getWalletClient,
      executeAtomicBatch: mocks.executeAtomicBatch,
    };
    mocks.useWalletProvider.mockImplementation(() => wallet);
    mocks.getPublicClient.mockReturnValue({
      readContract: mocks.readContract,
      getBalance: mocks.getBalance,
    });
    mocks.switchChain.mockResolvedValue(undefined);
    mocks.getBalance.mockResolvedValue(1_000_000_000_000_000_000n);
    mocks.pollUntil.mockResolvedValue(2n);
    mocks.executeDepositPlanWithWallet.mockImplementation(
      async ({ onBundleSubmitted, onBundleConfirmed }) => {
        onBundleSubmitted?.('0xbundle');
        onBundleConfirmed?.(`0x${'a'.repeat(64)}`);
        return {
          kind: 'eip7702',
          callsId: '0xbundle',
          transactionHash: `0x${'a'.repeat(64)}`,
        };
      },
    );
  });

  it('passes both supported request branches through unchanged', async () => {
    mocks.getDepositPlan
      .mockResolvedValueOnce(basePlan)
      .mockResolvedValueOnce(gmxPlan);

    const baseHook = renderHook(() => useSingleChainDepositWizard());
    await act(async () => {
      await baseHook.result.current.start(baseRequest);
    });
    expect(mocks.getDepositPlan).toHaveBeenNthCalledWith(1, baseRequest);
    expect(baseHook.result.current.wizard.steps[2]).toMatchObject({
      kind: 'settlement',
      label: 'Verify Morpho Moonwell position',
      chainId: 8453,
    });
    baseHook.unmount();

    const gmxHook = renderHook(() => useSingleChainDepositWizard());
    await act(async () => {
      await gmxHook.result.current.start(gmxRequest);
    });
    expect(mocks.getDepositPlan).toHaveBeenNthCalledWith(2, gmxRequest);
    expect(gmxHook.result.current.wizard.steps[2]).toMatchObject({
      kind: 'settlement',
      label: 'Verify GMX BTC/USDC position',
      chainId: 42161,
    });
  });

  it('rejects execution when the connected account changed after planning', async () => {
    mocks.getDepositPlan.mockResolvedValue(basePlan);
    const { result } = renderHook(() => useSingleChainDepositWizard());
    await act(async () => {
      await result.current.start(baseRequest);
    });

    wallet.account.address = OTHER_USER;
    await act(async () => {
      await result.current.advance();
    });

    expect(mocks.getDepositPlan).toHaveBeenCalledTimes(1);
    expect(mocks.executeDepositPlanWithWallet).not.toHaveBeenCalled();
    expect(result.current.wizard.currentIndex).toBe(1);
    expect(result.current.wizard.steps[1]?.status).toBe('failed');
    expect(result.current.wizard.error).toContain('connected wallet changed');
  });

  it('refreshes, preflights, executes a Privy batch, and verifies settlement', async () => {
    mocks.getDepositPlan.mockResolvedValue(basePlan);
    mocks.readContract
      .mockResolvedValueOnce(100_000_000n)
      .mockResolvedValueOnce(4n);
    const { result } = renderHook(() => useSingleChainDepositWizard());

    await act(async () => {
      await result.current.start(baseRequest);
      await result.current.advance();
    });

    expect(mocks.getDepositPlan).toHaveBeenCalledTimes(2);
    expect(mocks.executeDepositPlanWithWallet).toHaveBeenCalledWith(
      expect.objectContaining({
        plan: basePlan,
        chainId: 8453,
        getWalletClient: mocks.getWalletClient,
        executeAtomicBatch: mocks.executeAtomicBatch,
      }),
    );
    expect(result.current.wizard.currentIndex).toBe(2);
    expect(result.current.wizard.steps[1]).toMatchObject({
      status: 'confirmed',
      callsId: '0xbundle',
      transactionHash: `0x${'a'.repeat(64)}`,
    });

    await act(async () => {
      await result.current.advance();
    });

    expect(mocks.pollUntil).toHaveBeenCalledWith(
      expect.objectContaining({
        intervalMs: 4_000,
        timeoutMs: 90_000,
      }),
    );
    expect(result.current.wizard.status).toBe('done');
    expect(result.current.wizard.steps[2]?.status).toBe('confirmed');
  });

  it('uses the generic EIP-7702 wallet path when atomic execution is absent', async () => {
    delete wallet.executeAtomicBatch;
    mocks.getDepositPlan.mockResolvedValue(gmxPlan);
    mocks.readContract
      .mockResolvedValueOnce(100_000_000n)
      .mockResolvedValueOnce(7n);
    const { result } = renderHook(() => useSingleChainDepositWizard());

    await act(async () => {
      await result.current.start(gmxRequest);
      await result.current.advance();
    });

    const executionInput =
      mocks.executeDepositPlanWithWallet.mock.calls[0]?.[0];
    expect(executionInput).toMatchObject({
      plan: gmxPlan,
      chainId: 42161,
      getWalletClient: mocks.getWalletClient,
    });
    expect(executionInput).not.toHaveProperty('executeAtomicBatch');
    expect(mocks.switchChain).toHaveBeenCalledWith(42161);

    await act(async () => {
      await result.current.advance();
    });
    expect(mocks.pollUntil).toHaveBeenCalledWith(
      expect.objectContaining({ timeoutMs: 5 * 60_000 }),
    );
  });

  it('marks wallet delegation failures for the recovery UI', async () => {
    delete wallet.executeAtomicBatch;
    mocks.getDepositPlan.mockResolvedValue(basePlan);
    mocks.readContract
      .mockResolvedValueOnce(100_000_000n)
      .mockResolvedValueOnce(4n);
    const recoveryError = new Error(
      'Reconnect with the wallet that originally enabled Smart Account features.',
    );
    recoveryError.name = 'EIP7702WalletRecoveryError';
    mocks.executeDepositPlanWithWallet.mockRejectedValueOnce(recoveryError);
    const { result } = renderHook(() => useSingleChainDepositWizard());

    await act(async () => {
      await result.current.start(baseRequest);
      await result.current.advance();
    });

    expect(result.current.wizard.recovery).toBe('wallet-delegation');
    expect(result.current.wizard.steps[1]?.status).toBe('failed');

    act(() => {
      result.current.retry();
    });
    expect(result.current.wizard.recovery).toBeNull();
  });

  it('only re-polls settlement after a submitted batch times out', async () => {
    mocks.getDepositPlan.mockResolvedValue(basePlan);
    mocks.readContract
      .mockResolvedValueOnce(100_000_000n)
      .mockResolvedValueOnce(4n);
    mocks.pollUntil
      .mockRejectedValueOnce(new Error('Polling timed out after 90000ms'))
      .mockResolvedValueOnce(5n);
    const { result } = renderHook(() => useSingleChainDepositWizard());

    await act(async () => {
      await result.current.start(baseRequest);
      await result.current.advance();
    });
    await act(async () => {
      await result.current.advance();
    });

    expect(result.current.wizard.currentIndex).toBe(2);
    expect(result.current.wizard.steps[2]?.status).toBe('failed');
    expect(result.current.wizard.error).toContain('Polling timed out');
    expect(mocks.executeDepositPlanWithWallet).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.retry();
    });
    await act(async () => {
      await result.current.advance();
    });

    expect(mocks.pollUntil).toHaveBeenCalledTimes(2);
    expect(mocks.executeDepositPlanWithWallet).toHaveBeenCalledTimes(1);
    expect(mocks.getDepositPlan).toHaveBeenCalledTimes(2);
    expect(result.current.wizard.status).toBe('done');
  });

  it('blocks a low funding balance before wallet submission', async () => {
    mocks.getDepositPlan.mockResolvedValue(basePlan);
    mocks.readContract.mockResolvedValue(9_999_999n);
    const { result } = renderHook(() => useSingleChainDepositWizard());

    await act(async () => {
      await result.current.start(baseRequest);
      await result.current.advance();
    });

    expect(mocks.executeDepositPlanWithWallet).not.toHaveBeenCalled();
    expect(result.current.wizard.steps[1]?.status).toBe('failed');
    expect(result.current.wizard.error).toContain('Funding balance too low');
  });

  it('blocks a low native gas balance before a GMX wallet submission', async () => {
    wallet.chain.id = 42161;
    mocks.getDepositPlan.mockResolvedValue(gmxPlan);
    mocks.readContract.mockResolvedValue(100_000_000n);
    mocks.getBalance.mockResolvedValue(1_000_000_000_000_000n);
    const { result } = renderHook(() => useSingleChainDepositWizard());

    await act(async () => {
      await result.current.start(gmxRequest);
      await result.current.advance();
    });

    expect(mocks.executeDepositPlanWithWallet).not.toHaveBeenCalled();
    expect(result.current.wizard.steps[1]?.status).toBe('failed');
    expect(result.current.wizard.error).toContain('ETH balance too low');
  });

  it('reserves gas in addition to the exact Base ETH funding amount', async () => {
    mocks.getDepositPlan.mockResolvedValue(baseEthPlan);
    mocks.getBalance.mockResolvedValue(1_000_499_999_999_999_999n);
    const { result } = renderHook(() => useSingleChainDepositWizard());

    await act(async () => {
      await result.current.start(baseEthRequest);
      await result.current.advance();
    });

    expect(mocks.readContract).not.toHaveBeenCalled();
    expect(mocks.executeDepositPlanWithWallet).not.toHaveBeenCalled();
    expect(result.current.wizard.error).toContain('Native balance too low');
  });

  it('only checks settlement after the executor reports a submitted failure', async () => {
    mocks.getDepositPlan.mockResolvedValue(basePlan);
    mocks.readContract
      .mockResolvedValueOnce(100_000_000n)
      .mockResolvedValueOnce(4n);
    mocks.executeDepositPlanWithWallet.mockImplementationOnce(
      async ({ onBundleSubmitted }) => {
        onBundleSubmitted?.('0xsubmitted');
        throw new Error('Batch failed on-chain');
      },
    );
    const { result } = renderHook(() => useSingleChainDepositWizard());

    await act(async () => {
      await result.current.start(baseRequest);
      await result.current.advance();
    });

    expect(result.current.wizard.currentIndex).toBe(2);
    expect(result.current.wizard.error).toContain(
      'retry will only check the position',
    );
    expect(mocks.executeDepositPlanWithWallet).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.retry();
    });
    await act(async () => {
      await result.current.advance();
    });

    expect(mocks.pollUntil).toHaveBeenCalledTimes(1);
    expect(mocks.executeDepositPlanWithWallet).toHaveBeenCalledTimes(1);
    expect(result.current.wizard.status).toBe('done');
  });
});
