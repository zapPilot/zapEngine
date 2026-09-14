// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { useDepositWizard } from '@core/hooks/useDepositWizard';
import {
  type DepositPlan,
  HYPERLIQUID_BRIDGE2_BRIDGE_ID,
} from '@zapengine/types/api';
import type { Address, Hash } from 'viem';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const USER = '0x1111111111111111111111111111111111111111' as Address;
const SOURCE_TX = '0xsource' as Hash;
const HYPERCORE_USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
const HLP = '0xdfc24b077bc1425ad1dea75bcb6f8158e10df303';

const mocks = vi.hoisted(() => ({
  useWalletProvider: vi.fn(),
  waitForBridgeCompletion: vi.fn(),
  waitForHyperCoreUsdcArrival: vi.fn(),
  submitVaultDeposit: vi.fn(),
}));

vi.mock('@core/providers/walletContext', () => ({
  useWalletProvider: mocks.useWalletProvider,
}));

vi.mock('@core/services/intentClient', () => ({
  waitForBridgeCompletion: mocks.waitForBridgeCompletion,
}));

vi.mock('@core/services/hyperliquidService', () => ({
  HyperliquidVaultDepositError: class HyperliquidVaultDepositError extends Error {},
  getHyperCoreSpendableUsdc: vi.fn(),
  getVaultEquity: vi.fn(),
  submitVaultDeposit: mocks.submitVaultDeposit,
  waitForHyperCoreUsdcArrival: mocks.waitForHyperCoreUsdcArrival,
  waitForVaultEquityIncrease: vi.fn(),
}));

vi.mock('@core/utils/logger', () => ({
  logger: {
    createContextLogger: () => ({ error: vi.fn(), info: vi.fn() }),
  },
}));

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
      signing: {
        scheme: 'hyperliquid-l1-action',
        hyperliquidChain: 'Mainnet',
        apiUrl: 'https://api.hyperliquid.xyz',
      },
      lockupDays: 4,
    },
  ],
  totalGasUsd: '0',
  sourceChainId: 42161,
};

describe('useDepositWizard Bridge2 arrival', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useWalletProvider.mockReturnValue({ account: { address: USER } });
    mocks.waitForHyperCoreUsdcArrival.mockResolvedValue({
      arrivedUsd6: 20_100_000n,
      mode: 'unified',
    });
  });

  it('records the exact HyperCore arrival without polling LI.FI', async () => {
    const { result } = renderHook(() =>
      useDepositWizard({
        hyperliquidAgent: {
          isReady: false,
          masterAddress: null,
          getSigner: vi.fn(),
        },
      }),
    );

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
    expect(mocks.waitForHyperCoreUsdcArrival).toHaveBeenCalledWith(
      expect.objectContaining({
        user: USER,
        baselineUsd6: 1_000_000n,
        expectedUsd6: 20_000_000n,
      }),
    );
    expect(result.current.wizard.hlp.arrivedUsd6).toBe(20_100_000n);
  });

  it('fails closed when HyperCore arrival cannot be confirmed', async () => {
    mocks.waitForHyperCoreUsdcArrival.mockRejectedValueOnce(
      new Error('HyperCore arrival timed out'),
    );
    const { result } = renderHook(() =>
      useDepositWizard({
        hyperliquidAgent: {
          isReady: false,
          masterAddress: null,
          getSigner: vi.fn(),
        },
      }),
    );

    await act(async () => {
      await result.current.resumeReviewedPlan({
        plan: bridge2Plan,
        baselineUsd6: 1_000_000n,
        sourceTxHash: SOURCE_TX,
      });
    });

    expect(mocks.waitForBridgeCompletion).not.toHaveBeenCalled();
    expect(result.current.wizard.legs[0]?.status).toBe('destinationConfirmed');
    expect(result.current.wizard.stage).toBe('hyperliquidDeposit');
    expect(result.current.wizard.hlp.status).toBe('awaitingArrival');
    expect(result.current.wizard.hlp.arrivedUsd6).toBeNull();
    expect(result.current.wizard.error).toEqual({
      stage: 'hyperliquidDeposit',
      message: 'HyperCore arrival timed out',
    });

    await expect(result.current.runHlpDeposit()).rejects.toThrow(
      'HLP deposit is not ready yet',
    );
    expect(mocks.submitVaultDeposit).not.toHaveBeenCalled();
  });
});
