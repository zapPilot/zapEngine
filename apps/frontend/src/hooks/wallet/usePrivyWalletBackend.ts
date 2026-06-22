import {
  type SignTypedDataParams,
  useAuthorizationSignature,
  usePrivy,
  useSignTypedData,
  useWallets,
} from '@privy-io/react-auth';
import type {
  PreparedTransaction,
  PrivyPrepareSendCallsResponse,
} from '@zapengine/types/api';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  type Chain,
  createWalletClient,
  custom,
  decodeFunctionData,
  encodeFunctionData,
  erc20Abi,
  type Hex,
  parseUnits,
  toHex,
} from 'viem';
import { arbitrum, base, optimism } from 'viem/chains';

import {
  buildWalletAccount,
  buildWalletChain,
  type WalletError,
} from '@/providers/walletProviderUtils';
import {
  preparePrivyAtomicBatch,
  sendPrivyAtomicBatch,
} from '@/services/privyWalletService';
import type {
  ConnectedWalletClient,
  WalletAtomicBatchResult,
  WalletProviderInterface,
  WalletTypedData,
} from '@/types';
import { walletLogger } from '@/utils';

/**
 * Chains the Privy embedded wallet may operate on. Defined inline from
 * `viem/chains` to keep the bundle free of `wagmi/chains` imports.
 */
const PRIVY_CHAINS: readonly Chain[] = [arbitrum, base, optimism];
const CHAIN_BY_ID = new Map<number, Chain>(
  PRIVY_CHAINS.map((chain) => [chain.id, chain]),
);
const PRIVY_ATOMIC_BATCH_CHAINS = new Map<number, Chain>(
  [arbitrum, base].map((chain) => [chain.id, chain]),
);
const DEFAULT_CHAIN = arbitrum;
const WALLET_NOT_CONNECTED_ERROR = 'No Privy wallet connected';

export type PrivyBatchExecutionPhase =
  | 'idle'
  | 'signingIntent'
  | 'authorizingBatch'
  | 'sendingBatch';

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

function approvalSummary(tx: PreparedTransaction) {
  try {
    const decoded = decodeFunctionData({
      abi: erc20Abi,
      data: tx.data as Hex,
    });

    if (decoded.functionName !== 'approve') {
      return;
    }

    const [spender, amount] = decoded.args;
    return {
      token: tx.to,
      spender,
      amount: amount.toString(),
    };
  } catch {
    return;
  }
}

function atomicBatchSummary(transactions: PreparedTransaction[]) {
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

function decodeBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toWalletTypedData(payload: Record<string, unknown>): WalletTypedData {
  if (
    !isRecord(payload['domain']) ||
    !isRecord(payload['types']) ||
    !isRecord(payload['message']) ||
    typeof payload['primaryType'] !== 'string'
  ) {
    throw new Error('Privy preview typed data payload is malformed');
  }

  return payload as unknown as WalletTypedData;
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
  simulationPreview: PrivyPrepareSendCallsResponse | null;
  confirmBatchExecution: (acknowledgedRiskHash?: string) => Promise<void>;
  retryBatchSimulation: () => Promise<void>;
  updateApprovalAmount: (callIndex: number, amount: string) => Promise<void>;
  cancelBatchExecution: () => void;
  isSigningAndSending: boolean;
  batchExecutionPhase: PrivyBatchExecutionPhase;
  isRetryingSimulation: boolean;
  retryError: string | null;
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
  const { generateAuthorizationSignature } = useAuthorizationSignature();
  const { signTypedData: signPrivyTypedData } = useSignTypedData();
  const { wallets } = useWallets();
  const [error, setError] = useState<WalletError | null>(null);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  // States and refs to coordinate two-step execution
  const [simulationPreview, setSimulationPreview] =
    useState<PrivyPrepareSendCallsResponse | null>(null);
  const [isSigningAndSending, setIsSigningAndSending] = useState(false);
  const [batchExecutionPhase, setBatchExecutionPhase] =
    useState<PrivyBatchExecutionPhase>('idle');
  const [isRetryingSimulation, setIsRetryingSimulation] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const pendingExecutionRef = useRef<{
    resolve: (result: WalletAtomicBatchResult) => void;
    reject: (err: Error) => void;
    preview: PrivyPrepareSendCallsResponse;
    batch: Parameters<typeof preparePrivyAtomicBatch>[0];
  } | null>(null);

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
    async (
      preview: Extract<
        PrivyPrepareSendCallsResponse,
        { status: 'passed' | 'warning' }
      >,
    ): Promise<`0x${string}`> => {
      if (!embeddedWallet) {
        throw new Error(WALLET_NOT_CONNECTED_ERROR);
      }

      const typedData = toWalletTypedData(preview.typedDataPayload);
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

  const executeAtomicBatch = useCallback(
    async (
      transactions: PreparedTransaction[],
      chainId: number,
    ): Promise<WalletAtomicBatchResult> => {
      if (!embeddedWallet) {
        throw new Error(WALLET_NOT_CONNECTED_ERROR);
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
      const batch = {
        walletId,
        walletAddress: embeddedWallet.address,
        chainId: chain.id as 8453 | 42161,
        calls,
        idempotencyKey: createIdempotencyKey(),
      };

      walletLogger.info(
        '[privy.executeAtomicBatch] preparing Privy Wallets API batch',
        {
          chainId,
          caip2,
          embeddedWalletAddress: embeddedWallet.address,
          transactionCount: transactions.length,
          transactions: transactions.map(summarizeTransaction),
          atomicBatch: atomicBatchSummary(transactions),
        },
      );

      const prepareAccessToken = await getAccessToken();
      if (!prepareAccessToken) {
        throw new Error(
          'Privy user access token is invalid or expired. Please re-login.',
        );
      }

      // 1. Prepare batch and simulation
      const preview = await preparePrivyAtomicBatch(
        batch,
        prepareAccessToken,
      ).catch((error: unknown) => {
        throw new Error(
          `Privy EOA EIP-7702 atomic batch preparation failed: ${errorMessage(error)}`,
        );
      });

      // 2. Intercept flow and return promise waiting for user signature & confirmation
      return new Promise<WalletAtomicBatchResult>((resolve, reject) => {
        pendingExecutionRef.current = {
          resolve,
          reject,
          preview,
          batch,
        };
        setRetryError(null);
        setSimulationPreview(preview);
      });
    },
    [embeddedWallet, currentChainId, getAccessToken, user?.linkedAccounts],
  );

  const retryBatchSimulation = useCallback(async (): Promise<void> => {
    const pending = pendingExecutionRef.current;
    if (!pending) return;

    setRetryError(null);
    setIsRetryingSimulation(true);
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error(
          'Privy user access token is invalid or expired. Please re-login.',
        );
      }
      const preview = await preparePrivyAtomicBatch(pending.batch, accessToken);
      pending.preview = preview;
      setSimulationPreview(preview);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : errorMessage(err);
      setRetryError(message);
    } finally {
      setIsRetryingSimulation(false);
    }
  }, [getAccessToken]);

  const updateApprovalAmount = useCallback(
    async (callIndex: number, amount: string): Promise<void> => {
      const pending = pendingExecutionRef.current;
      if (!pending) return;

      const approval = pending.preview.approvals.find(
        (candidate) => candidate.callIndex === callIndex,
      );
      const call = pending.batch.calls[callIndex];
      if (!approval || !call) {
        const error = new Error('Approval call is no longer available.');
        setRetryError(error.message);
        throw error;
      }

      let rawAmount: bigint;
      try {
        rawAmount = parseUnits(amount.trim(), approval.token.decimals);
      } catch {
        const error = new Error('Enter a valid approval amount.');
        setRetryError(error.message);
        throw error;
      }
      if (rawAmount < 0n) {
        const error = new Error('Approval amount cannot be negative.');
        setRetryError(error.message);
        throw error;
      }

      const updatedBatch = {
        ...pending.batch,
        idempotencyKey: createIdempotencyKey(),
        calls: pending.batch.calls.map((candidate, index) =>
          index === callIndex
            ? {
                ...candidate,
                data: encodeFunctionData({
                  abi: erc20Abi,
                  functionName: 'approve',
                  args: [approval.spender as `0x${string}`, rawAmount],
                }),
              }
            : candidate,
        ),
      };

      setRetryError(null);
      setIsRetryingSimulation(true);
      try {
        const accessToken = await getAccessToken();
        if (!accessToken) {
          throw new Error(
            'Privy user access token is invalid or expired. Please re-login.',
          );
        }
        const preview = await preparePrivyAtomicBatch(
          updatedBatch,
          accessToken,
        );
        pending.batch = updatedBatch;
        pending.preview = preview;
        setSimulationPreview(preview);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : errorMessage(err);
        setRetryError(message);
        throw err;
      } finally {
        setIsRetryingSimulation(false);
      }
    },
    [getAccessToken],
  );

  const confirmBatchExecution = useCallback(
    async (acknowledgedRiskHash?: string): Promise<void> => {
      const pending = pendingExecutionRef.current;
      if (!pending) return;

      if (!embeddedWallet) {
        throw new Error(WALLET_NOT_CONNECTED_ERROR);
      }
      if (
        pending.preview.status === 'failed' ||
        pending.preview.status === 'unavailable'
      ) {
        return;
      }

      let keepPending = false;
      setIsSigningAndSending(true);
      try {
        // 1. User signs EIP-712 Intent via Privy modal
        walletLogger.info(
          '[privy.confirmBatchExecution] signing EIP-712 intent',
        );
        setBatchExecutionPhase('signingIntent');
        const userSignature = await signPreviewTypedData(pending.preview);

        // 2. User signs Privy SendCalls authorization payload
        walletLogger.info(
          '[privy.confirmBatchExecution] signing EIP-7702 auth',
        );
        setBatchExecutionPhase('authorizingBatch');
        const { signature: authorizationSignature } =
          await generateAuthorizationSignature(
            decodeBase64(pending.preview.authorizationPayload),
          );

        const executeAccessToken = await getAccessToken();
        if (!executeAccessToken) {
          throw new Error(
            'Privy user access token is invalid or expired. Please re-login.',
          );
        }

        // 3. Post to confirm endpoint
        walletLogger.info('[privy.confirmBatchExecution] confirming preview');
        setBatchExecutionPhase('sendingBatch');
        const result = await sendPrivyAtomicBatch(
          {
            previewId: pending.preview.previewId,
            userSignature,
            authorizationSignature,
            ...(acknowledgedRiskHash ? { acknowledgedRiskHash } : {}),
          },
          executeAccessToken,
        );

        if (result.status === 'review') {
          pending.preview = result.preview;
          setRetryError(null);
          setSimulationPreview(result.preview);
          keepPending = true;
          return;
        }

        walletLogger.info('[privy.confirmBatchExecution] success', {
          transactionId: result.transactionId,
          caip2: result.caip2,
        });

        pending.resolve({ callsId: result.transactionId });
      } catch (err: unknown) {
        walletLogger.error('[privy.confirmBatchExecution] failed:', err);
        pending.reject(
          err instanceof Error ? err : new Error(errorMessage(err)),
        );
      } finally {
        setIsSigningAndSending(false);
        setBatchExecutionPhase('idle');
        if (!keepPending) {
          setSimulationPreview(null);
          pendingExecutionRef.current = null;
        }
      }
    },
    [
      embeddedWallet,
      generateAuthorizationSignature,
      getAccessToken,
      signPreviewTypedData,
    ],
  );

  const cancelBatchExecution = useCallback((): void => {
    const pending = pendingExecutionRef.current;
    if (pending) {
      pending.reject(new Error('Transaction rejected by the user.'));
    }
    setSimulationPreview(null);
    setRetryError(null);
    pendingExecutionRef.current = null;
  }, []);

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

  return {
    backend,
    isActive,
    simulationPreview,
    confirmBatchExecution,
    retryBatchSimulation,
    updateApprovalAmount,
    cancelBatchExecution,
    isSigningAndSending,
    batchExecutionPhase,
    isRetryingSimulation,
    retryError,
  };
}
