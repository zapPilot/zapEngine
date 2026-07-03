import { act } from '@testing-library/react';
import { useInvestStrategy } from '@zapengine/app-core/hooks/useInvestStrategy';
import type { DepositPlan } from '@zapengine/types/api';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderHook } from '../../test-utils';

const USER = '0x1111111111111111111111111111111111111111';
const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

const mocks = vi.hoisted(() => {
  const walletClient = {
    account: { address: '0x1111111111111111111111111111111111111111' },
    sendTransaction: vi.fn(),
  };

  return {
    useWalletProvider: vi.fn(),
    getDepositPlan: vi.fn(),
    executeDepositPlan: vi.fn(),
    executeAtomicBatch: vi.fn(),
    getWalletClient: vi.fn(),
    switchChain: vi.fn(),
    getBridgeStatus: vi.fn(),
    walletClient,
  };
});

// Hooks resolve useWalletProvider from walletContext; reuse the
// WalletProvider mock above (module registry returns the mocked module).
vi.mock(
  '@zapengine/app-core/providers/walletContext',
  () => import('@zapengine/app-core/providers/WalletProvider'),
);
vi.mock('@zapengine/app-core/providers/WalletProvider', () => ({
  useWalletProvider: mocks.useWalletProvider,
}));

vi.mock('@zapengine/app-core/services/planOrchestrationService', () => ({
  getDepositPlan: mocks.getDepositPlan,
}));

vi.mock('@zapengine/app-core/lib/wallet/executeDepositPlan', () => ({
  executeDepositPlan: mocks.executeDepositPlan,
}));

vi.mock('@zapengine/app-core/services/intentClient', () => ({
  getBridgeStatus: mocks.getBridgeStatus,
}));

vi.mock('@zapengine/app-core/utils/logger', () => ({
  logger: {
    createContextLogger: () => ({
      info: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

const approveTx = {
  to: BASE_USDC,
  data: '0xaaaa',
  value: '0',
  chainId: 8453,
  gasLimit: '50000',
  meta: { intentType: 'ERC20_APPROVE' },
} as const;

const supplyTx = {
  to: '0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE',
  data: '0x1111',
  value: '0',
  chainId: 8453,
  gasLimit: '300000',
  meta: { intentType: 'SUPPLY' },
} as const;

const ethereumBridgeTx = {
  to: '0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE',
  data: '0x2222',
  value: '0',
  chainId: 8453,
  gasLimit: '450000',
  meta: { intentType: 'BRIDGE' },
} as const;

const arbitrumBridgeTx = {
  to: '0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE',
  data: '0x3333',
  value: '0',
  chainId: 8453,
  gasLimit: '450000',
  meta: { intentType: 'BRIDGE' },
} as const;

const plan: DepositPlan = {
  legs: [
    {
      chainId: 8453,
      kind: 'supply',
      protocol: 'morpho',
      toToken: BASE_USDC,
      fromAmount: '6000',
      toAmountMin: '6000',
      gasUsd: '0.10',
      durationSec: 12,
    },
    {
      chainId: 1,
      kind: 'bridge',
      toToken: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
      fromAmount: '2000',
      toAmountMin: '2000',
      bridge: 'across',
      gasUsd: '0.20',
      durationSec: 3,
    },
    {
      chainId: 42161,
      kind: 'bridge',
      toToken: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
      fromAmount: '2000',
      toAmountMin: '2000',
      bridge: 'relaydepository',
      gasUsd: '0.20',
      durationSec: 1,
    },
  ],
  approvals: [approveTx],
  calls: [supplyTx, ethereumBridgeTx, arbitrumBridgeTx],
  totalGasUsd: '0.5',
  sourceChainId: 8453,
};

describe('useInvestStrategy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useWalletProvider.mockReturnValue({
      account: { address: USER },
      chain: { id: 8453 },
      switchChain: mocks.switchChain,
      getWalletClient: mocks.getWalletClient,
    });
    mocks.getWalletClient.mockResolvedValue(mocks.walletClient);
    mocks.switchChain.mockResolvedValue(undefined);
    mocks.getDepositPlan.mockResolvedValue(plan);
    mocks.executeDepositPlan.mockImplementation(
      async ({ onBundleSubmitted }) => {
        onBundleSubmitted?.('0xbundle');
        return {
          kind: 'eip7702',
          callsId: '0xbundle',
          transactionHash: '0xsource',
        };
      },
    );
    mocks.getBridgeStatus.mockResolvedValue({ status: 'DONE' });
  });

  it('executes backend-provided approvals and three leg calls as one EIP-7702 bundle', async () => {
    const { result } = renderHook(() => useInvestStrategy());

    await act(async () => {
      await result.current.run({ fromToken: BASE_USDC, fromAmount: '10000' });
    });

    expect(mocks.getDepositPlan).toHaveBeenCalledWith({
      kind: 'invest',
      userAddress: USER,
      fromToken: BASE_USDC,
      fromAmount: '10000',
      sourceChainId: 8453,
    });
    expect(mocks.getWalletClient).toHaveBeenCalledWith(8453);
    expect(mocks.executeDepositPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        plan,
        walletClient: mocks.walletClient,
        chainId: 8453,
      }),
    );
    expect(result.current.tier).toBe('eip7702');
    expect(result.current.lastCallsId).toBe('0xbundle');
    expect(result.current.legs.map((leg) => leg.status)).toEqual([
      'submitted',
      'submitted',
      'submitted',
    ]);
  });

  it('does not create a chain RPC wallet client for the Privy atomic path', async () => {
    mocks.useWalletProvider.mockReturnValue({
      account: { address: USER },
      chain: { id: 8453 },
      executeAtomicBatch: mocks.executeAtomicBatch,
      getWalletClient: mocks.getWalletClient,
      switchChain: mocks.switchChain,
    });
    const { result } = renderHook(() => useInvestStrategy());

    await act(async () => {
      await result.current.run({ fromToken: BASE_USDC, fromAmount: '10000' });
    });

    expect(mocks.getWalletClient).not.toHaveBeenCalled();
    expect(mocks.executeDepositPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        plan,
        chainId: 8453,
        executeAtomicBatch: mocks.executeAtomicBatch,
      }),
    );
    expect(mocks.executeDepositPlan.mock.calls[0]?.[0]).not.toHaveProperty(
      'walletClient',
    );
  });

  it('falls back to sequential approval then three leg transactions when atomic batching is unavailable', async () => {
    mocks.executeDepositPlan.mockImplementation(
      async ({ onCallSubmitted, onCallConfirmed }) => {
        onCallSubmitted?.(0, supplyTx);
        onCallConfirmed?.(0, supplyTx, '0xsupplyhash');
        onCallSubmitted?.(1, ethereumBridgeTx);
        onCallConfirmed?.(1, ethereumBridgeTx, '0xethbridgehash');
        onCallSubmitted?.(2, arbitrumBridgeTx);
        onCallConfirmed?.(2, arbitrumBridgeTx, '0xarbbridgehash');
        return {
          kind: 'sequential',
          hashes: [
            '0xapprovehash',
            '0xsupplyhash',
            '0xethbridgehash',
            '0xarbbridgehash',
          ],
        };
      },
    );

    const { result } = renderHook(() => useInvestStrategy());

    await act(async () => {
      await result.current.run({ fromToken: BASE_USDC, fromAmount: '10000' });
    });

    expect(mocks.executeDepositPlan).toHaveBeenCalledTimes(1);
    expect(result.current.tier).toBe('sequential');
    expect(result.current.lastTxHashes).toEqual([
      '0xapprovehash',
      '0xsupplyhash',
      '0xethbridgehash',
      '0xarbbridgehash',
    ]);
  });

  it('switches to Base before fetching the plan when the connected wallet is on another chain', async () => {
    mocks.useWalletProvider.mockReturnValue({
      account: { address: USER },
      chain: { id: 1 },
      switchChain: mocks.switchChain,
      getWalletClient: mocks.getWalletClient,
    });

    const { result } = renderHook(() => useInvestStrategy());

    await act(async () => {
      await result.current.run({ fromToken: BASE_USDC, fromAmount: '10000' });
    });

    expect(mocks.switchChain).toHaveBeenCalledWith(8453);
    expect(mocks.getDepositPlan).toHaveBeenCalledWith({
      kind: 'invest',
      userAddress: USER,
      fromToken: BASE_USDC,
      fromAmount: '10000',
      sourceChainId: 8453,
    });
  });

  it('does not fetch a plan or submit transactions when switching to Base fails', async () => {
    const switchError = new Error('User rejected chain switch');
    mocks.useWalletProvider.mockReturnValue({
      account: { address: USER },
      chain: { id: 1 },
      switchChain: mocks.switchChain,
      getWalletClient: mocks.getWalletClient,
    });
    mocks.switchChain.mockRejectedValueOnce(switchError);

    const { result } = renderHook(() => useInvestStrategy());

    await act(async () => {
      await expect(
        result.current.run({ fromToken: BASE_USDC, fromAmount: '10000' }),
      ).rejects.toThrow('User rejected chain switch');
    });

    expect(mocks.getDepositPlan).not.toHaveBeenCalled();
    expect(mocks.executeDepositPlan).not.toHaveBeenCalled();
    expect(result.current.lastError).toBe(switchError);
  });
});
