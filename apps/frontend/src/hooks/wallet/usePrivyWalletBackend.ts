import { usePrivy, useWallets } from '@privy-io/react-auth';
import type { PreparedTransaction } from '@zapengine/types/api';
import { useCallback, useMemo, useState } from 'react';
import {
  type Chain,
  createWalletClient,
  custom,
  decodeFunctionData,
  erc20Abi,
  type Hex,
  toHex,
} from 'viem';
import { arbitrum, base, optimism } from 'wagmi/chains';

import {
  buildWalletAccount,
  buildWalletChain,
  type WalletError,
} from '@/providers/walletProviderUtils';
import { sendPrivyAtomicBatch } from '@/services/privyWalletService';
import type {
  ConnectedWalletClient,
  WalletAtomicBatchResult,
  WalletProviderInterface,
  WalletTypedData,
} from '@/types';
import { walletLogger } from '@/utils';

/**
 * Chains the Privy embedded wallet may operate on. Kept aligned with the
 * RainbowKit/wagmi config in `@/config/wagmi`.
 */
const PRIVY_CHAINS: readonly Chain[] = [arbitrum, base, optimism];
const CHAIN_BY_ID = new Map<number, Chain>(
  PRIVY_CHAINS.map((chain) => [chain.id, chain]),
);
const PRIVY_ATOMIC_BATCH_CHAINS = new Map<number, Chain>(
  [arbitrum, base].map((chain) => [chain.id, chain]),
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

function getPrivyAtomicBatchChain(chainId: number): Chain {
  const chain = PRIVY_ATOMIC_BATCH_CHAINS.get(chainId);
  if (!chain) {
    throw new Error(
      `Privy EOA EIP-7702 atomic batching is not configured for chain ${chainId}`,
    );
  }
  return chain;
}

function summarizeTransaction(tx: PreparedTransaction, index: number) {
  return {
    index,
    to: tx.to,
    value: tx.value,
    chainId: tx.chainId,
    intentType: tx.meta.intentType,
  };
}

function approvalSummary(tx: PreparedTransaction):
  | {
      token: string;
      spender: string;
      amount: string;
    }
  | undefined {
  try {
    const decoded = decodeFunctionData({
      abi: erc20Abi,
      data: tx.data as Hex,
    });

    if (decoded.functionName !== 'approve') {
      return undefined;
    }

    const [spender, amount] = decoded.args;
    return {
      token: tx.to,
      spender,
      amount: amount.toString(),
    };
  } catch {
    return undefined;
  }
}

function atomicBatchSummary(transactions: PreparedTransaction[]):
  | {
      approvals: {
        token: string;
        spender: string;
        amount: string;
      }[];
    }
  | undefined {
  const approvals = transactions.flatMap((tx) => {
    const approval = approvalSummary(tx);
    return approval ? [approval] : [];
  });

  return { approvals };
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function assertSameChainTransactions(
  transactions: PreparedTransaction[],
  chainId: number,
): void {
  const mismatch = transactions.find((tx) => tx.chainId !== chainId);
  if (!mismatch) {
    return;
  }

  throw new Error(
    `Privy EOA atomic batch contains a transaction for chain ${mismatch.chainId}, expected ${chainId}`,
  );
}

function toWalletSendCall(tx: PreparedTransaction) {
  return {
    to: tx.to,
    data: tx.data,
    value: toHex(BigInt(tx.value)),
  };
}

function createIdempotencyKey(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export interface PrivyWalletBackend {
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
 * chain RPC provider.
 *
 * Must be rendered inside a `PrivyProvider` (see `PrivyAuthProvider`).
 *
 * @returns The Privy backend plus an `isActive` flag for provider selection.
 */
export function usePrivyWalletBackend(): PrivyWalletBackend {
  const { ready, authenticated, login, logout, getAccessToken, user } =
    usePrivy();
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
        throw new Error('No Privy wallet connected');
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
    // Privy's `login()` opens the auth modal and returns synchronously; the
    // resulting connection is observed reactively via `authenticated`/`wallets`.
    setError(null);
    login();
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
        throw new Error('No Privy wallet connected');
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

  const sendTransaction = useCallback(
    async (tx: {
      to: `0x${string}`;
      data?: `0x${string}`;
      value?: bigint;
      chainId: number;
      gas?: bigint;
    }): Promise<`0x${string}`> => {
      if (!embeddedWallet) {
        throw new Error('No Privy wallet connected');
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

  const executeAtomicBatch = useCallback(
    async (
      transactions: PreparedTransaction[],
      chainId: number,
    ): Promise<WalletAtomicBatchResult> => {
      if (!embeddedWallet) {
        throw new Error('No Privy wallet connected');
      }
      if (transactions.length === 0) {
        throw new Error('Cannot execute empty Privy EIP-7702 batch');
      }
      assertSameChainTransactions(transactions, chainId);

      const chain = getPrivyAtomicBatchChain(chainId);
      const caip2 = `eip155:${chain.id}`;

      if (currentChainId !== chainId) {
        walletLogger.info('[privy.executeAtomicBatch] switching chain', {
          from: currentChainId,
          to: chainId,
        });
        await embeddedWallet.switchChain(chainId);
      }

      const calls = transactions.map(toWalletSendCall);
      const walletId = user?.linkedAccounts
        .flatMap((account) =>
          account.type === 'wallet' &&
          account.walletClientType === 'privy' &&
          account.chainType === 'ethereum' &&
          account.address.toLowerCase() ===
            embeddedWallet.address.toLowerCase() &&
          'id' in account &&
          typeof account.id === 'string'
            ? [account.id]
            : [],
        )
        .at(0);
      if (!walletId) {
        throw new Error('Privy wallet resource id is unavailable');
      }
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error('Privy access token is unavailable');
      }

      walletLogger.info(
        '[privy.executeAtomicBatch] sending Privy Wallets API batch',
        {
          chainId,
          caip2,
          embeddedWalletAddress: embeddedWallet.address,
          transactionCount: transactions.length,
          transactions: transactions.map(summarizeTransaction),
          atomicBatch: atomicBatchSummary(transactions),
        },
      );

      const result = await sendPrivyAtomicBatch(
        {
          walletId,
          walletAddress: embeddedWallet.address,
          chainId: chain.id as 8453 | 42161,
          calls,
          idempotencyKey: createIdempotencyKey(),
        },
        accessToken,
      ).catch((error: unknown) => {
        throw new Error(
          `Privy EOA EIP-7702 atomic batch failed: ${errorMessage(error)}`,
        );
      });

      walletLogger.info('[privy.executeAtomicBatch] Privy transaction id', {
        transactionId: result.transactionId,
        caip2: result.caip2,
      });

      return { callsId: result.transactionId };
    },
    [embeddedWallet, currentChainId, getAccessToken, user?.linkedAccounts],
  );

  const walletList = useMemo(
    () =>
      embeddedWallet
        ? [{ address: embeddedWallet.address, isActive: true }]
        : [],
    [embeddedWallet],
  );

  const handleSwitchActiveWallet = useCallback(async (): Promise<void> => {
    // Privy embedded wallet is single-account; switching is not applicable.
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
      executeAtomicBatch,
      connect,
      disconnect,
      isConnecting: false,
      isDisconnecting,
      isConnected: Boolean(embeddedWallet),
      error,
      clearError,
      signMessage,
      signTypedData,
      connectedWallets: walletList,
      switchActiveWallet: handleSwitchActiveWallet,
      hasMultipleWallets: false,
    }),
    [
      embeddedWallet,
      currentChainId,
      switchChain,
      sendTransaction,
      getWalletClient,
      executeAtomicBatch,
      connect,
      disconnect,
      isDisconnecting,
      error,
      clearError,
      signMessage,
      signTypedData,
      walletList,
      handleSwitchActiveWallet,
    ],
  );

  return { backend, isActive };
}
