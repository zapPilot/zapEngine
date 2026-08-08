// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { useBridgeTest } from '@core/hooks/useBridgeTest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const USER = '0x1111111111111111111111111111111111111111';
const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const HYPERCORE_USDC = '0x0000000000000000000000000000000000000000';
const ROUTER = '0x2222222222222222222222222222222222222222';
const FIRST_SOURCE_HASH = `0x${'1'.repeat(64)}`;
const FIRST_DESTINATION_HASH = `0x${'2'.repeat(64)}`;
const SECOND_SOURCE_HASH = `0x${'3'.repeat(64)}`;
const SECOND_DESTINATION_HASH = `0x${'4'.repeat(64)}`;

const mocks = vi.hoisted(() => ({
  useWalletProvider: vi.fn(),
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

describe('useBridgeTest Hyperliquid concurrent arrival success', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useWalletProvider.mockReturnValue({
      account: { address: USER },
      chain: { id: 8453 },
      switchChain: mocks.switchChain,
      sendTransaction: mocks.sendTransaction,
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
    mocks.getPerpUsdcBalance.mockResolvedValue({ withdrawableUsd6: 5_000_000n });
  });

  it('keeps the second execution result when the first arrival poll resolves later', async () => {
    let resolveFirstArrival!: () => void;
    mocks.sendTransaction
      .mockResolvedValueOnce(FIRST_SOURCE_HASH)
      .mockResolvedValueOnce(SECOND_SOURCE_HASH);
    mocks.waitForBridgeCompletion
      .mockResolvedValueOnce({
        status: 'DONE',
        receiving: { txHash: FIRST_DESTINATION_HASH, chainId: 1337 },
      })
      .mockResolvedValueOnce({
        status: 'DONE',
        receiving: { txHash: SECOND_DESTINATION_HASH, chainId: 1337 },
      });
    mocks.waitForPerpUsdcArrival
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolveFirstArrival = resolve;
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
    expect(result.current.error).toBeNull();
    expect(result.current.sourceTxHash).toBe(SECOND_SOURCE_HASH);
    expect(result.current.destinationTxHash).toBe(SECOND_DESTINATION_HASH);

    await act(async () => {
      resolveFirstArrival();
      await firstExecution;
    });

    expect(result.current.status).toBe('completed');
    expect(result.current.error).toBeNull();
    expect(result.current.sourceTxHash).toBe(SECOND_SOURCE_HASH);
    expect(result.current.destinationTxHash).toBe(SECOND_DESTINATION_HASH);
  });
});
