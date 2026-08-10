// @vitest-environment jsdom
import { useBridgeTest } from '@core/hooks/useBridgeTest';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const USER = '0x1111111111111111111111111111111111111111';
const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const ARBITRUM_USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
const ROUTER = '0x2222222222222222222222222222222222222222';

const mocks = vi.hoisted(() => ({
  useWalletProvider: vi.fn(),
  buildBridge: vi.fn(),
  needsApproval: vi.fn(),
  buildApproveTx: vi.fn(),
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
  sendTransaction: vi.fn(),
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
  needsApproval: mocks.needsApproval,
  buildApproveTx: mocks.buildApproveTx,
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

describe('useBridgeTest reset during chain switch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useWalletProvider.mockReturnValue({
      account: { address: USER },
      chain: { id: 1 },
      switchChain: mocks.switchChain,
      sendTransaction: mocks.sendTransaction,
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
      waitForTransactionReceipt: mocks.waitForTransactionReceipt,
    });
  });

  it('ignores a stale switch-chain rejection after reset', async () => {
    let rejectSwitch!: (error: Error) => void;
    mocks.switchChain.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectSwitch = reject;
        }),
    );

    const { result } = renderHook(() => useBridgeTest());
    let execution!: Promise<void>;

    await act(async () => {
      execution = result.current.execute(request);
      await vi.waitFor(() => {
        expect(mocks.switchChain).toHaveBeenCalledWith(8453);
      });
    });

    expect(result.current.status).toBe('quoting');

    act(() => {
      result.current.reset();
    });

    expect(result.current.status).toBe('idle');
    expect(result.current.quote).toBeNull();

    await act(async () => {
      rejectSwitch(new Error('User rejected the stale chain switch.'));
      await execution;
    });

    expect(mocks.sendPreparedTransaction).not.toHaveBeenCalled();
    expect(mocks.waitForBridgeCompletion).not.toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBeNull();
    expect(result.current.sourceTxHash).toBeNull();
    expect(result.current.destinationTxHash).toBeNull();
  });

  it('stops after a stale successful chain switch resolves following reset', async () => {
    let resolveSwitch!: () => void;
    mocks.switchChain.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveSwitch = resolve;
        }),
    );

    const { result } = renderHook(() => useBridgeTest());
    let execution!: Promise<void>;

    await act(async () => {
      execution = result.current.execute(request);
      await vi.waitFor(() => {
        expect(mocks.switchChain).toHaveBeenCalledWith(8453);
      });
    });

    act(() => {
      result.current.reset();
    });

    await act(async () => {
      resolveSwitch();
      await execution;
    });

    expect(mocks.sendPreparedTransaction).not.toHaveBeenCalled();
    expect(mocks.waitForBridgeCompletion).not.toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBeNull();
    expect(result.current.sourceTxHash).toBeNull();
    expect(result.current.destinationTxHash).toBeNull();
  });

  it('stops after funding checks finish following reset', async () => {
    let resolveBalance!: (balance: bigint) => void;
    mocks.readContract.mockImplementation(
      () =>
        new Promise<bigint>((resolve) => {
          resolveBalance = resolve;
        }),
    );

    const { result } = renderHook(() => useBridgeTest());
    let execution!: Promise<void>;

    await act(async () => {
      execution = result.current.execute(request);
      await vi.waitFor(() => {
        expect(mocks.readContract).toHaveBeenCalledOnce();
      });
    });

    act(() => {
      result.current.reset();
    });

    await act(async () => {
      resolveBalance(100000000n);
      await execution;
    });

    expect(mocks.switchChain).not.toHaveBeenCalled();
    expect(mocks.sendPreparedTransaction).not.toHaveBeenCalled();
    expect(mocks.waitForBridgeCompletion).not.toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBeNull();
    expect(result.current.sourceTxHash).toBeNull();
    expect(result.current.destinationTxHash).toBeNull();
  });

  it('stops after Hyperliquid baseline lookup finishes following reset', async () => {
    let resolveBaseline!: (balance: { withdrawableUsd6: bigint }) => void;
    mocks.switchChain.mockResolvedValue(undefined);
    mocks.getPerpUsdcBalance.mockImplementation(
      () =>
        new Promise<{ withdrawableUsd6: bigint }>((resolve) => {
          resolveBaseline = resolve;
        }),
    );

    const { result } = renderHook(() => useBridgeTest());
    let execution!: Promise<void>;
    const hyperliquidRequest = { ...request, toChainId: 1337 } as const;

    await act(async () => {
      execution = result.current.execute(hyperliquidRequest);
      await vi.waitFor(() => {
        expect(mocks.getPerpUsdcBalance).toHaveBeenCalledWith({ user: USER });
      });
    });

    act(() => {
      result.current.reset();
    });

    await act(async () => {
      resolveBaseline({ withdrawableUsd6: 5000000n });
      await execution;
    });

    expect(mocks.sendTransaction).not.toHaveBeenCalled();
    expect(mocks.sendPreparedTransaction).not.toHaveBeenCalled();
    expect(mocks.waitForBridgeCompletion).not.toHaveBeenCalled();
    expect(mocks.waitForPerpUsdcArrival).not.toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBeNull();
    expect(result.current.quote).toBeNull();
    expect(result.current.sourceTxHash).toBeNull();
    expect(result.current.destinationTxHash).toBeNull();
  });
});
