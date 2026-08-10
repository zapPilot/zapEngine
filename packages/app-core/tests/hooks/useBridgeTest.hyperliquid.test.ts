// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { useBridgeTest } from '@core/hooks/useBridgeTest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const USER = '0x1111111111111111111111111111111111111111';
const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const HYPERCORE_USDC = '0x0000000000000000000000000000000000000000';
const ROUTER = '0x2222222222222222222222222222222222222222';
const SOURCE_HASH = `0x${'1'.repeat(64)}`;
const DESTINATION_HASH = `0x${'2'.repeat(64)}`;
const SECOND_SOURCE_HASH = `0x${'3'.repeat(64)}`;
const SECOND_DESTINATION_HASH = `0x${'4'.repeat(64)}`;

const mocks = vi.hoisted(() => ({
  useWalletProvider: vi.fn(),
  executeDepositPlanWithWallet: vi.fn(),
  buildBridge: vi.fn(),
  needsApproval: vi.fn(),
  buildApproveTx: vi.fn(),
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
  toChainId: 1337,
  fromToken: BASE_USDC,
  toToken: HYPERCORE_USDC,
  fromAmount: '10000000',
} as const;

describe('useBridgeTest Hyperliquid arrival confirmation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useWalletProvider.mockReturnValue({
      account: { address: USER },
      chain: { id: 8453 },
      switchChain: mocks.switchChain,
      sendTransaction: mocks.sendTransaction,
      getWalletClient: mocks.getWalletClient,
      executionMode: 'eip7702',
    });
    mocks.buildBridge.mockResolvedValue(quote);
    mocks.needsApproval.mockResolvedValue(false);
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
    mocks.executeDepositPlanWithWallet.mockResolvedValue({
      kind: 'eip7702',
      callsId: 'calls-1',
      transactionHash: SOURCE_HASH,
    });
    mocks.waitForBridgeCompletion.mockResolvedValue({
      status: 'DONE',
      receiving: { txHash: DESTINATION_HASH, chainId: 1337 },
    });
  });

  it('blocks wallet interaction when the destination baseline is unavailable', async () => {
    mocks.getPerpUsdcBalance.mockRejectedValue(
      new Error('Unable to load Hyperliquid balance.'),
    );
    const { result } = renderHook(() => useBridgeTest());

    await act(async () => {
      await result.current.execute(request);
    });

    expect(result.current.status).toBe('failed');
    expect(result.current.error).toBe('Unable to load Hyperliquid balance.');
    expect(mocks.sendTransaction).not.toHaveBeenCalled();
    expect(mocks.waitForBridgeCompletion).not.toHaveBeenCalled();
    expect(mocks.waitForPerpUsdcArrival).not.toHaveBeenCalled();
  });

  it('preserves the receiving hash and exposes destination arrival failure', async () => {
    mocks.waitForPerpUsdcArrival.mockRejectedValue(
      new Error('Hyperliquid USDC arrival timed out.'),
    );
    const { result } = renderHook(() => useBridgeTest());

    await act(async () => {
      await result.current.execute(request);
    });

    expect(mocks.getPerpUsdcBalance).toHaveBeenCalledWith({ user: USER });
    expect(mocks.waitForPerpUsdcArrival).toHaveBeenCalledWith(
      expect.objectContaining({
        user: USER,
        baselineUsd6: 5_000_000n,
        expectedUsd6: 9_900_000n,
      }),
    );
    expect(result.current.sourceTxHash).toBe(SOURCE_HASH);
    expect(result.current.destinationTxHash).toBe(DESTINATION_HASH);
    expect(result.current.status).toBe('failed');
    expect(result.current.error).toBe('Hyperliquid USDC arrival timed out.');
  });

  it('keeps reset state when an aborted arrival poll rejects later', async () => {
    let rejectArrival!: (error: Error) => void;
    mocks.waitForPerpUsdcArrival.mockImplementation(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectArrival = reject;
        }),
    );
    const { result } = renderHook(() => useBridgeTest());
    let execution!: Promise<void>;

    await act(async () => {
      execution = result.current.execute(request);
      await vi.waitFor(() => {
        expect(mocks.waitForPerpUsdcArrival).toHaveBeenCalledTimes(1);
      });
    });

    const arrivalSignal = mocks.waitForPerpUsdcArrival.mock.calls[0]?.[0]
      .signal as AbortSignal;

    act(() => {
      result.current.reset();
    });

    expect(arrivalSignal.aborted).toBe(true);
    expect(result.current.status).toBe('idle');

    await act(async () => {
      rejectArrival(new Error('Stale arrival poll failed.'));
      await execution;
    });

    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBeNull();
    expect(result.current.sourceTxHash).toBeNull();
    expect(result.current.destinationTxHash).toBeNull();
  });

  it('keeps the second execution result when the first arrival poll rejects later', async () => {
    let rejectFirstArrival!: (error: Error) => void;
    mocks.executeDepositPlanWithWallet
      .mockResolvedValueOnce({
        kind: 'eip7702',
        callsId: 'first-calls',
        transactionHash: SOURCE_HASH,
      })
      .mockResolvedValueOnce({
        kind: 'eip7702',
        callsId: 'second-calls',
        transactionHash: SECOND_SOURCE_HASH,
      });
    mocks.waitForBridgeCompletion
      .mockResolvedValueOnce({
        status: 'DONE',
        receiving: { txHash: DESTINATION_HASH, chainId: 1337 },
      })
      .mockResolvedValueOnce({
        status: 'DONE',
        receiving: { txHash: SECOND_DESTINATION_HASH, chainId: 1337 },
      });
    mocks.waitForPerpUsdcArrival
      .mockImplementationOnce(
        () =>
          new Promise<void>((_resolve, reject) => {
            rejectFirstArrival = reject;
          }),
      )
      .mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useBridgeTest());
    let firstExecution!: Promise<void>;

    await act(async () => {
      firstExecution = result.current.execute(request);
      await vi.waitFor(() => {
        expect(mocks.waitForPerpUsdcArrival).toHaveBeenCalledTimes(1);
      });
    });

    const firstSignal = mocks.waitForPerpUsdcArrival.mock.calls[0]?.[0]
      .signal as AbortSignal;

    await act(async () => {
      await result.current.execute(request);
    });

    expect(firstSignal.aborted).toBe(true);
    expect(result.current.status).toBe('completed');
    expect(result.current.sourceTxHash).toBe(SECOND_SOURCE_HASH);
    expect(result.current.destinationTxHash).toBe(SECOND_DESTINATION_HASH);

    await act(async () => {
      rejectFirstArrival(new Error('Stale first execution failed.'));
      await firstExecution;
    });

    expect(result.current.status).toBe('completed');
    expect(result.current.error).toBeNull();
    expect(result.current.sourceTxHash).toBe(SECOND_SOURCE_HASH);
    expect(result.current.destinationTxHash).toBe(SECOND_DESTINATION_HASH);
  });
});
