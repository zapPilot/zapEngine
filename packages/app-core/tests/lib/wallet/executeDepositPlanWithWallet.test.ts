import {
  EIP7702WalletRecoveryError,
  executeDepositPlanWithWallet,
} from '@core/lib/wallet/executeDepositPlan';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  inspectDelegation: vi.fn(),
  executeWithEIP7702: vi.fn(),
  waitForEIP7702Confirmation: vi.fn(),
}));

vi.mock('@core/lib/wallet/eip7702Delegation', () => ({
  inspectDelegation: mocks.inspectDelegation,
}));

vi.mock('@core/services/intentClient', () => ({
  intentEngine: {
    executeWithEIP7702: mocks.executeWithEIP7702,
  },
}));

vi.mock('@zapengine/intent-engine', () => ({
  waitForEIP7702Confirmation: mocks.waitForEIP7702Confirmation,
}));

const plan = {
  approvals: [],
  calls: [
    {
      to: '0x2222222222222222222222222222222222222222',
      data: '0x1234',
      value: '0',
      chainId: 8453,
      meta: { intentType: 'SUPPLY' },
    },
  ],
};

describe('executeDepositPlanWithWallet', () => {
  const walletClient = {
    account: { address: '0x1111111111111111111111111111111111111111' },
  };
  const getWalletClient = vi.fn();

  beforeEach(() => {
    getWalletClient.mockReset().mockResolvedValue(walletClient);
    mocks.inspectDelegation.mockReset().mockResolvedValue({
      kind: 'notDelegated',
    });
    mocks.executeWithEIP7702.mockReset().mockResolvedValue({
      success: true,
      callsId: '0xbundle',
    });
    mocks.waitForEIP7702Confirmation.mockReset().mockResolvedValue({
      status: 'success',
    });
  });

  it('uses the atomic batcher without creating a chain RPC wallet client', async () => {
    const executeAtomicBatch = vi
      .fn()
      .mockResolvedValue({ callsId: '0xbundle', transactionHash: '0xhash' });

    const result = await executeDepositPlanWithWallet({
      plan,
      chainId: 8453,
      getWalletClient,
      executeAtomicBatch,
    });

    expect(getWalletClient).not.toHaveBeenCalled();
    expect(executeAtomicBatch).toHaveBeenCalledWith(plan.calls, 8453);
    expect(result).toEqual({
      kind: 'eip7702',
      callsId: '0xbundle',
      transactionHash: '0xhash',
    });
  });

  it('blocks an unknown delegation before wallet_sendCalls', async () => {
    mocks.inspectDelegation.mockResolvedValue({
      kind: 'delegated',
      label: 'Unrecognized EIP-7702 implementation',
      implementation: '0x0000000000000000000000000000000000000002',
    });

    await expect(
      executeDepositPlanWithWallet({
        plan,
        chainId: 8453,
        getWalletClient,
        externalWalletBrand: 'okx',
      }),
    ).rejects.toMatchObject({ code: 'EIP7702_DELEGATION_MISMATCH' });

    expect(getWalletClient).toHaveBeenCalledWith(8453);
    expect(mocks.executeWithEIP7702).not.toHaveBeenCalled();
  });

  it('blocks Ambire delegation with an OKX connector before wallet_sendCalls', async () => {
    mocks.inspectDelegation.mockResolvedValue({
      kind: 'delegated',
      label: 'Ambire EIP-7702 Delegator',
      walletBrand: 'ambire',
      walletLabel: 'Ambire Wallet',
      implementation: '0x5A7FC11397E9a8AD41BF10bf13F22B0a63f96f6d',
    });

    const execution = executeDepositPlanWithWallet({
      plan,
      chainId: 42161,
      getWalletClient,
      externalWalletBrand: 'okx',
    });

    await expect(execution).rejects.toMatchObject({
      code: 'EIP7702_DELEGATION_MISMATCH',
    });
    await expect(execution).rejects.toThrow(
      'connected wallet is OKX Wallet, but this account',
    );
    await expect(execution).rejects.toThrow('owned by Ambire Wallet');
    expect(mocks.executeWithEIP7702).not.toHaveBeenCalled();
  });

  it.each([
    ['ambire', 'Ambire Wallet'],
    ['okx', 'OKX Wallet'],
    ['metamask', 'MetaMask'],
  ] as const)(
    'allows a matching %s delegation owner',
    async (walletBrand, walletLabel) => {
      mocks.inspectDelegation.mockResolvedValue({
        kind: 'delegated',
        label: `${walletLabel} delegator`,
        walletBrand,
        walletLabel,
        implementation: '0x0000000000000000000000000000000000000002',
      });

      await expect(
        executeDepositPlanWithWallet({
          plan,
          chainId: 8453,
          getWalletClient,
          externalWalletBrand: walletBrand,
        }),
      ).resolves.toEqual({ kind: 'eip7702', callsId: '0xbundle' });

      expect(mocks.executeWithEIP7702).toHaveBeenCalledTimes(1);
    },
  );

  it('allows an undelegated account to let the active wallet establish delegation', async () => {
    await expect(
      executeDepositPlanWithWallet({
        plan,
        chainId: 8453,
        getWalletClient,
        externalWalletBrand: 'okx',
      }),
    ).resolves.toEqual({ kind: 'eip7702', callsId: '0xbundle' });

    expect(mocks.executeWithEIP7702).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['an unrecognized active connector', undefined, false],
    ['a delegation RPC failure', 'okx' as const, true],
  ])('fails closed for %s', async (_, externalWalletBrand, rpcFailure) => {
    if (rpcFailure) {
      mocks.inspectDelegation.mockRejectedValue(new Error('RPC unavailable'));
    }

    await expect(
      executeDepositPlanWithWallet({
        plan,
        chainId: 8453,
        getWalletClient,
        ...(externalWalletBrand ? { externalWalletBrand } : {}),
      }),
    ).rejects.toMatchObject({ code: 'EIP7702_DELEGATION_MISMATCH' });

    expect(mocks.executeWithEIP7702).not.toHaveBeenCalled();
  });

  it('uses known delegation metadata only after the wallet reports incompatibility', async () => {
    mocks.executeWithEIP7702.mockResolvedValue({
      success: false,
      error: 'Unsupported implementation for current delegation',
    });
    mocks.inspectDelegation.mockResolvedValue({
      kind: 'delegated',
      label: 'OKX SmartWalletEntry',
      walletBrand: 'okx',
      walletLabel: 'OKX Wallet',
      implementation: '0xe40ccB2D94975c51bff0C004eFDfd9B3a5796fA4',
    });

    const execution = executeDepositPlanWithWallet({
      plan,
      chainId: 8453,
      getWalletClient,
      externalWalletBrand: 'okx',
    });

    await expect(execution).rejects.toBeInstanceOf(EIP7702WalletRecoveryError);
    await expect(execution).rejects.toThrow('Reconnect with OKX Wallet');
    expect(mocks.inspectDelegation).toHaveBeenCalledWith({
      address: walletClient.account.address,
      chainId: 8453,
    });
  });

  it('preserves user rejection without suggesting a wallet migration', async () => {
    mocks.executeWithEIP7702.mockResolvedValue({
      success: false,
      error: 'User rejected the request (code 4001)',
    });

    await expect(
      executeDepositPlanWithWallet({
        plan,
        chainId: 8453,
        getWalletClient,
        externalWalletBrand: 'okx',
      }),
    ).rejects.toThrow('User rejected the request');

    expect(mocks.inspectDelegation).toHaveBeenCalledTimes(1);
  });
});
