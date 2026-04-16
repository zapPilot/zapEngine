import {
  createContext,
  type ReactElement,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { formatUnits } from "viem";
import {
  useBalance,
  useConnect,
  useConnection,
  useConnectors,
  useDisconnect,
  useSignMessage,
  useSwitchChain,
} from "wagmi";

import {
  buildWalletAccount,
  buildWalletChain,
  handleWalletOperationError,
  type SimplifiedChain,
  type SimplifiedWalletAccount,
  type WalletError,
} from "@/providers/walletProviderUtils";
import type { WalletProviderInterface } from "@/types";
import { walletLogger } from "@/utils";

type WalletContextValue = WalletProviderInterface;

const WalletContext = createContext<WalletContextValue | null>(null);

interface WalletProviderProps {
  children: ReactNode;
}
export function WalletProvider({
  children,
}: WalletProviderProps): ReactElement {
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
      walletLogger.info("switchActiveWallet is a no-op in wagmi mode");
    },
    []
  );

  const formattedBalance: string | undefined = useMemo(
    () =>
      balance.data
        ? formatUnits(balance.data.value, balance.data.decimals)
        : undefined,
    [balance.data]
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
    const connector = connectors[0];
    if (!connector) {
      setError({
        message:
          "No wallet detected. Please install MetaMask or another wallet extension.",
        code: "NO_WALLET",
      });
      return;
    }

    try {
      setError(null);
      await connectAsync({ connector });
    } catch (err) {
      handleWalletOperationError(
        setError,
        err,
        "Failed to connect wallet",
        "CONNECT_ERROR",
        "Failed to connect wallet:"
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
        "Failed to disconnect wallet",
        "DISCONNECT_ERROR",
        "Failed to disconnect wallet:"
      );
    }
  }, [disconnectAsync]);

  const handleSwitchChain = useCallback(
    async (chainId: number): Promise<void> => {
      if (!switchChainAsync) return;

      try {
        await switchChainAsync({ chainId });
      } catch (err) {
        walletLogger.error("Failed to switch chain:", err);
        throw err;
      }
    },
    [switchChainAsync]
  );

  const signMessage = useCallback(
    async (message: string): Promise<string> => {
      if (!address) {
        throw new Error("No account connected");
      }

      try {
        return await signMessageAsync({ message });
      } catch (err) {
        walletLogger.error("Failed to sign message:", err);
        throw err;
      }
    },
    [address, signMessageAsync]
  );

  const contextValue = useMemo<WalletContextValue>(
    () => ({
      account: walletAccount,
      chain: walletChain,
      switchChain: handleSwitchChain,
      connect: handleConnect,
      disconnect: handleDisconnect,
      isConnecting: isConnectingState,
      isDisconnecting: disconnectIsPending,
      isConnected,
      error,
      clearError,
      signMessage,
      connectedWallets: walletList,
      switchActiveWallet: handleSwitchActiveWallet,
      hasMultipleWallets: walletList.length > 1,
    }),
    [
      walletAccount,
      walletChain,
      handleSwitchChain,
      handleConnect,
      handleDisconnect,
      isConnectingState,
      disconnectIsPending,
      isConnected,
      error,
      clearError,
      signMessage,
      walletList,
      handleSwitchActiveWallet,
    ]
  );

  return (
    <WalletContext.Provider value={contextValue}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWalletProvider(): WalletProviderInterface {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error("useWalletProvider must be used within a WalletProvider");
  }
  return context;
}
