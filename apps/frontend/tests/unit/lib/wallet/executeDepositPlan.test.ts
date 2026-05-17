import type { DepositPlan } from '@zapengine/types/api';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { executeDepositPlan } from '@/lib/wallet/executeDepositPlan';

const mocks = vi.hoisted(() => ({
  getExecutionStrategy: vi.fn(),
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
    getExecutionStrategy: mocks.getExecutionStrategy,
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

  it('executes approvals and calls as one EIP-7702 atomic bundle by default when supported', async () => {
    mocks.getExecutionStrategy.mockResolvedValue('eip7702');
    mocks.executeWithEIP7702.mockResolvedValue({
      success: true,
      callsId: '0xbundle',
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

    expect(mocks.getExecutionStrategy).toHaveBeenCalledWith(walletClient, 8453);
    expect(mocks.executeWithEIP7702).toHaveBeenCalledWith(
      [approvalTx, callTx],
      walletClient,
      { chainId: 8453 },
    );
    expect(mocks.waitForEIP7702Confirmation).not.toHaveBeenCalled();
    expect(onBundleSubmitted).toHaveBeenCalledWith('0xbundle');
    expect(onBundleConfirmed).toHaveBeenCalledWith();
    expect(result).toEqual({
      kind: 'eip7702',
      callsId: '0xbundle',
    });
    expect(walletClient.sendTransaction).not.toHaveBeenCalled();
  });

  it('does not fail a submitted EIP-7702 bundle when calls status polling is unavailable', async () => {
    mocks.getExecutionStrategy.mockResolvedValue('eip7702');
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

  it('falls back to sequential when atomic send is explicitly unsupported after a supported capability response', async () => {
    mocks.getExecutionStrategy.mockResolvedValue('eip7702');
    mocks.executeWithEIP7702.mockResolvedValue({
      success: false,
      error: '`forceAtomic` is not supported on fallback to `eth_sendTransaction`.',
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

  it('does not fall back to sequential when the user rejects the atomic bundle', async () => {
    mocks.getExecutionStrategy.mockResolvedValue('eip7702');
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

  it('falls back to sequential execution only when atomic batching is unavailable', async () => {
    mocks.getExecutionStrategy.mockResolvedValue('sequential');
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
});
