import { getWagmiConfig } from '@core/config/wagmi';
import { extractErrorMessage } from '@core/lib/errors';
import {
  approvedWalletBrand,
  isApprovedWalletConnector,
} from '@core/lib/wallet/approvedWallets';
import {
  assertEIP7702DelegationCompatibility,
  isEIP7702WalletRecoveryError,
  submitPreparedTransactionsWithEIP7702,
} from '@core/lib/wallet/executeDepositPlan';
import {
  checkReviewedBatchGuards,
  useDeduplicatedReviewedExecution,
} from '@core/lib/wallet/reviewedBatchExecution';
import {
  buildWalletAccount,
  buildWalletChain,
  type WalletError,
} from '@core/providers/walletProviderUtils';
import type {
  ConnectedWalletClient,
  WalletConnectorOption,
  WalletProviderInterface,
  WalletReviewedBatchExecutor,
  WalletReviewedBatchStatus,
  WalletReviewedBatchStatusExecutor,
  WalletTypedData,
} from '@core/types';
import { walletLogger } from '@core/utils';
import { waitForEIP7702Confirmation } from '@zapengine/intent-engine';
import { useCallback, useMemo, useRef, useState } from 'react';
import { formatUnits } from 'viem';
import {
  type Connector,
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

/**
 * Maps wagmi's live connector list onto the picker's `WalletConnectorOption`
 * shape. EIP-6963 multi-injected discovery adds one connector per detected
 * extension alongside the generic `injected()` fallback (`id: 'injected'`);
 * once a specific one is found, the generic entry is redundant (same
 * underlying extension) and is dropped.
 */
function toConnectorOptions(
  connectors: readonly Connector[],
): WalletConnectorOption[] {
  const specificInjected = connectors.filter(
    (connector) => connector.id !== 'injected',
  );
  const visibleInjected =
    specificInjected.length > 0 ? specificInjected : connectors;

  return visibleInjected.map((connector) => ({
    id: connector.id,
    name: connector.name,
    ...(connector.icon ? { icon: connector.icon } : {}),
    recommended: isApprovedWalletConnector(connector),
    type: 'injected',
  }));
}

function toWalletError(
  err: unknown,
  fallbackMessage: string,
  code: string,
): WalletError {
  return {
    message: err instanceof Error ? err.message : fallbackMessage,
    code,
  };
}

export interface WagmiWalletBackend {
  /** The wallet interface backed by wagmi. */
  backend: WalletProviderInterface;
  /** Whether the wagmi backend should drive `useWalletProvider()`. */
  isConnected: boolean;
  /** Discovered injected wallets. */
  connectors: WalletConnectorOption[];
  /** Connect to a specific discovered connector by its `WalletConnectorOption.id`. */
  connectInjected: (connectorId: string) => Promise<boolean>;
}

/**
 * wagmi-backed implementation of {@link WalletProviderInterface}.
 *
 * Web + Electron desktop only — external wallets have no reach on native.
 * Single-account model (wagmi's default); multi-wallet switching is a no-op.
 * Never implements `executeAtomicBatch` — external wallets execute deposit
 * plans via the generic EIP-7702 path (`executionMode: 'eip7702'`), which only
 * needs `getWalletClient`.
 *
 * @returns The wagmi backend plus the extra connector-selection surface the
 * custom connect picker (`useWalletLogin`) reads from.
 */
export function useWagmiWalletBackend(): WagmiWalletBackend {
  const {
    address,
    isConnected,
    isConnecting: accountIsConnecting,
    isReconnecting,
    connector: activeConnector,
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

  const connectorOptions = useMemo(
    () => toConnectorOptions(connectors),
    [connectors],
  );
  const externalWalletBrand = activeConnector
    ? (approvedWalletBrand(activeConnector) ?? undefined)
    : undefined;

  const walletList = useMemo(() => {
    if (!address) return [];
    return [{ address, isActive: true }];
  }, [address]);

  const handleSwitchActiveWallet = useCallback(async (): Promise<void> => {
    walletLogger.info('switchActiveWallet is a no-op in wagmi mode');
  }, []);

  const formattedBalance: string | undefined = useMemo(
    () =>
      balance.data
        ? formatUnits(balance.data.value, balance.data.decimals)
        : undefined,
    [balance.data],
  );

  const walletAccount = useMemo(
    () => buildWalletAccount(address, formattedBalance),
    [address, formattedBalance],
  );

  const walletChain = useMemo(() => buildWalletChain(chain), [chain]);

  const isConnectingState =
    accountIsConnecting || isReconnecting || connectIsPending;
  const connectPromiseRef = useRef<Promise<boolean> | null>(null);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const connectToConnector = useCallback(
    (connector: Connector): Promise<boolean> => {
      const pending = connectPromiseRef.current;
      if (pending) return pending;

      const isSameActiveConnector =
        isConnected &&
        activeConnector !== undefined &&
        ((Boolean(activeConnector.uid) &&
          Boolean(connector.uid) &&
          activeConnector.uid === connector.uid) ||
          activeConnector === connector);
      if (isSameActiveConnector) {
        setError(null);
        return Promise.resolve(true);
      }

      // An explicit selection must not wait for wagmi's auto-reconnect sweep:
      // with several extensions installed, one that never answers the startup
      // probe keeps that sweep pending forever. wagmi's connect() action runs
      // independently of it, so proceeding here is safe.
      const promise = (async (): Promise<boolean> => {
        try {
          setError(null);
          await connectAsync({ connector });
          return true;
        } catch (err) {
          const name =
            typeof err === 'object' && err !== null && 'name' in err
              ? String((err as { name?: unknown }).name)
              : '';
          if (name === 'ConnectorAlreadyConnectedError') {
            setError(null);
            return true;
          }
          walletLogger.error('Failed to connect wallet:', err);
          setError(
            toWalletError(err, 'Failed to connect wallet', 'CONNECT_ERROR'),
          );
          return false;
        }
      })();
      connectPromiseRef.current = promise;
      void (async () => {
        try {
          await promise;
        } finally {
          if (connectPromiseRef.current === promise) {
            connectPromiseRef.current = null;
          }
        }
      })();
      return promise;
    },
    [activeConnector, connectAsync, isConnected],
  );

  const connectInjected = useCallback(
    async (connectorId: string): Promise<boolean> => {
      const connector = connectors.find((c) => c.id === connectorId);
      if (!connector) {
        setError({
          message: 'That wallet is no longer available.',
          code: 'NO_WALLET',
        });
        return false;
      }
      return connectToConnector(connector);
    },
    [connectors, connectToConnector],
  );

  /**
   * Default `WalletProviderInterface.connect()` — used when nothing overrides
   * it (e.g. direct tests). The unified provider overrides this with the
   * custom picker; this fallback keeps the interface usable stand-alone by
   * auto-connecting the sole detected wallet.
   */
  const handleConnect = useCallback(async (): Promise<void> => {
    if (connectors.length === 0) {
      setError({
        message: 'No wallet detected. Install a browser wallet extension.',
        code: 'NO_WALLET',
      });
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
      return;
    }
    await connectToConnector(connector);
  }, [connectors, connectToConnector]);

  const handleDisconnect = useCallback(async () => {
    try {
      setError(null);
      await disconnectAsync();
    } catch (err) {
      walletLogger.error('Failed to disconnect wallet:', err);
      setError(
        toWalletError(err, 'Failed to disconnect wallet', 'DISCONNECT_ERROR'),
      );
    }
  }, [disconnectAsync]);

  const handleSwitchChain = useCallback(
    async (chainId: number): Promise<void> => {
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
        getWagmiConfig(),
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
      if (!address) {
        throw new Error('Wallet not connected (no address from useConnection)');
      }

      if (chain?.id !== tx.chainId) {
        await switchChainAsync({ chainId: tx.chainId });
      }

      const walletClient = await getWagmiWalletClient(getWagmiConfig(), {
        chainId: tx.chainId,
      });

      const hash = await walletClient.sendTransaction({
        to: tx.to,
        ...(tx.data === undefined ? {} : { data: tx.data }),
        ...(tx.value === undefined ? {} : { value: tx.value }),
        ...(tx.gas === undefined ? {} : { gas: tx.gas }),
      });

      walletLogger.info('[wagmi.sendTransaction] hash', hash);
      return hash;
    },
    [address, chain?.id, switchChainAsync],
  );

  const executeExternalReviewedBatch = useCallback<WalletReviewedBatchExecutor>(
    async (input) => {
      const guard = checkReviewedBatchGuards(input, address);
      if (!guard.ok) {
        return guard.result;
      }

      try {
        if (chain?.id !== input.chainId) {
          await switchChainAsync({ chainId: input.chainId });
        }
        await assertEIP7702DelegationCompatibility({
          address: guard.connectedAddress as `0x${string}`,
          chainId: input.chainId,
          activeWalletBrand: externalWalletBrand,
        });
        const walletClient = await getActiveWalletClient(input.chainId);
        const result = await submitPreparedTransactionsWithEIP7702({
          transactions: input.transactions,
          walletClient,
          chainId: input.chainId,
        });
        return {
          status: 'submitted',
          callsId: result.callsId,
        };
      } catch (error: unknown) {
        if (isEIP7702WalletRecoveryError(error)) {
          return {
            status: 'blocked',
            code: error.code,
            reason: error.message,
          };
        }
        const reason = extractErrorMessage(error);
        const lowerReason = reason.toLowerCase();
        if (
          lowerReason.includes('eip-7702') ||
          lowerReason.includes('wallet_sendcalls') ||
          lowerReason.includes('atomic') ||
          lowerReason.includes('delegat') ||
          lowerReason.includes('no account') ||
          lowerReason.includes('wallet client')
        ) {
          return {
            status: 'blocked',
            code: 'EIP7702_UNAVAILABLE',
            reason,
          };
        }
        throw error;
      }
    },
    [
      address,
      chain?.id,
      externalWalletBrand,
      getActiveWalletClient,
      switchChainAsync,
    ],
  );

  const executeReviewedBatch = useDeduplicatedReviewedExecution(
    executeExternalReviewedBatch,
  );

  const waitForReviewedBatch = useCallback<WalletReviewedBatchStatusExecutor>(
    async ({ callsId, chainId }): Promise<WalletReviewedBatchStatus> => {
      try {
        const walletClient = await getActiveWalletClient(chainId);
        const confirmation = await waitForEIP7702Confirmation(
          callsId,
          walletClient,
        );
        if (confirmation.status === 'success') {
          return {
            status: 'confirmed',
            ...(confirmation.transactionHash
              ? { transactionHash: confirmation.transactionHash }
              : {}),
          };
        }
        return {
          status: 'failed',
          reason: `EIP-7702 bundle ${callsId} failed on-chain`,
        };
      } catch (error: unknown) {
        return {
          status: 'unknown',
          reason: extractErrorMessage(error),
        };
      }
    },
    [getActiveWalletClient],
  );

  const backend = useMemo<WalletProviderInterface>(
    () => ({
      ...(externalWalletBrand ? { externalWalletBrand } : {}),
      account: walletAccount,
      chain: walletChain,
      switchChain: handleSwitchChain,
      sendTransaction,
      getWalletClient: getActiveWalletClient,
      executeReviewedBatch,
      waitForReviewedBatch,
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
      executionMode: 'eip7702',
    }),
    [
      walletAccount,
      externalWalletBrand,
      walletChain,
      handleSwitchChain,
      sendTransaction,
      getActiveWalletClient,
      executeReviewedBatch,
      waitForReviewedBatch,
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

  return {
    backend,
    isConnected,
    connectors: connectorOptions,
    connectInjected,
  };
}
