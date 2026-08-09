// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { useWagmiWalletBackend } from '@core/hooks/wallet/useWagmiWalletBackend';
import { computeReviewedBatchFingerprint } from '@core/lib/wallet/reviewedBatchFingerprint';
import type { PreparedTransaction } from '@zapengine/types/api';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  connectAsync: vi.fn(),
  disconnectAsync: vi.fn(),
  switchChainAsync: vi.fn(),
  signMessageAsync: vi.fn(),
  signTypedDataAsync: vi.fn(),
  getWalletClient: vi.fn(),
  submitPreparedTransactionsWithEIP7702: vi.fn(),
  connection: {
    address: undefined as string | undefined,
    isConnected: false,
    isConnecting: false,
    isReconnecting: false,
    connector: undefined as { uid?: string } | undefined,
    chain: undefined as { id: number; name: string } | undefined,
  },
  connectors: [] as { id: string; name: string; icon?: string; type: string }[],
  isWalletConnectEnabled: vi.fn(() => false),
}));

vi.mock('wagmi', () => ({
  useConnection: () => mocks.connection,
  useConnectors: () => mocks.connectors,
  useConnect: () => ({ mutateAsync: mocks.connectAsync, isPending: false }),
  useDisconnect: () => ({
    mutateAsync: mocks.disconnectAsync,
    isPending: false,
  }),
  useSwitchChain: () => ({ mutateAsync: mocks.switchChainAsync }),
  useSignMessage: () => ({ mutateAsync: mocks.signMessageAsync }),
  useSignTypedData: () => ({ mutateAsync: mocks.signTypedDataAsync }),
  useBalance: () => ({ data: undefined }),
}));

vi.mock('wagmi/actions', () => ({
  getWalletClient: mocks.getWalletClient,
}));

vi.mock('@core/config/wagmi', () => ({
  getWagmiConfig: () => ({}),
}));

vi.mock('@core/lib/wallet/executeDepositPlan', () => ({
  submitPreparedTransactionsWithEIP7702:
    mocks.submitPreparedTransactionsWithEIP7702,
}));

vi.mock('@core/lib/env/walletConnect', () => ({
  isWalletConnectEnabled: mocks.isWalletConnectEnabled,
}));

vi.mock('@core/utils', () => ({
  walletLogger: { info: vi.fn(), error: vi.fn() },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.connectAsync.mockReset();
  mocks.connectAsync.mockResolvedValue(undefined);
  mocks.connection = {
    address: undefined,
    isConnected: false,
    isConnecting: false,
    isReconnecting: false,
    connector: undefined,
    chain: undefined,
  };
  mocks.connectors = [];
  mocks.isWalletConnectEnabled.mockReturnValue(false);
});

describe('useWagmiWalletBackend', () => {
  it('never implements executeAtomicBatch and always reports the eip7702 execution mode', () => {
    const { result } = renderHook(() => useWagmiWalletBackend());
    expect(result.current.backend.executionMode).toBe('eip7702');
    expect(result.current.backend.executeAtomicBatch).toBeUndefined();
  });

  it('submits the exact reviewed calls without waiting for bundle status', async () => {
    const transactions: PreparedTransaction[] = [
      {
        to: '0x2222222222222222222222222222222222222222',
        data: '0x',
        value: '0',
        chainId: 8453,
        meta: { intentType: 'supply' },
      },
    ];
    mocks.connection = {
      address: '0x1111111111111111111111111111111111111111',
      isConnected: true,
      isConnecting: false,
      chain: { id: 8453, name: 'Base' },
    };
    const walletClient = { account: { address: mocks.connection.address } };
    mocks.getWalletClient.mockResolvedValue(walletClient);
    mocks.submitPreparedTransactionsWithEIP7702.mockResolvedValue({
      callsId: 'calls-1',
    });
    const { result } = renderHook(() => useWagmiWalletBackend());

    await expect(
      result.current.backend.executeReviewedBatch?.({
        transactions,
        chainId: 8453,
        expectedWalletAddress: '0x1111111111111111111111111111111111111111',
        expectedBatchFingerprint: computeReviewedBatchFingerprint({
          chainId: 8453,
          transactions,
        }),
        expiresAt: Date.now() + 60_000,
        executionAllowed: true,
        expectedSimulationFingerprint: `0x${'ab'.repeat(32)}`,
        expectedRiskHash: `0x${'cd'.repeat(32)}`,
        requiresRiskAcknowledgement: false,
      }),
    ).resolves.toEqual({ status: 'submitted', callsId: 'calls-1' });

    expect(mocks.getWalletClient).toHaveBeenCalledWith({}, { chainId: 8453 });
    expect(mocks.submitPreparedTransactionsWithEIP7702).toHaveBeenCalledWith({
      transactions,
      walletClient,
      chainId: 8453,
    });
  });

  it('blocks a failed or unavailable review before resolving a wallet client', async () => {
    mocks.connection = {
      address: '0x1111111111111111111111111111111111111111',
      isConnected: true,
      isConnecting: false,
      chain: { id: 8453, name: 'Base' },
    };
    const transactions: PreparedTransaction[] = [
      {
        to: '0x2222222222222222222222222222222222222222',
        data: '0x',
        value: '0',
        chainId: 8453,
        meta: { intentType: 'supply' },
      },
    ];
    const { result } = renderHook(() => useWagmiWalletBackend());

    await expect(
      result.current.backend.executeReviewedBatch?.({
        transactions,
        chainId: 8453,
        expectedWalletAddress: '0x1111111111111111111111111111111111111111',
        expectedBatchFingerprint: computeReviewedBatchFingerprint({
          chainId: 8453,
          transactions,
        }),
        expiresAt: Date.now() + 60_000,
        executionAllowed: false,
        expectedSimulationFingerprint: `0x${'ab'.repeat(32)}`,
        expectedRiskHash: `0x${'cd'.repeat(32)}`,
        requiresRiskAcknowledgement: false,
      }),
    ).resolves.toMatchObject({ status: 'blocked', code: 'REVIEW_BLOCKED' });

    expect(mocks.getWalletClient).not.toHaveBeenCalled();
    expect(mocks.submitPreparedTransactionsWithEIP7702).not.toHaveBeenCalled();
  });

  it('maps discovered connectors, flags approved wallets as recommended, and drops the generic injected fallback once a specific wallet is found', () => {
    mocks.connectors = [
      { id: 'injected', name: 'Injected', type: 'injected' },
      {
        id: 'app.phantom',
        name: 'Phantom',
        icon: 'data:image/png;base64,x',
        type: 'injected',
      },
      { id: 'com.ambire', name: 'Ambire Wallet', type: 'injected' },
      { id: 'io.metamask', name: 'MetaMask', type: 'injected' },
      {
        id: 'com.okex.wallet',
        name: 'OKX Wallet',
        type: 'injected',
      },
    ];
    const { result } = renderHook(() => useWagmiWalletBackend());

    const ids = result.current.connectors.map((option) => option.id);
    expect(ids).not.toContain('injected');
    expect(ids).toEqual([
      'app.phantom',
      'com.ambire',
      'io.metamask',
      'com.okex.wallet',
    ]);

    const phantom = result.current.connectors.find(
      (o) => o.id === 'app.phantom',
    );
    const ambire = result.current.connectors.find((o) => o.id === 'com.ambire');
    const metamask = result.current.connectors.find(
      (o) => o.id === 'io.metamask',
    );
    const okx = result.current.connectors.find(
      (o) => o.id === 'com.okex.wallet',
    );
    expect(phantom).toMatchObject({
      recommended: false,
      type: 'injected',
      icon: 'data:image/png;base64,x',
    });
    expect(ambire).toMatchObject({ recommended: true, type: 'injected' });
    expect(metamask).toMatchObject({ recommended: true, type: 'injected' });
    expect(okx).toMatchObject({ recommended: true, type: 'injected' });
  });

  it('keeps the bare injected connector when no specific wallet is discovered', () => {
    mocks.connectors = [{ id: 'injected', name: 'Injected', type: 'injected' }];
    const { result } = renderHook(() => useWagmiWalletBackend());
    expect(result.current.connectors.map((o) => o.id)).toEqual(['injected']);
  });

  it('includes the generic WalletConnect connector as a non-recommended option when configured', () => {
    mocks.connectors = [
      { id: 'walletConnect', name: 'WalletConnect', type: 'walletConnect' },
    ];
    mocks.isWalletConnectEnabled.mockReturnValue(true);
    const { result } = renderHook(() => useWagmiWalletBackend());
    expect(result.current.isWalletConnectAvailable).toBe(true);
    expect(result.current.connectors).toEqual([
      {
        id: 'walletConnect',
        name: 'WalletConnect',
        recommended: false,
        type: 'walletConnect',
      },
    ]);
  });

  it('connectInjected connects the matching connector by id', async () => {
    const connector = {
      id: 'com.ambire',
      name: 'Ambire Wallet',
      type: 'injected',
    };
    mocks.connectors = [connector];
    mocks.connectAsync.mockResolvedValue(undefined);
    const { result } = renderHook(() => useWagmiWalletBackend());

    await act(async () => {
      await result.current.connectInjected('com.ambire');
    });

    expect(mocks.connectAsync).toHaveBeenCalledWith({ connector });
    expect(result.current.backend.error).toBeNull();
  });

  it('connectInjected surfaces NO_WALLET when the connector id no longer exists', async () => {
    mocks.connectors = [];
    const { result } = renderHook(() => useWagmiWalletBackend());

    await act(async () => {
      await result.current.connectInjected('com.ambire');
    });

    expect(mocks.connectAsync).not.toHaveBeenCalled();
    expect(result.current.backend.error).toMatchObject({ code: 'NO_WALLET' });
  });

  it('treats an already-connected active connector as a successful no-op', async () => {
    const connector = {
      id: 'com.ambire',
      uid: 'com.ambire-1',
      name: 'Ambire Wallet',
      type: 'injected',
    };
    mocks.connectors = [connector];
    mocks.connection = {
      address: '0x1111111111111111111111111111111111111111',
      isConnected: true,
      isConnecting: false,
      isReconnecting: false,
      connector,
      chain: { id: 8453, name: 'Base' },
    };
    const { result } = renderHook(() => useWagmiWalletBackend());

    await act(async () => {
      await expect(result.current.connectInjected('com.ambire')).resolves.toBe(
        true,
      );
    });

    expect(mocks.connectAsync).not.toHaveBeenCalled();
    expect(result.current.backend.error).toBeNull();
  });

  it('treats a named ConnectorAlreadyConnectedError as benign without logging', async () => {
    const connector = {
      id: 'com.ambire',
      uid: 'com.ambire-1',
      name: 'Ambire Wallet',
      type: 'injected',
    };
    mocks.connectors = [connector];
    mocks.connectAsync.mockRejectedValue(
      Object.assign(new Error('Connector already connected.'), {
        name: 'ConnectorAlreadyConnectedError',
      }),
    );
    const { result } = renderHook(() => useWagmiWalletBackend());

    await act(async () => {
      await expect(result.current.connectInjected('com.ambire')).resolves.toBe(
        true,
      );
    });

    const { walletLogger } = await import('@core/utils');
    expect(walletLogger.error).not.toHaveBeenCalled();
    expect(result.current.backend.error).toBeNull();
  });

  it('keeps ordinary connector errors visible as CONNECT_ERROR', async () => {
    const connector = {
      id: 'com.ambire',
      uid: 'com.ambire-1',
      name: 'Ambire Wallet',
      type: 'injected',
    };
    mocks.connectors = [connector];
    mocks.connectAsync.mockRejectedValue(new Error('User rejected request'));
    const { result } = renderHook(() => useWagmiWalletBackend());

    await act(async () => {
      await expect(result.current.connectInjected('com.ambire')).resolves.toBe(
        false,
      );
    });

    const { walletLogger } = await import('@core/utils');
    expect(walletLogger.error).toHaveBeenCalledTimes(1);
    expect(result.current.backend.error).toMatchObject({
      code: 'CONNECT_ERROR',
      message: 'User rejected request',
    });
  });

  it('reports reconnecting as busy and does not start a manual connect', async () => {
    const connector = {
      id: 'com.ambire',
      uid: 'com.ambire-1',
      name: 'Ambire Wallet',
      type: 'injected',
    };
    mocks.connectors = [connector];
    mocks.connection = {
      address: undefined,
      isConnected: false,
      isConnecting: false,
      isReconnecting: true,
      connector: undefined,
      chain: undefined,
    };
    const { result } = renderHook(() => useWagmiWalletBackend());

    expect(result.current.backend.isConnecting).toBe(true);
    await act(async () => {
      await expect(result.current.connectInjected('com.ambire')).resolves.toBe(
        false,
      );
    });
    expect(mocks.connectAsync).not.toHaveBeenCalled();
  });

  it('deduplicates deferred connect calls while the SDK promise is pending', async () => {
    const connector = {
      id: 'com.ambire',
      uid: 'com.ambire-1',
      name: 'Ambire Wallet',
      type: 'injected',
    };
    mocks.connectors = [connector];
    let resolveConnect: (() => void) | undefined;
    mocks.connectAsync.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveConnect = resolve;
        }),
    );
    const { result } = renderHook(() => useWagmiWalletBackend());

    let first: Promise<boolean>;
    let second: Promise<boolean>;
    await act(async () => {
      first = result.current.connectInjected('com.ambire');
      second = result.current.connectInjected('com.ambire');
      expect(mocks.connectAsync).toHaveBeenCalledTimes(1);
      resolveConnect?.();
      await expect(first).resolves.toBe(true);
      await expect(second).resolves.toBe(true);
    });
  });

  it('the default connect() asks the user to choose when multiple wallets are detected, and connects the sole one otherwise', async () => {
    mocks.connectors = [
      { id: 'com.ambire', name: 'Ambire Wallet', type: 'injected' },
      { id: 'io.metamask', name: 'MetaMask', type: 'injected' },
    ];
    const { result: multi } = renderHook(() => useWagmiWalletBackend());
    await act(async () => {
      await multi.current.backend.connect();
    });
    expect(multi.current.backend.error).toMatchObject({
      code: 'WALLET_SELECTION_REQUIRED',
    });

    vi.clearAllMocks();
    const solo = { id: 'com.ambire', name: 'Ambire Wallet', type: 'injected' };
    mocks.connectors = [solo];
    mocks.connectAsync.mockResolvedValue(undefined);
    const { result: single } = renderHook(() => useWagmiWalletBackend());
    await act(async () => {
      await single.current.backend.connect();
    });
    expect(mocks.connectAsync).toHaveBeenCalledWith({ connector: solo });
  });

  it('reports isConnected/isConnecting from the live wagmi connection state', () => {
    mocks.connection = {
      address: '0x1111111111111111111111111111111111111111',
      isConnected: true,
      isConnecting: false,
      chain: { id: 8453, name: 'Base' },
    };
    const { result } = renderHook(() => useWagmiWalletBackend());
    expect(result.current.isConnected).toBe(true);
    expect(result.current.backend.account).toMatchObject({
      address: '0x1111111111111111111111111111111111111111',
      isConnected: true,
    });
    expect(result.current.backend.chain).toMatchObject({
      id: 8453,
      name: 'Base',
    });
  });
});
