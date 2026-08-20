import { extractErrorMessage } from '@core/lib/errors';
import { computeReviewedBatchFingerprint } from '@core/lib/wallet/reviewedBatchFingerprint';
import type {
  WalletReviewedBatchExecutor,
  WalletReviewedBatchInput,
  WalletReviewedBatchResult,
} from '@core/types';
import { equalsAddress } from '@zapengine/types/shared';
import { useCallback, useRef } from 'react';

/**
 * Wallet-neutral guard rails shared by every reviewed-batch executor.  Both
 * the Privy and external-wallet adapters must refuse to sign anything that
 * diverges from the exact batch the user approved; keeping the checks in one
 * place prevents the two paths from drifting apart.
 */
export type ReviewedBatchGuard =
  | { ok: true; connectedAddress: string }
  | { ok: false; result: WalletReviewedBatchResult };

export const REVIEWED_BATCH_NOT_CONNECTED_ERROR =
  'No wallet is connected to submit the reviewed batch.';

export function checkReviewedBatchGuards(
  input: WalletReviewedBatchInput,
  connectedAddress: string | undefined,
): ReviewedBatchGuard {
  if (!connectedAddress) {
    return {
      ok: false,
      result: {
        status: 'blocked',
        code: 'WALLET_NOT_CONNECTED',
        reason: REVIEWED_BATCH_NOT_CONNECTED_ERROR,
      },
    };
  }
  if (!input.executionAllowed) {
    return {
      ok: false,
      result: {
        status: 'blocked',
        code: 'REVIEW_BLOCKED',
        reason: 'The execution review is blocked and cannot be submitted.',
      },
    };
  }
  if (!equalsAddress(connectedAddress, input.expectedWalletAddress)) {
    return {
      ok: false,
      result: {
        status: 'review-changed',
        reason: 'wallet-address-mismatch',
      },
    };
  }
  if (input.transactions.length === 0) {
    return {
      ok: false,
      result: {
        status: 'blocked',
        code: 'EMPTY_BATCH',
        reason: 'Cannot execute an empty reviewed batch.',
      },
    };
  }
  if (Date.now() >= input.expiresAt) {
    return {
      ok: false,
      result: {
        status: 'blocked',
        code: 'REVIEW_EXPIRED',
        reason: 'The execution review has expired. Refresh it before sending.',
      },
    };
  }
  if (
    !input.expectedBatchFingerprint ||
    !input.expectedSimulationFingerprint ||
    !input.expectedRiskHash
  ) {
    return {
      ok: false,
      result: {
        status: 'blocked',
        code: 'REVIEW_HASH_MISSING',
        reason: 'The execution review is missing its safety hashes.',
      },
    };
  }
  if (
    input.requiresRiskAcknowledgement &&
    input.acknowledgedRiskHash?.toLowerCase() !==
      input.expectedRiskHash.toLowerCase()
  ) {
    return {
      ok: false,
      result: {
        status: 'blocked',
        code: 'RISK_ACKNOWLEDGEMENT_REQUIRED',
        reason: 'Warning risks must be acknowledged before signing.',
      },
    };
  }
  const crossChain = input.transactions.find(
    (transaction) => transaction.chainId !== input.chainId,
  );
  if (crossChain) {
    return {
      ok: false,
      result: {
        status: 'blocked',
        code: 'CROSS_CHAIN_BATCH',
        reason: `Batch contains chain ${crossChain.chainId}, expected ${input.chainId}`,
      },
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
      ok: false,
      result: {
        status: 'blocked',
        code: 'INVALID_REVIEWED_BATCH',
        reason: extractErrorMessage(error),
      },
    };
  }
  if (
    batchFingerprint.toLowerCase() !==
    input.expectedBatchFingerprint.toLowerCase()
  ) {
    return {
      ok: false,
      result: {
        status: 'review-changed',
        reason: 'batch-fingerprint-mismatch',
      },
    };
  }
  return { ok: true, connectedAddress };
}

/**
 * Stable identity for one reviewed submission, so re-renders or double-taps
 * reuse the in-flight promise instead of preparing a second batch.
 */
export function reviewedBatchKey(input: WalletReviewedBatchInput): string {
  return JSON.stringify({
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
}

export interface ReviewedExecutionEntry {
  promise: Promise<WalletReviewedBatchResult>;
  expiresAt: number;
}

/**
 * Keep an accepted reviewed submission idempotent.  A confirm button can be
 * double-clicked (or retried while the wallet response is settling); sharing
 * the same promise prevents a second prepare/sign/send sequence.  The entry is
 * cleared once it is consumed (not submitted) or outlives its review expiry.
 */
export function runDeduplicatedReviewedExecution(
  tracker: Map<string, ReviewedExecutionEntry>,
  key: string,
  expiresAt: number,
  executor: () => Promise<WalletReviewedBatchResult>,
): Promise<WalletReviewedBatchResult> {
  const existing = tracker.get(key);
  if (existing) {
    if (Date.now() < existing.expiresAt) {
      return existing.promise;
    }
    tracker.delete(key);
  }

  const run = executor();
  tracker.set(key, { promise: run, expiresAt });
  void (async () => {
    let result: WalletReviewedBatchResult | undefined;
    try {
      result = await run;
    } catch {
      // The caller receives the original rejection; cleanup is still
      // required so a later review can be attempted.
    } finally {
      if (result?.status !== 'submitted' || Date.now() >= expiresAt) {
        tracker.delete(key);
      }
    }
  })();
  return run;
}

/**
 * Wraps a wallet-specific executor with the shared idempotency tracker.  Both
 * the Privy and external-wallet adapters mount the exact same dedupe wrapper,
 * so a double-tap never prepares a second batch for the same reviewed input.
 */
export function useDeduplicatedReviewedExecution(
  executor: WalletReviewedBatchExecutor,
): WalletReviewedBatchExecutor {
  const trackerRef = useRef<Map<string, ReviewedExecutionEntry>>(new Map());
  return useCallback<WalletReviewedBatchExecutor>(
    (input: WalletReviewedBatchInput) => {
      const key = reviewedBatchKey(input);
      return runDeduplicatedReviewedExecution(
        trackerRef.current,
        key,
        input.expiresAt,
        () => executor(input),
      );
    },
    [executor],
  );
}
