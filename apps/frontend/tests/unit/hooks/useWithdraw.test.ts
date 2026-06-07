import { act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useWithdraw } from '@/hooks/useWithdraw';

import { renderHook } from '../../test-utils';

const USER = '0x1111111111111111111111111111111111111111';
const VAULT = '0x4444444444444444444444444444444444444444';
const TARGET = '0x5555555555555555555555555555555555555555';
const GM_TOKEN = '0x70d95587d40A2caf56bd97485aB3Eec10Bee6336';
const EXCHANGE_ROUTER = '0x1C3fa76e6E1088bCE750f23a5BFcffa1efEF6A41';

const mocks = vi.hoisted(() => ({
  useWalletProvider: vi.fn(),
  getWithdrawPlan: vi.fn(),
  executeDepositPlan: vi.fn(),
  getWalletClient: vi.fn(),
  switchChain: vi.fn(),
  walletClient: {
    account: { address: '0x1111111111111111111111111111111111111111' },
  },
}));

vi.mock('@/providers/WalletProvider', () => ({
  useWalletProvider: mocks.useWalletProvider,
}));

vi.mock('@/services/planOrchestrationService', () => ({
  getWithdrawPlan: mocks.getWithdrawPlan,
}));

vi.mock('@/lib/wallet/executeDepositPlan', () => ({
  executeDepositPlan: mocks.executeDepositPlan,
}));

vi.mock('@/utils/logger', () => ({
  logger: {
    createContextLogger: () => ({ info: vi.fn(), error: vi.fn() }),
  },
}));

const gmxPlan = {
  legs: [],
  approvals: [
    {
      to: GM_TOKEN,
      data: '0xaaaa',
      value: '0',
      chainId: 42161,
      meta: { intentType: 'APPROVAL' },
    },
  ],
  calls: [
    {
      to: EXCHANGE_ROUTER,
      data: '0xbbbb',
      value: '1000000000000000',
      chainId: 42161,
      meta: { intentType: 'WITHDRAW' },
    },
  ],
  totalGasUsd: '0',
  sourceChainId: 42161,
};

const morphoPlan = {
  legs: [],
  approvals: [],
  calls: [
    {
      to: VAULT,
      data: '0xcccc',
      value: '0',
      chainId: 8453,
      meta: { intentType: 'WITHDRAW' },
    },
    {
      to: '0x7777777777777777777777777777777777777777',
      data: '0xdddd',
      value: '0',
      chainId: 8453,
      meta: { intentType: 'SWAP' },
    },
  ],
  totalGasUsd: '0.05',
  sourceChainId: 8453,
};

describe('useWithdraw', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useWalletProvider.mockReturnValue({
      account: { address: USER },
      chain: { id: 42161 },
      getWalletClient: mocks.getWalletClient,
      switchChain: mocks.switchChain,
    });
    mocks.getWalletClient.mockResolvedValue(mocks.walletClient);
    mocks.switchChain.mockResolvedValue(undefined);
    mocks.executeDepositPlan.mockResolvedValue({
      kind: 'eip7702',
      callsId: '0xbundle',
      transactionHash: '0xhash',
    });
  });

  it('requests a GMX withdraw plan and executes it on Arbitrum', async () => {
    mocks.getWithdrawPlan.mockResolvedValue(gmxPlan);
    const { result } = renderHook(() => useWithdraw());

    await act(async () => {
      await result.current.run({
        kind: 'gmx-v2',
        marketKey: 'eth-usdc',
        gmAmount: '5000',
      });
    });

    expect(mocks.switchChain).not.toHaveBeenCalled();
    expect(mocks.getWithdrawPlan).toHaveBeenCalledWith({
      kind: 'gmx-v2',
      marketKey: 'eth-usdc',
      gmAmount: '5000',
      userAddress: USER,
    });
    expect(mocks.getWalletClient).toHaveBeenCalledWith(42161);
    expect(mocks.executeDepositPlan).toHaveBeenCalledWith(
      expect.objectContaining({ plan: gmxPlan, chainId: 42161 }),
    );
    expect(result.current.tier).toBe('eip7702');
    expect(result.current.lastPlan).toBe(gmxPlan);
    expect(result.current.steps).toHaveLength(2);
  });

  it('switches to the vault chain and forwards toToken for a Morpho withdraw+swap', async () => {
    mocks.getWithdrawPlan.mockResolvedValue(morphoPlan);
    const { result } = renderHook(() => useWithdraw());

    await act(async () => {
      await result.current.run({
        kind: 'morpho',
        vaultAddress: VAULT,
        shareAmount: '1000000000000000000',
        chainId: 8453,
        toToken: TARGET,
      });
    });

    expect(mocks.switchChain).toHaveBeenCalledWith(8453);
    expect(mocks.getWithdrawPlan).toHaveBeenCalledWith({
      kind: 'morpho',
      userAddress: USER,
      vaultAddress: VAULT,
      shareAmount: '1000000000000000000',
      chainId: 8453,
      toToken: TARGET,
    });
    expect(mocks.getWalletClient).toHaveBeenCalledWith(8453);
  });

  it('omits toToken when not provided (redeem-only)', async () => {
    mocks.useWalletProvider.mockReturnValue({
      account: { address: USER },
      chain: { id: 8453 },
      getWalletClient: mocks.getWalletClient,
      switchChain: mocks.switchChain,
    });
    mocks.getWithdrawPlan.mockResolvedValue(morphoPlan);
    const { result } = renderHook(() => useWithdraw());

    await act(async () => {
      await result.current.run({
        kind: 'morpho',
        vaultAddress: VAULT,
        shareAmount: '1000000000000000000',
        chainId: 8453,
      });
    });

    expect(mocks.getWithdrawPlan).toHaveBeenCalledWith({
      kind: 'morpho',
      userAddress: USER,
      vaultAddress: VAULT,
      shareAmount: '1000000000000000000',
      chainId: 8453,
    });
    expect(mocks.switchChain).not.toHaveBeenCalled();
  });
});
