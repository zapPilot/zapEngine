import {
  buildWalletAccount,
  buildWalletChain,
  type WalletError,
} from '@zapengine/app-core/providers/walletProviderUtils';
import { WalletProviderBase } from '@zapengine/app-core/providers/walletContext';
import type {
  ConnectedWalletClient,
  WalletProviderInterface,
  WalletTypedData,
} from '@zapengine/app-core/types';
import { useEmbeddedEthereumWallet, usePrivy } from '@privy-io/expo';
import { useLogin } from '@privy-io/expo/ui';
import {
  type ReactElement,
  type ReactNode,
  useCallback,
  useMemo,
  useState,
} from 'react';
import { createWalletClient, custom, type Hex } from 'viem';

import {
  DEFAULT_MOBILE_PRIVY_CHAIN,
  buildConnectedWallets,
  getMobilePrivyChain,
  requireMobilePrivyChain,
  shouldSwitchChain,
  toEip155HexChainId,
} from '@/integration/walletBackendModel';

type EthereumProvider = Parameters<typeof custom>[0];

interface EmbeddedEthereumWallet {
  address: `0x${string}`;
  getProvider(): Promise<EthereumProvider>;
}

interface WalletProviderProps {
  children: ReactNode;
}

const WALLET_NOT_CONNECTED_ERROR = 'Privy wallet is not connected.';

function isEmbeddedEthereumWallet(
  wallet: unknown,
): wallet is EmbeddedEthereumWallet {
  if (typeof wallet !== 'object' || wallet === null) {
    return false;
  }
  const candidate = wallet as {
    address?: unknown;
    getProvider?: unknown;
  };
  return (
    typeof candidate.address === 'string' &&
    candidate.address.startsWith('0x') &&
    typeof candidate.getProvider === 'function'
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function toWalletError(error: unknown): WalletError {
  return { message: errorMessage(error) };
}

export function usePrivyExpoWalletBackend(): WalletProviderInterface {
  const { ready, user, logout } = usePrivy();
  const { login } = useLogin();
  const { wallets, create } = useEmbeddedEthereumWallet();
  const [currentChainId, setCurrentChainId] = useState(
    DEFAULT_MOBILE_PRIVY_CHAIN.id,
  );
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [error, setError] = useState<WalletError | null>(null);

  const embeddedWallet = useMemo(
    () => (wallets.length > 0 ? wallets.find(isEmbeddedEthereumWallet) : null),
    [wallets],
  );
  const isAuthenticated = ready && Boolean(user);
  const isConnected = isAuthenticated && Boolean(embeddedWallet);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const getProvider = useCallback(async (): Promise<EthereumProvider> => {
    if (!embeddedWallet) {
      throw new Error(WALLET_NOT_CONNECTED_ERROR);
    }
    return embeddedWallet.getProvider();
  }, [embeddedWallet]);

  const getWalletClient = useCallback(
    async (chainId?: number): Promise<ConnectedWalletClient> => {
      if (!embeddedWallet) {
        throw new Error(WALLET_NOT_CONNECTED_ERROR);
      }

      const chain =
        chainId === undefined
          ? getMobilePrivyChain(currentChainId)
          : requireMobilePrivyChain(chainId);
      const provider = await getProvider();

      return createWalletClient({
        account: embeddedWallet.address,
        chain,
        transport: custom(provider),
      }) as ConnectedWalletClient;
    },
    [currentChainId, embeddedWallet, getProvider],
  );

  const switchChain = useCallback(
    async (chainId: number): Promise<void> => {
      try {
        requireMobilePrivyChain(chainId);
        const provider = await getProvider();
        await provider.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: toEip155HexChainId(chainId) }],
        });
        setCurrentChainId(chainId);
      } catch (err) {
        setError(toWalletError(err));
        throw err;
      }
    },
    [getProvider],
  );

  const connect = useCallback(async (): Promise<void> => {
    try {
      setError(null);
      setIsConnecting(true);

      if (!ready) {
        throw new Error('Privy is not ready yet.');
      }

      if (!user) {
        await login({ loginMethods: ['email'] });
      }

      if (wallets.length === 0) {
        await create();
      }
    } catch (err) {
      setError(toWalletError(err));
      throw err;
    } finally {
      setIsConnecting(false);
    }
  }, [create, login, ready, user, wallets.length]);

  const disconnect = useCallback(async (): Promise<void> => {
    try {
      setError(null);
      setIsDisconnecting(true);
      await logout();
      setCurrentChainId(DEFAULT_MOBILE_PRIVY_CHAIN.id);
    } catch (err) {
      setError(toWalletError(err));
      throw err;
    } finally {
      setIsDisconnecting(false);
    }
  }, [logout]);

  const sendTransaction = useCallback(
    async (tx: {
      to: `0x${string}`;
      data?: `0x${string}`;
      value?: bigint;
      chainId: number;
      gas?: bigint;
    }): Promise<`0x${string}`> => {
      try {
        requireMobilePrivyChain(tx.chainId);
        if (shouldSwitchChain(currentChainId, tx.chainId)) {
          await switchChain(tx.chainId);
        }

        const client = await getWalletClient(tx.chainId);
        return client.sendTransaction({
          to: tx.to,
          ...(tx.data === undefined ? {} : { data: tx.data }),
          ...(tx.value === undefined ? {} : { value: tx.value }),
          ...(tx.gas === undefined ? {} : { gas: tx.gas }),
        });
      } catch (err) {
        setError(toWalletError(err));
        throw err;
      }
    },
    [currentChainId, getWalletClient, switchChain],
  );

  const signMessage = useCallback(
    async (message: string): Promise<string> => {
      try {
        const client = await getWalletClient();
        return client.signMessage({ message });
      } catch (err) {
        setError(toWalletError(err));
        throw err;
      }
    },
    [getWalletClient],
  );

  const signTypedData = useCallback(
    async (typedData: WalletTypedData): Promise<Hex> => {
      try {
        const client = await getWalletClient();
        return client.signTypedData(typedData as never);
      } catch (err) {
        setError(toWalletError(err));
        throw err;
      }
    },
    [getWalletClient],
  );

  const connectedWallets = useMemo(
    () => buildConnectedWallets(embeddedWallet?.address),
    [embeddedWallet?.address],
  );

  const switchActiveWallet = useCallback(
    async (address: string): Promise<void> => {
      void address;
    },
    [],
  );

  return useMemo<WalletProviderInterface>(
    () => ({
      account: buildWalletAccount(embeddedWallet?.address),
      chain: buildWalletChain(
        isConnected ? getMobilePrivyChain(currentChainId) : null,
      ),
      connect,
      disconnect,
      switchChain,
      sendTransaction,
      getWalletClient,
      signMessage,
      signTypedData,
      isConnected,
      isConnecting,
      isDisconnecting,
      error,
      clearError,
      connectedWallets,
      switchActiveWallet,
      hasMultipleWallets: false,
    }),
    [
      clearError,
      connect,
      connectedWallets,
      currentChainId,
      disconnect,
      embeddedWallet?.address,
      error,
      getWalletClient,
      isConnected,
      isConnecting,
      isDisconnecting,
      sendTransaction,
      signMessage,
      signTypedData,
      switchActiveWallet,
      switchChain,
    ],
  );
}

export function WalletProvider({
  children,
}: WalletProviderProps): ReactElement {
  const walletBackend = usePrivyExpoWalletBackend();

  return (
    <WalletProviderBase value={walletBackend}>{children}</WalletProviderBase>
  );
}
