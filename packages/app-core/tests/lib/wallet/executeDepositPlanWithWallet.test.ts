import { executeDepositPlanWithWallet } from '@core/lib/wallet/executeDepositPlan';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  inspectDelegation: vi.fn(),
}));

vi.mock('@core/lib/wallet/eip7702Delegation', () => ({
  inspectDelegation: mocks.inspectDelegation,
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
  const getWalletClient = vi.fn();

  beforeEach(() => {
    mocks.inspectDelegation.mockReset().mockResolvedValue({
      kind: 'delegated',
      compatibility: 'unsupported',
      label: 'Another wallet',
      implementation: '0x0000000000000000000000000000000000000001',
    });
    getWalletClient.mockReset().mockResolvedValue({
      account: { address: '0x1111111111111111111111111111111111111111' },
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

  it('resolves a chain RPC wallet client for the generic EIP-7702 path', async () => {
    // The unsupported-delegation pre-flight (mocked above) proves the resolved
    // wallet client actually reached executeDepositPlan.
    await expect(
      executeDepositPlanWithWallet({
        plan,
        chainId: 8453,
        getWalletClient,
      }),
    ).rejects.toThrow('This account is EIP-7702 delegated');

    expect(getWalletClient).toHaveBeenCalledWith(8453);
  });

  it('fails closed when the account uses an unknown EIP-7702 delegate', async () => {
    mocks.inspectDelegation.mockResolvedValue({
      kind: 'delegated',
      compatibility: 'unknown',
      label: 'Unknown EIP-7702 implementation',
      implementation: '0x0000000000000000000000000000000000000002',
    });

    await expect(
      executeDepositPlanWithWallet({
        plan,
        chainId: 8453,
        getWalletClient,
      }),
    ).rejects.toThrow('This account is EIP-7702 delegated');
  });
});
