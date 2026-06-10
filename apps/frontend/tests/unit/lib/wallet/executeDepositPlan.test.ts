import type { DepositPlan } from '@zapengine/types/api';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { executeDepositPlan } from '@/lib/wallet/executeDepositPlan';

const mocks = vi.hoisted(() => ({
  executeWithEIP7702: vi.fn(),
  waitForEIP7702Confirmation: vi.fn(),
  getPublicClient: vi.fn(),
  getCode: vi.fn(),
}));

vi.mock('@zapengine/intent-engine', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@zapengine/intent-engine')>();
  return {
    ...actual,
    waitForEIP7702Confirmation: mocks.waitForEIP7702Confirmation,
  };
});

vi.mock('@/services/intentClient', () => ({
  intentEngine: {
    executeWithEIP7702: mocks.executeWithEIP7702,
  },
  getPublicClient: mocks.getPublicClient,
}));

const accountAddress = '0x1111111111111111111111111111111111111111';
const ambireDelegate = '0x5A7FC11397E9a8AD41BF10bf13F22B0a63f96f6d';
const metamaskDelegate = '0x63c0c19a282a1B52b07dD5a65b58948A07DAE32B';
const unknownDelegate = '0x4444444444444444444444444444444444444444';

function delegatedCode(implementation: string): `0x${string}` {
  return `0xef0100${implementation.slice(2)}` as `0x${string}`;
}

const approvalTx = {
  to: '0x2222222222222222222222222222222222222222',
  data: '0xaaaa',
  value: '0',
  chainId: 8453,
  meta: { intentType: 'ERC20_APPROVE' },
};

const callTx = {
  to: '0x3333333333333333333333333333333333333333',
  data: '0xbbbb',
  value: '0',
  chainId: 8453,
  meta: { intentType: 'SUPPLY' },
};

const plan: DepositPlan = {
  legs: [
    {
      chainId: 8453,
      kind: 'supply',
      protocol: 'morpho',
      toToken: '0x2222222222222222222222222222222222222222',
      fromAmount: '1000',
      toAmountMin: '1000',
      gasUsd: '0',
      durationSec: 0,
    },
  ],
  approvals: [approvalTx],
  calls: [callTx],
  totalGasUsd: '0',
  sourceChainId: 8453,
};

const walletClient = {
  account: { address: accountAddress },
  sendTransaction: vi.fn(),
};

describe('executeDepositPlan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPublicClient.mockReturnValue({
      getCode: mocks.getCode,
    });
    mocks.getCode.mockResolvedValue('0x');
  });

  it('rejects before preflight when the wallet client has no connected account', async () => {
    await expect(
      executeDepositPlan({
        plan,
        walletClient: { sendTransaction: vi.fn() } as never,
        chainId: 8453,
      }),
    ).rejects.toThrow('Wallet client has no connected account');

    expect(mocks.getCode).not.toHaveBeenCalled();
    expect(mocks.executeWithEIP7702).not.toHaveBeenCalled();
  });

  it('blocks a known incompatible on-chain delegation before submitting', async () => {
    mocks.getCode.mockResolvedValue(delegatedCode(metamaskDelegate));

    await expect(
      executeDepositPlan({
        plan,
        walletClient: walletClient as never,
        chainId: 8453,
      }),
    ).rejects.toThrow(
      `This account is EIP-7702 delegated to MetaMask EIP-7702 Delegator (${metamaskDelegate})`,
    );

    expect(mocks.getCode).toHaveBeenCalledWith({ address: accountAddress });
    expect(mocks.executeWithEIP7702).not.toHaveBeenCalled();
  });

  it('allows a supported Ambire delegation to submit atomically', async () => {
    mocks.getCode.mockResolvedValue(delegatedCode(ambireDelegate));
    mocks.executeWithEIP7702.mockResolvedValue({
      success: true,
      callsId: '0xbundle',
    });
    mocks.waitForEIP7702Confirmation.mockResolvedValue({
      status: 'success',
      transactionHash: '0xreceipt',
    });

    const result = await executeDepositPlan({
      plan,
      walletClient: walletClient as never,
      chainId: 8453,
    });

    expect(mocks.executeWithEIP7702).toHaveBeenCalledWith(
      [approvalTx, callTx],
      walletClient,
      { chainId: 8453 },
    );
    expect(result).toEqual({
      kind: 'eip7702',
      callsId: '0xbundle',
      transactionHash: '0xreceipt',
    });
    expect(walletClient.sendTransaction).not.toHaveBeenCalled();
  });

  it('prefers a wallet-provided atomic batch executor over wallet_sendCalls', async () => {
    const executeAtomicBatch = vi.fn().mockResolvedValue({
      callsId: '0xuserop',
      transactionHash: '0xreceipt',
    });
    const onBundleSubmitted = vi.fn();
    const onBundleConfirmed = vi.fn();

    const result = await executeDepositPlan({
      plan,
      walletClient: walletClient as never,
      chainId: 8453,
      executeAtomicBatch,
      onBundleSubmitted,
      onBundleConfirmed,
    });

    expect(executeAtomicBatch).toHaveBeenCalledWith([approvalTx, callTx], 8453);
    expect(mocks.getCode).not.toHaveBeenCalled();
    expect(mocks.executeWithEIP7702).not.toHaveBeenCalled();
    expect(onBundleSubmitted).toHaveBeenCalledWith('0xuserop');
    expect(onBundleConfirmed).toHaveBeenCalledWith('0xreceipt');
    expect(result).toEqual({
      kind: 'eip7702',
      callsId: '0xuserop',
      transactionHash: '0xreceipt',
    });
  });

  it('does not require a provider or mark an unconfirmed atomic batch as confirmed', async () => {
    const executeAtomicBatch = vi.fn().mockResolvedValue({
      callsId: 'privy-transaction-id',
    });
    const onBundleSubmitted = vi.fn();
    const onBundleConfirmed = vi.fn();

    const result = await executeDepositPlan({
      plan,
      chainId: 8453,
      executeAtomicBatch,
      onBundleSubmitted,
      onBundleConfirmed,
    });

    expect(executeAtomicBatch).toHaveBeenCalledWith([approvalTx, callTx], 8453);
    expect(mocks.getCode).not.toHaveBeenCalled();
    expect(mocks.executeWithEIP7702).not.toHaveBeenCalled();
    expect(onBundleSubmitted).toHaveBeenCalledWith('privy-transaction-id');
    expect(onBundleConfirmed).not.toHaveBeenCalled();
    expect(result).toEqual({
      kind: 'eip7702',
      callsId: 'privy-transaction-id',
    });
  });

  it('allows an unknown delegated implementation instead of hard-failing', async () => {
    mocks.getCode.mockResolvedValue(delegatedCode(unknownDelegate));
    mocks.executeWithEIP7702.mockResolvedValue({
      success: true,
      callsId: '0xbundle',
    });
    mocks.waitForEIP7702Confirmation.mockRejectedValue(
      new Error('wallet_getCallsStatus unsupported'),
    );

    await expect(
      executeDepositPlan({
        plan,
        walletClient: walletClient as never,
        chainId: 8453,
      }),
    ).resolves.toEqual({
      kind: 'eip7702',
      callsId: '0xbundle',
    });
    expect(mocks.executeWithEIP7702).toHaveBeenCalledTimes(1);
  });

  it('waits for the bundle receipt and confirms with the tx hash on success', async () => {
    mocks.executeWithEIP7702.mockResolvedValue({
      success: true,
      callsId: '0xbundle',
    });
    mocks.waitForEIP7702Confirmation.mockResolvedValue({
      status: 'success',
      transactionHash: '0xreceipt',
    });
    const onBundleSubmitted = vi.fn();
    const onBundleConfirmed = vi.fn();

    const result = await executeDepositPlan({
      plan,
      walletClient: walletClient as never,
      chainId: 8453,
      onBundleSubmitted,
      onBundleConfirmed,
    });

    expect(mocks.waitForEIP7702Confirmation).toHaveBeenCalledWith(
      '0xbundle',
      walletClient,
    );
    expect(onBundleSubmitted).toHaveBeenCalledWith('0xbundle');
    expect(onBundleConfirmed).toHaveBeenCalledWith('0xreceipt');
    expect(result).toEqual({
      kind: 'eip7702',
      callsId: '0xbundle',
      transactionHash: '0xreceipt',
    });
    expect(walletClient.sendTransaction).not.toHaveBeenCalled();
  });

  it('returns the submitted EIP-7702 bundle when calls-status polling is unavailable', async () => {
    mocks.executeWithEIP7702.mockResolvedValue({
      success: true,
      callsId: '0xbundle',
    });
    mocks.waitForEIP7702Confirmation.mockRejectedValue(
      new Error('wallet_getCallsStatus unsupported'),
    );

    await expect(
      executeDepositPlan({
        plan,
        walletClient: walletClient as never,
        chainId: 8453,
      }),
    ).resolves.toEqual({
      kind: 'eip7702',
      callsId: '0xbundle',
    });
    expect(walletClient.sendTransaction).not.toHaveBeenCalled();
  });

  it('throws loudly when the atomic bundle fails on-chain', async () => {
    mocks.getCode
      .mockResolvedValueOnce('0x')
      .mockResolvedValueOnce(delegatedCode(metamaskDelegate));
    mocks.executeWithEIP7702.mockResolvedValue({
      success: true,
      callsId: '0xbundle',
    });
    mocks.waitForEIP7702Confirmation.mockResolvedValue({ status: 'failure' });

    await expect(
      executeDepositPlan({
        plan,
        walletClient: walletClient as never,
        chainId: 8453,
      }),
    ).rejects.toThrow(
      `EIP-7702 bundle 0xbundle failed on-chain. Current delegation: MetaMask EIP-7702 Delegator (${metamaskDelegate})`,
    );

    expect(mocks.getCode).toHaveBeenCalledTimes(2);
    expect(walletClient.sendTransaction).not.toHaveBeenCalled();
  });

  it('surfaces a needs-EIP-7702-wallet error when the wallet cannot batch atomically', async () => {
    mocks.executeWithEIP7702.mockResolvedValue({
      success: false,
      error:
        '`forceAtomic` is not supported on fallback to `eth_sendTransaction`.',
    });

    await expect(
      executeDepositPlan({
        plan,
        walletClient: walletClient as never,
        chainId: 8453,
      }),
    ).rejects.toThrow(/Ambire or OKX/);
    expect(walletClient.sendTransaction).not.toHaveBeenCalled();
  });

  it('rethrows non-atomic wallet errors without falling back sequentially', async () => {
    mocks.executeWithEIP7702.mockResolvedValue({
      success: false,
      error: 'User rejected request',
    });

    await expect(
      executeDepositPlan({
        plan,
        walletClient: walletClient as never,
        chainId: 8453,
      }),
    ).rejects.toThrow('User rejected request');
    expect(walletClient.sendTransaction).not.toHaveBeenCalled();
  });
});
