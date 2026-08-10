// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { useBridgeTest } from '@core/hooks/useBridgeTest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const USER = '0x1111111111111111111111111111111111111111';
const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const ARBITRUM_USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
const ROUTER = '0x2222222222222222222222222222222222222222';
const SPENDER = '0x3333333333333333333333333333333333333333';
const SOURCE_HASH = `0x${'1'.repeat(64)}`;
const DESTINATION_HASH = `0x${'2'.repeat(64)}`;

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

describe('useBridgeTest', () => {
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
    mocks.getPublicClient.mockReturnValue({
      readContract: mocks.readContract,
      estimateGas: mocks.estimateGas,
      getBalance: mocks.getBalance,
      getGasPrice: mocks.getGasPrice,
    });
    mocks.executeDepositPlanWithWallet.mockResolvedValue({
      kind: 'eip7702',
      callsId: 'calls-1',
      transactionHash: SOURCE_HASH,
    });
    mocks.waitForBridgeCompletion.mockResolvedValue({
      status: 'DONE',
      receiving: { txHash: DESTINATION_HASH, chainId: 42161 },
    });
  });

  it('prepares a USDC bridge quote through LI.FI', async () => {
    const { result } = renderHook(() => useBridgeTest());

    await act(async () => {
      await result.current.prepare(request);
    });

    expect(mocks.buildBridge).toHaveBeenCalledWith({
      ...request,
      userAddress: USER,
    });
    expect(result.current.status).toBe('ready');
    expect(result.current.quote?.estimate.tool).toBe('eco');
  });

  it('executes the bridge through the atomic EIP-5792/EIP-7702 executor', async () => {
    const { result } = renderHook(() => useBridgeTest());

    await act(async () => {
      await result.current.execute(request);
    });

    expect(mocks.sendTransaction).not.toHaveBeenCalled();
    expect(mocks.executeDepositPlanWithWallet).toHaveBeenCalledWith(
      expect.objectContaining({
        plan: {
          approvals: [],
          calls: [quote.transaction],
        },
        chainId: 8453,
        getWalletClient: mocks.getWalletClient,
      }),
    );
    expect(mocks.waitForBridgeCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        txHash: SOURCE_HASH,
        fromChain: 8453,
        toChain: 42161,
      }),
    );
    expect(result.current.status).toBe('completed');
    expect(result.current.sourceTxHash).toBe(SOURCE_HASH);
    expect(result.current.destinationTxHash).toBe(DESTINATION_HASH);
  });

  it('puts approval before the LI.FI call in the same atomic batch', async () => {
    const approvalTx = {
      to: BASE_USDC,
      data: '0x5678',
      value: '0',
      chainId: 8453,
      meta: { intentType: 'BRIDGE_APPROVAL' },
    };
    mocks.buildBridge.mockResolvedValue({
      ...quote,
      approval: {
        tokenAddress: BASE_USDC,
        spenderAddress: SPENDER,
        amount: request.fromAmount,
      },
    });
    mocks.needsApproval.mockResolvedValue(true);
    mocks.buildApproveTx.mockReturnValue(approvalTx);

    const { result } = renderHook(() => useBridgeTest());
    await act(async () => {
      await result.current.execute(request);
    });

    // Bridge simulation is intentionally skipped before allowance exists;
    // only the approval call is gas-estimated during preflight.
    expect(mocks.estimateGas).toHaveBeenCalledTimes(1);
    expect(mocks.estimateGas).toHaveBeenCalledWith({
      account: USER,
      to: BASE_USDC,
      data: '0x5678',
      value: 0n,
    });
    expect(mocks.executeDepositPlanWithWallet).toHaveBeenCalledWith(
      expect.objectContaining({
        plan: {
          approvals: [approvalTx],
          calls: [quote.transaction],
        },
      }),
    );
    expect(mocks.sendTransaction).not.toHaveBeenCalled();
  });

  it('fails closed when the connected wallet has no atomic execution mode', async () => {
    mocks.useWalletProvider.mockReturnValue({
      account: { address: USER },
      chain: { id: 8453 },
      switchChain: mocks.switchChain,
      sendTransaction: mocks.sendTransaction,
      getWalletClient: mocks.getWalletClient,
    });
    const { result } = renderHook(() => useBridgeTest());

    await act(async () => {
      await result.current.execute(request);
    });

    expect(result.current.status).toBe('failed');
    expect(result.current.error).toContain('atomic EIP-5792 / EIP-7702');
    expect(mocks.executeDepositPlanWithWallet).not.toHaveBeenCalled();
    expect(mocks.sendTransaction).not.toHaveBeenCalled();
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
    expect(mocks.executeDepositPlanWithWallet).not.toHaveBeenCalled();
  });

  it('surfaces atomic execution failures without sequential fallback', async () => {
    mocks.executeDepositPlanWithWallet.mockRejectedValue(
      new Error('wallet_sendCalls rejected the atomic batch.'),
    );
    const { result } = renderHook(() => useBridgeTest());

    await act(async () => {
      await result.current.execute(request);
    });

    expect(result.current.status).toBe('failed');
    expect(result.current.error).toBe(
      'wallet_sendCalls rejected the atomic batch.',
    );
    expect(mocks.sendTransaction).not.toHaveBeenCalled();
    expect(mocks.waitForBridgeCompletion).not.toHaveBeenCalled();
  });

  it('requires a source transaction hash before starting LI.FI tracking', async () => {
    mocks.executeDepositPlanWithWallet.mockResolvedValue({
      kind: 'eip7702',
      callsId: 'calls-without-hash',
    });
    const { result } = renderHook(() => useBridgeTest());

    await act(async () => {
      await result.current.execute(request);
    });

    expect(result.current.status).toBe('failed');
    expect(result.current.error).toContain(
      'did not report its transaction hash',
    );
    expect(mocks.waitForBridgeCompletion).not.toHaveBeenCalled();
  });

  it('exposes LI.FI completion polling failures after atomic source confirmation', async () => {
    mocks.waitForBridgeCompletion.mockRejectedValue(
      new Error('LI.FI completion polling timed out.'),
    );
    const { result } = renderHook(() => useBridgeTest());

    await act(async () => {
      await result.current.execute(request);
    });

    expect(result.current.sourceTxHash).toBe(SOURCE_HASH);
    expect(result.current.status).toBe('failed');
    expect(result.current.error).toBe('LI.FI completion polling timed out.');
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
