import {
  useSingleChainDepositWizard,
  type SingleChainDepositRecovery,
  type SingleChainDepositWizardStep,
} from '@zapengine/app-core/hooks/useSingleChainDepositWizard';
import { useStrategyDepositWizard } from '@zapengine/app-core/hooks/useStrategyDepositWizard';
import type {
  StrategyDepositWizardState,
  StrategyWizardStep,
} from '@zapengine/app-core/lib/wallet/strategyDepositMachine';
import { useWalletProvider } from '@zapengine/app-core/providers/walletContext';
import type {
  DepositReviewGroup,
  PlanOrchestrationDepositPlan,
  PreparedTransaction,
} from '@zapengine/types/api';
import type { WalletProviderInterface } from '@zapengine/app-core/types';
import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  type DepositExecutionCapability,
  resolveInvestExecutionCapability,
} from '@/integration/investExecutionModel';
import {
  buildInvestDepositPlanRequest,
  useInvest,
} from '@/integration/useInvest';

export interface InvestExecutionContextValue {
  wizard: InvestExecutionWizardState;
  pending: boolean;
  capability: DepositExecutionCapability;
  mode: 'strategy' | 'single-chain';
  startFromDraft: () => Promise<void>;
  advance: () => Promise<void>;
  retry: () => void;
  reset: () => void;
  /** Submit the exact, already-reviewed group without opening the legacy UI. */
  submitReviewedBatch: (input: {
    plan: PlanOrchestrationDepositPlan;
    review: DepositReviewGroup;
    acknowledgedRiskHash?: string;
    queue?: {
      plan: PlanOrchestrationDepositPlan;
      review: DepositReviewGroup;
    }[];
  }) => Promise<ReviewedBatchSubmissionResult>;
  reviewedSubmission: ReviewedBatchSubmission | null;
  reviewedProgress: ReviewedBatchProgress | null;
  reviewedQueue: {
    plan: PlanOrchestrationDepositPlan;
    review: DepositReviewGroup;
  }[];
  updateReviewedQueueEntry: (input: {
    index: number;
    plan: PlanOrchestrationDepositPlan;
    review: DepositReviewGroup;
  }) => void;
  submitNextReviewedBatch: (input?: {
    plan?: PlanOrchestrationDepositPlan;
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
  plan: PlanOrchestrationDepositPlan;
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
    wallet.account.address.toLowerCase() !== review.walletAddress.toLowerCase()
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
  plan: PlanOrchestrationDepositPlan,
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

export type InvestExecutionWizardStep =
  | StrategyWizardStep
  | SingleChainDepositWizardStep;

export interface InvestExecutionWizardState {
  steps: InvestExecutionWizardStep[];
  currentIndex: number;
  status: StrategyDepositWizardState['status'] | 'failed';
  error: string | null;
  recovery: SingleChainDepositRecovery;
}

const InvestExecutionContext =
  createContext<InvestExecutionContextValue | null>(null);

export function InvestExecutionProvider({ children }: { children: ReactNode }) {
  const wallet = useWalletProvider();
  const queryClient = useQueryClient();
  const {
    scope,
    totalUsd6,
    baseFundingToken,
    arbitrumFundingToken,
    singleChainFundingDraft,
  } = useInvest();
  const {
    wizard: strategyWizard,
    pending: strategyPending,
    start: startStrategy,
    advance: advanceStrategy,
    retry: retryStrategy,
    reset: resetStrategy,
  } = useStrategyDepositWizard();
  const {
    wizard: singleChainWizard,
    pending: singleChainPending,
    start: startSingleChain,
    advance: advanceSingleChain,
    retry: retrySingleChain,
    reset: resetSingleChain,
  } = useSingleChainDepositWizard();
  const invalidatedDone = useRef(false);
  const previousDraftKey = useRef('');
  const [reviewedSubmission, setReviewedSubmission] =
    useState<ReviewedBatchSubmission | null>(null);
  const [reviewedQueue, setReviewedQueue] = useState<
    { plan: PlanOrchestrationDepositPlan; review: DepositReviewGroup }[]
  >([]);
  const [reviewedProgress, setReviewedProgress] =
    useState<ReviewedBatchProgress | null>(null);
  const walletAddress = wallet.account?.address;
  const mode = scope === 'both' ? 'strategy' : 'single-chain';
  const singleChainDraftKey = singleChainFundingDraft
    ? [
        singleChainFundingDraft.scope,
        singleChainFundingDraft.chainId,
        singleChainFundingDraft.fromToken,
        singleChainFundingDraft.fromAmount,
      ].join(':')
    : 'none';
  const executionDraftKey = [
    walletAddress?.toLowerCase() ?? 'none',
    scope,
    totalUsd6,
    baseFundingToken.depositAddress,
    arbitrumFundingToken.depositAddress,
    singleChainDraftKey,
  ].join('|');

  const capability = resolveInvestExecutionCapability({
    isConnected: wallet.isConnected,
    executionMode: wallet.executionMode,
    scope,
  });

  const clearReviewedExecution = useCallback(() => {
    invalidatedDone.current = false;
    setReviewedSubmission(null);
    setReviewedQueue([]);
    setReviewedProgress(null);
    resetStrategy();
    resetSingleChain();
  }, [resetSingleChain, resetStrategy]);

  useEffect(() => {
    if (previousDraftKey.current === '') {
      previousDraftKey.current = executionDraftKey;
      return;
    }
    if (previousDraftKey.current === executionDraftKey) return;
    previousDraftKey.current = executionDraftKey;
    clearReviewedExecution();
  }, [clearReviewedExecution, executionDraftKey]);

  const startFromDraft = useCallback(async () => {
    if (!walletAddress || totalUsd6 === '0') return;
    invalidatedDone.current = false;
    const userAddress = walletAddress as `0x${string}`;
    const request = buildInvestDepositPlanRequest({
      userAddress,
      scope,
      totalUsd6,
      baseFundingToken,
      arbitrumFundingToken,
      singleChainFundingDraft,
    });
    if (request === null) return;

    if (request.kind === 'strategy') {
      const {
        kind: _kind,
        strategyId: _strategyId,
        ...strategyRequest
      } = request;
      void _kind;
      void _strategyId;
      await startStrategy(strategyRequest);
      return;
    }
    await startSingleChain(request);
  }, [
    arbitrumFundingToken,
    baseFundingToken,
    scope,
    singleChainFundingDraft,
    startSingleChain,
    startStrategy,
    totalUsd6,
    walletAddress,
  ]);

  const selectedWizard =
    mode === 'strategy' ? strategyWizard : singleChainWizard;
  const wizard = useMemo<InvestExecutionWizardState>(
    () => ({
      steps: selectedWizard.steps,
      currentIndex: selectedWizard.currentIndex,
      status: selectedWizard.status,
      error: selectedWizard.error,
      recovery: mode === 'single-chain' ? singleChainWizard.recovery : null,
    }),
    [mode, selectedWizard, singleChainWizard.recovery],
  );
  const pending = mode === 'strategy' ? strategyPending : singleChainPending;
  const advance = mode === 'strategy' ? advanceStrategy : advanceSingleChain;
  const retry = mode === 'strategy' ? retryStrategy : retrySingleChain;
  const reset = clearReviewedExecution;

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

  type ReviewedQueue = {
    plan: PlanOrchestrationDepositPlan;
    review: DepositReviewGroup;
  }[];

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
      plan: PlanOrchestrationDepositPlan;
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
      plan?: PlanOrchestrationDepositPlan;
      review?: DepositReviewGroup;
      acknowledgedRiskHash?: string;
    }): Promise<ReviewedBatchSubmissionResult> => {
      const progress = reviewedProgress;
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
      plan: PlanOrchestrationDepositPlan;
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

  useEffect(() => {
    if (wizard.status !== 'done' || invalidatedDone.current) return;
    invalidatedDone.current = true;
    void queryClient.invalidateQueries({ queryKey: ['desktop'] });
  }, [queryClient, wizard.status]);

  const value: InvestExecutionContextValue = {
    wizard,
    pending,
    capability,
    mode,
    startFromDraft,
    advance,
    retry,
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
