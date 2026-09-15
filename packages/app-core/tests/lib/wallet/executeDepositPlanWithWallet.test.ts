import {
  assertEIP7702DelegationCompatibility,
  EIP7702WalletRecoveryError,
  executeDepositPlan,
  executeDepositPlanWithWallet,
  isEIP7702WalletRecoveryError,
  submitPreparedTransactionsWithEIP7702,
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

  it('returns atomic submissions with and without transaction hashes and invokes callbacks correctly', async () => {
    const onBundleSubmitted = vi.fn();
    const onBundleConfirmed = vi.fn();
    const withHash = vi.fn().mockResolvedValue({
      callsId: 'calls-with-hash',
      transactionHash: '0xhash',
    });
    await expect(
      executeDepositPlan({
        plan,
        chainId: 8453,
        executeAtomicBatch: withHash,
        onBundleSubmitted,
        onBundleConfirmed,
      }),
    ).resolves.toEqual({
      kind: 'eip7702',
      callsId: 'calls-with-hash',
      transactionHash: '0xhash',
    });
    expect(onBundleSubmitted).toHaveBeenCalledWith('calls-with-hash');
    expect(onBundleConfirmed).toHaveBeenCalledWith('0xhash');

    onBundleConfirmed.mockClear();
    const withoutHash = vi.fn().mockResolvedValue({ callsId: 'calls-only' });
    await expect(
      executeDepositPlan({
        plan,
        chainId: 8453,
        executeAtomicBatch: withoutHash,
        onBundleConfirmed,
      }),
    ).resolves.toEqual({ kind: 'eip7702', callsId: 'calls-only' });
    expect(onBundleConfirmed).not.toHaveBeenCalled();
  });

  it('requires a wallet client and a connected wallet account for generic execution', async () => {
    await expect(
      executeDepositPlan({
        plan,
        chainId: 8453,
        externalWalletBrand: 'okx',
      }),
    ).rejects.toThrow('Wallet client is required');

    await expect(
      executeDepositPlan({
        plan,
        chainId: 8453,
        walletClient: { account: undefined } as never,
        externalWalletBrand: 'okx',
      }),
    ).rejects.toThrow('Wallet client has no connected account');
  });

  it('accepts string wallet accounts in addition to account objects', async () => {
    const stringAccountClient = {
      account: '0x1111111111111111111111111111111111111111',
    } as never;
    await expect(
      executeDepositPlan({
        plan,
        chainId: 8453,
        walletClient: stringAccountClient,
        externalWalletBrand: 'okx',
      }),
    ).resolves.toEqual({ kind: 'eip7702', callsId: '0xbundle' });
    expect(mocks.inspectDelegation).toHaveBeenCalledWith({
      address: '0x1111111111111111111111111111111111111111',
      chainId: 8453,
    });
  });

  it('surfaces submitted bundles when calls-status lookup is unavailable', async () => {
    mocks.waitForEIP7702Confirmation.mockRejectedValue(
      new Error('wallet_getCallsStatus unsupported'),
    );
    const onBundleSubmitted = vi.fn();
    const onBundleConfirmed = vi.fn();

    await expect(
      executeDepositPlan({
        plan,
        chainId: 8453,
        walletClient: walletClient as never,
        externalWalletBrand: 'okx',
        onBundleSubmitted,
        onBundleConfirmed,
      }),
    ).resolves.toEqual({ kind: 'eip7702', callsId: '0xbundle' });
    expect(onBundleSubmitted).toHaveBeenCalledWith('0xbundle');
    expect(onBundleConfirmed).toHaveBeenCalledWith();
  });

  it('returns confirmed bundle hashes when confirmation succeeds', async () => {
    mocks.waitForEIP7702Confirmation.mockResolvedValue({
      status: 'success',
      transactionHash: '0xconfirmed',
    });
    const onBundleConfirmed = vi.fn();
    await expect(
      executeDepositPlan({
        plan,
        chainId: 8453,
        walletClient: walletClient as never,
        externalWalletBrand: 'okx',
        onBundleConfirmed,
      }),
    ).resolves.toEqual({
      kind: 'eip7702',
      callsId: '0xbundle',
      transactionHash: '0xconfirmed',
    });
    expect(onBundleConfirmed).toHaveBeenCalledWith('0xconfirmed');
  });

  it('omits transactionHash when success confirmation has none', async () => {
    mocks.waitForEIP7702Confirmation.mockResolvedValue({ status: 'success' });
    await expect(
      executeDepositPlan({
        plan,
        chainId: 8453,
        walletClient: walletClient as never,
        externalWalletBrand: 'okx',
      }),
    ).resolves.toEqual({ kind: 'eip7702', callsId: '0xbundle' });
  });

  it('reports failed on-chain bundles with current delegation diagnostics', async () => {
    mocks.waitForEIP7702Confirmation.mockResolvedValue({ status: 'failed' });
    mocks.inspectDelegation
      .mockResolvedValueOnce({ kind: 'notDelegated' })
      .mockResolvedValueOnce({
        kind: 'delegated',
        label: 'OKX SmartWalletEntry',
        walletBrand: 'okx',
        walletLabel: 'OKX Wallet',
        implementation: '0x0000000000000000000000000000000000000002',
      });

    await expect(
      executeDepositPlan({
        plan,
        chainId: 8453,
        walletClient: walletClient as never,
        externalWalletBrand: 'okx',
      }),
    ).rejects.toThrow('Current delegation: OKX SmartWalletEntry');
  });

  it('falls back to not-delegated diagnostics when post-failure inspection fails', async () => {
    mocks.waitForEIP7702Confirmation.mockResolvedValue({ status: 'failed' });
    mocks.inspectDelegation
      .mockResolvedValueOnce({ kind: 'notDelegated' })
      .mockRejectedValueOnce(new Error('rpc down'));
    await expect(
      executeDepositPlan({
        plan,
        chainId: 8453,
        walletClient: walletClient as never,
        externalWalletBrand: 'okx',
      }),
    ).rejects.toThrow('no EIP-7702 delegation detected');
  });

  it.each([
    'Atomicity not supported',
    'wallet_sendCalls method not found',
    'delegate implementation mismatch',
    'invalid signature authorization',
  ])('maps compatibility error "%s" to wallet recovery', async (message) => {
    mocks.executeWithEIP7702.mockResolvedValue({
      success: false,
      error: message,
    });
    mocks.inspectDelegation.mockResolvedValue({ kind: 'notDelegated' });
    await expect(
      executeDepositPlan({
        plan,
        chainId: 8453,
        walletClient: walletClient as never,
        externalWalletBrand: 'okx',
      }),
    ).rejects.toBeInstanceOf(EIP7702WalletRecoveryError);
  });

  it('falls back to the generic batch error when no error string is supplied', async () => {
    mocks.executeWithEIP7702.mockResolvedValue({ success: false });
    await expect(
      executeDepositPlan({
        plan,
        chainId: 8453,
        walletClient: walletClient as never,
        externalWalletBrand: 'okx',
      }),
    ).rejects.toThrow('failed to return a calls bundle id');
  });

  it('validates prepared batches and exposes the returned calls id', async () => {
    await expect(
      submitPreparedTransactionsWithEIP7702({
        transactions: [],
        walletClient: walletClient as never,
        chainId: 8453,
      }),
    ).rejects.toThrow('Cannot execute empty transaction array');

    await expect(
      submitPreparedTransactionsWithEIP7702({
        transactions: plan.calls as never,
        walletClient: walletClient as never,
        chainId: 8453,
      }),
    ).resolves.toEqual({ callsId: '0xbundle' });

    mocks.executeWithEIP7702.mockResolvedValue({ success: false });
    await expect(
      submitPreparedTransactionsWithEIP7702({
        transactions: plan.calls as never,
        walletClient: walletClient as never,
        chainId: 8453,
      }),
    ).rejects.toThrow('failed to return a calls bundle id');
  });

  it('exposes wallet recovery error type guards and original wallet labels', () => {
    const error = new EIP7702WalletRecoveryError({
      kind: 'delegated',
      label: 'Ambire delegation',
      walletBrand: 'ambire',
      walletLabel: 'Ambire Wallet',
      implementation: '0x0000000000000000000000000000000000000002',
    });
    expect(error.originalWalletLabel).toBe('Ambire Wallet');
    expect(isEIP7702WalletRecoveryError(error)).toBe(true);
    expect(isEIP7702WalletRecoveryError(new Error('nope'))).toBe(false);
  });

  it('fails compatibility checks for unknown wallets and inspection failures', async () => {
    await expect(
      assertEIP7702DelegationCompatibility({
        address: walletClient.account.address as never,
        chainId: 8453,
        activeWalletBrand: undefined,
      }),
    ).rejects.toThrow('could not identify the active browser wallet');

    mocks.inspectDelegation.mockRejectedValue(new Error('rpc down'));
    await expect(
      assertEIP7702DelegationCompatibility({
        address: walletClient.account.address as never,
        chainId: 8453,
        activeWalletBrand: 'okx',
      }),
    ).rejects.toThrow('could not verify this account');
  });
});
