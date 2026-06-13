import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useWagmiWalletBackend } from '@/hooks/wallet/useWagmiWalletBackend';

const mockAddress =
  '0x1234567890123456789012345678901234567890' as `0x${string}`;

const mocks = vi.hoisted(() => ({
  useConnection: vi.fn(),
  useConnectors: vi.fn(),
  useConnect: vi.fn(),
  useDisconnect: vi.fn(),
  useSwitchChain: vi.fn(),
  useSignMessage: vi.fn(),
  useSignTypedData: vi.fn(),
  useBalance: vi.fn(),
  getWalletClient: vi.fn(),
  formatUnits: vi.fn(),
  walletLogger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('wagmi', () => ({
  useConnection: () => mocks.useConnection(),
  useConnectors: () => mocks.useConnectors(),
  useConnect: () => mocks.useConnect(),
  useDisconnect: () => mocks.useDisconnect(),
  useSwitchChain: () => mocks.useSwitchChain(),
  useSignMessage: () => mocks.useSignMessage(),
  useSignTypedData: () => mocks.useSignTypedData(),
  useBalance: () => mocks.useBalance(),
}));

vi.mock('wagmi/actions', () => ({
  getWalletClient: (...args: unknown[]) => mocks.getWalletClient(...args),
}));

vi.mock('@/config/wagmi', () => ({
  wagmiConfig: {},
}));

vi.mock('viem', async (importOriginal) => {
  const actual = await importOriginal<typeof import('viem')>();
  return {
    ...actual,
    formatUnits: (value: bigint, decimals: number) => {
      return mocks.formatUnits(value, decimals);
    },
  };
});

vi.mock('@/utils', () => ({
  walletLogger: mocks.walletLogger,
}));

const mockChain = {
  id: 1,
  name: 'Ethereum Mainnet',
  nativeCurrency: { symbol: 'ETH', decimals: 18 },
};

async function invokeAction<T>(
  action: () => Promise<T>,
): Promise<{ value: T | undefined; error: unknown }> {
  let value: T | undefined;
  let error: unknown;

  await act(async () => {
    try {
      value = await action();
    } catch (caughtError) {
      error = caughtError;
    }
  });

  return { value, error };
}

describe('useWagmiWalletBackend', () => {
  let mockConnectAsync: ReturnType<typeof vi.fn>;
  let mockDisconnectAsync: ReturnType<typeof vi.fn>;
  let mockSwitchChainAsync: ReturnType<typeof vi.fn>;
  let mockSignMessageAsync: ReturnType<typeof vi.fn>;
  let mockSignTypedDataAsync: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockConnectAsync = vi.fn().mockResolvedValue(undefined);
    mockDisconnectAsync = vi.fn().mockResolvedValue(undefined);
    mockSwitchChainAsync = vi.fn().mockResolvedValue(undefined);
    mockSignMessageAsync = vi.fn().mockResolvedValue('0xsignature');
    mockSignTypedDataAsync = vi.fn().mockResolvedValue('0xtypedsignature');

    mocks.useConnection.mockReturnValue({
      address: undefined,
      isConnected: false,
      isConnecting: false,
      chain: undefined,
    });
    mocks.useConnectors.mockReturnValue([{ id: 'injected', name: 'MetaMask' }]);
    mocks.useConnect.mockReturnValue({
      mutateAsync: mockConnectAsync,
      isPending: false,
    });
    mocks.useDisconnect.mockReturnValue({
      mutateAsync: mockDisconnectAsync,
      isPending: false,
    });
    mocks.useSwitchChain.mockReturnValue({
      mutateAsync: mockSwitchChainAsync,
    });
    mocks.useSignMessage.mockReturnValue({
      mutateAsync: mockSignMessageAsync,
    });
    mocks.useSignTypedData.mockReturnValue({
      mutateAsync: mockSignTypedDataAsync,
    });
    mocks.useBalance.mockReturnValue({ data: undefined, isLoading: false });
    mocks.getWalletClient.mockResolvedValue({
      account: { address: mockAddress },
      sendTransaction: vi.fn(),
    });
    mocks.formatUnits.mockImplementation((value: bigint, decimals: number) =>
      (Number(value) / 10 ** decimals).toString(),
    );
  });

  describe('initial state', () => {
    it('should return disconnected state by default', () => {
      const { result } = renderHook(() => useWagmiWalletBackend());

      expect(result.current.isConnected).toBe(false);
      expect(result.current.isConnecting).toBe(false);
      expect(result.current.isDisconnecting).toBe(false);
      expect(result.current.account).toBeNull();
      expect(result.current.chain).toBeNull();
      expect(result.current.error).toBeNull();
    });

    it('should return empty wallet list when not connected', () => {
      const { result } = renderHook(() => useWagmiWalletBackend());

      expect(result.current.connectedWallets).toEqual([]);
      expect(result.current.hasMultipleWallets).toBe(false);
    });
  });

  describe('connected state', () => {
    beforeEach(() => {
      mocks.useConnection.mockReturnValue({
        address: mockAddress,
        isConnected: true,
        isConnecting: false,
        chain: mockChain,
      });
      mocks.useBalance.mockReturnValue({
        data: {
          value: BigInt('1500000000000000000'),
          decimals: 18,
          symbol: 'ETH',
        },
      });
    });

    it('should reflect connected state', () => {
      const { result } = renderHook(() => useWagmiWalletBackend());

      expect(result.current.isConnected).toBe(true);
      expect(result.current.account).toEqual({
        address: mockAddress,
        isConnected: true,
        balance: '1.5',
      });
    });

    it('should transform chain data', () => {
      const { result } = renderHook(() => useWagmiWalletBackend());

      expect(result.current.chain).toEqual({
        id: 1,
        name: 'Ethereum Mainnet',
        symbol: 'ETH',
      });
    });

    it('should show single wallet in connectedWallets', () => {
      const { result } = renderHook(() => useWagmiWalletBackend());

      expect(result.current.connectedWallets).toEqual([
        { address: mockAddress, isActive: true },
      ]);
      expect(result.current.hasMultipleWallets).toBe(false);
    });
  });

  describe('connecting state', () => {
    it('should reflect connecting state from useConnection', () => {
      mocks.useConnection.mockReturnValue({
        address: undefined,
        isConnected: false,
        isConnecting: true,
        chain: undefined,
      });

      const { result } = renderHook(() => useWagmiWalletBackend());

      expect(result.current.isConnecting).toBe(true);
    });

    it('should reflect connecting state from useConnect isPending', () => {
      mocks.useConnectors.mockReturnValue([
        { id: 'injected', name: 'MetaMask' },
      ]);
      mocks.useConnect.mockReturnValue({
        mutateAsync: mockConnectAsync,
        isPending: true,
      });

      const { result } = renderHook(() => useWagmiWalletBackend());

      expect(result.current.isConnecting).toBe(true);
    });
  });

  describe('disconnecting state', () => {
    it('should reflect disconnecting state', () => {
      mocks.useDisconnect.mockReturnValue({
        mutateAsync: mockDisconnectAsync,
        isPending: true,
      });

      const { result } = renderHook(() => useWagmiWalletBackend());

      expect(result.current.isDisconnecting).toBe(true);
    });
  });

  describe('connect', () => {
    it('should connect with first connector when only one available', async () => {
      const connector = { id: 'injected', name: 'MetaMask' };
      mocks.useConnectors.mockReturnValue([connector]);

      const { result } = renderHook(() => useWagmiWalletBackend());

      await invokeAction(() => result.current.connect());

      expect(mockConnectAsync).toHaveBeenCalledWith({ connector });
    });

    it('should set NO_WALLET error when no connectors', async () => {
      mocks.useConnectors.mockReturnValue([]);

      const { result } = renderHook(() => useWagmiWalletBackend());

      await invokeAction(() => result.current.connect());

      await waitFor(() => {
        expect(result.current.error).toEqual({
          message:
            'No wallet detected. Please install MetaMask or another wallet extension.',
          code: 'NO_WALLET',
        });
      });
      expect(mockConnectAsync).not.toHaveBeenCalled();
    });

    it('should set WALLET_SELECTION_REQUIRED error when multiple connectors', async () => {
      mocks.useConnectors.mockReturnValue([
        { id: 'metamask', name: 'MetaMask' },
        { id: 'rabby', name: 'Rabby' },
      ]);

      const { result } = renderHook(() => useWagmiWalletBackend());

      await invokeAction(() => result.current.connect());

      await waitFor(() => {
        expect(result.current.error).toEqual({
          message: 'Multiple wallets detected. Please choose a wallet first.',
          code: 'WALLET_SELECTION_REQUIRED',
        });
      });
      expect(mockConnectAsync).not.toHaveBeenCalled();
    });

    it('should handle connection errors', async () => {
      mocks.useConnectors.mockReturnValue([
        { id: 'injected', name: 'MetaMask' },
      ]);
      mockConnectAsync.mockRejectedValue(new Error('User rejected'));

      const { result } = renderHook(() => useWagmiWalletBackend());

      const { error } = await invokeAction(() => result.current.connect());

      expect(error).toBeInstanceOf(Error);
      await waitFor(() => {
        expect(result.current.error).toEqual({
          message: 'User rejected',
          code: 'CONNECT_ERROR',
        });
      });
    });

    it('should clear previous error before connecting', async () => {
      mocks.useConnectors.mockReturnValue([
        { id: 'injected', name: 'MetaMask' },
      ]);

      const { result } = renderHook(() => useWagmiWalletBackend());

      // First attempt fails
      mockConnectAsync.mockRejectedValueOnce(new Error('First error'));
      await invokeAction(() => result.current.connect());
      expect(result.current.error).toBeDefined();

      // Second attempt succeeds
      mockConnectAsync.mockResolvedValueOnce(undefined);
      await invokeAction(() => result.current.connect());
      expect(result.current.error).toBeNull();
    });
  });

  describe('disconnect', () => {
    it('should call disconnectAsync', async () => {
      const { result } = renderHook(() => useWagmiWalletBackend());

      await invokeAction(() => result.current.disconnect());

      expect(mockDisconnectAsync).toHaveBeenCalled();
    });

    it('should handle disconnect errors', async () => {
      mockDisconnectAsync.mockRejectedValue(new Error('Disconnect failed'));

      const { result } = renderHook(() => useWagmiWalletBackend());

      const { error } = await invokeAction(() => result.current.disconnect());

      expect(error).toBeInstanceOf(Error);
      await waitFor(() => {
        expect(result.current.error).toEqual({
          message: 'Disconnect failed',
          code: 'DISCONNECT_ERROR',
        });
      });
    });
  });

  describe('switchChain', () => {
    it('should switch chain', async () => {
      const { result } = renderHook(() => useWagmiWalletBackend());

      await invokeAction(() => result.current.switchChain(137));

      expect(mockSwitchChainAsync).toHaveBeenCalledWith({ chainId: 137 });
    });

    it('should throw on chain switch failure', async () => {
      mockSwitchChainAsync.mockRejectedValue(
        new Error('User rejected chain switch'),
      );

      const { result } = renderHook(() => useWagmiWalletBackend());

      const { error } = await invokeAction(() =>
        result.current.switchChain(137),
      );

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe('User rejected chain switch');
    });

    it('should be a no-op when switchChainAsync is undefined', async () => {
      mocks.useSwitchChain.mockReturnValue({ mutateAsync: undefined });

      const { result } = renderHook(() => useWagmiWalletBackend());

      // Should not throw
      await invokeAction(() => result.current.switchChain(137));
    });
  });

  describe('getWalletClient', () => {
    it('should return wallet client when connected', async () => {
      mocks.useConnection.mockReturnValue({
        address: mockAddress,
        isConnected: true,
        isConnecting: false,
        chain: mockChain,
      });

      const walletClient = { account: { address: mockAddress } };
      mocks.getWalletClient.mockResolvedValue(walletClient);

      const { result } = renderHook(() => useWagmiWalletBackend());

      const { value } = await invokeAction(() =>
        result.current.getWalletClient(),
      );

      expect(value).toBe(walletClient);
    });

    it('should pass chainId when provided', async () => {
      mocks.useConnection.mockReturnValue({
        address: mockAddress,
        isConnected: true,
        isConnecting: false,
        chain: mockChain,
      });

      const walletClient = { account: { address: mockAddress } };
      mocks.getWalletClient.mockResolvedValue(walletClient);

      const { result } = renderHook(() => useWagmiWalletBackend());

      await invokeAction(() => result.current.getWalletClient(8453));

      expect(mocks.getWalletClient).toHaveBeenCalledWith({}, { chainId: 8453 });
    });

    it('should throw when not connected', async () => {
      const { result } = renderHook(() => useWagmiWalletBackend());

      const { error } = await invokeAction(() =>
        result.current.getWalletClient(),
      );

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe('No account connected');
    });
  });

  describe('signMessage', () => {
    it('should sign message when connected', async () => {
      mocks.useConnection.mockReturnValue({
        address: mockAddress,
        isConnected: true,
        isConnecting: false,
        chain: mockChain,
      });

      const { result } = renderHook(() => useWagmiWalletBackend());

      const { value } = await invokeAction(() =>
        result.current.signMessage('Hello, world!'),
      );

      expect(mockSignMessageAsync).toHaveBeenCalledWith({
        message: 'Hello, world!',
      });
      expect(value).toBe('0xsignature');
    });

    it('should throw when no account connected', async () => {
      const { result } = renderHook(() => useWagmiWalletBackend());

      const { error } = await invokeAction(() =>
        result.current.signMessage('test'),
      );

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe('No account connected');
    });

    it('should throw on signing failure', async () => {
      mocks.useConnection.mockReturnValue({
        address: mockAddress,
        isConnected: true,
        isConnecting: false,
        chain: mockChain,
      });
      mockSignMessageAsync.mockRejectedValue(
        new Error('User rejected signing'),
      );

      const { result } = renderHook(() => useWagmiWalletBackend());

      const { error } = await invokeAction(() =>
        result.current.signMessage('test'),
      );

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe('User rejected signing');
    });
  });

  describe('signTypedData', () => {
    const typedData = {
      domain: { name: 'Test', chainId: 1 },
      types: { Test: [{ name: 'value', type: 'string' }] },
      message: { value: 'test' },
      primaryType: 'Test',
    } as const;

    it('should sign typed data when connected', async () => {
      mocks.useConnection.mockReturnValue({
        address: mockAddress,
        isConnected: true,
        isConnecting: false,
        chain: mockChain,
      });

      const { result } = renderHook(() => useWagmiWalletBackend());

      const { value } = await invokeAction(() =>
        result.current.signTypedData(typedData as never),
      );

      expect(mockSignTypedDataAsync).toHaveBeenCalled();
      expect(value).toBe('0xtypedsignature');
    });

    it('should throw when no account connected', async () => {
      const { result } = renderHook(() => useWagmiWalletBackend());

      const { error } = await invokeAction(() =>
        result.current.signTypedData(typedData as never),
      );

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe('No account connected');
    });

    it('should throw on signing failure', async () => {
      mocks.useConnection.mockReturnValue({
        address: mockAddress,
        isConnected: true,
        isConnecting: false,
        chain: mockChain,
      });
      mockSignTypedDataAsync.mockRejectedValue(new Error('User rejected'));

      const { result } = renderHook(() => useWagmiWalletBackend());

      const { error } = await invokeAction(() =>
        result.current.signTypedData(typedData as never),
      );

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe('User rejected');
    });
  });

  describe('sendTransaction', () => {
    const txParams = {
      to: '0xabcdef1234567890abcdef1234567890abcdef12' as `0x${string}`,
      data: '0x1234' as `0x${string}`,
      value: BigInt('1000000000000000000'),
      chainId: 1,
    };

    it('should send transaction when on correct chain', async () => {
      const mockSendTx = vi.fn().mockResolvedValue('0xtxhash');
      mocks.useConnection.mockReturnValue({
        address: mockAddress,
        isConnected: true,
        isConnecting: false,
        chain: mockChain,
      });
      mocks.getWalletClient.mockResolvedValue({
        account: { address: mockAddress },
        sendTransaction: mockSendTx,
      });

      const { result } = renderHook(() => useWagmiWalletBackend());

      const { value } = await invokeAction(() =>
        result.current.sendTransaction(txParams),
      );

      expect(mockSendTx).toHaveBeenCalled();
      expect(value).toBe('0xtxhash');
    });

    it('should switch chain before sending when on different chain', async () => {
      const mockSendTx = vi.fn().mockResolvedValue('0xtxhash');
      mocks.useConnection.mockReturnValue({
        address: mockAddress,
        isConnected: true,
        isConnecting: false,
        chain: {
          id: 137,
          name: 'Polygon',
          nativeCurrency: { symbol: 'MATIC', decimals: 18 },
        },
      });
      mocks.getWalletClient.mockResolvedValue({
        account: { address: mockAddress },
        sendTransaction: mockSendTx,
      });

      const { result } = renderHook(() => useWagmiWalletBackend());

      const { value } = await invokeAction(() =>
        result.current.sendTransaction(txParams),
      );

      expect(mockSwitchChainAsync).toHaveBeenCalledWith({ chainId: 1 });
      expect(value).toBe('0xtxhash');
    });

    it('should throw when not connected', async () => {
      const { result } = renderHook(() => useWagmiWalletBackend());

      const { error } = await invokeAction(() =>
        result.current.sendTransaction(txParams),
      );

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe(
        'Wallet not connected (no address from useConnection)',
      );
    });

    it('should throw when getWalletClient returns null', async () => {
      mocks.useConnection.mockReturnValue({
        address: mockAddress,
        isConnected: true,
        isConnecting: false,
        chain: mockChain,
      });
      mocks.getWalletClient.mockResolvedValue(null);

      const { result } = renderHook(() => useWagmiWalletBackend());

      const { error } = await invokeAction(() =>
        result.current.sendTransaction(txParams),
      );

      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('switchActiveWallet', () => {
    it('should be a no-op', async () => {
      const { result } = renderHook(() => useWagmiWalletBackend());

      await invokeAction(() => result.current.switchActiveWallet('0xother'));

      expect(mocks.walletLogger.info).toHaveBeenCalledWith(
        'switchActiveWallet is a no-op in wagmi mode',
      );
    });
  });

  describe('clearError', () => {
    it('should clear the error state', async () => {
      mocks.useConnectors.mockReturnValue([]);

      const { result } = renderHook(() => useWagmiWalletBackend());

      // Trigger error
      await invokeAction(() => result.current.connect());
      await waitFor(() => {
        expect(result.current.error).not.toBeNull();
      });

      // Clear
      act(() => {
        result.current.clearError();
      });

      await waitFor(() => {
        expect(result.current.error).toBeNull();
      });
    });
  });

  describe('balance', () => {
    it('should return undefined balance when no balance data', () => {
      mocks.useConnection.mockReturnValue({
        address: mockAddress,
        isConnected: true,
        isConnecting: false,
        chain: mockChain,
      });
      mocks.useBalance.mockReturnValue({ data: undefined });

      const { result } = renderHook(() => useWagmiWalletBackend());

      expect(result.current.account?.balance).toBe('0');
    });

    it('should format balance from useBalance', () => {
      mocks.useConnection.mockReturnValue({
        address: mockAddress,
        isConnected: true,
        isConnecting: false,
        chain: mockChain,
      });
      mocks.useBalance.mockReturnValue({
        data: { value: BigInt('5000000'), decimals: 6, symbol: 'USDC' },
      });

      const { result } = renderHook(() => useWagmiWalletBackend());

      expect(result.current.account?.balance).toBe('5');
    });
  });
});
