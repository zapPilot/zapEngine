// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { useBridgeTest } from '@core/hooks/useBridgeTest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const USER = '0x1111111111111111111111111111111111111111';
const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const ARBITRUM_USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
const ROUTER = '0x2222222222222222222222222222222222222222';
const SPENDER = '0x3333333333333333333333333333333333333333';
const APPROVAL_HASH = `0x${'0'.repeat(64)}`;
const SOURCE_HASH = `0x${'1'.repeat(64)}`;
const DESTINATION_HASH = `0x${'2'.repeat(64)}`;

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

const bridgeCall = {
  to: ROUTER,
  data: '0x1234',
  value: '0',
  chainId: 8453,
  gasLimit: '100000',
  meta: { intentType: 'BRIDGE' },
};

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
  calls: [bridgeCall],
  providerData: {},
};

const request = {
  fromChainId: 8453,
  toChainId: 42161,
  fromToken: BASE_USDC,
  toToken: ARBITRUM_USDC,
  fromAmount: '10000000',
} as const;

describe('useBridgeTest', () => {
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
    mocks.sendTransaction.mockResolvedValue(SOURCE_HASH);
    mocks.waitForBridgeCompletion.mockResolvedValue({
      status: 'settled',
      sourceTxHash: SOURCE_HASH,
      destinationTxHash: DESTINATION_HASH,
    });
  });

  it('prepares a USDC-only quote through IntentEngine.buildBridge', async () => {
    const { result } = renderHook(() => useBridgeTest());

    await act(async () => {
      await result.current.prepare(request);
    });

    expect(mocks.buildBridge).toHaveBeenCalledWith({
      ...request,
      userAddress: USER,
    });
    expect(result.current.status).toBe('ready');
    expect(result.current.quote?.provider).toBe('across');
  });

  it('executes the bridge and waits for provider-neutral destination completion', async () => {
    const { result } = renderHook(() => useBridgeTest());

    await act(async () => {
      await result.current.execute(request);
    });

    expect(mocks.sendTransaction).toHaveBeenCalledTimes(1);
    expect(mocks.sendTransaction).toHaveBeenCalledWith({
      to: ROUTER,
      data: '0x1234',
      value: 0n,
      chainId: 8453,
      gas: 100000n,
    });
    expect(mocks.waitForBridgeCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'across',
        txHash: SOURCE_HASH,
        fromChain: 8453,
        toChain: 42161,
      }),
    );
    expect(result.current.status).toBe('completed');
    expect(result.current.destinationTxHash).toBe(DESTINATION_HASH);
  });

  it('blocks wallet interaction when the USDC balance is insufficient', async () => {
    mocks.readContract.mockResolvedValue(9_999_999n);
    const { result } = renderHook(() => useBridgeTest());

    await act(async () => {
      await result.current.execute(request);
    });

    expect(result.current.status).toBe('failed');
    expect(result.current.error).toBe(
      'USDC balance is too low for this bridge amount.',
    );
    expect(mocks.estimateGas).not.toHaveBeenCalled();
    expect(mocks.switchChain).not.toHaveBeenCalled();
    expect(mocks.sendTransaction).not.toHaveBeenCalled();
    expect(mocks.waitForBridgeCompletion).not.toHaveBeenCalled();
  });

  it('blocks wallet interaction when native gas is insufficient', async () => {
    mocks.getBalance.mockResolvedValue(99_999_999_999_999n);
    const { result } = renderHook(() => useBridgeTest());

    await act(async () => {
      await result.current.execute(request);
    });

    expect(mocks.estimateGas).toHaveBeenCalledTimes(1);
    expect(mocks.getGasPrice).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('failed');
    expect(result.current.error).toBe(
      'ETH balance is too low to pay bridge and approval gas.',
    );
    expect(mocks.switchChain).not.toHaveBeenCalled();
    expect(mocks.sendTransaction).not.toHaveBeenCalled();
    expect(mocks.waitForBridgeCompletion).not.toHaveBeenCalled();
  });

  it('stops when the USDC approval transaction reverts', async () => {
    mocks.buildBridge.mockResolvedValue({
      ...quote,
      approvals: [
        {
          to: BASE_USDC,
          data: '0x5678',
          value: '0',
          chainId: 8453,
          meta: { intentType: 'BRIDGE_APPROVAL' },
        },
      ],
    });
    mocks.sendTransaction.mockResolvedValue(APPROVAL_HASH);
    mocks.waitForTransactionReceipt.mockResolvedValue({ status: 'reverted' });
    const { result } = renderHook(() => useBridgeTest());

    await act(async () => {
      await result.current.execute(request);
    });

    expect(mocks.sendTransaction).toHaveBeenCalledTimes(1);
    expect(mocks.sendTransaction).toHaveBeenCalledWith({
      to: BASE_USDC,
      data: '0x5678',
      value: 0n,
      chainId: 8453,
    });
    expect(result.current.status).toBe('failed');
    expect(result.current.error).toBe('Bridge approval transaction reverted.');
    expect(mocks.waitForBridgeCompletion).not.toHaveBeenCalled();
  });

  it('stops when the bridge source transaction reverts', async () => {
    mocks.waitForTransactionReceipt.mockResolvedValue({ status: 'reverted' });
    const { result } = renderHook(() => useBridgeTest());

    await act(async () => {
      await result.current.execute(request);
    });

    expect(mocks.sendTransaction).toHaveBeenCalledTimes(1);
    expect(result.current.sourceTxHash).toBe(SOURCE_HASH);
    expect(result.current.status).toBe('failed');
    expect(result.current.error).toBe('Bridge source transaction reverted.');
    expect(mocks.waitForBridgeCompletion).not.toHaveBeenCalled();
  });

  it('exposes provider completion polling failures after source submission', async () => {
    mocks.waitForBridgeCompletion.mockRejectedValue(
      new Error('Bridge completion polling timed out.'),
    );
    const { result } = renderHook(() => useBridgeTest());

    await act(async () => {
      await result.current.execute(request);
    });

    expect(mocks.waitForBridgeCompletion).toHaveBeenCalledTimes(1);
    expect(result.current.sourceTxHash).toBe(SOURCE_HASH);
    expect(result.current.destinationTxHash).toBeNull();
    expect(result.current.status).toBe('failed');
    expect(result.current.error).toBe('Bridge completion polling timed out.');
  });

  it('rejects Hyperliquid as a source before requesting a quote', async () => {
    const { result } = renderHook(() => useBridgeTest());

    await act(async () => {
      await result.current.prepare({
        ...request,
        fromChainId: 1337,
        toChainId: 8453,
      });
    });

    expect(mocks.buildBridge).not.toHaveBeenCalled();
    expect(result.current.status).toBe('failed');
    expect(result.current.error).toContain('outbound');
  });
});
