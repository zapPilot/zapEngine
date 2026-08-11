// @vitest-environment jsdom
import { useBridgeTest } from '@core/hooks/useBridgeTest';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const USER = '0x1111111111111111111111111111111111111111';
const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const ARBITRUM_USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
const ROUTER = '0x2222222222222222222222222222222222222222';
const SOURCE_HASH =
  '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

const mocks = vi.hoisted(() => ({
  useWalletProvider: vi.fn(),
  buildBridge: vi.fn(),
  needsApproval: vi.fn(),
  buildApproveTx: vi.fn(),
  getPublicClient: vi.fn(),
  waitForBridgeCompletion: vi.fn(),
  getPerpUsdcBalance: vi.fn(),
  waitForPerpUsdcArrival: vi.fn(),
  executeDepositPlanWithWallet: vi.fn(),
  readContract: vi.fn(),
  estimateGas: vi.fn(),
  getBalance: vi.fn(),
  getGasPrice: vi.fn(),
  getWalletClient: vi.fn(),
}));

vi.mock('@core/providers/walletContext', () => ({
  useWalletProvider: mocks.useWalletProvider,
}));

vi.mock('@core/lib/wallet/executeDepositPlan', () => ({
  executeDepositPlanWithWallet: mocks.executeDepositPlanWithWallet,
}));

vi.mock('@core/services/intentClient', () => ({
  intentEngine: { buildBridge: mocks.buildBridge },
  getPublicClient: mocks.getPublicClient,
  waitForBridgeCompletion: mocks.waitForBridgeCompletion,
}));

vi.mock('@core/services/hyperliquidService', () => ({
  getPerpUsdcBalance: mocks.getPerpUsdcBalance,
  waitForPerpUsdcArrival: mocks.waitForPerpUsdcArrival,
}));

vi.mock('@zapengine/intent-engine', () => ({
  HYPERCORE_CHAIN_ID: 1337,
  needsApproval: mocks.needsApproval,
  buildApproveTx: mocks.buildApproveTx,
}));

const quote = {
  transaction: {
    to: ROUTER,
    data: '0x1234',
    value: '0',
    chainId: 8453,
    gasLimit: '100000',
    meta: { intentType: 'BRIDGE' },
  },
  estimate: {
    fromAmount: '10000000',
    toAmount: '9950000',
    toAmountMin: '9900000',
    gasCostUsd: '0.01',
    feeCostUsd: '0.04',
    executionDuration: 60,
    tool: 'across',
  },
};

const request = {
  fromChainId: 8453,
  toChainId: 42161,
  fromToken: BASE_USDC,
  toToken: ARBITRUM_USDC,
  fromAmount: '10000000',
} as const;

describe('useBridgeTest reset during wallet signature', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useWalletProvider.mockReturnValue({
      account: { address: USER },
      chain: { id: 8453 },
      switchChain: vi.fn(),
      getWalletClient: mocks.getWalletClient,
      executionMode: 'eip7702',
    });
    mocks.buildBridge.mockResolvedValue(quote);
    mocks.needsApproval.mockResolvedValue(false);
    mocks.readContract.mockResolvedValue(100000000n);
    mocks.estimateGas.mockResolvedValue(100000n);
    mocks.getBalance.mockResolvedValue(10n ** 18n);
    mocks.getGasPrice.mockResolvedValue(1_000_000_000n);
    mocks.getPublicClient.mockReturnValue({
      readContract: mocks.readContract,
      estimateGas: mocks.estimateGas,
      getBalance: mocks.getBalance,
      getGasPrice: mocks.getGasPrice,
    });
  });

  it('ignores a stale wallet-signature rejection after reset', async () => {
    let rejectSignature!: (error: Error) => void;
    mocks.executeDepositPlanWithWallet.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectSignature = reject;
        }),
    );

    const { result } = renderHook(() => useBridgeTest());
    let execution!: Promise<void>;

    await act(async () => {
      execution = result.current.execute(request);
      await vi.waitFor(() => {
        expect(mocks.executeDepositPlanWithWallet).toHaveBeenCalledOnce();
      });
    });

    expect(result.current.status).toBe('awaitingBridgeSignature');

    act(() => {
      result.current.reset();
    });

    expect(result.current.status).toBe('idle');
    expect(result.current.quote).toBeNull();

    await act(async () => {
      rejectSignature(new Error('User rejected stale bridge signature.'));
      await execution;
    });

    expect(mocks.waitForBridgeCompletion).not.toHaveBeenCalled();
    expect(mocks.waitForPerpUsdcArrival).not.toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBeNull();
    expect(result.current.quote).toBeNull();
    expect(result.current.sourceTxHash).toBeNull();
    expect(result.current.destinationTxHash).toBeNull();
    expect(result.current.lifiScanUrl).toBeNull();
  });

  it('ignores a stale wallet-signature success after reset', async () => {
    let resolveSignature!: (execution: {
      kind: 'eip7702';
      callsId: string;
      transactionHash: typeof SOURCE_HASH;
    }) => void;
    mocks.executeDepositPlanWithWallet.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSignature = resolve;
        }),
    );

    const { result } = renderHook(() => useBridgeTest());
    let execution!: Promise<void>;

    await act(async () => {
      execution = result.current.execute(request);
      await vi.waitFor(() => {
        expect(mocks.executeDepositPlanWithWallet).toHaveBeenCalledOnce();
      });
    });

    expect(result.current.status).toBe('awaitingBridgeSignature');

    act(() => {
      result.current.reset();
    });

    await act(async () => {
      resolveSignature({
        kind: 'eip7702',
        callsId: 'stale-calls',
        transactionHash: SOURCE_HASH,
      });
      await execution;
    });

    expect(mocks.waitForBridgeCompletion).not.toHaveBeenCalled();
    expect(mocks.waitForPerpUsdcArrival).not.toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBeNull();
    expect(result.current.quote).toBeNull();
    expect(result.current.sourceTxHash).toBeNull();
    expect(result.current.destinationTxHash).toBeNull();
    expect(result.current.lifiScanUrl).toBeNull();
  });
});
