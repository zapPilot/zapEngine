import { act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { usePrivyWalletBackend } from '@/hooks/wallet/usePrivyWalletBackend';

import { renderHook } from '../../../test-utils';

const PRIVY_ADDRESS = '0xf8a6b8ce3a6c8F4E5a73600a89aE9A645EAEf940';

const mocks = vi.hoisted(() => ({
  login: vi.fn(),
  logout: vi.fn(),
  getAccessToken: vi.fn(),
  getEthereumProvider: vi.fn(),
  switchChain: vi.fn(),
  sendCalls: vi.fn(),
  waitForCallsStatus: vi.fn(),
  accountApiPost: vi.fn(),
  walletInfo: vi.fn(),
  walletError: vi.fn(),
  privyLinkedAccounts: [] as Record<string, unknown>[],
}));

vi.mock('@privy-io/react-auth', () => ({
  usePrivy: () => ({
    ready: true,
    authenticated: true,
    login: mocks.login,
    logout: mocks.logout,
    getAccessToken: mocks.getAccessToken,
    user: {
      linkedAccounts: mocks.privyLinkedAccounts,
    },
  }),
  useWallets: () => ({
    wallets: [
      {
        walletClientType: 'privy',
        address: PRIVY_ADDRESS,
        chainId: 'eip155:42161',
        getEthereumProvider: mocks.getEthereumProvider,
        switchChain: mocks.switchChain,
      },
    ],
  }),
}));

vi.mock('viem/actions', () => ({
  sendCalls: mocks.sendCalls,
  waitForCallsStatus: mocks.waitForCallsStatus,
}));

vi.mock('@/lib/http', () => ({
  httpUtils: {
    accountApi: {
      post: mocks.accountApiPost,
    },
  },
}));

vi.mock('@/utils', () => ({
  walletLogger: {
    info: mocks.walletInfo,
    error: mocks.walletError,
  },
}));

const approvalTx = {
  to: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  data: '0x095ea7b30000000000000000000000007bfa7c4f149e7415b73bdedfe609237e29cbf34a0000000000000000000000000000000000000000000000000000000000002713',
  value: '0',
  chainId: 8453,
  meta: { intentType: 'ERC20_APPROVE' },
} as const;

const supplyTx = {
  to: '0x7BfA7C4f149E7415b73bdeDfe609237e29CBF34A',
  data: '0x6e553f650000000000000000000000000000000000000000000000000000000000002713000000000000000000000000f8a6b8ce3a6c8f4e5a73600a89ae9a645eaef940',
  value: '0',
  chainId: 8453,
  meta: { intentType: 'SUPPLY' },
} as const;

describe('usePrivyWalletBackend', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getEthereumProvider.mockResolvedValue({ request: vi.fn() });
    mocks.switchChain.mockResolvedValue(undefined);
    mocks.getAccessToken.mockResolvedValue('privy-access-token');
    mocks.privyLinkedAccounts.splice(0, mocks.privyLinkedAccounts.length, {
      type: 'wallet',
      id: 'privy-wallet-id',
      address: PRIVY_ADDRESS,
      chainType: 'ethereum',
      walletClientType: 'privy',
    });
    mocks.accountApiPost.mockResolvedValue({
      transactionId: 'privy-transaction-id',
      caip2: 'eip155:8453',
    });
    mocks.sendCalls.mockResolvedValue({ id: '0xcalls' });
    mocks.waitForCallsStatus.mockResolvedValue({
      status: 'success',
      receipts: [{ transactionHash: '0xtxhash' }],
    });
  });

  it('executes Privy EOA batches through the Privy Wallets API on Base', async () => {
    const { result } = renderHook(() => usePrivyWalletBackend());

    let callsId: string | undefined;
    await act(async () => {
      const execution = await result.current.backend.executeAtomicBatch?.(
        [approvalTx, supplyTx],
        8453,
      );
      callsId = execution?.callsId;
    });

    expect(mocks.switchChain).toHaveBeenCalledWith(8453);
    expect(mocks.getAccessToken).toHaveBeenCalledTimes(1);
    expect(mocks.accountApiPost).toHaveBeenCalledWith(
      '/wallet-execution/privy/send-calls',
      {
        walletId: 'privy-wallet-id',
        walletAddress: PRIVY_ADDRESS,
        chainId: 8453,
        calls: [
          {
            to: approvalTx.to,
            data: approvalTx.data,
            value: '0x0',
          },
          {
            to: supplyTx.to,
            data: supplyTx.data,
            value: '0x0',
          },
        ],
        idempotencyKey: expect.any(String),
      },
      {
        headers: { Authorization: 'Bearer privy-access-token' },
        retries: 0,
      },
    );
    expect(callsId).toBe('privy-transaction-id');
    expect(mocks.getEthereumProvider).not.toHaveBeenCalled();
    expect(mocks.sendCalls).not.toHaveBeenCalled();
    expect(mocks.waitForCallsStatus).not.toHaveBeenCalled();
    expect(mocks.walletInfo).toHaveBeenCalledWith(
      '[privy.executeAtomicBatch] sending Privy Wallets API batch',
      expect.objectContaining({
        chainId: 8453,
        caip2: 'eip155:8453',
        embeddedWalletAddress: PRIVY_ADDRESS,
        transactionCount: 2,
        atomicBatch: expect.objectContaining({
          approvals: [
            expect.objectContaining({
              token: approvalTx.to,
              spender: '0x7BfA7C4f149E7415b73bdeDfe609237e29CBF34A',
              amount: '10003',
            }),
          ],
        }),
      }),
    );
  });

  it('fails before the Privy Wallets API when a transaction targets another chain', async () => {
    const { result } = renderHook(() => usePrivyWalletBackend());

    await act(async () => {
      await expect(
        result.current.backend.executeAtomicBatch?.(
          [{ ...approvalTx, chainId: 42161 }],
          8453,
        ),
      ).rejects.toThrow(
        'Privy EOA atomic batch contains a transaction for chain 42161, expected 8453',
      );
    });

    expect(mocks.accountApiPost).not.toHaveBeenCalled();
  });

  it('fails before submission when the Privy wallet resource id is unavailable', async () => {
    mocks.privyLinkedAccounts[0] = {
      ...mocks.privyLinkedAccounts[0],
      id: null,
    };
    const { result } = renderHook(() => usePrivyWalletBackend());

    await act(async () => {
      await expect(
        result.current.backend.executeAtomicBatch?.(
          [approvalTx, supplyTx],
          8453,
        ),
      ).rejects.toThrow('Privy wallet resource id is unavailable');
    });

    expect(mocks.accountApiPost).not.toHaveBeenCalled();
  });

  it('surfaces Privy Wallets API errors without falling back to a chain RPC', async () => {
    mocks.accountApiPost.mockRejectedValueOnce(
      new Error('Privy API rejected batch'),
    );
    const { result } = renderHook(() => usePrivyWalletBackend());

    await act(async () => {
      await expect(
        result.current.backend.executeAtomicBatch?.(
          [approvalTx, supplyTx],
          8453,
        ),
      ).rejects.toThrow(
        'Privy EOA EIP-7702 atomic batch failed: Privy API rejected batch',
      );
    });

    expect(mocks.getEthereumProvider).not.toHaveBeenCalled();
    expect(mocks.sendCalls).not.toHaveBeenCalled();
  });
});
