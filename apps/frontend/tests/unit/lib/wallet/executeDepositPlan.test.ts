import type { DepositPlan } from '@zapengine/types/api';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { executeDepositPlan } from '@/lib/wallet/executeDepositPlan';

const mocks = vi.hoisted(() => ({
  executeWithEIP7702: vi.fn(),
  waitForEIP7702Confirmation: vi.fn(),
  getPublicClient: vi.fn(),
  waitForTransactionReceipt: vi.fn(),
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
  account: { address: '0x1111111111111111111111111111111111111111' },
  sendTransaction: vi.fn(),
};

describe('executeDepositPlan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPublicClient.mockReturnValue({
      waitForTransactionReceipt: mocks.waitForTransactionReceipt,
    });
    mocks.waitForTransactionReceipt.mockResolvedValue({ status: 'success' });
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

    expect(mocks.executeWithEIP7702).toHaveBeenCalledWith(
      [approvalTx, callTx],
      walletClient,
      { chainId: 8453 },
    );
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

  it('falls back to sequential when the EIP-7702 bundle reverts on-chain', async () => {
    mocks.executeWithEIP7702.mockResolvedValue({
      success: true,
      callsId: '0xbundle',
    });
    mocks.waitForEIP7702Confirmation.mockResolvedValue({ status: 'failure' });
    walletClient.sendTransaction
      .mockResolvedValueOnce('0xapprove')
      .mockResolvedValueOnce('0xcall');
    const onCallConfirmed = vi.fn();

    const result = await executeDepositPlan({
      plan,
      walletClient: walletClient as never,
      chainId: 8453,
      onCallConfirmed,
    });

    expect(mocks.waitForEIP7702Confirmation).toHaveBeenCalledWith(
      '0xbundle',
      walletClient,
    );
    expect(walletClient.sendTransaction).toHaveBeenCalledTimes(2);
    expect(mocks.waitForTransactionReceipt).toHaveBeenCalledTimes(2);
    expect(onCallConfirmed).toHaveBeenCalledWith(0, callTx, '0xcall');
    expect(result).toEqual({
      kind: 'sequential',
      hashes: ['0xapprove', '0xcall'],
    });
  });

  it('returns the submitted EIP-7702 bundle even when calls-status polling is unavailable', async () => {
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
  });

  it('falls back to sequential when the wallet cannot force an atomic batch', async () => {
    mocks.executeWithEIP7702.mockResolvedValue({
      success: false,
      error:
        '`forceAtomic` is not supported on fallback to `eth_sendTransaction`.',
    });
    walletClient.sendTransaction
      .mockResolvedValueOnce('0xapprove')
      .mockResolvedValueOnce('0xcall');
    const onApprovalConfirmed = vi.fn();
    const onCallConfirmed = vi.fn();

    const result = await executeDepositPlan({
      plan,
      walletClient: walletClient as never,
      chainId: 8453,
      onApprovalConfirmed,
      onCallConfirmed,
    });

    expect(walletClient.sendTransaction).toHaveBeenCalledTimes(2);
    expect(mocks.waitForTransactionReceipt).toHaveBeenCalledTimes(2);
    expect(onApprovalConfirmed).toHaveBeenCalledWith(
      0,
      approvalTx,
      '0xapprove',
    );
    expect(onCallConfirmed).toHaveBeenCalledWith(0, callTx, '0xcall');
    expect(result).toEqual({
      kind: 'sequential',
      hashes: ['0xapprove', '0xcall'],
    });
  });

  it('falls back to sequential when the wallet reports atomicity not supported', async () => {
    mocks.executeWithEIP7702.mockResolvedValue({
      success: false,
      error: 'Atomicity not supported by this wallet',
    });
    walletClient.sendTransaction
      .mockResolvedValueOnce('0xapprove')
      .mockResolvedValueOnce('0xcall');

    const result = await executeDepositPlan({
      plan,
      walletClient: walletClient as never,
      chainId: 8453,
    });

    expect(walletClient.sendTransaction).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      kind: 'sequential',
      hashes: ['0xapprove', '0xcall'],
    });
  });

  it('falls back to sequential when the chain is outside the EIP-7702 set', async () => {
    mocks.executeWithEIP7702.mockResolvedValue({
      success: false,
      error: 'Unsupported EIP-7702 chain id: 10',
    });
    walletClient.sendTransaction
      .mockResolvedValueOnce('0xapprove')
      .mockResolvedValueOnce('0xcall');

    const result = await executeDepositPlan({
      plan,
      walletClient: walletClient as never,
      chainId: 10,
    });

    expect(walletClient.sendTransaction).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      kind: 'sequential',
      hashes: ['0xapprove', '0xcall'],
    });
  });

  it('throws (no silent sequential re-prompt) when the user rejects the atomic bundle', async () => {
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
