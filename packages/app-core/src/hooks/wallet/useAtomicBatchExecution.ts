import { extractErrorMessage } from '@core/lib/errors';
import {
  assertSameChainTransactions,
  atomicBatchSummary,
  createIdempotencyKey,
  decodeBase64,
  getPrivyAtomicBatchChain,
  summarizeTransaction,
  toWalletSendCall,
  toWalletTypedData,
  WALLET_NOT_CONNECTED_ERROR,
} from '@core/lib/wallet/privyAtomicBatch';
import {
  checkReviewedBatchGuards,
  useDeduplicatedReviewedExecution,
} from '@core/lib/wallet/reviewedBatchExecution';
import {
  preparePrivyAtomicBatch,
  sendPrivyAtomicBatch,
} from '@core/services/privyWalletService';
import type {
  WalletAtomicBatchExecutor,
  WalletAtomicBatchResult,
  WalletReviewedBatchExecutor,
  WalletTypedData,
} from '@core/types';
import { walletLogger } from '@core/utils';
import type {
  PrivyPrepareSendCallsRequest,
  PrivyPrepareSendCallsResponse,
} from '@zapengine/types/api';
import { useCallback, useRef, useState } from 'react';
import { encodeFunctionData, erc20Abi, type Hash, parseUnits } from 'viem';

export type PrivyBatchExecutionPhase =
  | 'idle'
  | 'signingIntent'
  | 'authorizingBatch'
  | 'sendingBatch';

const PRIVY_ACCESS_TOKEN_ERROR =
  'Privy user access token is invalid or expired. Please re-login.';
const REVIEW_CHANGED_STATUS = 'review-changed' as const;

/**
 * Platform primitives the batch flow needs but must not import directly —
 * `@privy-io/react-auth` (web) and `@privy-io/expo` (native) each supply
 * their own implementations, which is what keeps this hook RN-safe.
 */
export interface AtomicBatchExecutionDeps {
  getAccessToken: () => Promise<string | null>;
  /** Sign the preview's EIP-712 `ZapPilotIntent` payload with the embedded wallet. */
  signPreviewTypedData: (typedData: WalletTypedData) => Promise<`0x${string}`>;
  /** Sign the Privy Wallets API authorization payload (session key). */
  generateAuthorizationSignature: (
    payload: Uint8Array,
  ) => Promise<{ signature: string }>;
  /** Switch the embedded wallet to `chainId` unless it is already there. */
  ensureChain: (chainId: number) => Promise<void>;
  /** Privy wallet resource id for the active embedded wallet. */
  resolveWalletId: () => string | undefined;
  walletAddress: string | undefined;
}

export interface AtomicBatchExecution {
  executeAtomicBatch: WalletAtomicBatchExecutor;
  /**
   * Execute an already-reviewed batch without opening the legacy preview UI.
   * This is the headless path used by the unified invest review screen.
   */
  executeReviewedBatch: WalletReviewedBatchExecutor;
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
 * Props a host hands to the simulation-preview UI. The app injects its own
 * renderer (app-core ships no UI components); always bound to the Privy
 * backend — the wagmi path never produces a simulation preview (external
 * wallets show their own confirmation UI).
 */
export interface SimulationPreviewRenderProps {
  isOpen: boolean;
  onClose: AtomicBatchExecution['cancelBatchExecution'];
  previewData: NonNullable<AtomicBatchExecution['simulationPreview']>;
  onConfirm: AtomicBatchExecution['confirmBatchExecution'];
  onRetry: AtomicBatchExecution['retryBatchSimulation'];
  onUpdateApproval: AtomicBatchExecution['updateApprovalAmount'];
  isSigningAndSending: AtomicBatchExecution['isSigningAndSending'];
  batchExecutionPhase: AtomicBatchExecution['batchExecutionPhase'];
  isRetryingSimulation: AtomicBatchExecution['isRetryingSimulation'];
  retryError: AtomicBatchExecution['retryError'];
}

/**
 * Two-step Privy atomic-batch execution against account-engine:
 * `executeAtomicBatch` prepares (server runs the Tenderly simulation) and
 * then blocks on a held promise until the preview UI resolves it through
 * `confirmBatchExecution` (sign intent → sign authorization → confirm) or
 * `cancelBatchExecution`. A confirm answered with `{status: 'review'}`
 * (simulation drift) swaps the fresh preview in and keeps the promise
 * pending so the user can re-review.
 */
export function useAtomicBatchExecution(
  deps: AtomicBatchExecutionDeps,
): AtomicBatchExecution {
  const {
    getAccessToken,
    signPreviewTypedData,
    generateAuthorizationSignature,
    ensureChain,
    resolveWalletId,
    walletAddress,
  } = deps;

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
    batch: PrivyPrepareSendCallsRequest;
  } | null>(null);

  const executePrivyReviewedBatch = useCallback<WalletReviewedBatchExecutor>(
    async (input) => {
      const guard = checkReviewedBatchGuards(input, walletAddress);
      if (!guard.ok) {
        return guard.result;
      }
      const connectedAddress = guard.connectedAddress;

      let chain: ReturnType<typeof getPrivyAtomicBatchChain>;
      try {
        chain = getPrivyAtomicBatchChain(input.chainId);
        await ensureChain(chain.id);
      } catch (error: unknown) {
        return {
          status: 'blocked',
          code: 'CHAIN_UNAVAILABLE',
          reason: extractErrorMessage(error),
        };
      }

      const walletId = resolveWalletId();
      if (!walletId) {
        return {
          status: 'blocked',
          code: 'WALLET_ID_UNAVAILABLE',
          reason: 'Privy wallet resource id is unavailable',
        };
      }

      const accessToken = await getAccessToken();
      if (!accessToken) {
        return {
          status: 'blocked',
          code: 'ACCESS_TOKEN_EXPIRED',
          reason: PRIVY_ACCESS_TOKEN_ERROR,
        };
      }

      const batch: PrivyPrepareSendCallsRequest = {
        walletId,
        walletAddress: connectedAddress,
        chainId: chain.id as 8453 | 42161,
        calls: input.transactions.map(toWalletSendCall),
        idempotencyKey: createIdempotencyKey(),
      };

      const preview = await preparePrivyAtomicBatch(batch, accessToken);
      if (preview.status === 'failed') {
        return {
          status: 'blocked',
          code: 'SIMULATION_FAILED',
          reason: preview.failureReason,
        };
      }
      if (preview.status === 'unavailable') {
        return {
          status: 'blocked',
          code: 'SIMULATION_UNAVAILABLE',
          reason: preview.unavailableReason,
        };
      }
      if (
        preview.simulationFingerprint.toLowerCase() !==
        input.expectedSimulationFingerprint.toLowerCase()
      ) {
        return {
          status: REVIEW_CHANGED_STATUS,
          reason: 'simulation-fingerprint-mismatch',
          simulationFingerprint: preview.simulationFingerprint,
          riskHash: preview.riskHash,
        };
      }
      if (
        preview.riskHash.toLowerCase() !== input.expectedRiskHash.toLowerCase()
      ) {
        return {
          status: REVIEW_CHANGED_STATUS,
          reason: 'risk-hash-mismatch',
          simulationFingerprint: preview.simulationFingerprint,
          riskHash: preview.riskHash,
        };
      }

      const userSignature = await signPreviewTypedData(
        toWalletTypedData(preview.typedDataPayload),
      );
      const { signature: authorizationSignature } =
        await generateAuthorizationSignature(
          decodeBase64(preview.authorizationPayload),
        );

      // The user may take long enough to sign that the prepare token expires;
      // reacquire immediately before the confirm request, as the legacy
      // confirmation path does, and never retry a consumed preview.
      const executeAccessToken = await getAccessToken();
      if (!executeAccessToken) {
        return {
          status: 'blocked',
          code: 'ACCESS_TOKEN_EXPIRED',
          reason: PRIVY_ACCESS_TOKEN_ERROR,
        };
      }

      const result = await sendPrivyAtomicBatch(
        {
          previewId: preview.previewId,
          userSignature,
          authorizationSignature,
          ...(input.acknowledgedRiskHash
            ? { acknowledgedRiskHash: input.acknowledgedRiskHash }
            : {}),
        },
        executeAccessToken,
      );

      if (result.status === 'review') {
        return {
          status: REVIEW_CHANGED_STATUS,
          reason: 'server-review-changed',
          simulationFingerprint: result.preview.simulationFingerprint,
          riskHash: result.preview.riskHash,
        };
      }

      return {
        status: 'submitted',
        callsId: result.transactionId,
        ...(result.transactionHash
          ? { transactionHash: result.transactionHash as Hash }
          : {}),
      };
    },
    [
      ensureChain,
      generateAuthorizationSignature,
      getAccessToken,
      resolveWalletId,
      signPreviewTypedData,
      walletAddress,
    ],
  );

  const executeReviewedBatch = useDeduplicatedReviewedExecution(
    executePrivyReviewedBatch,
  );

  const executeAtomicBatch = useCallback<WalletAtomicBatchExecutor>(
    async (transactions, chainId) => {
      if (!walletAddress) {
        throw new Error(WALLET_NOT_CONNECTED_ERROR);
      }
      if (transactions.length === 0) {
        throw new Error('Cannot execute empty Privy EIP-7702 batch');
      }
      assertSameChainTransactions(transactions, chainId);

      const chain = getPrivyAtomicBatchChain(chainId);
      const caip2 = `eip155:${chain.id}`;

      await ensureChain(chain.id);

      const calls = transactions.map(toWalletSendCall);
      const walletId = resolveWalletId();
      if (!walletId) {
        throw new Error('Privy wallet resource id is unavailable');
      }
      const batch: PrivyPrepareSendCallsRequest = {
        walletId,
        walletAddress,
        chainId: chain.id as 8453 | 42161,
        calls,
        idempotencyKey: createIdempotencyKey(),
      };

      walletLogger.info(
        '[privy.executeAtomicBatch] preparing Privy Wallets API batch',
        {
          chainId,
          caip2,
          embeddedWalletAddress: walletAddress,
          transactionCount: transactions.length,
          transactions: transactions.map(summarizeTransaction),
          atomicBatch: atomicBatchSummary(transactions),
        },
      );

      const prepareAccessToken = await getAccessToken();
      if (!prepareAccessToken) {
        throw new Error(PRIVY_ACCESS_TOKEN_ERROR);
      }

      // 1. Prepare batch and simulation
      const preview = await preparePrivyAtomicBatch(
        batch,
        prepareAccessToken,
      ).catch((error: unknown) => {
        throw new Error(
          `Privy EOA EIP-7702 atomic batch preparation failed: ${extractErrorMessage(error)}`,
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
    [walletAddress, ensureChain, resolveWalletId, getAccessToken],
  );

  const retryBatchSimulation = useCallback(async (): Promise<void> => {
    const pending = pendingExecutionRef.current;
    if (!pending) return;

    setRetryError(null);
    setIsRetryingSimulation(true);
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error(PRIVY_ACCESS_TOKEN_ERROR);
      }
      const preview = await preparePrivyAtomicBatch(pending.batch, accessToken);
      pending.preview = preview;
      setSimulationPreview(preview);
    } catch (err: unknown) {
      const message = extractErrorMessage(err);
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

      const updatedBatch: PrivyPrepareSendCallsRequest = {
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
          throw new Error(PRIVY_ACCESS_TOKEN_ERROR);
        }
        const preview = await preparePrivyAtomicBatch(
          updatedBatch,
          accessToken,
        );
        pending.batch = updatedBatch;
        pending.preview = preview;
        setSimulationPreview(preview);
      } catch (err: unknown) {
        const message = extractErrorMessage(err);
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

      if (!walletAddress) {
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
        // 1. User signs EIP-712 Intent with the embedded wallet
        walletLogger.info(
          '[privy.confirmBatchExecution] signing EIP-712 intent',
        );
        setBatchExecutionPhase('signingIntent');
        const userSignature = await signPreviewTypedData(
          toWalletTypedData(pending.preview.typedDataPayload),
        );

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
          throw new Error(PRIVY_ACCESS_TOKEN_ERROR);
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
          transactionHash: result.transactionHash,
          caip2: result.caip2,
        });

        pending.resolve({
          callsId: result.transactionId,
          ...(result.transactionHash
            ? { transactionHash: result.transactionHash as Hash }
            : {}),
        });
      } catch (err: unknown) {
        walletLogger.error('[privy.confirmBatchExecution] failed:', err);
        pending.reject(
          err instanceof Error ? err : new Error(extractErrorMessage(err)),
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
      walletAddress,
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

  return {
    executeAtomicBatch,
    executeReviewedBatch,
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
