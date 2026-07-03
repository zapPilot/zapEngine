import { act, waitFor } from '@testing-library/react';
import { useDepositWizard } from '@zapengine/app-core/hooks/useDepositWizard';
import type { DepositPlan } from '@zapengine/types/api';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderHook } from '../../test-utils';

const USER = '0x1111111111111111111111111111111111111111';
const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const HYPERCORE_USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
const HLP = '0xdfc24b077bc1425ad1dea75bcb6f8158e10df303';

const mocks = vi.hoisted(() => ({
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
  walletClient: { signTypedData: vi.fn() },
}));

vi.mock('@zapengine/app-core/providers/WalletProvider', () => ({
  useWalletProvider: mocks.useWalletProvider,
}));

vi.mock('@zapengine/app-core/services/planOrchestrationService', () => ({
  getDepositPlan: mocks.getDepositPlan,
}));

vi.mock('@zapengine/app-core/lib/wallet/executeDepositPlan', () => ({
  executeDepositPlanWithWallet: mocks.executeDepositPlan,
}));

vi.mock('@zapengine/app-core/services/intentClient', () => ({
  waitForBridgeCompletion: mocks.waitForBridgeCompletion,
}));

vi.mock('@zapengine/app-core/services/hyperliquidService', () => ({
  getPerpUsdcBalance: mocks.getPerpUsdcBalance,
  getVaultEquity: mocks.getVaultEquity,
  submitVaultDeposit: mocks.submitVaultDeposit,
  waitForPerpUsdcArrival: mocks.waitForPerpUsdcArrival,
}));

vi.mock('@zapengine/app-core/utils/logger', () => ({
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
      minDepositUsd: '5000000',
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
    mocks.executeDepositPlan.mockImplementation(
      async ({ onBundleSubmitted, onBundleConfirmed }) => {
        onBundleSubmitted?.('0xbundle');
        onBundleConfirmed?.('0xsource');
        return {
          kind: 'eip7702',
          callsId: '0xbundle',
          transactionHash: '0xsource',
        };
      },
    );
    mocks.waitForBridgeCompletion.mockResolvedValue({
      status: 'DONE',
      receiving: { txHash: '0xdest' },
    });
    mocks.waitForPerpUsdcArrival.mockResolvedValue({
      arrivedUsd6: 29_500_000n,
    });
    mocks.submitVaultDeposit.mockResolvedValue(undefined);
  });

  it('runs the source batch and lands on the HLP step with arrived funds', async () => {
    const { result } = renderHook(() => useDepositWizard());

    await act(async () => {
      await result.current.start({
        fromToken: BASE_USDC as never,
        fromAmount: '100000000',
      });
    });

    expect(mocks.getDepositPlan).toHaveBeenCalledWith({
      kind: 'invest',
      userAddress: USER,
      fromToken: BASE_USDC,
      fromAmount: '100000000',
      sourceChainId: 8453,
    });
    // Baseline read BEFORE execution, against the plan's api url.
    expect(mocks.getPerpUsdcBalance).toHaveBeenCalledWith({
      user: USER,
      apiUrl: 'https://api.hyperliquid.xyz',
    });
    expect(mocks.waitForBridgeCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        txHash: '0xsource',
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

    await waitFor(() => {
      expect(result.current.wizard.stage).toBe('hyperliquidDeposit');
      expect(result.current.wizard.hlp.status).toBe('arrived');
    });
    expect(result.current.wizard.hlp.arrivedUsd6).toBe(29_500_000n);
    expect(result.current.wizard.legs[1]?.destinationTxHash).toBe('0xdest');
    expect(mocks.switchChain).not.toHaveBeenCalled();
  });

  it('submits the HLP vaultTransfer with the arrived amount and confirms via equity', async () => {
    mocks.getVaultEquity
      .mockResolvedValueOnce(null) // before submit
      .mockResolvedValueOnce({ equityUsd6: 29_400_000n }); // confirmation poll

    const { result } = renderHook(() => useDepositWizard());
    await act(async () => {
      await result.current.start({
        fromToken: BASE_USDC as never,
        fromAmount: '100000000',
      });
    });
    await waitFor(() => {
      expect(result.current.wizard.hlp.status).toBe('arrived');
    });

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
    });
    expect(result.current.wizard.stage).toBe('done');
    expect(result.current.wizard.hlp.status).toBe('deposited');
    expect(result.current.wizard.hlp.vaultEquityUsd6).toBe(29_400_000n);
  });

  it('rejects the HLP deposit before funds have arrived', async () => {
    mocks.waitForPerpUsdcArrival.mockReturnValue(new Promise(() => undefined));

    const { result } = renderHook(() => useDepositWizard());
    await act(async () => {
      await result.current.start({
        fromToken: BASE_USDC as never,
        fromAmount: '100000000',
      });
    });

    await expect(result.current.runHlpDeposit()).rejects.toThrow(
      'not ready yet',
    );
    expect(mocks.submitVaultDeposit).not.toHaveBeenCalled();
  });

  it('marks the bridge leg failed and surfaces a bridging error on terminal failure', async () => {
    mocks.waitForBridgeCompletion.mockRejectedValue(
      new Error('Bridge transfer FAILED'),
    );
    mocks.waitForPerpUsdcArrival.mockReturnValue(new Promise(() => undefined));

    const { result } = renderHook(() => useDepositWizard());
    await act(async () => {
      await result.current.start({
        fromToken: BASE_USDC as never,
        fromAmount: '100000000',
      });
    });

    await waitFor(() => {
      expect(result.current.wizard.legs[1]?.status).toBe('failed');
    });
    expect(result.current.wizard.error?.stage).toBe('bridging');
  });

  it('fails the bridging stage when the wallet reports no batch hash', async () => {
    mocks.executeDepositPlan.mockImplementation(
      async ({ onBundleSubmitted, onBundleConfirmed }) => {
        onBundleSubmitted?.('0xbundle');
        onBundleConfirmed?.(undefined);
        return { kind: 'eip7702', callsId: '0xbundle' };
      },
    );

    const { result } = renderHook(() => useDepositWizard());
    await act(async () => {
      await result.current.start({
        fromToken: BASE_USDC as never,
        fromAmount: '100000000',
      });
    });

    expect(result.current.wizard.error?.message).toMatch(/scan\.li\.fi/);
    expect(mocks.waitForBridgeCompletion).not.toHaveBeenCalled();
  });

  it('skips the baseline read for plans without an HLP follow-up', async () => {
    const noHlpPlan: DepositPlan = { ...plan };
    delete (noHlpPlan as { followUps?: unknown }).followUps;
    mocks.getDepositPlan.mockResolvedValue(noHlpPlan);

    const { result } = renderHook(() => useDepositWizard());
    await act(async () => {
      await result.current.start({
        fromToken: BASE_USDC as never,
        fromAmount: '100000000',
      });
    });

    expect(mocks.getPerpUsdcBalance).not.toHaveBeenCalled();
    expect(mocks.waitForPerpUsdcArrival).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(result.current.wizard.stage).toBe('done');
    });
  });
});
