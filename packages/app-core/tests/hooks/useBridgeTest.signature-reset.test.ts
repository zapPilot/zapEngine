// @vitest-environment jsdom
import { useBridgeTest } from '@core/hooks/useBridgeTest';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const USER = '0x1111111111111111111111111111111111111111';
const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const ARBITRUM_USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
const ROUTER = '0x2222222222222222222222222222222222222222';
const SOURCE_HASH = `0x${'1'.repeat(64)}`;

const mocks = vi.hoisted(() => ({
  useWalletProvider: vi.fn(),
  buildBridge: vi.fn(),
  getPublicClient: vi.fn(),
  waitForBridgeCompletion: vi.fn(),
  getPerpUsdcBalance: vi.fn(),
  waitForPerpUsdcArrival: vi.fn(),
  sendPreparedTransaction: vi.fn(),
  readContract: vi.fn(),
  estimateGas: vi.fn(),
  getBalance: vi.fn(),
  getGasPrice: vi.fn(),
  waitForTransactionReceipt: vi.fn(),
  switchChain: vi.fn(),
}));

vi.mock('@core/providers/walletContext', () => ({
  useWalletProvider: mocks.useWalletProvider,
}));

vi.mock('@core/lib/wallet/sendPreparedTransaction', () => ({
  sendPreparedTransaction: mocks.sendPreparedTransaction,
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
  provider: 'across',
  fromChainId: 8453,
  toChainId: 42161,
  fromToken: BASE_USDC,
  toToken: ARBITRUM_USDC,
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
  toChainId: 42161,
  fromToken: BASE_USDC,
  toToken: ARBITRUM_USDC,
  fromAmount: '10000000',
} as const;

describe('useBridgeTest signature reset isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useWalletProvider.mockReturnValue({
      account: { address: USER },
      chain: { id: 8453 },
      switchChain: mocks.switchChain,
    });
    mocks.buildBridge.mockResolvedValue(quote);
    mocks.readContract.mockResolvedValue(100000000n);
    mocks.estimateGas.mockResolvedValue(100000n);
    mocks.getBalance.mockResolvedValue(10n ** 18n);
    mocks.getGasPrice.mockResolvedValue(1_000_000_000n);
    mocks.getPublicClient.mockReturnValue({
      readContract: mocks.readContract,
      estimateGas: mocks.estimateGas,
      getBalance: mocks.getBalance,
      getGasPrice: mocks.getGasPrice,
      waitForTransactionReceipt: mocks.waitForTransactionReceipt,
    });
  });

  it('keeps reset state when a stale wallet signature rejects later', async () => {
    let rejectSignature!: (error: Error) => void;
    mocks.sendPreparedTransaction.mockImplementation(
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
        expect(mocks.sendPreparedTransaction).toHaveBeenCalledTimes(1);
      });
    });

    act(() => {
      result.current.reset();
    });

    await act(async () => {
      rejectSignature(new Error('User rejected stale signature'));
      await execution;
    });

    expect(mocks.waitForTransactionReceipt).not.toHaveBeenCalled();
    expect(mocks.waitForBridgeCompletion).not.toHaveBeenCalled();
    expect(mocks.waitForPerpUsdcArrival).not.toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBeNull();
    expect(result.current.quote).toBeNull();
    expect(result.current.sourceTxHash).toBeNull();
    expect(result.current.destinationTxHash).toBeNull();
  });

  it('keeps reset state when a stale wallet signature resolves later', async () => {
    let resolveSignature!: (hash: typeof SOURCE_HASH) => void;
    mocks.sendPreparedTransaction.mockImplementation(
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
        expect(mocks.sendPreparedTransaction).toHaveBeenCalledTimes(1);
      });
    });

    act(() => {
      result.current.reset();
    });

    await act(async () => {
      resolveSignature(SOURCE_HASH);
      await execution;
    });

    expect(mocks.waitForTransactionReceipt).not.toHaveBeenCalled();
    expect(mocks.waitForBridgeCompletion).not.toHaveBeenCalled();
    expect(mocks.waitForPerpUsdcArrival).not.toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBeNull();
    expect(result.current.quote).toBeNull();
    expect(result.current.sourceTxHash).toBeNull();
    expect(result.current.destinationTxHash).toBeNull();
  });
});
