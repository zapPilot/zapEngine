// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { useDepositWizard } from '@core/hooks/useDepositWizard';
import { PollTimeoutError } from '@core/lib/polling';
import { initialDepositWizardState } from '@core/lib/wallet/depositWizardMachine';
import type { DepositPlan } from '@zapengine/types/api';
import type { Hash } from 'viem';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const USER = '0x1111111111111111111111111111111111111111';
const OTHER_USER = '0x2222222222222222222222222222222222222222';
const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const HYPERCORE_USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
const HLP = '0xdfc24b077bc1425ad1dea75bcb6f8158e10df303';
const SOURCE_TX = '0xsource' as Hash;

const mocks = vi.hoisted(() => {
  // Mirrors the real class so `instanceof` still classifies the failure the
  // hook sees; the @nktkas/hyperliquid surface is irrelevant at this layer.
  class HyperliquidVaultDepositError extends Error {
    readonly ambiguous: boolean;

    constructor(
      message: string,
      options: { cause?: unknown; ambiguous: boolean },
    ) {
      super(message);
      this.name = 'HyperliquidVaultDepositError';
      this.ambiguous = options.ambiguous;
    }
  }

  return {
    HyperliquidVaultDepositError,
    useWalletProvider: vi.fn(),
    getDepositPlan: vi.fn(),
    executeDepositPlan: vi.fn(),
    executeAtomicBatch: vi.fn(),
    getWalletClient: vi.fn(),
    switchChain: vi.fn(),
    waitForBridgeCompletion: vi.fn(),
    getPerpUsdcBalance: vi.fn(),
    getVaultEquity: vi.fn(),
    submitVaultDeposit: vi.fn(),
    waitForPerpUsdcArrival: vi.fn(),
    waitForVaultEquityIncrease: vi.fn(),
    // vi.hoisted runs before the module consts, so the funding address is
    // spelled out here; `USER` below must stay in sync.
    walletClient: {
      account: { address: '0x1111111111111111111111111111111111111111' },
      signTypedData: vi.fn(),
    },
  };
});

vi.mock('@core/providers/walletContext', () => ({
  useWalletProvider: mocks.useWalletProvider,
}));

vi.mock('@core/services/planOrchestrationService', () => ({
  getDepositPlan: mocks.getDepositPlan,
}));

vi.mock('@core/lib/wallet/executeDepositPlan', () => ({
  executeDepositPlanWithWallet: mocks.executeDepositPlan,
}));

vi.mock('@core/services/intentClient', () => ({
  waitForBridgeCompletion: mocks.waitForBridgeCompletion,
}));

vi.mock('@core/services/hyperliquidService', () => ({
  HyperliquidVaultDepositError: mocks.HyperliquidVaultDepositError,
  getPerpUsdcBalance: mocks.getPerpUsdcBalance,
  getVaultEquity: mocks.getVaultEquity,
  submitVaultDeposit: mocks.submitVaultDeposit,
  waitForPerpUsdcArrival: mocks.waitForPerpUsdcArrival,
  waitForVaultEquityIncrease: mocks.waitForVaultEquityIncrease,
}));

vi.mock('@core/utils/logger', () => ({
  logger: {
    createContextLogger: () => ({ info: vi.fn(), error: vi.fn() }),
  },
}));

const plan: DepositPlan = {
  legs: [
    {
      chainId: 8453,
      kind: 'supply',
      protocol: 'morpho',
      toToken: BASE_USDC,
      fromAmount: '70000000',
      toAmountMin: '70000000',
      gasUsd: '0.1',
      durationSec: 12,
    },
    {
      chainId: 1337,
      kind: 'bridge',
      protocol: 'hyperliquid',
      toToken: HYPERCORE_USDC,
      fromAmount: '30000000',
      toAmountMin: '29000000',
      bridge: 'relaydepository',
      gasUsd: '0.01',
      durationSec: 2,
    },
  ],
  approvals: [],
  calls: [
    {
      to: BASE_USDC,
      data: '0x11',
      value: '0',
      chainId: 8453,
      meta: { intentType: 'SUPPLY' },
    },
    {
      to: BASE_USDC,
      data: '0x22',
      value: '0',
      chainId: 8453,
      meta: { intentType: 'BRIDGE' },
    },
  ],
  followUps: [
    {
      kind: 'hyperliquid-vault-deposit',
      chainId: 1337,
      afterLegIndex: 1,
      amount: { source: 'bridge-output', legIndex: 1 },
      expectedUsd: '29000000',
      minDepositUsd: '10000000',
      action: { type: 'vaultTransfer', vaultAddress: HLP, isDeposit: true },
      signing: {
        scheme: 'hyperliquid-l1-action',
        hyperliquidChain: 'Mainnet',
        apiUrl: 'https://api.hyperliquid.xyz',
      },
      lockupDays: 4,
    },
  ],
  totalGasUsd: '0.11',
  sourceChainId: 8453,
};

describe('useDepositWizard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useWalletProvider.mockReturnValue({
      account: { address: USER },
      chain: { id: 8453 },
      executeAtomicBatch: mocks.executeAtomicBatch,
      getWalletClient: mocks.getWalletClient,
      switchChain: mocks.switchChain,
    });
    mocks.getWalletClient.mockResolvedValue(mocks.walletClient);
    mocks.switchChain.mockResolvedValue(undefined);
    mocks.getDepositPlan.mockResolvedValue(plan);
    mocks.getPerpUsdcBalance.mockResolvedValue({
      withdrawableUsd6: 1_000_000n,
      accountValueUsd6: 1_000_000n,
    });
    mocks.waitForBridgeCompletion.mockResolvedValue({
      status: 'DONE',
      receiving: { txHash: '0xdest' },
    });
    mocks.waitForPerpUsdcArrival.mockResolvedValue({
      arrivedUsd6: 29_500_000n,
    });
    mocks.submitVaultDeposit.mockResolvedValue(undefined);
    mocks.getVaultEquity.mockResolvedValue(null);
    mocks.waitForVaultEquityIncrease.mockResolvedValue({
      equityUsd6: 29_400_000n,
    });
  });

  function renderWizard() {
    return renderHook(() => useDepositWizard());
  }

  /** Resume a reviewed plan and wait until the HLP deposit CTA is armed. */
  async function resumeUntilArrived(sourceTxHash: Hash = SOURCE_TX) {
    const rendered = renderWizard();
    await act(async () => {
      await rendered.result.current.resumeReviewedPlan({
        plan,
        baselineUsd6: 1_000_000n,
        sourceTxHash,
      });
    });
    await waitFor(() => {
      expect(rendered.result.current.wizard.hlp.status).toBe('arrived');
    });
    return rendered;
  }

  it('tracks a reviewed plan without ever touching the source executor', async () => {
    const { result } = await resumeUntilArrived();

    // The reviewed batch was already submitted once — nothing here may replan
    // it, re-sign it, or switch the wallet's chain.
    expect(mocks.getDepositPlan).not.toHaveBeenCalled();
    expect(mocks.executeDepositPlan).not.toHaveBeenCalled();
    expect(mocks.executeAtomicBatch).not.toHaveBeenCalled();
    expect(mocks.switchChain).not.toHaveBeenCalled();
    // The baseline arrives from the caller, taken before the batch went out.
    expect(mocks.getPerpUsdcBalance).not.toHaveBeenCalled();

    expect(mocks.waitForBridgeCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        txHash: SOURCE_TX,
        fromChain: 8453,
        toChain: 1337,
      }),
    );
    expect(mocks.waitForPerpUsdcArrival).toHaveBeenCalledWith(
      expect.objectContaining({
        user: USER,
        baselineUsd6: 1_000_000n,
        expectedUsd6: 29_000_000n,
      }),
    );

    expect(result.current.wizard.stage).toBe('hyperliquidDeposit');
    expect(result.current.wizard.hlp.status).toBe('arrived');
    expect(result.current.wizard.hlp.arrivedUsd6).toBe(29_500_000n);
    expect(result.current.wizard.legs[1]?.sourceTxHash).toBe(SOURCE_TX);
    expect(result.current.wizard.legs[1]?.destinationTxHash).toBe('0xdest');
  });

  it('stops the resume chain when the bridge leg fails', async () => {
    mocks.waitForBridgeCompletion.mockRejectedValue(
      new Error('Bridge transfer FAILED'),
    );

    const { result } = renderWizard();
    await act(async () => {
      await result.current.resumeReviewedPlan({
        plan,
        baselineUsd6: 1_000_000n,
        sourceTxHash: SOURCE_TX,
      });
    });

    expect(mocks.waitForPerpUsdcArrival).not.toHaveBeenCalled();
    expect(result.current.wizard.legs[1]?.status).toBe('failed');
    expect(result.current.wizard.error?.stage).toBe('bridging');
    expect(result.current.wizard.hlp.status).toBe('idle');
  });

  it('aborts the first resume when a second one supersedes it', async () => {
    let firstSignal: AbortSignal | undefined;
    mocks.waitForBridgeCompletion.mockImplementationOnce(
      ({ signal }: { signal: AbortSignal }) => {
        firstSignal = signal;
        return new Promise(() => undefined);
      },
    );

    const { result } = renderWizard();
    act(() => {
      void result.current.resumeReviewedPlan({
        plan,
        baselineUsd6: 1_000_000n,
        sourceTxHash: SOURCE_TX,
      });
    });
    await waitFor(() => {
      expect(firstSignal).toBeDefined();
    });

    await act(async () => {
      await result.current.resumeReviewedPlan({
        plan,
        baselineUsd6: 1_000_000n,
        sourceTxHash: '0xsecond' as Hash,
      });
    });

    expect(firstSignal?.aborted).toBe(true);
    expect(
      mocks.waitForBridgeCompletion.mock.calls.map(
        ([args]: [{ txHash: Hash }]) => args.txHash,
      ),
    ).toEqual([SOURCE_TX, '0xsecond']);
    expect(mocks.waitForPerpUsdcArrival).toHaveBeenCalledTimes(1);
  });

  it('lets no bridge result from a reset run reach the state', async () => {
    let settleBridge = () => undefined as void;
    mocks.waitForBridgeCompletion.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          settleBridge = () =>
            resolve({ status: 'DONE', receiving: { txHash: '0xdest' } });
        }),
    );

    const { result } = renderWizard();
    let resumed: Promise<void> = Promise.resolve();
    act(() => {
      resumed = result.current.resumeReviewedPlan({
        plan,
        baselineUsd6: 1_000_000n,
        sourceTxHash: SOURCE_TX,
      });
    });

    act(() => {
      result.current.reset();
    });

    await act(async () => {
      settleBridge();
      await resumed;
    });

    // An empty legs array would otherwise read as "every bridge terminal".
    expect(result.current.wizard).toEqual(initialDepositWizardState);
    expect(mocks.waitForPerpUsdcArrival).not.toHaveBeenCalled();
  });

  it('submits the measured delta and confirms via vault equity', async () => {
    mocks.getVaultEquity.mockResolvedValue({ equityUsd6: 1_000_000n });

    const { result } = await resumeUntilArrived();
    await act(async () => {
      await result.current.runHlpDeposit();
    });

    // Signature-only path: wallet client fetched without a chain switch.
    expect(mocks.getWalletClient).toHaveBeenCalledWith();
    expect(mocks.submitVaultDeposit).toHaveBeenCalledWith({
      walletClient: mocks.walletClient,
      vaultAddress: HLP,
      usd6: 29_500_000n,
      isTestnet: false,
      apiUrl: 'https://api.hyperliquid.xyz',
    });
    expect(mocks.waitForVaultEquityIncrease).toHaveBeenCalledWith(
      expect.objectContaining({
        user: USER,
        vaultAddress: HLP,
        equityBeforeUsd6: 1_000_000n,
        apiUrl: 'https://api.hyperliquid.xyz',
      }),
    );
    expect(result.current.wizard.stage).toBe('done');
    expect(result.current.wizard.hlp.status).toBe('deposited');
    expect(result.current.wizard.hlp.vaultEquityUsd6).toBe(29_400_000n);
  });

  it('caps the vaultTransfer at what the bridge could have delivered', async () => {
    mocks.waitForPerpUsdcArrival.mockResolvedValue({
      arrivedUsd6: 41_000_000n,
    });

    const { result } = await resumeUntilArrived();
    await act(async () => {
      await result.current.runHlpDeposit();
    });

    // 29 USDC quoted output plus its slippage tolerance; the rest of the
    // delta is unrelated HyperCore activity.
    expect(mocks.submitVaultDeposit).toHaveBeenCalledWith(
      expect.objectContaining({ usd6: 29_580_000n }),
    );
  });

  it('rejects a reviewed plan that carries no HLP follow-up', async () => {
    const noHlpPlan: DepositPlan = { ...plan };
    delete (noHlpPlan as { followUps?: unknown }).followUps;

    const { result } = renderWizard();
    await expect(
      result.current.resumeReviewedPlan({
        plan: noHlpPlan,
        baselineUsd6: 1_000_000n,
        sourceTxHash: SOURCE_TX,
      }),
    ).rejects.toThrow('no HLP follow-up');

    expect(mocks.waitForBridgeCompletion).not.toHaveBeenCalled();
    expect(result.current.wizard).toEqual(initialDepositWizardState);
  });

  it('lets no arrival from a reset run reach the state', async () => {
    let settleArrival = () => undefined as void;
    mocks.waitForPerpUsdcArrival.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          settleArrival = () => resolve({ arrivedUsd6: 29_500_000n });
        }),
    );

    const { result } = renderWizard();
    let resumed: Promise<void> = Promise.resolve();
    act(() => {
      resumed = result.current.resumeReviewedPlan({
        plan,
        baselineUsd6: 1_000_000n,
        sourceTxHash: SOURCE_TX,
      });
    });
    await waitFor(() => {
      expect(result.current.wizard.hlp.status).toBe('awaitingArrival');
    });

    act(() => {
      result.current.reset();
    });

    await act(async () => {
      settleArrival();
      await resumed;
    });

    // Nothing downstream would ever clear a foreign delta again.
    expect(result.current.wizard).toEqual(initialDepositWizardState);
  });

  it('validates a resume before it can abort a healthy run', async () => {
    let firstSignal: AbortSignal | undefined;
    mocks.waitForBridgeCompletion.mockImplementationOnce(
      ({ signal }: { signal: AbortSignal }) => {
        firstSignal = signal;
        return new Promise(() => undefined);
      },
    );
    const noHlpPlan: DepositPlan = { ...plan };
    delete (noHlpPlan as { followUps?: unknown }).followUps;

    const { result } = renderWizard();
    act(() => {
      void result.current.resumeReviewedPlan({
        plan,
        baselineUsd6: 1_000_000n,
        sourceTxHash: SOURCE_TX,
      });
    });
    await waitFor(() => {
      expect(result.current.wizard.stage).toBe('bridging');
    });

    await expect(
      result.current.resumeReviewedPlan({
        plan: noHlpPlan,
        baselineUsd6: 1_000_000n,
        sourceTxHash: '0xsecond' as Hash,
      }),
    ).rejects.toThrow('no HLP follow-up');

    // An unusable input must not kill the run in flight and freeze its
    // half-finished progress on screen.
    expect(firstSignal?.aborted).toBe(false);
    expect(result.current.wizard.stage).toBe('bridging');
    expect(result.current.wizard.legs[1]?.status).toBe('bridgePending');
  });

  it('never signs for an account the wallet switched to mid-flight', async () => {
    mocks.getWalletClient.mockResolvedValue({
      account: { address: OTHER_USER },
      signTypedData: vi.fn(),
    });

    const { result } = await resumeUntilArrived();
    await act(async () => {
      await result.current.runHlpDeposit();
    });

    // The delta belongs to the funding account, so nothing may be signed.
    expect(mocks.submitVaultDeposit).not.toHaveBeenCalled();
    expect(result.current.wizard.hlp.status).toBe('arrived');
    expect(result.current.wizard.error?.stage).toBe('hyperliquidDeposit');
  });

  it('does not submit when the run is dropped during the equity read', async () => {
    let settleEquity = () => undefined as void;
    mocks.getVaultEquity.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          settleEquity = () => resolve({ equityUsd6: 1_000_000n });
        }),
    );

    const { result } = await resumeUntilArrived();
    const submission = result.current.runHlpDeposit();
    await waitFor(() => {
      expect(result.current.wizard.hlp.status).toBe('confirming');
    });

    act(() => {
      result.current.reset();
    });

    await act(async () => {
      settleEquity();
      await submission;
    });

    // Nothing was signed yet, so an abandoned run must move no funds.
    expect(mocks.submitVaultDeposit).not.toHaveBeenCalled();
    expect(result.current.wizard).toEqual(initialDepositWizardState);
  });

  it('keeps submitted-but-unverified terminal for further submissions', async () => {
    mocks.waitForVaultEquityIncrease.mockRejectedValueOnce(
      new PollTimeoutError('Polling timed out after 120000ms'),
    );

    const { result } = await resumeUntilArrived();
    await act(async () => {
      await result.current.runHlpDeposit();
    });

    expect(result.current.wizard.stage).toBe('done');
    expect(result.current.wizard.hlp.status).toBe('submittedUnverified');
    // The transfer was accepted — never report it as a failed stage.
    expect(result.current.wizard.error).toBeNull();

    act(() => {
      result.current.retry();
    });
    await expect(result.current.runHlpDeposit()).rejects.toThrow(
      'not ready yet',
    );
    expect(mocks.submitVaultDeposit).toHaveBeenCalledTimes(1);
  });

  it('refuses to sign once the connected wallet changed', async () => {
    const { result, rerender } = await resumeUntilArrived();

    mocks.useWalletProvider.mockReturnValue({
      account: { address: OTHER_USER },
      chain: { id: 8453 },
      executeAtomicBatch: mocks.executeAtomicBatch,
      getWalletClient: mocks.getWalletClient,
      switchChain: mocks.switchChain,
    });
    rerender();

    await expect(result.current.runHlpDeposit()).rejects.toThrow(
      'connected wallet changed',
    );
    expect(mocks.submitVaultDeposit).not.toHaveBeenCalled();
  });

  it('waits for equity instead of re-arming after an ambiguous failure', async () => {
    mocks.getVaultEquity.mockResolvedValue({ equityUsd6: 1_000_000n });
    mocks.submitVaultDeposit.mockRejectedValueOnce(
      new mocks.HyperliquidVaultDepositError(
        'Hyperliquid vault deposit failed: request timed out',
        { ambiguous: true },
      ),
    );

    const { result } = await resumeUntilArrived();
    await act(async () => {
      await result.current.runHlpDeposit();
    });

    // The signed action may already be live, so equity is the only proof.
    expect(mocks.submitVaultDeposit).toHaveBeenCalledTimes(1);
    expect(mocks.waitForVaultEquityIncrease).toHaveBeenCalledTimes(1);
    expect(result.current.wizard.stage).toBe('done');
    expect(result.current.wizard.hlp.status).toBe('deposited');
    expect(result.current.wizard.error).toBeNull();
  });

  it('re-arms the deposit CTA when the exchange rejected the transfer', async () => {
    mocks.submitVaultDeposit.mockRejectedValueOnce(
      new mocks.HyperliquidVaultDepositError(
        'Hyperliquid vault deposit failed: Insufficient balance',
        { ambiguous: false },
      ),
    );

    const { result } = await resumeUntilArrived();
    await act(async () => {
      await result.current.runHlpDeposit();
    });

    // Nothing moved, so the perp USDC is still the user's to deposit.
    expect(result.current.wizard.hlp.status).toBe('arrived');
    expect(result.current.wizard.hlp.arrivedUsd6).toBe(29_500_000n);
    expect(result.current.wizard.error?.stage).toBe('hyperliquidDeposit');
    expect(mocks.waitForVaultEquityIncrease).not.toHaveBeenCalled();
  });

  it('lets no HLP outcome from a reset submission reach the state', async () => {
    let releaseSubmit = () => undefined as void;
    mocks.submitVaultDeposit.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          releaseSubmit = () => resolve();
        }),
    );

    const { result } = await resumeUntilArrived();

    const submission = result.current.runHlpDeposit();
    await waitFor(() => {
      expect(result.current.wizard.hlp.status).toBe('confirming');
    });

    act(() => {
      result.current.reset();
    });

    await act(async () => {
      releaseSubmit();
      await submission;
    });

    expect(result.current.wizard).toEqual(initialDepositWizardState);
    expect(mocks.waitForVaultEquityIncrease).not.toHaveBeenCalled();
  });
});
