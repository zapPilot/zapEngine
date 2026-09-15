// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { WALLET_NOT_CONNECTED_ERROR } from '@core/lib/wallet/privyAtomicBatch';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  ready: true,
  authenticated: true,
  login: vi.fn(),
  logout: vi.fn(),
  getAccessToken: vi.fn(),
  user: undefined as
    | { linkedAccounts: Array<Record<string, unknown>> }
    | undefined,
  wallets: [] as Array<{
    address: string;
    chainId?: string;
    walletClientType: string;
    getEthereumProvider: ReturnType<typeof vi.fn>;
    switchChain: ReturnType<typeof vi.fn>;
  }>,
  generateAuthorizationSignature: vi.fn(),
  signPrivyTypedData: vi.fn(),
  createWalletClient: vi.fn(),
  custom: vi.fn((provider: unknown) => ({ provider })),
  client: {
    signMessage: vi.fn(),
    signTypedData: vi.fn(),
    sendTransaction: vi.fn(),
  },
  atomicArgs: undefined as Record<string, unknown> | undefined,
  executeAtomicBatch: vi.fn(),
  executeReviewedBatch: vi.fn(),
  loggerInfo: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock('@privy-io/react-auth', () => ({
  usePrivy: () => ({
    ready: mocks.ready,
    authenticated: mocks.authenticated,
    login: mocks.login,
    logout: mocks.logout,
    getAccessToken: mocks.getAccessToken,
    user: mocks.user,
  }),
  useAuthorizationSignature: () => ({
    generateAuthorizationSignature: mocks.generateAuthorizationSignature,
  }),
  useSignTypedData: () => ({ signTypedData: mocks.signPrivyTypedData }),
  useWallets: () => ({ wallets: mocks.wallets }),
}));

vi.mock('viem', async (importOriginal) => {
  const actual = await importOriginal<typeof import('viem')>();
  return {
    ...actual,
    createWalletClient: (...args: unknown[]) =>
      mocks.createWalletClient(...args),
    custom: (...args: unknown[]) => mocks.custom(...args),
  };
});

vi.mock('@core/hooks/wallet/useAtomicBatchExecution', () => ({
  useAtomicBatchExecution: (args: Record<string, unknown>) => {
    mocks.atomicArgs = args;
    return {
      executeAtomicBatch: mocks.executeAtomicBatch,
      executeReviewedBatch: mocks.executeReviewedBatch,
      simulationPreview: null,
      confirmBatchExecution: vi.fn(),
      retryBatchSimulation: vi.fn(),
      updateApprovalAmount: vi.fn(),
      cancelBatchExecution: vi.fn(),
      isSigningAndSending: false,
      batchExecutionPhase: 'idle',
      isRetryingSimulation: false,
      retryError: null,
    };
  },
}));

vi.mock('@core/utils', () => ({
  walletLogger: {
    info: mocks.loggerInfo,
    error: mocks.loggerError,
  },
}));

import { usePrivyWalletBackend } from '@core/hooks/wallet/usePrivyWalletBackend';

const ADDRESS = '0x1111111111111111111111111111111111111111';

function makeWallet(chainId: string | undefined = 'eip155:42161') {
  return {
    address: ADDRESS,
    chainId,
    walletClientType: 'privy',
    getEthereumProvider: vi.fn().mockResolvedValue({ request: vi.fn() }),
    switchChain: vi.fn().mockResolvedValue(undefined),
  };
}

function renderBackend() {
  return renderHook(() => usePrivyWalletBackend());
}

describe('usePrivyWalletBackend', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ready = true;
    mocks.authenticated = true;
    mocks.user = undefined;
    mocks.wallets = [];
    mocks.atomicArgs = undefined;
    mocks.logout.mockResolvedValue(undefined);
    mocks.signPrivyTypedData.mockResolvedValue({ signature: '0xpreview' });
    mocks.client.signMessage.mockResolvedValue('0xsigned');
    mocks.client.signTypedData.mockResolvedValue('0xtyped');
    mocks.client.sendTransaction.mockResolvedValue('0xhash');
    mocks.createWalletClient.mockReturnValue(mocks.client);
  });

  it('is inactive and disconnected before an embedded Privy wallet exists', async () => {
    mocks.ready = false;
    const { result } = renderBackend();

    expect(result.current.isActive).toBe(false);
    expect(result.current.backend.isConnected).toBe(false);
    expect(result.current.backend.isConnecting).toBe(true);
    expect(result.current.backend.connectedWallets).toEqual([]);
    expect(result.current.backend.account).toBeNull();

    await expect(result.current.backend.getWalletClient()).rejects.toThrow(
      WALLET_NOT_CONNECTED_ERROR,
    );
    await expect(result.current.backend.switchChain(1)).rejects.toThrow(
      WALLET_NOT_CONNECTED_ERROR,
    );
    await expect(
      result.current.backend.sendTransaction({ to: ADDRESS, chainId: 1 }),
    ).rejects.toThrow(WALLET_NOT_CONNECTED_ERROR);
  });

  it('activates only for ready authenticated users with a Privy embedded wallet', () => {
    const wallet = makeWallet();
    mocks.wallets = [{ ...makeWallet(), walletClientType: 'metamask' }, wallet];
    const { result, rerender } = renderBackend();

    expect(result.current.isActive).toBe(true);
    expect(result.current.backend.isConnected).toBe(true);
    expect(result.current.backend.isConnecting).toBe(false);
    expect(result.current.backend.connectedWallets).toEqual([
      { address: ADDRESS, isActive: true },
    ]);
    expect(result.current.backend.chain?.id).toBe(42161);

    mocks.authenticated = false;
    rerender();
    expect(result.current.isActive).toBe(false);
  });

  it('opens login, clears errors, and captures synchronous login failures', async () => {
    const { result, rerender } = renderBackend();

    await act(async () => {
      await result.current.backend.connect();
    });
    expect(mocks.login).toHaveBeenCalledTimes(1);
    expect(result.current.backend.error).toBeNull();

    mocks.login.mockImplementationOnce(() => {
      throw new Error('popup blocked');
    });
    await act(async () => {
      await result.current.backend.connect();
    });
    rerender();
    expect(result.current.backend.error).toEqual({
      message: 'popup blocked',
      code: 'PRIVY_LOGIN_ERROR',
    });
    expect(mocks.loggerError).toHaveBeenCalled();

    act(() => result.current.backend.clearError());
    expect(result.current.backend.error).toBeNull();

    mocks.login.mockImplementationOnce(() => {
      throw 'non-error';
    });
    await act(async () => {
      await result.current.backend.connect();
    });
    expect(result.current.backend.error?.message).toBe(
      'Failed to open Privy login',
    );
  });

  it('tracks disconnect state, restores it after success, and rethrows logout failures', async () => {
    const { result } = renderBackend();

    await act(async () => {
      await result.current.backend.disconnect();
    });
    expect(mocks.logout).toHaveBeenCalledTimes(1);
    expect(result.current.backend.isDisconnecting).toBe(false);

    mocks.logout.mockRejectedValueOnce(new Error('logout failed'));
    await act(async () => {
      await expect(result.current.backend.disconnect()).rejects.toThrow(
        'logout failed',
      );
    });
    expect(result.current.backend.isDisconnecting).toBe(false);
    expect(mocks.loggerError).toHaveBeenCalled();
  });

  it('builds clients from current, explicit, default, and unknown chain ids', async () => {
    const wallet = makeWallet('eip155:8453');
    mocks.wallets = [wallet];
    const { result, unmount } = renderBackend();

    await result.current.backend.getWalletClient();
    expect(wallet.getEthereumProvider).toHaveBeenCalled();
    expect(mocks.createWalletClient.mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({
        account: ADDRESS,
        chain: expect.objectContaining({ id: 8453 }),
      }),
    );

    await result.current.backend.getWalletClient(1);
    expect(mocks.createWalletClient.mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({ chain: expect.objectContaining({ id: 1 }) }),
    );
    unmount();

    mocks.wallets = [makeWallet('invalid')];
    const invalid = renderBackend();
    await invalid.result.current.backend.getWalletClient();
    expect(mocks.createWalletClient.mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({
        chain: expect.objectContaining({ id: 42161 }),
      }),
    );
    await invalid.result.current.backend.getWalletClient(999999);
    expect(mocks.createWalletClient.mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({
        chain: expect.objectContaining({ id: 42161 }),
      }),
    );
  });

  it('signs messages and typed data through the constructed wallet client', async () => {
    mocks.wallets = [makeWallet()];
    const { result } = renderBackend();

    await expect(result.current.backend.signMessage('hello')).resolves.toBe(
      '0xsigned',
    );
    expect(mocks.client.signMessage).toHaveBeenCalledWith({ message: 'hello' });

    const typedData = {
      domain: {},
      types: { Test: [{ name: 'value', type: 'uint256' }] },
      primaryType: 'Test',
      message: { value: 1n },
    };
    await expect(result.current.backend.signTypedData(typedData)).resolves.toBe(
      '0xtyped',
    );
    expect(mocks.client.signTypedData).toHaveBeenCalledWith(typedData);
  });

  it('signs preview typed data with Privy UI and rejects it when disconnected', async () => {
    const wallet = makeWallet();
    mocks.wallets = [wallet];
    const connected = renderBackend();
    const signPreview = mocks.atomicArgs?.signPreviewTypedData as (
      typedData: unknown,
    ) => Promise<string>;

    await expect(signPreview({ domain: {} })).resolves.toBe('0xpreview');
    expect(mocks.signPrivyTypedData).toHaveBeenCalledWith(
      { domain: {} },
      {
        address: ADDRESS,
        uiOptions: { showWalletUIs: true },
      },
    );
    connected.unmount();

    mocks.wallets = [];
    renderBackend();
    const disconnected = mocks.atomicArgs?.signPreviewTypedData as (
      typedData: unknown,
    ) => Promise<string>;
    await expect(disconnected({})).rejects.toThrow(WALLET_NOT_CONNECTED_ERROR);
  });

  it('switches chains explicitly and propagates switch failures', async () => {
    const wallet = makeWallet();
    mocks.wallets = [wallet];
    const { result } = renderBackend();

    await result.current.backend.switchChain(10);
    expect(wallet.switchChain).toHaveBeenCalledWith(10);

    wallet.switchChain.mockRejectedValueOnce(new Error('switch failed'));
    await expect(result.current.backend.switchChain(1)).rejects.toThrow(
      'switch failed',
    );
    expect(mocks.loggerError).toHaveBeenCalled();
  });

  it('switches before sending when needed and forwards only defined transaction fields', async () => {
    const wallet = makeWallet('eip155:42161');
    mocks.wallets = [wallet];
    const { result } = renderBackend();

    await expect(
      result.current.backend.sendTransaction({
        to: ADDRESS,
        chainId: 8453,
        data: '0x1234',
        value: 5n,
        gas: 21_000n,
      }),
    ).resolves.toBe('0xhash');
    expect(wallet.switchChain).toHaveBeenCalledWith(8453);
    expect(mocks.client.sendTransaction).toHaveBeenCalledWith({
      to: ADDRESS,
      data: '0x1234',
      value: 5n,
      gas: 21_000n,
    });

    wallet.switchChain.mockClear();
    mocks.client.sendTransaction.mockClear();
    await result.current.backend.sendTransaction({
      to: ADDRESS,
      chainId: 42161,
    });
    expect(wallet.switchChain).not.toHaveBeenCalled();
    expect(mocks.client.sendTransaction).toHaveBeenCalledWith({ to: ADDRESS });
  });

  it('ensures batch chain only when needed and resolves matching linked wallet ids', async () => {
    const wallet = makeWallet('eip155:42161');
    mocks.wallets = [wallet];
    mocks.user = {
      linkedAccounts: [
        { type: 'email', address: ADDRESS },
        {
          type: 'wallet',
          walletClientType: 'metamask',
          chainType: 'ethereum',
          address: ADDRESS,
          id: 'wrong-client',
        },
        {
          type: 'wallet',
          walletClientType: 'privy',
          chainType: 'solana',
          address: ADDRESS,
          id: 'wrong-chain',
        },
        {
          type: 'wallet',
          walletClientType: 'privy',
          chainType: 'ethereum',
          address: '0x2222222222222222222222222222222222222222',
          id: 'wrong-address',
        },
        {
          type: 'wallet',
          walletClientType: 'privy',
          chainType: 'ethereum',
          address: ADDRESS.toUpperCase(),
          id: 'wallet-id',
        },
      ],
    };
    renderBackend();

    const ensureChain = mocks.atomicArgs?.ensureChain as (
      chainId: number,
    ) => Promise<void>;
    const resolveWalletId = mocks.atomicArgs?.resolveWalletId as () =>
      | string
      | undefined;

    await ensureChain(42161);
    expect(wallet.switchChain).not.toHaveBeenCalled();
    await ensureChain(10);
    expect(wallet.switchChain).toHaveBeenCalledWith(10);
    expect(resolveWalletId()).toBe('wallet-id');
  });

  it('returns no wallet id without an embedded wallet or a valid linked-account id', () => {
    renderBackend();
    let resolveWalletId = mocks.atomicArgs?.resolveWalletId as () =>
      | string
      | undefined;
    expect(resolveWalletId()).toBeUndefined();

    mocks.wallets = [makeWallet()];
    mocks.user = {
      linkedAccounts: [
        {
          type: 'wallet',
          walletClientType: 'privy',
          chainType: 'ethereum',
          address: ADDRESS,
          id: 123,
        },
      ],
    };
    renderBackend();
    resolveWalletId = mocks.atomicArgs?.resolveWalletId as () =>
      | string
      | undefined;
    expect(resolveWalletId()).toBeUndefined();
  });

  it('returns unknown reviewed-batch status and keeps active-wallet switching a no-op', async () => {
    mocks.wallets = [makeWallet()];
    const { result } = renderBackend();

    await expect(
      result.current.backend.waitForReviewedBatch?.({} as never),
    ).resolves.toEqual({
      status: 'unknown',
      reason: 'Privy batch confirmation is tracked by account-engine.',
    });
    await expect(
      result.current.backend.switchActiveWallet(ADDRESS),
    ).resolves.toBeUndefined();
    expect(mocks.loggerInfo).toHaveBeenCalledWith(
      'switchActiveWallet is a no-op in Privy mode',
    );
  });
});
