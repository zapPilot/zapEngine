import { useDepositWizard } from '@zapengine/app-core/hooks/useDepositWizard';
import { extractErrorMessage } from '@zapengine/app-core/lib/errors';
import { hlpStepFromPlan } from '@zapengine/app-core/lib/wallet/depositWizardMachine';
import { getHyperCoreSpendableUsdc } from '@zapengine/app-core/services/hyperliquidService';
import type {
  DepositPlan,
  HyperliquidVaultDepositStep,
  ReviewedDepositPlan,
} from '@zapengine/types/api';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { Address, Hash } from 'viem';

import { useCheckpointAutoAdvance } from '@/hooks/useCheckpointAutoAdvance';
import { useHyperliquidAgent } from '@/hooks/useHyperliquidAgent';
import {
  hlpProgressRows,
  hlpRetryMode,
  resumeKey,
  shouldAutoRunHlpDeposit,
  unsafeResumeReason,
} from '@/integration/hlpProgressModel';
import {
  advanceCheckpoint,
  confirmCheckpointReview,
} from '@/integration/checkpointAdvanceModel';
import { hlpStageProgressInput } from '@/integration/investReviewModel';
import { hyperliquidAccountUrl } from '@/integration/investExecutionModel';
import { chainBatchDrafts } from '@/integration/investTargetsModel';
import { isStrategyDepositPlan } from '@/integration/simulationPreviewModel';
import { useAccount } from '@/integration/useAccount';
import { useInvest } from '@/integration/useInvest';
import { useInvestExecution } from '@/integration/useInvestExecution';
import { useInvestReview } from '@/integration/useInvestReview';

import { useHyperCoreLegPlan } from './useHyperCoreLegPlan';

function asDepositPlan(
  plan: ReviewedDepositPlan | undefined,
): DepositPlan | null {
  if (!plan || isStrategyDepositPlan(plan)) return null;
  return plan;
}

export function useFundExecutionController({ visible }: { visible: boolean }) {
  const visibleRef = useRef(visible);
  useLayoutEffect(() => {
    visibleRef.current = visible;
  }, [visible]);
  const account = useAccount();
  const invest = useInvest();
  const setHlpBaselineUsd6 = invest.setHlpBaselineUsd6;
  // Checkpoints re-review one stage at a time; mounting this screen must not
  // re-review the batches the user already confirmed.
  const review = useInvestReview({ autoReview: false });
  const {
    reviewedSubmission,
    reviewedProgress,
    reviewedQueue,
    updateReviewedQueueEntry,
    submitNextReviewedBatch,
    reset: resetReviewedExecution,
  } = useInvestExecution();

  const batches = useMemo(
    () => chainBatchDrafts(invest.stageDrafts),
    [invest.stageDrafts],
  );
  const currentIndex = reviewedProgress?.groupIndex ?? 0;
  const nextIndex = currentIndex + 1;
  const nextEntry = reviewedQueue[nextIndex];
  // The queued entry — not a freshly fetched one — is the exact plan the
  // checkpoint will submit, so it is also what the card must show.
  const nextBatch = batches[nextIndex];
  const hlpIndex = batches.findIndex((batch) =>
    batch.positions.some((draft) => draft.positionId === 'hlp'),
  );
  const hlpDraft =
    hlpIndex >= 0
      ? batches[hlpIndex]?.positions.find((draft) => draft.positionId === 'hlp')
      : undefined;
  const hlpSourceChainKey = hlpDraft?.sourceToken.chainKey ?? null;
  const hlpPlan =
    hlpIndex >= 0 ? asDepositPlan(reviewedQueue[hlpIndex]?.plan) : null;
  const hlpStep = hlpPlan ? hlpStepFromPlan(hlpPlan) : null;
  const hyperCoreDraft = invest.hyperCoreFundingDraft;
  const legPlan = useHyperCoreLegPlan(hyperCoreDraft);
  const spotPlan = hyperCoreDraft ? legPlan.plan : null;
  const fundingSource = hyperCoreDraft ? 'hypercore' : 'bridge';
  // A HyperCore-funded HLP allocation never joins `chainBatchDrafts`, so the
  // signing material has to come from its own plan; reading it only from the
  // reviewed queue would leave the agent permanently un-armed and silent.
  const agent = useHyperliquidAgent(
    spotPlan?.step.signing ?? hlpStep?.signing ?? null,
  );
  const {
    wizard,
    resumeReviewedPlan,
    startSpotDeposit,
    runHlpDeposit,
    retry: retryHlp,
    reset: resetHlp,
  } = useDepositWizard({ hyperliquidAgent: agent });

  const [checkpointPending, setCheckpointPending] = useState(false);
  const [checkpointError, setCheckpointError] = useState<string | null>(null);
  const [checkpointNeedsConfirmation, setCheckpointNeedsConfirmation] =
    useState(false);
  const [flowError, setFlowError] = useState<string | null>(null);
  const resumedKeyRef = useRef<string | null>(null);
  const autoDepositAttemptedRef = useRef(false);
  // Read after every await so a checkpoint that moved on while this screen was
  // waiting cannot have stale evidence or a stale error written over it.
  const latestProgressRef = useRef(reviewedProgress);
  useEffect(() => {
    latestProgressRef.current = reviewedProgress;
  }, [reviewedProgress]);

  const allBatchesComplete =
    reviewedProgress?.phase === 'complete' &&
    currentIndex === reviewedQueue.length - 1;
  // Hold the HyperCore deposit until every wallet batch has landed. It does
  // not depend on them, but it locks withdrawals for four days, so it must not
  // start while a batch the user is still signing for could yet fail.
  const armedSpotPlan = allBatchesComplete ? spotPlan : null;
  const hlpBatchComplete =
    hlpIndex >= 0 &&
    currentIndex === hlpIndex &&
    reviewedProgress?.phase === 'complete';
  const sourceTxHash = hlpBatchComplete
    ? ((reviewedProgress?.transactionHash ?? null) as Hash | null)
    : null;
  const bridgeConfirmed = wizard.legs.some(
    (leg) => leg.kind === 'bridge' && leg.status === 'destinationConfirmed',
  );

  const hlpModel = useMemo(
    () =>
      hlpStageProgressInput({
        hasReviewedSubmission: reviewedSubmission !== null,
        reviewedPhase: reviewedProgress?.phase ?? null,
        reviewedStatusNote: reviewedProgress?.statusNote ?? null,
        sourceTxHash,
        baselineUsd6: invest.hlpBaselineUsd6,
        hlpPlan: hlpBatchComplete ? hlpPlan : null,
        spotPlan: armedSpotPlan,
        fundingSource,
        hyperCoreRequestedUsd6: hyperCoreDraft?.requestedUsd6 ?? null,
        wizardStage: wizard.stage,
        wizardErrorStage: wizard.error?.stage ?? null,
        hlpStatus: wizard.hlp.status,
        bridgeConfirmed,
        flowError,
        agentReady: agent.isReady,
      }),
    [
      agent.isReady,
      armedSpotPlan,
      bridgeConfirmed,
      flowError,
      fundingSource,
      hlpBatchComplete,
      hlpPlan,
      hyperCoreDraft?.requestedUsd6,
      invest.hlpBaselineUsd6,
      reviewedProgress?.phase,
      reviewedProgress?.statusNote,
      reviewedSubmission,
      sourceTxHash,
      wizard.error?.stage,
      wizard.hlp.status,
      wizard.stage,
    ],
  );

  const currentResumeKey = resumeKey(
    hlpModel,
    reviewedProgress?.callsId ?? null,
  );

  const runGuarded = useCallback((run: () => Promise<void>) => {
    setFlowError(null);
    void run().catch((error: unknown) => {
      setFlowError(extractErrorMessage(error));
    });
  }, []);

  /**
   * Arm the vault deposit from whichever evidence this run actually has. The
   * HyperCore path skips the baseline machinery entirely: `startSpotDeposit`
   * sizes itself against the live account-mode-aware balance, so there is no
   * bridge delta to measure and no source transaction to resume from.
   */
  const trackHlpDeposit = useCallback(async () => {
    if (armedSpotPlan) {
      await startSpotDeposit(armedSpotPlan);
      return;
    }
    if (!hlpPlan || !sourceTxHash || !invest.hlpBaselineUsd6) return;
    await resumeReviewedPlan({
      plan: hlpPlan,
      baselineUsd6: BigInt(invest.hlpBaselineUsd6),
      sourceTxHash,
    });
  }, [
    armedSpotPlan,
    hlpPlan,
    invest.hlpBaselineUsd6,
    resumeReviewedPlan,
    sourceTxHash,
    startSpotDeposit,
  ]);

  useEffect(() => {
    if (currentResumeKey === null) {
      if (resumedKeyRef.current !== null) {
        resumedKeyRef.current = null;
        autoDepositAttemptedRef.current = false;
        resetHlp();
      }
      return;
    }
    if (resumedKeyRef.current === currentResumeKey) return;
    resumedKeyRef.current = currentResumeKey;
    runGuarded(trackHlpDeposit);
  }, [currentResumeKey, resetHlp, runGuarded, trackHlpDeposit]);

  useEffect(() => {
    if (!shouldAutoRunHlpDeposit(hlpModel, autoDepositAttemptedRef.current)) {
      return;
    }
    autoDepositAttemptedRef.current = true;
    runGuarded(runHlpDeposit);
  }, [hlpModel, runGuarded, runHlpDeposit]);

  const captureHlpBaseline = useCallback(
    async (step: HyperliquidVaultDepositStep) => {
      const userAddress = account.address as Address | null;
      if (!userAddress) throw new Error('HLP preflight is unavailable.');
      const baseline = await getHyperCoreSpendableUsdc({
        user: userAddress,
        apiUrl: step.signing.apiUrl,
      });
      setHlpBaselineUsd6(baseline.spendableUsd6.toString());
    },
    [account.address, setHlpBaselineUsd6],
  );

  const checkpointStillCurrent = useCallback(
    (startedCallsId: string | null) => {
      const progress = latestProgressRef.current;
      return (
        progress !== null &&
        progress.callsId === startedCallsId &&
        progress.phase === 'checkpoint'
      );
    },
    [],
  );

  const runCheckpointAction = useCallback(
    async (
      action: () => Promise<Awaited<ReturnType<typeof advanceCheckpoint>>>,
      handlePaused: (
        outcome: Exclude<
          Awaited<ReturnType<typeof advanceCheckpoint>>,
          { status: 'submitted' }
        >,
      ) => void,
    ) => {
      const startedCallsId = latestProgressRef.current?.callsId ?? null;
      setCheckpointPending(true);
      setCheckpointError(null);
      setCheckpointNeedsConfirmation(false);
      try {
        const outcome = await action();
        if (
          outcome.status === 'submitted' ||
          !checkpointStillCurrent(startedCallsId)
        ) {
          return;
        }
        handlePaused(outcome);
      } catch (error: unknown) {
        if (checkpointStillCurrent(startedCallsId)) {
          setCheckpointError(extractErrorMessage(error));
        }
      } finally {
        setCheckpointPending(false);
      }
    },
    [checkpointStillCurrent],
  );

  const submitVisibleCheckpoint = useCallback(
    (input: Parameters<typeof submitNextReviewedBatch>[0]) =>
      visibleRef.current && latestProgressRef.current?.phase === 'checkpoint'
        ? submitNextReviewedBatch(input)
        : Promise.resolve({
            status: 'blocked' as const,
            reason: 'The funding session changed before signing.',
          }),
    [submitNextReviewedBatch],
  );

  /**
   * Carry the flow from this checkpoint to the next batch. The automatic pass
   * re-reviews once. If live quote bytes changed, it freezes and renders that
   * fresh review so a person can explicitly confirm the exact visible batch.
   */
  const advanceToNextBatch = useCallback(async () => {
    if (!nextEntry || checkpointPending) return;

    await runCheckpointAction(
      () =>
        advanceCheckpoint({
          reviewNext: () => review.reviewBatch(nextIndex),
          queued: nextEntry,
          now: () => Date.now(),
          captureHlpBaseline,
          submitNext: submitVisibleCheckpoint,
        }),
      (outcome) => {
        if (outcome.status !== 'rejected') {
          updateReviewedQueueEntry({
            index: nextIndex,
            plan: outcome.fresh.plan,
            review: outcome.fresh.review,
          });
        }
        setCheckpointNeedsConfirmation(outcome.status === 'review-changed');
        setCheckpointError(outcome.reason);
      },
    );
  }, [
    captureHlpBaseline,
    checkpointPending,
    nextEntry,
    nextIndex,
    review,
    runCheckpointAction,
    submitVisibleCheckpoint,
    updateReviewedQueueEntry,
  ]);

  /** Submit the fresh review already rendered above without generating a third quote. */
  const confirmUpdatedNextBatch = useCallback(async () => {
    if (!nextEntry || checkpointPending) return;

    await runCheckpointAction(
      () =>
        confirmCheckpointReview({
          reviewed: nextEntry,
          now: () => Date.now(),
          captureHlpBaseline,
          submitNext: submitVisibleCheckpoint,
        }),
      (outcome) => setCheckpointError(outcome.reason),
    );
  }, [
    captureHlpBaseline,
    checkpointPending,
    nextEntry,
    runCheckpointAction,
    submitVisibleCheckpoint,
  ]);

  // One automatic re-review per checkpoint; only an explicit Retry requests another.
  useCheckpointAutoAdvance(
    visible &&
      reviewedProgress?.phase === 'checkpoint' &&
      nextEntry &&
      checkpointError === null
      ? `${reviewedProgress.callsId}:${nextIndex}`
      : null,
    () => void advanceToNextBatch(),
  );

  const resetHlpRef = useRef(resetHlp);
  useEffect(() => {
    resetHlpRef.current = resetHlp;
  }, [resetHlp]);
  useEffect(
    () => () => {
      latestProgressRef.current = null;
      resetHlpRef.current();
    },
    [],
  );

  const lastBatchIndex = reviewedQueue.length - 1;
  const hlpDone = wizard.stage === 'done';
  // A HyperCore leg runs after the last EVM batch lands, so collapsing this to
  // `allBatchesComplete` would declare the route finished before the vault
  // deposit had been attempted at all.
  const hasHlpLeg = hlpIndex >= 0 || hyperCoreDraft !== null;
  const routeComplete = allBatchesComplete && (hasHlpLeg ? hlpDone : true);
  const rows = hasHlpLeg ? hlpProgressRows(hlpModel) : [];
  const accountUrl =
    wizard.hlp.status === 'submittedUnverified'
      ? hyperliquidAccountUrl(wizard.hlp, account.address)
      : null;
  const visibleError =
    (hlpBatchComplete ? unsafeResumeReason(hlpModel) : null) ??
    (hyperCoreDraft && legPlan.isError
      ? 'The Hyperliquid deposit could not be prepared. Retry in a moment.'
      : null) ??
    flowError ??
    wizard.error?.message ??
    agent.error;
  const retryMode = hlpRetryMode(hlpModel);

  const retryTracking = () => {
    resumedKeyRef.current = currentResumeKey;
    autoDepositAttemptedRef.current = false;
    runGuarded(trackHlpDeposit);
  };
  const approveAgent = () => {
    autoDepositAttemptedRef.current = false;
    runGuarded(() => agent.approve());
  };
  return {
    account,
    invest,
    reviewedSubmission,
    reviewedProgress,
    reviewedQueue,
    resetReviewedExecution,
    resetHlp,
    batches,
    currentIndex,
    nextEntry,
    nextBatch,
    hlpSourceChainKey,
    wizard,
    agent,
    checkpointPending,
    checkpointError,
    checkpointNeedsConfirmation,
    advanceToNextBatch,
    confirmUpdatedNextBatch,
    lastBatchIndex,
    routeComplete,
    rows,
    accountUrl,
    visibleError,
    retryMode,
    retryHlp,
    runGuarded,
    runHlpDeposit,
    retryTracking,
    approveAgent,
    hlpModel,
  };
}
