import {
  usePrivy,
  useSign7702Authorization,
  useWallets,
} from '@privy-io/react-auth';
import type { PreparedTransaction } from '@zapengine/types/api';
import { createKernelAccount, createKernelAccountClient } from '@zerodev/sdk';
import {
  getEntryPoint,
  KERNEL_V3_3,
  KernelVersionToAddressesMap,
} from '@zerodev/sdk/constants';
import { useCallback, useMemo, useState } from 'react';
import {
  type Address,
  type Chain,
  createWalletClient,
  custom,
  type Hash,
  type Hex,
  http,
} from 'viem';
import type { SignAuthorizationReturnType } from 'viem/accounts';
import { arbitrum, base, optimism } from 'wagmi/chains';

import { getZeroDevConfig } from '@/lib/env/zerodev';
import {
  buildWalletAccount,
  buildWalletChain,
  type WalletError,
} from '@/providers/walletProviderUtils';
import { getPublicClient } from '@/services/intentClient';
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
const PRIVY_7702_CHAINS = new Map<number, Chain>(
  [arbitrum, base].map((chain) => [chain.id, chain]),
);
const DEFAULT_CHAIN = arbitrum;
const ZERO_DEV_ENTRY_POINT = getEntryPoint('0.7');
const ZERO_DEV_KERNEL_VERSION = KERNEL_V3_3;
const ZERO_DEV_KERNEL_ADDRESSES =
  KernelVersionToAddressesMap[ZERO_DEV_KERNEL_VERSION];

/**
 * Parse a CAIP-2 chain id (e.g. `"eip155:42161"`) into its numeric chain id.
 */
function parseChainId(caip2: string | undefined): number | undefined {
  if (!caip2) return undefined;
  const raw = caip2.split(':').pop();
  const id = Number(raw);
  return Number.isFinite(id) ? id : undefined;
}

function getPrivy7702Chain(chainId: number): Chain {
  const chain = PRIVY_7702_CHAINS.get(chainId);
  if (!chain) {
    throw new Error(
      `Privy EIP-7702 execution is not configured for chain ${chainId}`,
    );
  }
  return chain;
}

function extractTransactionHash(receipt: unknown): Hash | undefined {
  if (typeof receipt !== 'object' || receipt === null) {
    return undefined;
  }

  const topLevelHash = (receipt as { transactionHash?: unknown })
    .transactionHash;
  if (typeof topLevelHash === 'string' && topLevelHash.startsWith('0x')) {
    return topLevelHash as Hash;
  }

  const nestedHash = (receipt as { receipt?: { transactionHash?: unknown } })
    .receipt?.transactionHash;
  if (typeof nestedHash === 'string' && nestedHash.startsWith('0x')) {
    return nestedHash as Hash;
  }

  return undefined;
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
 * Uses Privy's core hooks (no `@privy-io/wagmi`): the embedded wallet's
 * EIP-1193 provider is wrapped in a viem `WalletClient` via `custom()`, which
 * satisfies the full signing/sending surface using the repo's existing viem.
 *
 * Must be rendered inside a `PrivyProvider` (see `PrivyAuthProvider`).
 *
 * @returns The Privy backend plus an `isActive` flag for provider selection.
 */
export function usePrivyWalletBackend(): PrivyWalletBackend {
  const { ready, authenticated, login, logout } = usePrivy();
  const { signAuthorization } = useSign7702Authorization();
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

      const chain = getPrivy7702Chain(chainId);
      const { rpc: zeroDevRpc } = getZeroDevConfig(chainId);

      if (currentChainId !== chainId) {
        walletLogger.info('[privy.executeAtomicBatch] switching chain', {
          from: currentChainId,
          to: chainId,
        });
        await embeddedWallet.switchChain(chainId);
      }

      const walletClient = await buildClient(chainId);
      const publicClient = getPublicClient(chainId);
      const authorization = (await signAuthorization(
        {
          contractAddress:
            ZERO_DEV_KERNEL_ADDRESSES.accountImplementationAddress,
          chainId,
        },
        { address: embeddedWallet.address },
      )) as SignAuthorizationReturnType;

      const account = await createKernelAccount(publicClient, {
        eip7702Account: walletClient,
        eip7702Auth: authorization,
        entryPoint: ZERO_DEV_ENTRY_POINT,
        kernelVersion: ZERO_DEV_KERNEL_VERSION,
      });

      const kernelClient = createKernelAccountClient({
        account,
        chain,
        client: publicClient,
        bundlerTransport: http(zeroDevRpc),
      });

      const userOpHash = await kernelClient.sendUserOperation({
        callData: await kernelClient.account.encodeCalls(
          transactions.map((tx) => ({
            to: tx.to as Address,
            data: tx.data as Hex,
            value: BigInt(tx.value),
          })),
        ),
      });

      walletLogger.info('[privy.executeAtomicBatch] userOp hash', userOpHash);
      const receipt = await kernelClient.waitForUserOperationReceipt({
        hash: userOpHash,
      });
      const transactionHash = extractTransactionHash(receipt);

      return {
        callsId: userOpHash,
        ...(transactionHash ? { transactionHash } : {}),
      };
    },
    [embeddedWallet, currentChainId, buildClient, signAuthorization],
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
