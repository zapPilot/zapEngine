import { getWagmiConfig } from '@core/config/wagmi';
import { isWalletConnectEnabled } from '@core/lib/env/walletConnect';
import { isApprovedWalletConnector } from '@core/lib/wallet/approvedWallets';
import { submitPreparedTransactionsWithEIP7702 } from '@core/lib/wallet/executeDepositPlan';
import { computeReviewedBatchFingerprint } from '@core/lib/wallet/reviewedBatchFingerprint';
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
  WalletReviewedBatchResult,
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
  const injectedConnectors = connectors.filter(
    (connector) => connector.type !== 'walletConnect',
  );
  const specificInjected = injectedConnectors.filter(
    (connector) => connector.id !== 'injected',
  );
  const visibleInjected =
    specificInjected.length > 0 ? specificInjected : injectedConnectors;

  const injectedOptions: WalletConnectorOption[] = visibleInjected.map(
    (connector) => ({
      id: connector.id,
      name: connector.name,
      ...(connector.icon ? { icon: connector.icon } : {}),
      recommended: isApprovedWalletConnector(connector),
      type: 'injected',
    }),
  );

  const walletConnectConnector = connectors.find(
    (connector) => connector.type === 'walletConnect',
  );
  const walletConnectOptions: WalletConnectorOption[] = walletConnectConnector
    ? [
        {
          id: walletConnectConnector.id,
          name: 'WalletConnect',
          recommended: false,
          type: 'walletConnect',
        },
      ]
    : [];

  return [...injectedOptions, ...walletConnectOptions];
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
  /** Discovered wallets (injected + the generic WalletConnect entry). */
  connectors: WalletConnectorOption[];
  /** Connect to a specific discovered connector by its `WalletConnectorOption.id`. */
  connectInjected: (connectorId: string) => Promise<void>;
  connectWalletConnect: () => Promise<void>;
  isWalletConnectAvailable: boolean;
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
  /* jscpd:ignore-start -- Privy and external adapters share required review guard rails. */
  const reviewedExecutionRef = useRef(
    new Map<
      string,
      { promise: Promise<WalletReviewedBatchResult>; expiresAt: number }
    >(),
  );

  const connectorOptions = useMemo(
    () => toConnectorOptions(connectors),
    [connectors],
  );

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

  const isConnectingState = accountIsConnecting || connectIsPending;

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const connectToConnector = useCallback(
    async (connector: Connector): Promise<void> => {
      try {
        setError(null);
        await connectAsync({ connector });
      } catch (err) {
        walletLogger.error('Failed to connect wallet:', err);
        setError(
          toWalletError(err, 'Failed to connect wallet', 'CONNECT_ERROR'),
        );
      }
    },
    [connectAsync],
  );

  const connectInjected = useCallback(
    async (connectorId: string): Promise<void> => {
      const connector = connectors.find((c) => c.id === connectorId);
      if (!connector) {
        setError({
          message: 'That wallet is no longer available.',
          code: 'NO_WALLET',
        });
        return;
      }
      await connectToConnector(connector);
    },
    [connectors, connectToConnector],
  );

  const connectWalletConnect = useCallback(async (): Promise<void> => {
    const connector = connectors.find((c) => c.type === 'walletConnect');
    if (!connector) {
      setError({
        message: 'WalletConnect is not configured.',
        code: 'NO_WALLET',
      });
      return;
    }
    await connectToConnector(connector);
  }, [connectors, connectToConnector]);

  /**
   * Default `WalletProviderInterface.connect()` — used when nothing overrides
   * it (e.g. direct tests). The unified provider overrides this with the
   * custom picker; this fallback keeps the interface usable stand-alone by
   * auto-connecting the sole detected wallet.
   */
  const handleConnect = useCallback(async (): Promise<void> => {
    const injectedOnly = connectors.filter((c) => c.type !== 'walletConnect');

    if (injectedOnly.length === 0) {
      setError({
        message:
          'No wallet detected. Install a browser wallet extension or use WalletConnect.',
        code: 'NO_WALLET',
      });
      return;
    }

    if (injectedOnly.length > 1) {
      setError({
        message: 'Multiple wallets detected. Please choose a wallet first.',
        code: 'WALLET_SELECTION_REQUIRED',
      });
      return;
    }

    const connector = injectedOnly[0];
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

  const executeReviewedBatch = useCallback<WalletReviewedBatchExecutor>(
    (input) => {
      const key = JSON.stringify({
        chainId: input.chainId,
        expectedWalletAddress: input.expectedWalletAddress.toLowerCase(),
        expectedBatchFingerprint: input.expectedBatchFingerprint,
        expiresAt: input.expiresAt,
        executionAllowed: input.executionAllowed,
        expectedSimulationFingerprint: input.expectedSimulationFingerprint,
        expectedRiskHash: input.expectedRiskHash,
        transactions: input.transactions.map((transaction) => ({
          chainId: transaction.chainId,
          to: transaction.to.toLowerCase(),
          data: transaction.data,
          value: transaction.value,
        })),
      });
      const existing = reviewedExecutionRef.current.get(key);
      if (existing) {
        if (Date.now() < existing.expiresAt) {
          return existing.promise;
        }
        reviewedExecutionRef.current.delete(key);
      }

      const run = (async (): Promise<WalletReviewedBatchResult> => {
        if (!address) {
          return {
            status: 'blocked',
            code: 'WALLET_NOT_CONNECTED',
            reason: 'No external wallet connected',
          };
        }
        if (!input.executionAllowed) {
          return {
            status: 'blocked',
            code: 'REVIEW_BLOCKED',
            reason: 'The execution review is blocked and cannot be submitted.',
          };
        }
        if (
          address.toLowerCase() !== input.expectedWalletAddress.toLowerCase()
        ) {
          return {
            status: 'review-changed',
            reason: 'wallet-address-mismatch',
          };
        }
        if (input.transactions.length === 0) {
          return {
            status: 'blocked',
            code: 'EMPTY_BATCH',
            reason: 'Cannot execute empty EIP-7702 batch',
          };
        }
        if (Date.now() >= input.expiresAt) {
          return {
            status: 'blocked',
            code: 'REVIEW_EXPIRED',
            reason:
              'The execution review has expired. Refresh it before sending.',
          };
        }
        if (
          !input.expectedBatchFingerprint ||
          !input.expectedSimulationFingerprint ||
          !input.expectedRiskHash
        ) {
          return {
            status: 'blocked',
            code: 'REVIEW_HASH_MISSING',
            reason: 'The execution review is missing its safety hashes',
          };
        }
        if (
          input.requiresRiskAcknowledgement &&
          input.acknowledgedRiskHash?.toLowerCase() !==
            input.expectedRiskHash.toLowerCase()
        ) {
          return {
            status: 'blocked',
            code: 'RISK_ACKNOWLEDGEMENT_REQUIRED',
            reason: 'Warning risks must be acknowledged before signing',
          };
        }
        const crossChain = input.transactions.find(
          (transaction) => transaction.chainId !== input.chainId,
        );
        if (crossChain) {
          return {
            status: 'blocked',
            code: 'CROSS_CHAIN_BATCH',
            reason: `Batch contains chain ${crossChain.chainId}, expected ${input.chainId}`,
          };
        }
        let batchFingerprint: `0x${string}`;
        try {
          batchFingerprint = computeReviewedBatchFingerprint({
            chainId: input.chainId,
            transactions: input.transactions,
          });
        } catch (error: unknown) {
          return {
            status: 'blocked',
            code: 'INVALID_REVIEWED_BATCH',
            reason: error instanceof Error ? error.message : String(error),
          };
        }
        if (
          batchFingerprint.toLowerCase() !==
          input.expectedBatchFingerprint.toLowerCase()
        ) {
          return {
            status: 'review-changed',
            reason: 'batch-fingerprint-mismatch',
          };
        }

        try {
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
          const reason = error instanceof Error ? error.message : String(error);
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
      })();

      reviewedExecutionRef.current.set(key, {
        promise: run,
        expiresAt: input.expiresAt,
      });
      void (async () => {
        let result: WalletReviewedBatchResult | undefined;
        try {
          result = await run;
        } catch {
          // The caller receives the original rejection; cleanup is still
          // required so a later review can be attempted.
        } finally {
          if (result?.status !== 'submitted' || Date.now() >= input.expiresAt) {
            reviewedExecutionRef.current.delete(key);
          }
        }
      })();
      return run;
    },
    [address, getActiveWalletClient],
  );
  /* jscpd:ignore-end */

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
          reason: error instanceof Error ? error.message : String(error),
        };
      }
    },
    [getActiveWalletClient],
  );

  const backend = useMemo<WalletProviderInterface>(
    () => ({
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
    connectWalletConnect,
    isWalletConnectAvailable: isWalletConnectEnabled(),
  };
}
