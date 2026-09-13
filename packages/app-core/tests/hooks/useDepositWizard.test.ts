// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { useDepositWizard } from '@core/hooks/useDepositWizard';
import { initialDepositWizardState } from '@core/lib/wallet/depositWizardMachine';
import type { DepositPlan, HlpSpotDepositPlan } from '@zapengine/types/api';
import type { Address, Hash } from 'viem';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const USER = '0x1111111111111111111111111111111111111111' as Address;
const OTHER_USER = '0x2222222222222222222222222222222222222222' as Address;
const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const HYPERCORE_USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
const HLP = '0xdfc24b077bc1425ad1dea75bcb6f8158e10df303';
const SOURCE_TX = '0xsource' as Hash;
const AGENT = '0x3333333333333333333333333333333333333333' as Address;

const mocks = vi.hoisted(() => {
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
    createContextLogger: () => ({ info: vi.fn(), error: vi.fn() }),
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
  return {
    isReady: true,
    masterAddress,
    getSigner: mocks.getSigner,
  };
}

function renderWizard(agent = readyAgent()) {
  return renderHook(() => useDepositWizard({ hyperliquidAgent: agent }));
}

async function resumeUntilArrived() {
  const rendered = renderWizard();
  await act(async () => {
    await rendered.result.current.resumeReviewedPlan({
      plan: bridgePlan,
      baselineUsd6: 1_000_000n,
      sourceTxHash: SOURCE_TX,
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

  it('tracks the existing reviewed bridge without resubmitting it', async () => {
    const { result } = await resumeUntilArrived();
    expect(mocks.waitForBridgeCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        txHash: SOURCE_TX,
        fromChain: 8453,
        toChain: 1337,
      }),
    );
    expect(mocks.waitForHyperCoreUsdcArrival).toHaveBeenCalledWith(
      expect.objectContaining({
        user: USER,
        baselineUsd6: 1_000_000n,
        expectedUsd6: 29_000_000n,
      }),
    );
    expect(result.current.wizard.hlp.arrivedUsd6).toBe(29_500_000n);
  });

  it('stops when bridge tracking fails', async () => {
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
    expect(result.current.wizard.error?.stage).toBe('bridging');
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

  it('fails closed when a direct deposit exceeds spendable USDC', async () => {
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
  });

  it('signs vaultTransfer with the approved local agent', async () => {
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
    expect(result.current.wizard.hlp.status).toBe('deposited');
  });

  it('refuses vault signing until an agent is ready for this master wallet', async () => {
    const rendered = renderWizard({
      isReady: false,
      masterAddress: USER,
      getSigner: mocks.getSigner,
    });
    await act(async () => {
      await rendered.result.current.startSpotDeposit(spotPlan);
    });
    await expect(rendered.result.current.runHlpDeposit()).rejects.toThrow(
      'Enable Hyperliquid signing',
    );
    expect(mocks.getSigner).not.toHaveBeenCalled();
    expect(mocks.submitVaultDeposit).not.toHaveBeenCalled();
  });

  it('invalidates the flow if the connected master wallet changes', async () => {
    const rendered = renderWizard();
    await act(async () => {
      await rendered.result.current.startSpotDeposit(spotPlan);
    });
    mocks.useWalletProvider.mockReturnValue({ account: { address: OTHER_USER } });
    rendered.rerender();
    await expect(rendered.result.current.runHlpDeposit()).rejects.toThrow(
      'connected wallet changed',
    );
    expect(mocks.submitVaultDeposit).not.toHaveBeenCalled();
  });

  it('re-arms only a definitely failed vault submission', async () => {
    mocks.submitVaultDeposit.mockRejectedValueOnce(
      new mocks.HyperliquidVaultDepositError('rejected', { ambiguous: false }),
    );
    const { result } = await resumeUntilArrived();
    await act(async () => {
      await result.current.runHlpDeposit();
    });
    expect(result.current.wizard.hlp.status).toBe('arrived');
    expect(result.current.wizard.error?.stage).toBe('hyperliquidDeposit');
  });

  it('does not blindly retry an ambiguous vault submission', async () => {
    mocks.submitVaultDeposit.mockRejectedValueOnce(
      new mocks.HyperliquidVaultDepositError('network lost', { ambiguous: true }),
    );
    mocks.waitForVaultEquityIncrease.mockRejectedValueOnce(
      new Error('Polling timed out'),
    );
    const { result } = await resumeUntilArrived();
    await act(async () => {
      await result.current.runHlpDeposit();
    });
    expect(result.current.wizard.hlp.status).toBe('submittedUnverified');
    expect(result.current.wizard.error).toBeNull();
  });

  it('reset aborts active work and restores initial state', async () => {
    const { result } = await resumeUntilArrived();
    act(() => result.current.reset());
    expect(result.current.wizard).toEqual(initialDepositWizardState);
  });
});
