import {
  PrivyProvider,
  useEmbeddedEthereumWallet,
  usePrivy,
} from '@privy-io/expo';
import { useLogin } from '@privy-io/expo/ui';
import { WalletProviderBase } from '@zapengine/app-core/providers/walletContext';
import {
  buildWalletAccount,
  buildWalletChain,
} from '@zapengine/app-core/providers/walletProviderUtils';
import type {
  ConnectedWalletClient,
  WalletProviderInterface,
  WalletTypedData,
} from '@zapengine/app-core/types';
import {
  type ReactElement,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  createWalletClient,
  custom,
  type EIP1193Provider,
  type Hex,
} from 'viem';

import {
  assertNativeWalletChain,
  buildConnectedWallets,
  DEFAULT_NATIVE_WALLET_CHAIN,
  getNativeWalletChain,
  shouldSwitchChain,
  toWalletError,
  toWalletSwitchEthereumChainParams,
} from '@/integration/walletBackendModel';
import {
  isPrivyLoginCancellation,
  loginWithPrivy,
  NATIVE_PRIVY_PROVIDER_CONFIG,
} from '@/integration/nativePrivyLogin';

const WALLET_NOT_CONNECTED_ERROR = 'No Privy embedded wallet connected';

interface WalletProviderProps {
  children: ReactNode;
}

type EthereumRequestProvider = EIP1193Provider & {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
};

function parseChainId(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value !== 'string') {
    return null;
  }
  const parsed = value.startsWith('0x')
    ? Number.parseInt(value, 16)
    : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export function MobilePrivyProvider({
  appId,
  clientId,
  supportedChains,
  children,
}: {
  appId: string;
  clientId: string;
  supportedChains: NonNullable<
    React.ComponentProps<typeof PrivyProvider>['supportedChains']
  >;
  children: ReactNode;
}): ReactElement {
  return (
    <PrivyProvider
      appId={appId}
      clientId={clientId}
      supportedChains={supportedChains}
      config={NATIVE_PRIVY_PROVIDER_CONFIG}
    >
      {children}
    </PrivyProvider>
  );
}

export function WalletProvider({
  children,
}: WalletProviderProps): ReactElement {
  const backend = usePrivyExpoWalletBackend();

  return <WalletProviderBase value={backend}>{children}</WalletProviderBase>;
}

export function usePrivyExpoWalletBackend(): WalletProviderInterface {
  const { isReady, error: privyError, logout } = usePrivy();
  const { login } = useLogin();
  const { wallets } = useEmbeddedEthereumWallet();
  const embeddedWallet = wallets[0] ?? null;
  const [chainId, setChainId] = useState<number>(
    DEFAULT_NATIVE_WALLET_CHAIN.id,
  );
  const [error, setError] = useState<{ message: string; code?: string } | null>(
    null,
  );
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  const getProvider =
    useCallback(async (): Promise<EthereumRequestProvider> => {
      if (!embeddedWallet) {
        throw new Error(WALLET_NOT_CONNECTED_ERROR);
      }
      return (await embeddedWallet.getProvider()) as EthereumRequestProvider;
    }, [embeddedWallet]);

  const switchChain = useCallback(
    async (requestedChainId: number): Promise<void> => {
      assertNativeWalletChain(requestedChainId);
      const provider = await getProvider();
      await provider.request({
        method: 'wallet_switchEthereumChain',
        params: toWalletSwitchEthereumChainParams(requestedChainId),
      });
      setChainId(requestedChainId);
    },
    [getProvider],
  );

  const getWalletClient = useCallback(
    async (requestedChainId?: number): Promise<ConnectedWalletClient> => {
      if (!embeddedWallet) {
        throw new Error(WALLET_NOT_CONNECTED_ERROR);
      }
      const targetChain = getNativeWalletChain(requestedChainId ?? chainId);
      const provider = await getProvider();

      return createWalletClient({
        account: embeddedWallet.address as `0x${string}`,
        chain: targetChain,
        transport: custom(provider),
      }) as ConnectedWalletClient;
    },
    [chainId, embeddedWallet, getProvider],
  );

  const connect = useCallback(async (): Promise<void> => {
    setError(null);
    setIsConnecting(true);
    try {
      if (!isReady) {
        throw new Error('Privy is not ready yet.');
      }

      await loginWithPrivy(login);
    } catch (err) {
      if (!isPrivyLoginCancellation(err)) {
        setError(toWalletError(err));
      }
      throw err;
    } finally {
      setIsConnecting(false);
    }
  }, [isReady, login]);

  const disconnect = useCallback(async (): Promise<void> => {
    setError(null);
    setIsDisconnecting(true);
    try {
      await logout();
      setChainId(DEFAULT_NATIVE_WALLET_CHAIN.id);
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
      assertNativeWalletChain(tx.chainId);
      if (shouldSwitchChain(chainId, tx.chainId)) {
        await switchChain(tx.chainId);
      }
      const client = await getWalletClient(tx.chainId);
      return client.sendTransaction({
        to: tx.to,
        ...(tx.data === undefined ? {} : { data: tx.data }),
        ...(tx.value === undefined ? {} : { value: tx.value }),
        ...(tx.gas === undefined ? {} : { gas: tx.gas }),
      });
    },
    [chainId, getWalletClient, switchChain],
  );

  const signMessage = useCallback(
    async (message: string): Promise<string> => {
      const client = await getWalletClient();
      return client.signMessage({ message });
    },
    [getWalletClient],
  );

  const signTypedData = useCallback(
    async (typedData: WalletTypedData): Promise<Hex> => {
      const client = await getWalletClient();
      return client.signTypedData(typedData as never);
    },
    [getWalletClient],
  );

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  useEffect(() => {
    if (!embeddedWallet) {
      return;
    }

    let cancelled = false;
    void embeddedWallet
      .getProvider()
      .then((provider) =>
        (provider as EthereumRequestProvider).request({
          method: 'eth_chainId',
        }),
      )
      .then((providerChainId) => {
        const parsed = parseChainId(providerChainId);
        if (!cancelled && parsed) {
          setChainId(getNativeWalletChain(parsed).id);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setChainId(DEFAULT_NATIVE_WALLET_CHAIN.id);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [embeddedWallet]);

  const walletList = useMemo(
    () => buildConnectedWallets(embeddedWallet?.address),
    [embeddedWallet?.address],
  );

  const handleSwitchActiveWallet =
    useCallback(async (): Promise<void> => {}, []);

  return useMemo<WalletProviderInterface>(
    () => ({
      account: buildWalletAccount(embeddedWallet?.address),
      chain: embeddedWallet
        ? buildWalletChain(getNativeWalletChain(chainId))
        : null,
      connect,
      disconnect,
      switchChain,
      sendTransaction,
      getWalletClient,
      signMessage,
      signTypedData,
      isConnected: Boolean(embeddedWallet),
      isConnecting: !isReady || isConnecting,
      isDisconnecting,
      error:
        error ?? (privyError ? { message: getErrorMessage(privyError) } : null),
      clearError,
      connectedWallets: walletList,
      switchActiveWallet: handleSwitchActiveWallet,
      hasMultipleWallets: false,
    }),
    [
      chainId,
      clearError,
      connect,
      disconnect,
      embeddedWallet,
      error,
      getWalletClient,
      handleSwitchActiveWallet,
      isConnecting,
      isDisconnecting,
      isReady,
      privyError,
      sendTransaction,
      signMessage,
      signTypedData,
      switchChain,
      walletList,
    ],
  );
}
