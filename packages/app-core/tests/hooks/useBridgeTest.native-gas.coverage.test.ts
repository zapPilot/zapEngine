// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { useBridgeTest } from '@core/hooks/useBridgeTest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const USER = '0x1111111111111111111111111111111111111111';
const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const ARBITRUM_USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
const ROUTER = '0x2222222222222222222222222222222222222222';

const mocks = vi.hoisted(() => ({
  buildBridge: vi.fn(),
  getPublicClient: vi.fn(),
  executeDepositPlanWithWallet: vi.fn(),
  waitForBridgeCompletion: vi.fn(),
  needsApproval: vi.fn(),
  buildApproveTx: vi.fn(),
  getHyperCoreSpendableUsdc: vi.fn(),
  waitForHyperCoreUsdcArrival: vi.fn(),
  readContract: vi.fn(),
  estimateGas: vi.fn(),
  getBalance: vi.fn(),
  getGasPrice: vi.fn(),
}));

vi.mock('@core/providers/walletContext', () => ({
  useWalletProvider: () => ({
    account: { address: USER },
    chain: { id: 8453 },
    switchChain: vi.fn(),
    getWalletClient: vi.fn(),
    executionMode: 'eip7702',
  }),
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
  getHyperCoreSpendableUsdc: mocks.getHyperCoreSpendableUsdc,
  waitForHyperCoreUsdcArrival: mocks.waitForHyperCoreUsdcArrival,
}));

vi.mock('@zapengine/intent-engine', () => ({
  HYPERCORE_CHAIN_ID: 1337,
  needsApproval: mocks.needsApproval,
  buildApproveTx: mocks.buildApproveTx,
}));

describe('useBridgeTest native gas preflight coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.buildBridge.mockResolvedValue({
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
    });
    mocks.needsApproval.mockResolvedValue(false);
    mocks.readContract.mockResolvedValue(100000000n);
    mocks.estimateGas.mockResolvedValue(100000n);
    mocks.getBalance.mockResolvedValue(0n);
    mocks.getGasPrice.mockResolvedValue(1_000_000_000n);
    mocks.getPublicClient.mockReturnValue({
      readContract: mocks.readContract,
      estimateGas: mocks.estimateGas,
      getBalance: mocks.getBalance,
      getGasPrice: mocks.getGasPrice,
    });
  });

  it('blocks bridge execution when native balance cannot pay estimated gas', async () => {
    const { result } = renderHook(() => useBridgeTest());

    await act(async () => {
      await result.current.execute({
        fromChainId: 8453,
        toChainId: 42161,
        fromToken: BASE_USDC,
        toToken: ARBITRUM_USDC,
        fromAmount: '10000000',
      });
    });

    expect(result.current.status).toBe('failed');
    expect(result.current.error).toBe(
      'ETH balance is too low to pay bridge and approval gas.',
    );
    expect(mocks.executeDepositPlanWithWallet).not.toHaveBeenCalled();
  });
});
