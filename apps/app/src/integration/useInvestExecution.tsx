import { queryKeys } from '@zapengine/app-core/hooks/queries';
import { useWalletProvider } from '@zapengine/app-core/providers/walletContext';
import type {
  DepositReviewGroup,
  ReviewedDepositPlan,
  PreparedTransaction,
} from '@zapengine/types/api';
import { equalsAddress } from '@zapengine/types/shared';
import type { WalletProviderInterface } from '@zapengine/app-core/types';
import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  type DepositExecutionCapability,
  resolveDepositExecutionCapability,
} from '@/integration/investExecutionModel';
import { stageDraftsKey } from '@/integration/investTargetsModel';
import { useInvest } from '@/integration/useInvest';
import { trackEvent } from '@/observability/analytics';

type ReviewedQueueEntry = {
  plan: ReviewedDepositPlan;
  review: DepositReviewGroup;
};
type ReviewedQueue = ReviewedQueueEntry[];

export interface InvestExecutionContextValue {
  capability: DepositExecutionCapability;
  reset: () => void;
  /** Submit the exact, already-reviewed group without re-planning. */
  submitReviewedBatch: (input: {
    plan: ReviewedDepositPlan;
    review: DepositReviewGroup;
    acknowledgedRiskHash?: string;
    queue?: ReviewedQueue;
  }) => Promise<ReviewedBatchSubmissionResult>;
  reviewedSubmission: ReviewedBatchSubmission | null;
  reviewedProgress: ReviewedBatchProgress | null;
  reviewedQueue: ReviewedQueue;
  updateReviewedQueueEntry: (input: {
    index: number;
    plan: ReviewedDepositPlan;
    review: DepositReviewGroup;
  }) => void;
  submitNextReviewedBatch: (input?: {
    plan?: ReviewedDepositPlan;
    review?: DepositReviewGroup;
    acknowledgedRiskHash?: string;
  }) => Promise<ReviewedBatchSubmissionResult>;
}

export interface ReviewedBatchSubmission {
  status: 'submitted';
  groupId: string;
  chainId: number;
  callsId: string;
  transactionHash?: `0x${string}`;
}

export interface ReviewedBatchProgress extends ReviewedBatchSubmission {
  phase: 'confirming' | 'submitted' | 'checkpoint' | 'complete' | 'failed';
  groupIndex: number;
  groupCount: number;
  statusNote?: string;
}

export type ReviewedBatchSubmissionResult =
  | ReviewedBatchSubmission
  | {
      status: 'review-changed' | 'blocked';
      reason: string;
    };

async function executeReviewedBatchWithWallet({
  wallet,
  plan,
  review,
  acknowledgedRiskHash,
}: {
  wallet: WalletProviderInterface;
  plan: ReviewedDepositPlan;
  review: DepositReviewGroup;
  acknowledgedRiskHash?: string | undefined;
}): Promise<ReviewedBatchSubmissionResult> {
  const batch = reviewedBatchTransactions(plan, review);
  if (!batch) {
    return {
      status: 'blocked',
      reason: 'The reviewed execution group is missing from the plan.',
    };
  }
  if (
    !wallet.account?.address ||
    !equalsAddress(wallet.account.address, review.walletAddress)
  ) {
    return {
      status: 'blocked',
      reason:
        'The connected wallet changed. Refresh the review before signing.',
    };
  }
  if (!wallet.executeReviewedBatch) {
    return {
      status: 'blocked',
      reason: 'This wallet cannot execute a reviewed atomic batch.',
    };
  }
  const result = await wallet.executeReviewedBatch({
    transactions: batch.transactions,
    chainId: batch.chainId,
    expectedWalletAddress: review.walletAddress,
    expectedBatchFingerprint: review.batchFingerprint,
    expiresAt: review.expiresAt,
    executionAllowed: review.executionAllowed,
    expectedSimulationFingerprint: review.expectedSimulationFingerprint,
    expectedRiskHash: review.expectedRiskHash,
    requiresRiskAcknowledgement: review.requiresRiskAcknowledgement,
    ...(acknowledgedRiskHash ? { acknowledgedRiskHash } : {}),
  });
  if (result.status !== 'submitted') {
    return { status: result.status, reason: result.reason };
  }
  return {
    status: 'submitted',
    groupId: review.groupId,
    chainId: batch.chainId,
    callsId: result.callsId,
    ...(result.transactionHash
      ? { transactionHash: result.transactionHash }
      : {}),
  };
}

function reviewedBatchTransactions(
  plan: ReviewedDepositPlan,
  review: DepositReviewGroup,
): { transactions: PreparedTransaction[]; chainId: number } | null {
  if ('executionGroups' in plan) {
    const group = plan.executionGroups.find(
      (candidate) => candidate.id === review.groupId,
    );
    if (!group) return null;
    return {
      chainId: group.chainId,
      transactions: [...group.approvals, ...group.calls],
    };
  }
  if (`chain-${plan.sourceChainId}` !== review.groupId) return null;
  return {
    chainId: plan.sourceChainId,
    transactions: [...plan.approvals, ...plan.calls],
  };
}

const InvestExecutionContext =
  createContext<InvestExecutionContextValue | null>(null);

export function InvestExecutionProvider({ children }: { children: ReactNode }) {
  const wallet = useWalletProvider();
  const queryClient = useQueryClient();
  const { stageDrafts } = useInvest();
  const invalidatedDone = useRef(false);
  const previousDraftKey = useRef('');
  const [reviewedSubmission, setReviewedSubmission] =
    useState<ReviewedBatchSubmission | null>(null);
  const [reviewedQueue, setReviewedQueue] = useState<ReviewedQueue>([]);
  const [reviewedProgress, setReviewedProgress] =
    useState<ReviewedBatchProgress | null>(null);
  const walletAddress = wallet.account?.address;
  const executionDraftKey = [
    walletAddress?.toLowerCase() ?? 'none',
    stageDraftsKey(stageDrafts),
  ].join('|');

  const capability = resolveDepositExecutionCapability({
    isConnected: wallet.isConnected,
    executionMode: wallet.executionMode,
  });

  const reset = useCallback(() => {
    invalidatedDone.current = false;
    setReviewedSubmission(null);
    setReviewedQueue([]);
    setReviewedProgress(null);
  }, []);

  useEffect(() => {
    if (previousDraftKey.current === '') {
      previousDraftKey.current = executionDraftKey;
      return;
    }
    if (previousDraftKey.current === executionDraftKey) return;
    previousDraftKey.current = executionDraftKey;
    reset();
  }, [executionDraftKey, reset]);

  const commitReviewedSubmission = useCallback(
    (
      submission: ReviewedBatchSubmission,
      queue: ReviewedQueue,
      groupIndex: number,
    ) => {
      setReviewedSubmission(submission);
      setReviewedProgress({
        ...submission,
        phase: 'confirming',
        groupIndex,
        groupCount: queue.length,
      });
      setReviewedQueue(queue);
    },
    [],
  );

  const monitorReviewedBatch = useCallback(
    async (
      submission: ReviewedBatchSubmission,
      queue: ReviewedQueue,
      groupIndex: number,
    ): Promise<void> => {
      if (!wallet.waitForReviewedBatch) {
        setReviewedProgress((current) =>
          current?.callsId === submission.callsId &&
          current.groupIndex === groupIndex
            ? {
                ...current,
                phase:
                  queue.length > groupIndex + 1 ? 'checkpoint' : 'submitted',
                statusNote:
                  'This wallet accepted the batch, but does not expose calls status.',
              }
            : current,
        );
        return;
      }
      const status = await wallet.waitForReviewedBatch({
        callsId: submission.callsId,
        chainId: submission.chainId,
      });
      if (status.status === 'failed') {
        setReviewedProgress((current) =>
          current?.callsId === submission.callsId &&
          current.groupIndex === groupIndex
            ? { ...current, phase: 'failed', statusNote: status.reason }
            : current,
        );
        return;
      }
      const nextPhase =
        status.status === 'unknown'
          ? queue.length > groupIndex + 1
            ? 'checkpoint'
            : 'submitted'
          : queue.length > groupIndex + 1
            ? 'checkpoint'
            : 'complete';
      setReviewedProgress((current) =>
        current?.callsId === submission.callsId &&
        current.groupIndex === groupIndex
          ? {
              ...current,
              phase: nextPhase,
              ...(status.status === 'unknown'
                ? {
                    statusNote:
                      status.reason ??
                      'Batch status is unavailable; it was not resubmitted.',
                  }
                : status.transactionHash
                  ? { transactionHash: status.transactionHash }
                  : {}),
            }
          : current,
      );
    },
    [wallet],
  );

  const submitReviewedBatch = useCallback(
    async (input: {
      plan: ReviewedDepositPlan;
      review: DepositReviewGroup;
      acknowledgedRiskHash?: string;
      queue?: ReviewedQueue;
    }): Promise<ReviewedBatchSubmissionResult> => {
      const submission = await executeReviewedBatchWithWallet({
        wallet,
        plan: input.plan,
        review: input.review,
        acknowledgedRiskHash: input.acknowledgedRiskHash,
      });
      if (submission.status !== 'submitted') {
        return submission;
      }
      trackEvent('invest_submitted', {
        chain_id: submission.chainId,
        group_id: submission.groupId,
      });
      const queue = input.queue?.length
        ? input.queue
        : [{ plan: input.plan, review: input.review }];
      commitReviewedSubmission(submission, queue, 0);
      void monitorReviewedBatch(submission, queue, 0);
      return submission;
    },
    [commitReviewedSubmission, monitorReviewedBatch, wallet],
  );

  const submitNextReviewedBatch = useCallback(
    async (input?: {
      plan?: ReviewedDepositPlan;
      review?: DepositReviewGroup;
      acknowledgedRiskHash?: string;
    }): Promise<ReviewedBatchSubmissionResult> => {
      const progress = reviewedProgress;
      if (progress && progress.phase !== 'checkpoint') {
        return {
          status: 'blocked',
          reason: 'The current reviewed batch has not reached its checkpoint.',
        };
      }
      const nextIndex = progress ? progress.groupIndex + 1 : 0;
      const queued = reviewedQueue[nextIndex];
      const next =
        input?.plan && input.review
          ? { plan: input.plan, review: input.review }
          : queued;
      if (!next) {
        return {
          status: 'blocked',
          reason: 'No reviewed batch is waiting for confirmation.',
        };
      }
      const submission = await executeReviewedBatchWithWallet({
        wallet,
        plan: next.plan,
        review: next.review,
        acknowledgedRiskHash: input?.acknowledgedRiskHash,
      });
      if (submission.status !== 'submitted') {
        return submission;
      }
      const activeQueue =
        input?.plan && input.review
          ? reviewedQueue.map((entry, index) =>
              index === nextIndex ? next : entry,
            )
          : reviewedQueue;
      commitReviewedSubmission(submission, activeQueue, nextIndex);
      void monitorReviewedBatch(submission, activeQueue, nextIndex);
      return submission;
    },
    [
      commitReviewedSubmission,
      monitorReviewedBatch,
      reviewedProgress,
      reviewedQueue,
      wallet,
    ],
  );

  const updateReviewedQueueEntry = useCallback(
    (input: {
      index: number;
      plan: ReviewedDepositPlan;
      review: DepositReviewGroup;
    }) => {
      setReviewedQueue((current) =>
        current.map((entry, index) =>
          index === input.index
            ? { plan: input.plan, review: input.review }
            : entry,
        ),
      );
    },
    [],
  );

  // The wallet-level batches are done once the last queued group completes;
  // refresh the portfolio views the invest flow just changed.
  const allBatchesComplete =
    reviewedProgress?.phase === 'complete' &&
    reviewedProgress.groupIndex === reviewedQueue.length - 1;
  useEffect(() => {
    if (!allBatchesComplete || invalidatedDone.current) return;
    invalidatedDone.current = true;
    void queryClient.invalidateQueries({ queryKey: queryKeys.desktop.all });
  }, [allBatchesComplete, queryClient]);

  const value: InvestExecutionContextValue = {
    capability,
    reset,
    submitReviewedBatch,
    reviewedSubmission,
    reviewedProgress,
    reviewedQueue,
    updateReviewedQueueEntry,
    submitNextReviewedBatch,
  };

  return (
    <InvestExecutionContext.Provider value={value}>
      {children}
    </InvestExecutionContext.Provider>
  );
}

export function useInvestExecution(): InvestExecutionContextValue {
  const context = useContext(InvestExecutionContext);
  if (!context) {
    throw new Error(
      'useInvestExecution must be used within an InvestExecutionProvider',
    );
  }
  return context;
}
