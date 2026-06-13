import { useCallback, useMemo, useState } from 'react';
import { formatUnits } from 'viem';
import {
  useBalance,
  useConnect,
  useConnection,
  useConnectors,
  useDisconnect,
  useSignMessage,
  useSignTypedData,
  useSwitchChain,
} from 'wagmi';
import { getWalletClient as getWagmiWalletClient } from 'wagmi/actions';

import { wagmiConfig } from '@/config/wagmi';
import {
  buildWalletAccount,
  buildWalletChain,
  handleWalletOperationError,
  type SimplifiedChain,
  type SimplifiedWalletAccount,
  type WalletError,
} from '@/providers/walletProviderUtils';
import type {
  ConnectedWalletClient,
  WalletProviderInterface,
  WalletTypedData,
} from '@/types';
import { walletLogger } from '@/utils';

/**
 * wagmi-backed implementation of {@link WalletProviderInterface}.
 *
 * Extracted from `WalletProvider` so it can be reused both by the
 * RainbowKit-only provider and by the unified provider that merges it with the
 * Privy embedded-wallet backend. Behaviour is unchanged from the original
 * single-provider implementation (single-account model).
 *
 * @returns The wallet interface backed by wagmi/RainbowKit.
 */
export function useWagmiWalletBackend(): WalletProviderInterface {
  const {
    address,
    isConnected,
    isConnecting: accountIsConnecting,
    chain,
  } = useConnection();
  const connectors = useConnectors();
  const { mutateAsync: connectAsync, isPending: connectIsPending } =
    useConnect();
  const { mutateAsync: disconnectAsync, isPending: disconnectIsPending } =
    useDisconnect();
  const { mutateAsync: switchChainAsync } = useSwitchChain();
  const { mutateAsync: signMessageAsync } = useSignMessage();
  const { mutateAsync: signTypedDataAsync } = useSignTypedData();
  const balance = useBalance({
    address,
    chainId: chain?.id,
  });
  const [error, setError] = useState<WalletError | null>(null);

  const walletList = useMemo(() => {
    if (!address) return [];
    return [{ address, isActive: true }];
  }, [address]);

  const handleSwitchActiveWallet = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async (_address: string): Promise<void> => {
      // wagmi uses a single-account model; multi-wallet switching is not applicable
      walletLogger.info('switchActiveWallet is a no-op in wagmi mode');
    },
    [],
  );

  const formattedBalance: string | undefined = useMemo(
    () =>
      balance.data
        ? formatUnits(balance.data.value, balance.data.decimals)
        : undefined,
    [balance.data],
  );

  const walletAccount = useMemo((): SimplifiedWalletAccount | null => {
    return buildWalletAccount(address, formattedBalance);
  }, [address, formattedBalance]);

  const walletChain = useMemo((): SimplifiedChain | null => {
    return buildWalletChain(chain);
  }, [chain]);

  const isConnectingState = accountIsConnecting || connectIsPending;

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const handleConnect = useCallback(async () => {
    const noWalletError: WalletError = {
      message:
        'No wallet detected. Please install MetaMask or another wallet extension.',
      code: 'NO_WALLET',
    };

    if (connectors.length === 0) {
      setError(noWalletError);
      return;
    }

    if (connectors.length > 1) {
      setError({
        message: 'Multiple wallets detected. Please choose a wallet first.',
        code: 'WALLET_SELECTION_REQUIRED',
      });
      return;
    }

    const connector = connectors[0];
    if (!connector) {
      setError(noWalletError);
      return;
    }

    try {
      setError(null);
      await connectAsync({ connector });
    } catch (err) {
      handleWalletOperationError(
        setError,
        err,
        'Failed to connect wallet',
        'CONNECT_ERROR',
        'Failed to connect wallet:',
      );
    }
  }, [connectAsync, connectors]);

  const handleDisconnect = useCallback(async () => {
    try {
      setError(null);
      await disconnectAsync();
    } catch (err) {
      handleWalletOperationError(
        setError,
        err,
        'Failed to disconnect wallet',
        'DISCONNECT_ERROR',
        'Failed to disconnect wallet:',
      );
    }
  }, [disconnectAsync]);

  const handleSwitchChain = useCallback(
    async (chainId: number): Promise<void> => {
      if (!switchChainAsync) return;

      try {
        await switchChainAsync({ chainId });
      } catch (err) {
        walletLogger.error('Failed to switch chain:', err);
        throw err;
      }
    },
    [switchChainAsync],
  );

  const signMessage = useCallback(
    async (message: string): Promise<string> => {
      if (!address) {
        throw new Error('No account connected');
      }

      try {
        return await signMessageAsync({ message });
      } catch (err) {
        walletLogger.error('Failed to sign message:', err);
        throw err;
      }
    },
    [address, signMessageAsync],
  );

  const signTypedData = useCallback(
    async (typedData: WalletTypedData): Promise<`0x${string}`> => {
      if (!address) {
        throw new Error('No account connected');
      }

      try {
        return await signTypedDataAsync(typedData as never);
      } catch (err) {
        walletLogger.error('Failed to sign typed data:', err);
        throw err;
      }
    },
    [address, signTypedDataAsync],
  );

  const getActiveWalletClient = useCallback(
    async (chainId?: number): Promise<ConnectedWalletClient> => {
      if (!address) {
        throw new Error('No account connected');
      }

      return getWagmiWalletClient(
        wagmiConfig,
        chainId === undefined ? {} : { chainId },
      );
    },
    [address],
  );

  const sendTransaction = useCallback(
    async (tx: {
      to: `0x${string}`;
      data?: `0x${string}`;
      value?: bigint;
      chainId: number;
      gas?: bigint;
    }): Promise<`0x${string}`> => {
      walletLogger.info('[sendTransaction] start', {
        currentChainId: chain?.id,
        targetChainId: tx.chainId,
        address,
        to: tx.to,
      });

      if (!address) {
        throw new Error('Wallet not connected (no address from useConnection)');
      }

      if (chain?.id !== tx.chainId) {
        walletLogger.info('[sendTransaction] switching chain', {
          from: chain?.id,
          to: tx.chainId,
        });
        await switchChainAsync({ chainId: tx.chainId });
      }

      const walletClient = await getWagmiWalletClient(wagmiConfig, {
        chainId: tx.chainId,
      });
      if (!walletClient) {
        throw new Error(
          'Wallet not connected (getWalletClient returned null after chain switch)',
        );
      }

      walletLogger.info('[sendTransaction] dispatching to wallet', {
        clientChainId: walletClient.chain?.id,
        dataBytes: tx.data ? (tx.data.length - 2) / 2 : 0,
        value: tx.value?.toString() ?? '0',
      });

      const hash = await walletClient.sendTransaction({
        to: tx.to,
        ...(tx.data === undefined ? {} : { data: tx.data }),
        ...(tx.value === undefined ? {} : { value: tx.value }),
        ...(tx.gas === undefined ? {} : { gas: tx.gas }),
      });

      walletLogger.info('[sendTransaction] hash', hash);
      return hash;
    },
    [address, chain?.id, switchChainAsync],
  );

  return useMemo<WalletProviderInterface>(
    () => ({
      account: walletAccount,
      chain: walletChain,
      switchChain: handleSwitchChain,
      sendTransaction,
      getWalletClient: getActiveWalletClient,
      connect: handleConnect,
      disconnect: handleDisconnect,
      isConnecting: isConnectingState,
      isDisconnecting: disconnectIsPending,
      isConnected,
      error,
      clearError,
      signMessage,
      signTypedData,
      connectedWallets: walletList,
      switchActiveWallet: handleSwitchActiveWallet,
      hasMultipleWallets: walletList.length > 1,
    }),
    [
      walletAccount,
      walletChain,
      handleSwitchChain,
      sendTransaction,
      getActiveWalletClient,
      handleConnect,
      handleDisconnect,
      isConnectingState,
      disconnectIsPending,
      isConnected,
      error,
      clearError,
      signMessage,
      signTypedData,
      walletList,
      handleSwitchActiveWallet,
    ],
  );
}
