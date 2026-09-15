// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { useDepositWizard } from '@core/hooks/useDepositWizard';
import { PollTimeoutError } from '@core/lib/polling';
import { initialDepositWizardState } from '@core/lib/wallet/depositWizardMachine';
import {
  type DepositPlan,
  type HlpSpotDepositPlan,
  HYPERLIQUID_BRIDGE2_BRIDGE_ID,
} from '@zapengine/types/api';
import type { Address, Hash } from 'viem';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const USER = '0x1111111111111111111111111111111111111111' as Address;
const OTHER_USER = '0x2222222222222222222222222222222222222222' as Address;
const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const HYPERCORE_USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
const HLP = '0xdfc24b077bc1425ad1dea75bcb6f8158e10df303';
const SOURCE_TX = '0xsource' as Hash;

const mocks = vi.hoisted(() => {
  // Mirrors the real class so `instanceof` still classifies the failure the
  // hook sees; the @nktkas/hyperliquid surface is irrelevant at this layer.
  class HyperliquidVaultDepositError extends Error {
    readonly ambiguous: boolean;
    constructor(message: string, options: { ambiguous: boolean }) {
      super(message);
      this.name = 'HyperliquidVaultDepositError';
      this.ambiguous = options.ambiguous;
    }
  }
  return {
    HyperliquidVaultDepositError,
    useWalletProvider: vi.fn(),
    waitForBridgeCompletion: vi.fn(),
    getHyperCoreSpendableUsdc: vi.fn(),
    getVaultEquity: vi.fn(),
    submitVaultDeposit: vi.fn(),
    waitForHyperCoreUsdcArrival: vi.fn(),
    waitForVaultEquityIncrease: vi.fn(),
    getSigner: vi.fn(),
    signer: { address: '0x3333333333333333333333333333333333333333' },
  };
});

vi.mock('@core/providers/walletContext', () => ({
  useWalletProvider: mocks.useWalletProvider,
}));

vi.mock('@core/services/intentClient', () => ({
  waitForBridgeCompletion: mocks.waitForBridgeCompletion,
}));

vi.mock('@core/services/hyperliquidService', () => ({
  HyperliquidVaultDepositError: mocks.HyperliquidVaultDepositError,
  getHyperCoreSpendableUsdc: mocks.getHyperCoreSpendableUsdc,
  getVaultEquity: mocks.getVaultEquity,
  submitVaultDeposit: mocks.submitVaultDeposit,
  waitForHyperCoreUsdcArrival: mocks.waitForHyperCoreUsdcArrival,
  waitForVaultEquityIncrease: mocks.waitForVaultEquityIncrease,
}));

vi.mock('@core/utils/logger', () => ({
  logger: {
    createContextLogger: () => ({ error: vi.fn(), info: vi.fn() }),
  },
}));

const signing = {
  scheme: 'hyperliquid-l1-action' as const,
  hyperliquidChain: 'Mainnet' as const,
  apiUrl: 'https://api.hyperliquid.xyz',
};

const bridgePlan: DepositPlan = {
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
      signing,
      lockupDays: 4,
    },
  ],
  totalGasUsd: '0.11',
  sourceChainId: 8453,
};

/** Arbitrum USDC funding HyperCore through the Bridge2 escrow — no LI.FI route. */
const bridge2Plan: DepositPlan = {
  legs: [
    {
      chainId: 1337,
      kind: 'bridge',
      protocol: 'hyperliquid',
      toToken: HYPERCORE_USDC,
      fromAmount: '20000000',
      toAmountMin: '20000000',
      bridge: HYPERLIQUID_BRIDGE2_BRIDGE_ID,
      gasUsd: '0',
      durationSec: 60,
    },
  ],
  approvals: [],
  calls: [
    {
      to: HYPERCORE_USDC,
      data: '0x33',
      value: '0',
      chainId: 42161,
      meta: { intentType: 'BRIDGE' },
    },
  ],
  followUps: [
    {
      kind: 'hyperliquid-vault-deposit',
      chainId: 1337,
      afterLegIndex: 0,
      amount: { source: 'bridge-output', legIndex: 0 },
      expectedUsd: '20000000',
      minDepositUsd: '10000000',
      action: { type: 'vaultTransfer', vaultAddress: HLP, isDeposit: true },
      signing,
      lockupDays: 4,
    },
  ],
  totalGasUsd: '0',
  sourceChainId: 42161,
};

const spotPlan: HlpSpotDepositPlan = {
  kind: 'hlp-spot-deposit',
  execution: 'hypercore-signatures',
  amountUsd6: '10000000',
  minDepositUsd: '10000000',
  lockupDays: 4,
  step: {
    kind: 'hyperliquid-vault-deposit',
    chainId: 1337,
    amount: { source: 'fixed', amount: '10000000' },
    minDepositUsd: '10000000',
    action: { type: 'vaultTransfer', vaultAddress: HLP, isDeposit: true },
    signing,
    lockupDays: 4,
  },
};

function readyAgent(masterAddress: Address = USER) {
  return { isReady: true, masterAddress, getSigner: mocks.getSigner };
}

function renderWizard(agent = readyAgent()) {
  return renderHook(() => useDepositWizard({ hyperliquidAgent: agent }));
}

/** Resume a reviewed plan and wait until the HLP deposit CTA is armed. */
async function resumeUntilArrived(sourceTxHash: Hash = SOURCE_TX) {
  const rendered = renderWizard();
  await act(async () => {
    await rendered.result.current.resumeReviewedPlan({
      plan: bridgePlan,
      baselineUsd6: 1_000_000n,
      sourceTxHash,
    });
  });
  await waitFor(() => {
    expect(rendered.result.current.wizard.hlp.status).toBe('arrived');
  });
  return rendered;
}

describe('useDepositWizard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useWalletProvider.mockReturnValue({ account: { address: USER } });
    mocks.waitForBridgeCompletion.mockResolvedValue({
      status: 'DONE',
      receiving: { txHash: '0xdest' },
    });
    mocks.waitForHyperCoreUsdcArrival.mockResolvedValue({
      arrivedUsd6: 29_500_000n,
      mode: 'unified',
    });
    mocks.getHyperCoreSpendableUsdc.mockResolvedValue({
      mode: 'unified',
      rawAbstraction: 'unifiedAccount',
      spendableUsd6: 20_000_000n,
      spot: { totalUsd6: 20_000_000n, holdUsd6: 0n },
      perp: { withdrawableUsd6: 0n, accountValueUsd6: 0n },
    });
    mocks.getSigner.mockResolvedValue(mocks.signer);
    mocks.submitVaultDeposit.mockResolvedValue(undefined);
    mocks.getVaultEquity.mockResolvedValue(null);
    mocks.waitForVaultEquityIncrease.mockResolvedValue({
      equityUsd6: 29_400_000n,
    });
  });

  it('requires a connected wallet before starting either deposit flow', async () => {
    mocks.useWalletProvider.mockReturnValue({ account: undefined });
    const { result } = renderWizard();

    await expect(
      result.current.resumeReviewedPlan({
        plan: bridgePlan,
        baselineUsd6: 1_000_000n,
        sourceTxHash: SOURCE_TX,
      }),
    ).rejects.toThrow('Connect wallet first');
    await expect(result.current.startSpotDeposit(spotPlan)).rejects.toThrow(
      'Connect wallet first',
    );
  });

  it('rejects a bridge-funded HLP step without an expected amount', async () => {
    const missingExpected: DepositPlan = {
      ...bridgePlan,
      followUps: bridgePlan.followUps?.map((step) => ({ ...step })),
    };
    delete (missingExpected.followUps?.[0] as { expectedUsd?: string })
      .expectedUsd;
    const { result } = renderWizard();

    await expect(
      result.current.resumeReviewedPlan({
        plan: missingExpected,
        baselineUsd6: 1_000_000n,
        sourceTxHash: SOURCE_TX,
      }),
    ).rejects.toThrow('missing its expected amount');
  });

  it('accepts a bridge completion without a destination transaction hash', async () => {
    mocks.waitForBridgeCompletion.mockResolvedValueOnce({ status: 'DONE' });
    const { result } = await resumeUntilArrived();

    expect(result.current.wizard.legs[1]?.status).toBe('destinationConfirmed');
    expect(result.current.wizard.legs[1]?.destinationTxHash).toBeUndefined();
  });

  it('treats an aborted bridge poll as cancellation rather than failure', async () => {
    mocks.waitForBridgeCompletion.mockRejectedValueOnce(
      new DOMException('Polling aborted', 'AbortError'),
    );
    const { result } = renderWizard();

    await act(async () => {
      await result.current.resumeReviewedPlan({
        plan: bridgePlan,
        baselineUsd6: 1_000_000n,
        sourceTxHash: SOURCE_TX,
      });
    });

    expect(mocks.waitForHyperCoreUsdcArrival).not.toHaveBeenCalled();
    expect(result.current.wizard.error).toBeNull();
  });

  it('polls LI.FI for a routed HyperCore leg without resubmitting it', async () => {
    const { result } = await resumeUntilArrived();

    expect(mocks.waitForBridgeCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        txHash: SOURCE_TX,
        fromChain: 8453,
        toChain: 1337,
      }),
    );
    // The baseline arrives from the caller, taken before the batch went out;
    // re-reading it here would measure against a post-bridge balance.
    expect(mocks.getHyperCoreSpendableUsdc).not.toHaveBeenCalled();
    expect(mocks.waitForHyperCoreUsdcArrival).toHaveBeenCalledWith(
      expect.objectContaining({
        user: USER,
        baselineUsd6: 1_000_000n,
        expectedUsd6: 29_000_000n,
      }),
    );

    expect(result.current.wizard.stage).toBe('hyperliquidDeposit');
    expect(result.current.wizard.hlp.arrivedUsd6).toBe(29_500_000n);
    expect(result.current.wizard.legs[1]?.sourceTxHash).toBe(SOURCE_TX);
    expect(result.current.wizard.legs[1]?.destinationTxHash).toBe('0xdest');
  });

  it('confirms a Bridge2 leg without polling LI.FI and waits for HyperCore arrival', async () => {
    mocks.waitForHyperCoreUsdcArrival.mockResolvedValue(20_100_000n);
    const { result } = renderWizard();
    await act(async () => {
      await result.current.resumeReviewedPlan({
        plan: bridge2Plan,
        baselineUsd6: 1_000_000n,
        sourceTxHash: SOURCE_TX,
      });
    });
    await waitFor(() => {
      expect(result.current.wizard.hlp.status).toBe('arrived');
    });

    expect(mocks.waitForBridgeCompletion).not.toHaveBeenCalled();
    expect(result.current.wizard.legs[0]?.status).toBe('destinationConfirmed');
    expect(mocks.waitForHyperCoreUsdcArrival).toHaveBeenCalledWith(
      expect.objectContaining({
        user: USER,
        baselineUsd6: 1_000_000n,
        expectedUsd6: 20_000_000n,
      }),
    );
  });

  it('stops the resume chain when the bridge leg fails', async () => {
    mocks.waitForBridgeCompletion.mockRejectedValue(new Error('bridge failed'));
    const { result } = renderWizard();
    await act(async () => {
      await result.current.resumeReviewedPlan({
        plan: bridgePlan,
        baselineUsd6: 1_000_000n,
        sourceTxHash: SOURCE_TX,
      });
    });

    expect(mocks.waitForHyperCoreUsdcArrival).not.toHaveBeenCalled();
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
        plan: bridgePlan,
        baselineUsd6: 1_000_000n,
        sourceTxHash: SOURCE_TX,
      });
    });
    await waitFor(() => {
      expect(firstSignal).toBeDefined();
    });

    await act(async () => {
      await result.current.resumeReviewedPlan({
        plan: bridgePlan,
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
    expect(mocks.waitForHyperCoreUsdcArrival).toHaveBeenCalledTimes(1);
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
        plan: bridgePlan,
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
    expect(mocks.waitForHyperCoreUsdcArrival).not.toHaveBeenCalled();
  });

  it('lets no arrival from a reset run reach the state', async () => {
    let settleArrival = () => undefined as void;
    mocks.waitForHyperCoreUsdcArrival.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          settleArrival = () =>
            resolve({ arrivedUsd6: 29_500_000n, mode: 'unified' });
        }),
    );

    const { result } = renderWizard();
    let resumed: Promise<void> = Promise.resolve();
    act(() => {
      resumed = result.current.resumeReviewedPlan({
        plan: bridgePlan,
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

  it('rejects a reviewed plan that carries no HLP follow-up', async () => {
    const noHlpPlan: DepositPlan = { ...bridgePlan };
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

  it('validates a resume before it can abort a healthy run', async () => {
    let firstSignal: AbortSignal | undefined;
    mocks.waitForBridgeCompletion.mockImplementationOnce(
      ({ signal }: { signal: AbortSignal }) => {
        firstSignal = signal;
        return new Promise(() => undefined);
      },
    );
    const noHlpPlan: DepositPlan = { ...bridgePlan };
    delete (noHlpPlan as { followUps?: unknown }).followUps;

    const { result } = renderWizard();
    act(() => {
      void result.current.resumeReviewedPlan({
        plan: bridgePlan,
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

  it('arms a direct deposit from the account-mode-aware spendable balance', async () => {
    const { result } = renderWizard();
    await act(async () => {
      await result.current.startSpotDeposit(spotPlan);
    });

    expect(mocks.getHyperCoreSpendableUsdc).toHaveBeenCalledWith(
      expect.objectContaining({ user: USER, apiUrl: signing.apiUrl }),
    );
    expect(result.current.wizard.hlp.status).toBe('arrived');
    expect(result.current.wizard.error).toBeNull();
  });

  it('never signs a direct deposit that exceeds spendable USDC', async () => {
    mocks.getHyperCoreSpendableUsdc.mockResolvedValue({
      mode: 'standard',
      rawAbstraction: 'disabled',
      spendableUsd6: 7_000_000n,
      spot: { totalUsd6: 20_000_000n, holdUsd6: 0n },
      perp: { withdrawableUsd6: 7_000_000n, accountValueUsd6: 7_000_000n },
    });
    const { result } = renderWizard();
    await act(async () => {
      await result.current.startSpotDeposit(spotPlan);
    });

    expect(result.current.wizard.error?.message).toContain('short by 3000000');
    // Fail closed in the hook, not only in the screen that renders the error.
    await expect(result.current.runHlpDeposit()).rejects.toThrow(
      'not ready yet',
    );
    expect(mocks.getSigner).not.toHaveBeenCalled();
    expect(mocks.submitVaultDeposit).not.toHaveBeenCalled();
  });

  it('drops a spot balance result that arrives after reset', async () => {
    let resolveBalance:
      | ((
          value: Awaited<ReturnType<typeof mocks.getHyperCoreSpendableUsdc>>,
        ) => void)
      | undefined;
    mocks.getHyperCoreSpendableUsdc.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveBalance = resolve;
      }),
    );
    const { result } = renderWizard();

    let startPromise: Promise<void> | undefined;
    act(() => {
      startPromise = result.current.startSpotDeposit(spotPlan);
    });
    await waitFor(() =>
      expect(mocks.getHyperCoreSpendableUsdc).toHaveBeenCalledOnce(),
    );
    act(() => result.current.reset());
    resolveBalance?.({
      mode: 'unified',
      rawAbstraction: 'unifiedAccount',
      spendableUsd6: 20_000_000n,
      spot: { totalUsd6: 20_000_000n, holdUsd6: 0n },
      perp: { withdrawableUsd6: 0n, accountValueUsd6: 0n },
    });
    await act(async () => {
      await startPromise;
    });

    expect(result.current.wizard).toEqual(initialDepositWizardState);
  });

  it('drops a submission when reset happens while obtaining the agent signer', async () => {
    let resolveSigner: ((value: typeof mocks.signer) => void) | undefined;
    mocks.getSigner.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSigner = resolve;
      }),
    );
    const { result } = await resumeUntilArrived();

    let submission: Promise<void> | undefined;
    act(() => {
      submission = result.current.runHlpDeposit();
    });
    await waitFor(() => expect(mocks.getSigner).toHaveBeenCalledOnce());
    act(() => result.current.reset());
    resolveSigner?.(mocks.signer);
    await act(async () => {
      await submission;
    });

    expect(mocks.submitVaultDeposit).not.toHaveBeenCalled();
    expect(result.current.wizard).toEqual(initialDepositWizardState);
  });

  it('re-arms after a plain pre-submission error', async () => {
    mocks.submitVaultDeposit.mockRejectedValueOnce(
      new Error('wallet rejected'),
    );
    const { result } = await resumeUntilArrived();

    await act(async () => {
      await result.current.runHlpDeposit();
    });

    expect(result.current.wizard.hlp.status).toBe('arrived');
    expect(result.current.wizard.error?.message).toContain('wallet rejected');
    expect(mocks.waitForVaultEquityIncrease).not.toHaveBeenCalled();
  });

  it('signs vaultTransfer with the approved local agent', async () => {
    mocks.getVaultEquity.mockResolvedValue({ equityUsd6: 1_000_000n });

    const { result } = await resumeUntilArrived();
    await act(async () => {
      await result.current.runHlpDeposit();
    });

    expect(mocks.getSigner).toHaveBeenCalledWith(USER);
    expect(mocks.submitVaultDeposit).toHaveBeenCalledWith({
      signer: mocks.signer,
      vaultAddress: HLP,
      usd6: 29_500_000n,
      isTestnet: false,
      apiUrl: signing.apiUrl,
    });
    expect(mocks.waitForVaultEquityIncrease).toHaveBeenCalledWith(
      expect.objectContaining({
        user: USER,
        vaultAddress: HLP,
        equityBeforeUsd6: 1_000_000n,
        apiUrl: signing.apiUrl,
      }),
    );
    expect(result.current.wizard.stage).toBe('done');
    expect(result.current.wizard.hlp.status).toBe('deposited');
    expect(result.current.wizard.hlp.vaultEquityUsd6).toBe(29_400_000n);
  });

  it('caps the vaultTransfer at what the bridge could have delivered', async () => {
    mocks.waitForHyperCoreUsdcArrival.mockResolvedValue({
      arrivedUsd6: 41_000_000n,
      mode: 'unified',
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

  it('refuses vault signing until an agent is ready for this master wallet', async () => {
    const notReady = renderWizard({
      isReady: false,
      masterAddress: USER,
      getSigner: mocks.getSigner,
    });
    await act(async () => {
      await notReady.result.current.startSpotDeposit(spotPlan);
    });
    await expect(notReady.result.current.runHlpDeposit()).rejects.toThrow(
      'Enable Hyperliquid signing',
    );

    // An agent approved by a different master wallet is equally unusable:
    // it cannot act inside the account whose balance was measured.
    const foreignAgent = renderWizard(readyAgent(OTHER_USER));
    await act(async () => {
      await foreignAgent.result.current.startSpotDeposit(spotPlan);
    });
    await expect(foreignAgent.result.current.runHlpDeposit()).rejects.toThrow(
      'Enable Hyperliquid signing',
    );

    expect(mocks.getSigner).not.toHaveBeenCalled();
    expect(mocks.submitVaultDeposit).not.toHaveBeenCalled();
  });

  it('refuses to sign once the connected wallet changed', async () => {
    const { result, rerender } = await resumeUntilArrived();

    mocks.useWalletProvider.mockReturnValue({
      account: { address: OTHER_USER },
    });
    rerender();

    await expect(result.current.runHlpDeposit()).rejects.toThrow(
      'connected wallet changed',
    );
    expect(mocks.submitVaultDeposit).not.toHaveBeenCalled();
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
    expect(mocks.getSigner).not.toHaveBeenCalled();
    expect(mocks.submitVaultDeposit).not.toHaveBeenCalled();
    expect(result.current.wizard).toEqual(initialDepositWizardState);
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

    // Nothing moved, so the HyperCore USDC is still the user's to deposit.
    expect(result.current.wizard.hlp.status).toBe('arrived');
    expect(result.current.wizard.hlp.arrivedUsd6).toBe(29_500_000n);
    expect(result.current.wizard.error?.stage).toBe('hyperliquidDeposit');
    expect(mocks.waitForVaultEquityIncrease).not.toHaveBeenCalled();
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
    expect(result.current.wizard.hlp.status).toBe('deposited');
    expect(result.current.wizard.error).toBeNull();
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
