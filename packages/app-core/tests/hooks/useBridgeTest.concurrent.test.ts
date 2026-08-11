// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { useBridgeTest } from '@core/hooks/useBridgeTest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const USER = '0x1111111111111111111111111111111111111111';
const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const HYPERCORE_USDC = '0x0000000000000000000000000000000000000000';
const ROUTER = '0x2222222222222222222222222222222222222222';
const FIRST_SOURCE_HASH = `0x${'1'.repeat(64)}`;
const SECOND_SOURCE_HASH = `0x${'2'.repeat(64)}`;
const SECOND_DESTINATION_HASH = `0x${'3'.repeat(64)}`;

const mocks = vi.hoisted(() => ({
  useWalletProvider: vi.fn(),
  buildBridge: vi.fn(),
  getPublicClient: vi.fn(),
  waitForBridgeCompletion: vi.fn(),
  getPerpUsdcBalance: vi.fn(),
  waitForPerpUsdcArrival: vi.fn(),
  readContract: vi.fn(),
  estimateGas: vi.fn(),
  getBalance: vi.fn(),
  getGasPrice: vi.fn(),
  waitForTransactionReceipt: vi.fn(),
  switchChain: vi.fn(),
  sendTransaction: vi.fn(),
}));

vi.mock('@core/providers/walletContext', () => ({
  useWalletProvider: mocks.useWalletProvider,
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
}));

const quote = {
  provider: 'lifi',
  fromChainId: 8453,
  toChainId: 1337,
  fromToken: BASE_USDC,
  toToken: HYPERCORE_USDC,
  fromAmount: '10000000',
  toAmount: '9950000',
  toAmountMin: '9900000',
  feeUsd: '0.04',
  gasUsd: '0.01',
  estimatedDurationSec: 60,
  approvals: [],
  calls: [
    {
      to: ROUTER,
      data: '0x1234',
      value: '0',
      chainId: 8453,
      gasLimit: '100000',
      meta: { intentType: 'BRIDGE' },
    },
  ],
  providerData: {},
};

const request = {
  fromChainId: 8453,
  toChainId: 1337,
  fromToken: BASE_USDC,
  toToken: HYPERCORE_USDC,
  fromAmount: '10000000',
} as const;

describe('useBridgeTest concurrent execution isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useWalletProvider.mockReturnValue({
      account: { address: USER },
      chain: { id: 8453 },
      switchChain: mocks.switchChain,
      sendTransaction: mocks.sendTransaction,
    });
    mocks.buildBridge.mockResolvedValue(quote);
    mocks.readContract.mockResolvedValue(100000000n);
    mocks.estimateGas.mockResolvedValue(100000n);
    mocks.getBalance.mockResolvedValue(10n ** 18n);
    mocks.getGasPrice.mockResolvedValue(1_000_000_000n);
    mocks.waitForTransactionReceipt.mockResolvedValue({ status: 'success' });
    mocks.getPublicClient.mockReturnValue({
      readContract: mocks.readContract,
      estimateGas: mocks.estimateGas,
      getBalance: mocks.getBalance,
      getGasPrice: mocks.getGasPrice,
      waitForTransactionReceipt: mocks.waitForTransactionReceipt,
    });
    mocks.getPerpUsdcBalance.mockResolvedValue({
      withdrawableUsd6: 5_000_000n,
    });
    mocks.waitForPerpUsdcArrival.mockResolvedValue(undefined);
  });

  it('keeps the second result when the first provider poll rejects after being aborted', async () => {
    let rejectFirstPoll!: (error: Error) => void;
    mocks.sendTransaction
      .mockResolvedValueOnce(FIRST_SOURCE_HASH)
      .mockResolvedValueOnce(SECOND_SOURCE_HASH);
    mocks.waitForBridgeCompletion
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            rejectFirstPoll = reject;
          }),
      )
      .mockResolvedValueOnce({
        status: 'settled',
        sourceTxHash: SECOND_SOURCE_HASH,
        destinationTxHash: SECOND_DESTINATION_HASH,
      });

    const { result } = renderHook(() => useBridgeTest());
    let firstExecution!: Promise<void>;

    await act(async () => {
      firstExecution = result.current.execute(request);
      await vi.waitFor(() => {
        expect(mocks.waitForBridgeCompletion).toHaveBeenCalledTimes(1);
      });
    });

    const firstSignal = mocks.waitForBridgeCompletion.mock.calls[0]?.[0]
      .signal as AbortSignal;

    await act(async () => {
      await result.current.execute(request);
    });

    expect(firstSignal.aborted).toBe(true);
    expect(result.current.status).toBe('completed');
    expect(result.current.sourceTxHash).toBe(SECOND_SOURCE_HASH);
    expect(result.current.destinationTxHash).toBe(SECOND_DESTINATION_HASH);

    await act(async () => {
      rejectFirstPoll(new Error('Stale provider poll failed.'));
      await firstExecution;
    });

    expect(result.current.status).toBe('completed');
    expect(result.current.error).toBeNull();
    expect(result.current.sourceTxHash).toBe(SECOND_SOURCE_HASH);
    expect(result.current.destinationTxHash).toBe(SECOND_DESTINATION_HASH);
  });

  it('keeps reset state when an aborted provider poll resolves successfully', async () => {
    let resolvePoll!: (value: {
      status: 'settled';
      sourceTxHash: string;
      destinationTxHash: string;
    }) => void;
    mocks.sendTransaction.mockResolvedValue(FIRST_SOURCE_HASH);
    mocks.waitForBridgeCompletion.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePoll = resolve;
        }),
    );

    const { result } = renderHook(() => useBridgeTest());
    let execution!: Promise<void>;

    await act(async () => {
      execution = result.current.execute(request);
      await vi.waitFor(() => {
        expect(mocks.waitForBridgeCompletion).toHaveBeenCalledTimes(1);
      });
    });

    const signal = mocks.waitForBridgeCompletion.mock.calls[0]?.[0]
      .signal as AbortSignal;

    act(() => {
      result.current.reset();
    });

    expect(signal.aborted).toBe(true);
    expect(result.current.status).toBe('idle');
    expect(result.current.sourceTxHash).toBeNull();
    expect(result.current.destinationTxHash).toBeNull();

    await act(async () => {
      resolvePoll({
        status: 'settled',
        sourceTxHash: FIRST_SOURCE_HASH,
        destinationTxHash: SECOND_DESTINATION_HASH,
      });
      await execution;
    });

    expect(mocks.waitForPerpUsdcArrival).not.toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBeNull();
    expect(result.current.sourceTxHash).toBeNull();
    expect(result.current.destinationTxHash).toBeNull();
  });

  it('keeps reset state when an aborted provider poll rejects later', async () => {
    let rejectPoll!: (error: Error) => void;
    mocks.sendTransaction.mockResolvedValue(FIRST_SOURCE_HASH);
    mocks.waitForBridgeCompletion.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectPoll = reject;
        }),
    );

    const { result } = renderHook(() => useBridgeTest());
    let execution!: Promise<void>;

    await act(async () => {
      execution = result.current.execute(request);
      await vi.waitFor(() => {
        expect(mocks.waitForBridgeCompletion).toHaveBeenCalledTimes(1);
      });
    });

    const signal = mocks.waitForBridgeCompletion.mock.calls[0]?.[0]
      .signal as AbortSignal;

    act(() => {
      result.current.reset();
    });

    expect(signal.aborted).toBe(true);
    expect(result.current.status).toBe('idle');
    expect(result.current.sourceTxHash).toBeNull();
    expect(result.current.destinationTxHash).toBeNull();

    await act(async () => {
      rejectPoll(new Error('Stale provider poll rejected after reset.'));
      await execution;
    });

    expect(mocks.waitForPerpUsdcArrival).not.toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBeNull();
    expect(result.current.quote).toBeNull();
    expect(result.current.sourceTxHash).toBeNull();
    expect(result.current.destinationTxHash).toBeNull();
  });
});
