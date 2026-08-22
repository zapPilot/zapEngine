import {
  type AtomicBatchExecution,
  useAtomicBatchExecution,
} from '@core/hooks/wallet/useAtomicBatchExecution';
import { WALLET_NOT_CONNECTED_ERROR } from '@core/lib/wallet/privyAtomicBatch';
import {
  buildWalletAccount,
  buildWalletChain,
  type WalletError,
} from '@core/providers/walletProviderUtils';
import type {
  ConnectedWalletClient,
  WalletProviderInterface,
  WalletReviewedBatchStatusExecutor,
  WalletTypedData,
} from '@core/types';
import { walletLogger } from '@core/utils';
import {
  type SignTypedDataParams,
  useAuthorizationSignature,
  usePrivy,
  useSignTypedData,
  useWallets,
} from '@privy-io/react-auth';
import { equalsAddress } from '@zapengine/types/shared';
import { useCallback, useMemo, useState } from 'react';
import { type Chain, createWalletClient, custom } from 'viem';
import { arbitrum, base, optimism } from 'viem/chains';

export type { PrivyBatchExecutionPhase } from '@core/hooks/wallet/useAtomicBatchExecution';

/**
 * Chains the Privy embedded wallet may operate on. Defined inline from
 * `viem/chains` to keep the bundle free of `wagmi/chains` imports.
 */
const PRIVY_CHAINS: readonly Chain[] = [arbitrum, base, optimism];
const CHAIN_BY_ID = new Map<number, Chain>(
  PRIVY_CHAINS.map((chain) => [chain.id, chain]),
);
const DEFAULT_CHAIN = arbitrum;

/**
 * Parse a CAIP-2 chain id (e.g. `"eip155:42161"`) into its numeric chain id.
 */
function parseChainId(caip2: string | undefined): number | undefined {
  if (!caip2) return undefined;
  const raw = caip2.split(':').pop();
  const id = Number(raw);
  return Number.isFinite(id) ? id : undefined;
}

export interface PrivyWalletBackend extends AtomicBatchExecution {
  /** The wallet interface backed by the Privy embedded wallet. */
  backend: WalletProviderInterface;
  /**
   * Whether the Privy backend should drive `useWalletProvider()` — true once a
   * user is authenticated and an embedded wallet exists.
   */
  isActive: boolean;
}

/**
 * Privy-backed implementation of {@link WalletProviderInterface}.
 *
 * Uses Privy's core hooks (no `@privy-io/wagmi`). Single transactions and
 * signatures use the embedded wallet's EIP-1193 provider. Atomic batches use
 * the server-side Privy Wallets API and never forward `wallet_sendCalls` to a
 * chain RPC provider — the shared `useAtomicBatchExecution` flow drives them
 * with the react-auth primitives wired in below.
 *
 * Must be rendered inside a `PrivyProvider` (see `PrivyAuthProvider`).
 *
 * @returns The Privy backend plus an `isActive` flag for provider selection.
 */
export function usePrivyWalletBackend(): PrivyWalletBackend {
  const { ready, authenticated, login, logout, getAccessToken, user } =
    usePrivy();
  const { generateAuthorizationSignature } = useAuthorizationSignature();
  const { signTypedData: signPrivyTypedData } = useSignTypedData();
  const { wallets } = useWallets();
  const [error, setError] = useState<WalletError | null>(null);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  const embeddedWallet = useMemo(
    () => wallets.find((wallet) => wallet.walletClientType === 'privy'),
    [wallets],
  );

  const isActive = ready && authenticated && Boolean(embeddedWallet);

  const currentChainId = parseChainId(embeddedWallet?.chainId);

  const buildClient = useCallback(
    async (chainId?: number): Promise<ConnectedWalletClient> => {
      if (!embeddedWallet) {
        throw new Error(WALLET_NOT_CONNECTED_ERROR);
      }
      const provider = await embeddedWallet.getEthereumProvider();
      const chain =
        CHAIN_BY_ID.get(chainId ?? currentChainId ?? DEFAULT_CHAIN.id) ??
        DEFAULT_CHAIN;
      return createWalletClient({
        account: embeddedWallet.address as `0x${string}`,
        chain,
        transport: custom(provider),
      });
    },
    [embeddedWallet, currentChainId],
  );

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const connect = useCallback(async (): Promise<void> => {
    try {
      setError(null);
      login();
    } catch (err) {
      walletLogger.error('Failed to open Privy login:', err);
      setError({
        message:
          err instanceof Error ? err.message : 'Failed to open Privy login',
        code: 'PRIVY_LOGIN_ERROR',
      });
    }
  }, [login]);

  const disconnect = useCallback(async (): Promise<void> => {
    try {
      setError(null);
      setIsDisconnecting(true);
      await logout();
    } catch (err) {
      walletLogger.error('Failed to logout from Privy:', err);
      throw err;
    } finally {
      setIsDisconnecting(false);
    }
  }, [logout]);

  const switchChain = useCallback(
    async (chainId: number): Promise<void> => {
      if (!embeddedWallet) {
        throw new Error(WALLET_NOT_CONNECTED_ERROR);
      }
      try {
        await embeddedWallet.switchChain(chainId);
      } catch (err) {
        walletLogger.error('Failed to switch chain (Privy):', err);
        throw err;
      }
    },
    [embeddedWallet],
  );

  const getWalletClient = useCallback(
    (chainId?: number): Promise<ConnectedWalletClient> => buildClient(chainId),
    [buildClient],
  );

  const signMessage = useCallback(
    async (message: string): Promise<string> => {
      const client = await buildClient();
      return client.signMessage({ message });
    },
    [buildClient],
  );

  const signTypedData = useCallback(
    async (typedData: WalletTypedData): Promise<`0x${string}`> => {
      const client = await buildClient();
      return client.signTypedData(typedData as never);
    },
    [buildClient],
  );

  const signPreviewTypedData = useCallback(
    async (typedData: WalletTypedData): Promise<`0x${string}`> => {
      if (!embeddedWallet) {
        throw new Error(WALLET_NOT_CONNECTED_ERROR);
      }

      const { signature } = await signPrivyTypedData(
        typedData as SignTypedDataParams,
        {
          address: embeddedWallet.address,
          uiOptions: { showWalletUIs: true },
        },
      );
      return signature as `0x${string}`;
    },
    [embeddedWallet, signPrivyTypedData],
  );

  const sendTransaction = useCallback(
    async (tx: {
      to: `0x${string}`;
      data?: `0x${string}`;
      value?: bigint;
      chainId: number;
      gas?: bigint;
    }): Promise<`0x${string}`> => {
      if (!embeddedWallet) {
        throw new Error(WALLET_NOT_CONNECTED_ERROR);
      }
      if (currentChainId !== tx.chainId) {
        walletLogger.info('[privy.sendTransaction] switching chain', {
          from: currentChainId,
          to: tx.chainId,
        });
        await embeddedWallet.switchChain(tx.chainId);
      }
      const client = await buildClient(tx.chainId);
      const hash = await client.sendTransaction({
        to: tx.to,
        ...(tx.data === undefined ? {} : { data: tx.data }),
        ...(tx.value === undefined ? {} : { value: tx.value }),
        ...(tx.gas === undefined ? {} : { gas: tx.gas }),
      });
      walletLogger.info('[privy.sendTransaction] hash', hash);
      return hash;
    },
    [embeddedWallet, currentChainId, buildClient],
  );

  const ensureChain = useCallback(
    async (chainId: number): Promise<void> => {
      if (!embeddedWallet) {
        throw new Error(WALLET_NOT_CONNECTED_ERROR);
      }
      if (currentChainId !== chainId) {
        walletLogger.info('[privy.executeAtomicBatch] switching chain', {
          from: currentChainId,
          to: chainId,
        });
        await embeddedWallet.switchChain(chainId);
      }
    },
    [embeddedWallet, currentChainId],
  );

  const resolveWalletId = useCallback((): string | undefined => {
    if (!embeddedWallet) {
      return undefined;
    }
    return user?.linkedAccounts
      .flatMap((account) =>
        account.type === 'wallet' &&
        account.walletClientType === 'privy' &&
        account.chainType === 'ethereum' &&
        equalsAddress(account.address, embeddedWallet.address) &&
        'id' in account &&
        typeof account.id === 'string'
          ? [account.id]
          : [],
      )
      .at(0);
  }, [embeddedWallet, user?.linkedAccounts]);

  const batch = useAtomicBatchExecution({
    getAccessToken,
    signPreviewTypedData,
    generateAuthorizationSignature,
    ensureChain,
    resolveWalletId,
    walletAddress: embeddedWallet?.address,
  });

  // Privy confirmation is tracked by account-engine after `sendCalls`; there
  // is no wallet_getCallsStatus transport for the embedded provider. Returning
  // `unknown` keeps the progress layer from ever attempting a duplicate send.
  const waitForReviewedBatch = useCallback<WalletReviewedBatchStatusExecutor>(
    async () => ({
      status: 'unknown',
      reason: 'Privy batch confirmation is tracked by account-engine.',
    }),
    [],
  );

  const walletList = useMemo(
    () =>
      embeddedWallet
        ? [{ address: embeddedWallet.address, isActive: true }]
        : [],
    [embeddedWallet],
  );

  const handleSwitchActiveWallet = useCallback(async (): Promise<void> => {
    walletLogger.info('switchActiveWallet is a no-op in Privy mode');
  }, []);

  const backend = useMemo<WalletProviderInterface>(
    () => ({
      account: buildWalletAccount(embeddedWallet?.address),
      chain: buildWalletChain(
        currentChainId === undefined ? null : CHAIN_BY_ID.get(currentChainId),
      ),
      switchChain,
      sendTransaction,
      getWalletClient,
      executeAtomicBatch: batch.executeAtomicBatch,
      executeReviewedBatch: batch.executeReviewedBatch,
      waitForReviewedBatch,
      connect,
      disconnect,
      // Privy is not ready to resolve its session yet. Surface that busy
      // state so the unified picker cannot race initial hydration/login.
      isConnecting: !ready,
      isDisconnecting,
      isConnected: Boolean(embeddedWallet),
      error,
      clearError,
      signMessage,
      signTypedData,
      connectedWallets: walletList,
      switchActiveWallet: handleSwitchActiveWallet,
      hasMultipleWallets: false,
      executionMode: 'atomic-batch',
    }),
    [
      embeddedWallet,
      currentChainId,
      switchChain,
      sendTransaction,
      getWalletClient,
      batch.executeAtomicBatch,
      batch.executeReviewedBatch,
      waitForReviewedBatch,
      connect,
      disconnect,
      ready,
      isDisconnecting,
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
    isActive,
    executeAtomicBatch: batch.executeAtomicBatch,
    executeReviewedBatch: batch.executeReviewedBatch,
    simulationPreview: batch.simulationPreview,
    confirmBatchExecution: batch.confirmBatchExecution,
    retryBatchSimulation: batch.retryBatchSimulation,
    updateApprovalAmount: batch.updateApprovalAmount,
    cancelBatchExecution: batch.cancelBatchExecution,
    isSigningAndSending: batch.isSigningAndSending,
    batchExecutionPhase: batch.batchExecutionPhase,
    isRetryingSimulation: batch.isRetryingSimulation,
    retryError: batch.retryError,
  };
}
