import { act, waitFor } from '@testing-library/react';
import { decodeFunctionData, erc20Abi } from 'viem';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { usePrivyWalletBackend } from '@/hooks/wallet/usePrivyWalletBackend';

import { renderHook } from '../../../test-utils';

const PRIVY_ADDRESS = '0xf8a6b8ce3a6c8F4E5a73600a89aE9A645EAEf940';

const mocks = vi.hoisted(() => {
  const getEthereumProvider = vi.fn();
  const providerRequest = vi.fn();
  const switchChain = vi.fn();

  return {
    login: vi.fn(),
    logout: vi.fn(),
    getAccessToken: vi.fn(),
    generateAuthorizationSignature: vi.fn(),
    getEthereumProvider,
    switchChain,
    sendCalls: vi.fn(),
    waitForCallsStatus: vi.fn(),
    accountApiPost: vi.fn(),
    walletInfo: vi.fn(),
    walletError: vi.fn(),
    providerRequest,
    privyLinkedAccounts: [] as Record<string, unknown>[],
    privyWallets: [] as Record<string, unknown>[],
    usePrivy: vi.fn(() => ({
      ready: true,
      authenticated: true,
      login: mocks.login,
      logout: mocks.logout,
      getAccessToken: mocks.getAccessToken,
      user: {
        linkedAccounts: mocks.privyLinkedAccounts,
      },
    })),
    useWallets: vi.fn(() => ({
      wallets: [...mocks.privyWallets],
    })),
  };
});

vi.mock('@privy-io/react-auth', () => ({
  usePrivy: mocks.usePrivy,
  useWallets: mocks.useWallets,
  useAuthorizationSignature: () => ({
    generateAuthorizationSignature: mocks.generateAuthorizationSignature,
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

const RISK_HASH = `0x${'2'.repeat(64)}`;

function passedPreview(overrides: Record<string, unknown> = {}) {
  return {
    status: 'passed',
    chainId: 8453,
    walletAddress: PRIVY_ADDRESS,
    calls: [
      {
        index: 0,
        to: approvalTx.to,
        data: approvalTx.data,
        value: '0',
        method: 'approve',
        status: 'succeeded',
        gasUsed: '21000',
        error: null,
        contractVerified: true,
      },
    ],
    assetChanges: [],
    approvals: [],
    contracts: [],
    warnings: [],
    blockNumber: 123,
    callGas: '21000',
    simulationIds: ['sim-1'],
    shareUrls: [],
    simulationFingerprint: `0x${'1'.repeat(64)}`,
    riskHash: RISK_HASH,
    previewId: 'mock-preview-id',
    batchHash: `0x${'3'.repeat(64)}`,
    typedDataPayload: {
      domain: {
        name: 'ZapPilot',
        version: '1',
        chainId: 8453,
        verifyingContract: '0x0000000000000000000000000000000000000000',
      },
      types: {
        ZapPilotIntent: [{ name: 'nonce', type: 'uint256' }],
      },
      primaryType: 'ZapPilotIntent',
      message: { nonce: 0 },
    },
    expiresAt: Date.now() + 300000,
    authorizationPayload: 'c2VydmVyLWZvcm1hdHRlZC1wYXlsb2Fk',
    requestExpiry: 1_800_000_000_000,
    ...overrides,
  };
}

function deferred<T>() {
  let resolvePromise!: (value: T) => void;
  let rejectPromise!: (error: unknown) => void;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}

function unavailablePreview() {
  const {
    previewId: _previewId,
    batchHash: _batchHash,
    typedDataPayload: _typedDataPayload,
    expiresAt: _expiresAt,
    authorizationPayload: _authorizationPayload,
    requestExpiry: _requestExpiry,
    ...evidence
  } = passedPreview();
  return {
    ...evidence,
    status: 'unavailable',
    unavailableReason: 'Tenderly simulation timed out',
  };
}

describe('usePrivyWalletBackend', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.accountApiPost.mockReset();
    mocks.providerRequest.mockReset();
    mocks.providerRequest.mockResolvedValue('mock-user-eip712-signature');
    mocks.getEthereumProvider.mockResolvedValue({
      request: mocks.providerRequest,
    });
    mocks.switchChain.mockResolvedValue(undefined);
    mocks.getAccessToken.mockResolvedValue('privy-access-token');
    mocks.generateAuthorizationSignature.mockResolvedValue({
      signature: 'base64-authorization-signature',
    });
    mocks.usePrivy.mockReturnValue({
      ready: true,
      authenticated: true,
      login: mocks.login,
      logout: mocks.logout,
      getAccessToken: mocks.getAccessToken,
      user: {
        linkedAccounts: mocks.privyLinkedAccounts,
      },
    });
    mocks.privyWallets.splice(0, mocks.privyWallets.length, {
      walletClientType: 'privy',
      address: PRIVY_ADDRESS,
      chainId: 'eip155:42161',
      getEthereumProvider: mocks.getEthereumProvider,
      switchChain: mocks.switchChain,
    });
    mocks.privyLinkedAccounts.splice(0, mocks.privyLinkedAccounts.length, {
      type: 'wallet',
      id: 'privy-wallet-id',
      address: PRIVY_ADDRESS,
      chainType: 'ethereum',
      walletClientType: 'privy',
    });
    mocks.accountApiPost
      .mockResolvedValueOnce(passedPreview())
      .mockResolvedValueOnce({
        status: 'submitted',
        transactionId: 'privy-transaction-id',
        caip2: 'eip155:8453',
      });
    mocks.sendCalls.mockResolvedValue({ id: '0xcalls' });
    mocks.waitForCallsStatus.mockResolvedValue({
      status: 'success',
      receipts: [{ transactionHash: '0xtxhash' }],
    });
  });

  it('executes Privy EOA batches through split prepare and confirm endpoints', async () => {
    const { result } = renderHook(() => usePrivyWalletBackend());

    let promise: Promise<any> | undefined;
    await act(async () => {
      promise = result.current.backend.executeAtomicBatch?.(
        [approvalTx, supplyTx],
        8453,
      );
    });

    expect(mocks.switchChain).toHaveBeenCalledWith(8453);
    expect(mocks.getAccessToken).toHaveBeenCalledTimes(1);
    expect(mocks.accountApiPost).toHaveBeenNthCalledWith(
      1,
      '/wallet-execution/privy/prepare-send-calls',
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

    expect(result.current.simulationPreview).toBeDefined();

    // Confirm execution
    await act(async () => {
      await result.current.confirmBatchExecution();
    });

    const execution = await promise;
    expect(execution?.callsId).toBe('privy-transaction-id');

    expect(mocks.providerRequest.mock.calls[0]?.[0]).toMatchObject({
      method: 'eth_signTypedData_v4',
      params: expect.arrayContaining([PRIVY_ADDRESS]),
    });
    expect(
      Array.from(mocks.generateAuthorizationSignature.mock.calls[0][0]),
    ).toEqual(Array.from(new TextEncoder().encode('server-formatted-payload')));
    expect(mocks.accountApiPost).toHaveBeenNthCalledWith(
      2,
      '/wallet-execution/privy/confirm-send-calls',
      {
        previewId: 'mock-preview-id',
        userSignature: 'mock-user-eip712-signature',
        authorizationSignature: 'base64-authorization-signature',
      },
      {
        headers: { Authorization: 'Bearer privy-access-token' },
        retries: 0,
      },
    );
  });

  it('retries simulation without ending the pending execution flow', async () => {
    mocks.accountApiPost
      .mockReset()
      .mockResolvedValueOnce(unavailablePreview())
      .mockResolvedValueOnce(
        passedPreview({ previewId: 'retried-preview-id' }),
      );
    const { result } = renderHook(() => usePrivyWalletBackend());
    let rejection: Promise<unknown> | undefined;

    await act(async () => {
      const promise = result.current.backend.executeAtomicBatch?.(
        [approvalTx],
        8453,
      );
      rejection = expect(promise).rejects.toThrow(
        'Transaction rejected by the user.',
      );
    });
    expect(result.current.simulationPreview?.status).toBe('unavailable');

    await act(async () => {
      await result.current.retryBatchSimulation();
    });
    expect(result.current.simulationPreview).toMatchObject({
      status: 'passed',
      previewId: 'retried-preview-id',
    });

    act(() => result.current.cancelBatchExecution());
    await rejection;
  });

  it('updates an approval call and re-simulates with a new idempotency key', async () => {
    const approval = {
      callIndex: 0,
      owner: PRIVY_ADDRESS,
      spender: supplyTx.to,
      token: {
        address: approvalTx.to,
        symbol: 'USDC',
        name: 'USD Coin',
        decimals: 6,
        logoUrl: null,
      },
      rawAmount: '10001',
      amount: '0.010001',
      unlimited: false,
      simulatedSpendRaw: '10001',
      exceedsSimulatedSpend: false,
    };
    mocks.accountApiPost
      .mockReset()
      .mockResolvedValueOnce(passedPreview({ approvals: [approval] }))
      .mockResolvedValueOnce(
        passedPreview({
          previewId: 'edited-preview-id',
          approvals: [{ ...approval, rawAmount: '750000', amount: '0.75' }],
        }),
      );
    const { result } = renderHook(() => usePrivyWalletBackend());
    let execution: Promise<unknown> | undefined;

    act(() => {
      execution = result.current.backend.executeAtomicBatch?.(
        [approvalTx, supplyTx],
        8453,
      );
      void execution?.catch(() => undefined);
    });

    await waitFor(() =>
      expect(result.current.simulationPreview).toMatchObject({
        previewId: 'mock-preview-id',
      }),
    );

    await act(async () => {
      await result.current.updateApprovalAmount(0, '0.75');
    });

    const firstRequest = mocks.accountApiPost.mock.calls[0]?.[1];
    const secondRequest = mocks.accountApiPost.mock.calls[1]?.[1];
    expect(secondRequest.idempotencyKey).not.toBe(firstRequest.idempotencyKey);
    const decoded = decodeFunctionData({
      abi: erc20Abi,
      data: secondRequest.calls[0].data,
    });
    expect(decoded.functionName).toBe('approve');
    expect(decoded.args[0].toLowerCase()).toBe(supplyTx.to.toLowerCase());
    expect(decoded.args[1]).toBe(750000n);
    expect(result.current.simulationPreview).toMatchObject({
      previewId: 'edited-preview-id',
    });

    act(() => result.current.cancelBatchExecution());
    await expect(execution).rejects.toThrow(
      'Transaction rejected by the user.',
    );
  });

  it('keeps the flow pending when confirm returns a replacement review', async () => {
    mocks.accountApiPost
      .mockReset()
      .mockResolvedValueOnce(passedPreview())
      .mockResolvedValueOnce({
        status: 'review',
        preview: passedPreview({
          status: 'warning',
          previewId: 'replacement-preview-id',
          warnings: [
            {
              code: 'UNVERIFIED_CONTRACT',
              message: 'Target is unverified',
              callIndex: 0,
              address: approvalTx.to,
            },
          ],
        }),
      });
    const { result } = renderHook(() => usePrivyWalletBackend());
    let rejection: Promise<unknown> | undefined;

    await act(async () => {
      const promise = result.current.backend.executeAtomicBatch?.(
        [approvalTx],
        8453,
      );
      rejection = expect(promise).rejects.toThrow(
        'Transaction rejected by the user.',
      );
    });
    await act(async () => {
      await result.current.confirmBatchExecution();
    });

    expect(result.current.simulationPreview).toMatchObject({
      status: 'warning',
      previewId: 'replacement-preview-id',
    });
    act(() => result.current.cancelBatchExecution());
    await rejection;
  });

  it('sends the acknowledged warning risk hash on confirm', async () => {
    mocks.accountApiPost
      .mockReset()
      .mockResolvedValueOnce(
        passedPreview({
          status: 'warning',
          warnings: [
            {
              code: 'UNVERIFIED_CONTRACT',
              message: 'Target is unverified',
              callIndex: 0,
              address: approvalTx.to,
            },
          ],
        }),
      )
      .mockResolvedValueOnce({
        status: 'submitted',
        transactionId: 'privy-transaction-id',
        caip2: 'eip155:8453',
      });
    const { result } = renderHook(() => usePrivyWalletBackend());

    await act(async () => {
      void result.current.backend.executeAtomicBatch?.([approvalTx], 8453);
    });
    await act(async () => {
      await result.current.confirmBatchExecution(RISK_HASH);
    });

    expect(mocks.accountApiPost).toHaveBeenNthCalledWith(
      2,
      '/wallet-execution/privy/confirm-send-calls',
      expect.objectContaining({ acknowledgedRiskHash: RISK_HASH }),
      expect.any(Object),
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

  it('surfaces Privy Wallets API preparation errors without falling back to a chain RPC', async () => {
    mocks.accountApiPost
      .mockReset()
      .mockRejectedValueOnce(new Error('Privy API rejected prep'));
    const { result } = renderHook(() => usePrivyWalletBackend());

    await act(async () => {
      await expect(
        result.current.backend.executeAtomicBatch?.(
          [approvalTx, supplyTx],
          8453,
        ),
      ).rejects.toThrow(
        'Privy EOA EIP-7702 atomic batch preparation failed: Privy API rejected prep',
      );
    });

    expect(mocks.getEthereumProvider).not.toHaveBeenCalled();
    expect(mocks.sendCalls).not.toHaveBeenCalled();
  });

  it('throws when buildClient is called without an embedded wallet', async () => {
    mocks.privyWallets.splice(0, mocks.privyWallets.length);
    const { result } = renderHook(() => usePrivyWalletBackend());

    await act(async () => {
      await expect(result.current.backend.getWalletClient?.()).rejects.toThrow(
        'No Privy wallet connected',
      );
    });
  });

  it('throws when switchChain is called without an embedded wallet', async () => {
    mocks.privyWallets.splice(0, mocks.privyWallets.length);
    const { result } = renderHook(() => usePrivyWalletBackend());

    await act(async () => {
      await expect(result.current.backend.switchChain?.(8453)).rejects.toThrow(
        'No Privy wallet connected',
      );
    });
  });

  it('throws when sendTransaction is called without an embedded wallet', async () => {
    mocks.privyWallets.splice(0, mocks.privyWallets.length);
    const { result } = renderHook(() => usePrivyWalletBackend());

    await act(async () => {
      await expect(
        result.current.backend.sendTransaction?.({
          to: '0x123' as `0x${string}`,
          chainId: 8453,
        }),
      ).rejects.toThrow('No Privy wallet connected');
    });
  });

  it('throws when executeAtomicBatch is called with an empty batch', async () => {
    const { result } = renderHook(() => usePrivyWalletBackend());

    await act(async () => {
      await expect(
        result.current.backend.executeAtomicBatch?.([], 8453),
      ).rejects.toThrow('Cannot execute empty Privy EIP-7702 batch');
    });

    expect(mocks.accountApiPost).not.toHaveBeenCalled();
  });

  it('throws when prepare access token is missing', async () => {
    mocks.getAccessToken.mockResolvedValueOnce(null);
    const { result } = renderHook(() => usePrivyWalletBackend());

    await act(async () => {
      await expect(
        result.current.backend.executeAtomicBatch?.([approvalTx], 8453),
      ).rejects.toThrow(
        'Privy user access token is invalid or expired. Please re-login.',
      );
    });
  });

  it('confirmBatchExecution is a no-op when no pending execution', async () => {
    const { result } = renderHook(() => usePrivyWalletBackend());

    await act(async () => {
      await result.current.confirmBatchExecution();
    });

    // Should not throw, should not call any APIs
    expect(mocks.providerRequest).not.toHaveBeenCalled();
    expect(mocks.accountApiPost).not.toHaveBeenCalled();
  });

  it('tracks signing, authorization, and send phases during batch confirmation', async () => {
    const typedDataSignature = deferred<string>();
    const authorizationSignature = deferred<{
      signature: string;
    }>();
    const confirmResponse = deferred<{
      status: 'submitted';
      transactionId: string;
      caip2: string;
    }>();
    mocks.providerRequest.mockReturnValueOnce(typedDataSignature.promise);
    mocks.generateAuthorizationSignature.mockReturnValueOnce(
      authorizationSignature.promise,
    );
    mocks.accountApiPost
      .mockReset()
      .mockResolvedValueOnce(passedPreview())
      .mockReturnValueOnce(confirmResponse.promise);
    const { result } = renderHook(() => usePrivyWalletBackend());
    let execution: Promise<unknown> | undefined;

    await act(async () => {
      execution = result.current.backend.executeAtomicBatch?.(
        [approvalTx],
        8453,
      );
    });

    let confirm: Promise<void> | undefined;
    act(() => {
      confirm = result.current.confirmBatchExecution();
    });
    await waitFor(() =>
      expect(result.current.batchExecutionPhase).toBe('signingIntent'),
    );

    await act(async () => {
      typedDataSignature.resolve('mock-user-eip712-signature');
      await typedDataSignature.promise;
    });
    await waitFor(() =>
      expect(result.current.batchExecutionPhase).toBe('authorizingBatch'),
    );

    await act(async () => {
      authorizationSignature.resolve({
        signature: 'base64-authorization-signature',
      });
      await authorizationSignature.promise;
    });
    await waitFor(() =>
      expect(result.current.batchExecutionPhase).toBe('sendingBatch'),
    );

    await act(async () => {
      confirmResponse.resolve({
        status: 'submitted',
        transactionId: 'privy-transaction-id',
        caip2: 'eip155:8453',
      });
      await confirm;
    });
    await expect(execution).resolves.toEqual({
      callsId: 'privy-transaction-id',
    });
    expect(result.current.batchExecutionPhase).toBe('idle');
  });

  it('cancelBatchExecution clears pending execution', async () => {
    const { result } = renderHook(() => usePrivyWalletBackend());

    let batchRejection: Promise<unknown> | undefined;
    await act(async () => {
      const promise = result.current.backend.executeAtomicBatch?.(
        [approvalTx],
        8453,
      );
      batchRejection = expect(promise).rejects.toThrow(
        'Transaction rejected by the user.',
      );
    });

    expect(result.current.simulationPreview).toBeDefined();

    act(() => {
      result.current.cancelBatchExecution();
    });

    await batchRejection;
    expect(result.current.simulationPreview).toBeNull();
  });

  it('cancelBatchExecution is safe when no pending execution', async () => {
    const { result } = renderHook(() => usePrivyWalletBackend());

    act(() => {
      result.current.cancelBatchExecution();
    });

    // Should not throw
    expect(result.current.simulationPreview).toBeNull();
  });

  it('throws when confirmBatchExecution has no wallet', async () => {
    const { result, rerender } = renderHook(() => usePrivyWalletBackend());

    let batchRejection: Promise<unknown> | undefined;
    await act(async () => {
      const promise = result.current.backend.executeAtomicBatch?.(
        [approvalTx],
        8453,
      );
      batchRejection = expect(promise).rejects.toThrow(
        'Transaction rejected by the user.',
      );
    });

    mocks.privyWallets.splice(0, mocks.privyWallets.length);
    rerender();

    await act(async () => {
      await expect(result.current.confirmBatchExecution()).rejects.toThrow(
        'No Privy wallet connected',
      );
    });

    act(() => {
      result.current.cancelBatchExecution();
    });
    await batchRejection;
  });

  it('throws when executeAtomicBatch access token is missing on confirm', async () => {
    const { result } = renderHook(() => usePrivyWalletBackend());

    let batchRejection: Promise<unknown> | undefined;
    await act(async () => {
      const promise = result.current.backend.executeAtomicBatch?.(
        [approvalTx],
        8453,
      );
      batchRejection = expect(promise).rejects.toThrow(
        'Privy user access token is invalid or expired. Please re-login.',
      );
    });

    mocks.getAccessToken.mockResolvedValueOnce(null);

    await act(async () => {
      await result.current.confirmBatchExecution();
    });
    await batchRejection;
  });

  it('getPrivyAtomicBatchChain throws for unsupported chain', async () => {
    const { result } = renderHook(() => usePrivyWalletBackend());

    await act(async () => {
      // 1 = Ethereum mainnet is not supported for atomic batching
      await expect(
        result.current.backend.executeAtomicBatch?.(
          [{ ...approvalTx, chainId: 1 }],
          1,
        ),
      ).rejects.toThrow(
        'Privy EOA EIP-7702 atomic batching is not configured for chain 1',
      );
    });
  });

  it('signMessage throws when no wallet connected', async () => {
    mocks.privyWallets.splice(0, mocks.privyWallets.length);
    const { result } = renderHook(() => usePrivyWalletBackend());

    await act(async () => {
      await expect(
        result.current.backend.signMessage?.('test message'),
      ).rejects.toThrow('No Privy wallet connected');
    });
  });

  it('signTypedData throws when no wallet connected', async () => {
    mocks.privyWallets.splice(0, mocks.privyWallets.length);
    const { result } = renderHook(() => usePrivyWalletBackend());

    await act(async () => {
      await expect(
        result.current.backend.signTypedData?.({
          domain: {},
          types: {},
          message: {},
        }),
      ).rejects.toThrow('No Privy wallet connected');
    });
  });

  it('isActive is false when ready but not authenticated', async () => {
    mocks.usePrivy.mockReturnValue({
      ready: true,
      authenticated: false,
      login: mocks.login,
      logout: mocks.logout,
      getAccessToken: mocks.getAccessToken,
      user: null,
    } as any);

    const { result } = renderHook(() => usePrivyWalletBackend());

    expect(result.current.isActive).toBe(false);
  });

  it('isActive is false when authenticated but no embedded wallet', async () => {
    mocks.privyWallets.splice(0, mocks.privyWallets.length);

    const { result } = renderHook(() => usePrivyWalletBackend());

    expect(result.current.isActive).toBe(false);
  });

  it('disconnect logs error when logout fails', async () => {
    mocks.logout.mockRejectedValueOnce(new Error('Logout failed'));

    const { result } = renderHook(() => usePrivyWalletBackend());

    await act(async () => {
      await expect(result.current.backend.disconnect?.()).rejects.toThrow(
        'Logout failed',
      );
    });

    expect(mocks.walletError).toHaveBeenCalledWith(
      'Failed to logout from Privy:',
      expect.any(Error),
    );
  });

  it('switchChain logs error when switch fails', async () => {
    mocks.switchChain.mockRejectedValueOnce(
      new Error('User rejected chain switch'),
    );

    const { result } = renderHook(() => usePrivyWalletBackend());

    await act(async () => {
      await expect(result.current.backend.switchChain?.(137)).rejects.toThrow(
        'User rejected chain switch',
      );
    });

    expect(mocks.walletError).toHaveBeenCalledWith(
      'Failed to switch chain (Privy):',
      expect.any(Error),
    );
  });
});
