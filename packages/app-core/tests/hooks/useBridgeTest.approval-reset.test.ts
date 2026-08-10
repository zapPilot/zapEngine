// @vitest-environment jsdom
import { useBridgeTest } from '@core/hooks/useBridgeTest';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const USER = '0x1111111111111111111111111111111111111111';
const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const ARBITRUM_USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
const ROUTER = '0x2222222222222222222222222222222222222222';
const SPENDER = '0x3333333333333333333333333333333333333333';
const SOURCE_HASH = `0x${'1'.repeat(64)}`;

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
  switchChain: vi.fn(),
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
  approval: {
    tokenAddress: BASE_USDC,
    spenderAddress: SPENDER,
    amount: '10000000',
  },
  estimate: {
    fromAmount: '10000000',
    toAmount: '9950000',
    toAmountMin: '9900000',
    gasCostUsd: '0.01',
    feeCostUsd: '0.04',
    executionDuration: 60,
    tool: 'eco',
  },
};

const request = {
  fromChainId: 8453,
  toChainId: 42161,
  fromToken: BASE_USDC,
  toToken: ARBITRUM_USDC,
  fromAmount: '10000000',
} as const;

describe('useBridgeTest reset around atomic approval batch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useWalletProvider.mockReturnValue({
      account: { address: USER },
      chain: { id: 8453 },
      switchChain: mocks.switchChain,
      getWalletClient: mocks.getWalletClient,
      executionMode: 'eip7702',
    });
    mocks.buildBridge.mockResolvedValue(quote);
    mocks.needsApproval.mockResolvedValue(true);
    mocks.buildApproveTx.mockReturnValue({
      to: BASE_USDC,
      data: '0x5678',
      value: '0',
      chainId: 8453,
      meta: { intentType: 'BRIDGE_APPROVAL' },
    });
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

  it('does not continue after approval lookup resolves following reset', async () => {
    let resolveApproval!: (needed: boolean) => void;
    mocks.needsApproval.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          resolveApproval = resolve;
        }),
    );

    const { result } = renderHook(() => useBridgeTest());
    let execution!: Promise<void>;
    await act(async () => {
      execution = result.current.execute(request);
      await vi.waitFor(() =>
        expect(mocks.needsApproval).toHaveBeenCalledOnce(),
      );
    });

    act(() => result.current.reset());
    await act(async () => {
      resolveApproval(true);
      await execution;
    });

    expect(mocks.readContract).not.toHaveBeenCalled();
    expect(mocks.executeDepositPlanWithWallet).not.toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
    expect(result.current.sourceTxHash).toBeNull();
  });

  it('keeps reset authoritative when atomic batch confirmation resolves later', async () => {
    let resolveAtomic!: (value: {
      kind: 'eip7702';
      callsId: string;
      transactionHash: string;
    }) => void;
    mocks.executeDepositPlanWithWallet.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveAtomic = resolve;
        }),
    );

    const { result } = renderHook(() => useBridgeTest());
    let execution!: Promise<void>;
    await act(async () => {
      execution = result.current.execute(request);
      await vi.waitFor(() =>
        expect(mocks.executeDepositPlanWithWallet).toHaveBeenCalledOnce(),
      );
    });

    expect(result.current.status).toBe('awaitingBridgeSignature');
    act(() => result.current.reset());

    await act(async () => {
      resolveAtomic({
        kind: 'eip7702',
        callsId: 'calls-1',
        transactionHash: SOURCE_HASH,
      });
      await execution;
    });

    expect(mocks.waitForBridgeCompletion).not.toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBeNull();
    expect(result.current.sourceTxHash).toBeNull();
  });
});
