import { useDepositWizard } from '@zapengine/app-core/hooks/useDepositWizard';
import { extractErrorMessage } from '@zapengine/app-core/lib/errors';
import { hlpStepFromPlan } from '@zapengine/app-core/lib/wallet/depositWizardMachine';
import { getHyperCoreSpendableUsdc } from '@zapengine/app-core/services';
import type { DepositPlan, ReviewedDepositPlan } from '@zapengine/types/api';
import { Redirect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { formatUnits, type Address, type Hash } from 'viem';

import { ChainBatchReviewCard } from '@/components/invest/ChainBatchReviewCard';
import { ProgressTimelineRow } from '@/components/invest/ProgressTimelineRow';
import { StepHeader } from '@/components/invest/StepHeader';
import { WizardDoneCard } from '@/components/invest/WizardDoneCard';
import { InlineErrorCard } from '@/components/ui/InlineErrorCard';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { ScreenScrollView } from '@/components/ui/ScreenScrollView';
import { Tap } from '@/components/ui/Tap';
import { useCheckpointAutoAdvance } from '@/hooks/useCheckpointAutoAdvance';
import { useHyperliquidAgent } from '@/hooks/useHyperliquidAgent';
import { useNowTicker } from '@/hooks/useNowTicker';
import {
  hlpProgressRows,
  hlpRetryMode,
  resumeKey,
  shouldAutoRunHlpDeposit,
  shouldOfferAgentEnable,
  unsafeResumeReason,
  type HlpRowKey,
} from '@/integration/hlpProgressModel';
import { advanceCheckpoint } from '@/integration/checkpointAdvanceModel';
import {
  hlpStageProgressInput,
  investDoneStatusLabel,
  queueTone,
  reviewGroupBlocked,
} from '@/integration/investReviewModel';
import { hyperliquidAccountUrl } from '@/integration/investExecutionModel';
import {
  chainBatchDrafts,
  chainBatchLabel,
} from '@/integration/investTargetsModel';
import { isStrategyDepositPlan } from '@/integration/simulationPreviewModel';
import { useAccount } from '@/integration/useAccount';
import { useInvest } from '@/integration/useInvest';
import { useInvestExecution } from '@/integration/useInvestExecution';
import { useInvestReview } from '@/integration/useInvestReview';
import { formatUsd } from '@/lib/format';

import { useHyperCoreLegPlan } from './useHyperCoreLegPlan';

function asDepositPlan(
  plan: ReviewedDepositPlan | undefined,
): DepositPlan | null {
  if (!plan || isStrategyDepositPlan(plan)) return null;
  return plan;
}

function hlpRowLabel(key: HlpRowKey): string {
  if (key === 'bridge') return 'Bridge into Hyperliquid';
  if (key === 'arrival') return 'HyperCore USDC arrived';
  return 'Deposit into official HLP vault';
}

function hlpRowDetail(
  key: HlpRowKey,
  hlp: ReturnType<typeof useDepositWizard>['wizard']['hlp'],
): string {
  if (key === 'bridge') {
    return 'Tracks the submitted transfer; the source transaction is never resubmitted.';
  }
  if (key === 'arrival') {
    return hlp.arrivedUsd6 !== null
      ? `${formatUnits(hlp.arrivedUsd6, 6)} USDC received for this deposit.`
      : 'Waiting for the spendable-balance delta above the pre-bridge snapshot.';
  }
  if (hlp.status === 'confirming') {
    return 'Hyperliquid vaultTransfer submitted; verifying vault equity.';
  }
  return 'Signed by your approved Zap Pilot agent.';
}

export function InvestProgressScreen() {
  const router = useRouter();
  const account = useAccount();
  const invest = useInvest();
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
  const [flowError, setFlowError] = useState<string | null>(null);
  const resumedKeyRef = useRef<string | null>(null);
  const autoDepositAttemptedRef = useRef(false);
  // Read after every await so a checkpoint that moved on while this screen was
  // waiting cannot have stale evidence or a stale error written over it.
  const latestProgressRef = useRef(reviewedProgress);
  useEffect(() => {
    latestProgressRef.current = reviewedProgress;
  }, [reviewedProgress]);

  const checkpointNow = useNowTicker(reviewedProgress?.phase === 'checkpoint');
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

  /**
   * Carry the flow from this checkpoint to the next batch. Runs on its own once
   * the checkpoint is reached and again only when a person presses Retry: every
   * non-submitted outcome is something they have to look at.
   */
  const advanceToNextBatch = useCallback(async () => {
    if (!nextEntry || checkpointPending) return;
    const startedCallsId = latestProgressRef.current?.callsId ?? null;
    const stillAtThisCheckpoint = () => {
      const progress = latestProgressRef.current;
      return (
        progress !== null &&
        progress.callsId === startedCallsId &&
        progress.phase === 'checkpoint'
      );
    };

    setCheckpointPending(true);
    setCheckpointError(null);
    try {
      const outcome = await advanceCheckpoint({
        reviewNext: () => review.reviewBatch(nextIndex),
        queued: nextEntry,
        now: () => Date.now(),
        captureHlpBaseline: async (step) => {
          const userAddress = account.address as Address | null;
          if (!userAddress) throw new Error('HLP preflight is unavailable.');
          const baseline = await getHyperCoreSpendableUsdc({
            user: userAddress,
            apiUrl: step.signing.apiUrl,
          });
          invest.setHlpBaselineUsd6(baseline.spendableUsd6.toString());
        },
        submitNext: submitNextReviewedBatch,
      });
      if (outcome.status === 'submitted' || !stillAtThisCheckpoint()) return;
      if (outcome.status !== 'rejected') {
        updateReviewedQueueEntry({
          index: nextIndex,
          plan: outcome.fresh.plan,
          review: outcome.fresh.review,
        });
      }
      setCheckpointError(outcome.reason);
    } catch (error: unknown) {
      if (stillAtThisCheckpoint()) {
        setCheckpointError(extractErrorMessage(error));
      }
    } finally {
      setCheckpointPending(false);
    }
  }, [
    account.address,
    checkpointPending,
    invest,
    nextEntry,
    nextIndex,
    review,
    submitNextReviewedBatch,
    updateReviewedQueueEntry,
  ]);

  // One automatic attempt per checkpoint; a Retry press is the only replay.
  useCheckpointAutoAdvance(
    reviewedProgress?.phase === 'checkpoint' &&
      nextEntry &&
      checkpointError === null
      ? `${reviewedProgress.callsId}:${nextIndex}`
      : null,
    () => void advanceToNextBatch(),
  );

  const finish = () => {
    resetHlp();
    resetReviewedExecution();
    router.replace('/home');
  };

  if (!reviewedSubmission || !reviewedProgress) {
    return <Redirect href="/invest/amount" />;
  }

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

  if (routeComplete) {
    return (
      <ScreenScrollView>
        <StepHeader title="Invest" step="Done" />
        <View className="px-5 pt-6">
          <Text className="font-serif text-[28px] leading-[32px] text-ink">
            Investment complete
          </Text>
          <Text className="mt-2 text-[12px] leading-[18px] text-ink-dim">
            Every reviewed wallet batch was submitted once. No batch was sent
            twice, and the HLP vault action was signed by your approved
            Hyperliquid agent.
          </Text>
          {accountUrl ? (
            <Tap
              accessibilityRole="link"
              className="mt-4 self-start"
              onPress={() => void Linking.openURL(accountUrl)}
            >
              <Text className="text-[12px] text-accent underline">
                View your Hyperliquid account
              </Text>
            </Tap>
          ) : null}
          <WizardDoneCard
            amountLabel={formatUsd(invest.amountUsd)}
            statusLabel={investDoneStatusLabel({
              drafts: invest.stageDrafts,
              hasHyperCoreLeg: hyperCoreDraft !== null,
              hlpDeposited: wizard.hlp.status === 'deposited',
            })}
            onDone={finish}
          />
        </View>
      </ScreenScrollView>
    );
  }

  return (
    <ScreenScrollView>
      <StepHeader
        title="Invest"
        step={
          reviewedProgress.phase === 'failed'
            ? 'Needs attention'
            : reviewedProgress.phase === 'checkpoint'
              ? 'Checkpoint'
              : 'In progress'
        }
      />
      <View className="px-5 pt-6">
        <Text className="font-serif text-[28px] leading-[32px] text-ink">
          One checkpoint at a time
        </Text>
        <Text className="mt-2 text-[12px] leading-[18px] text-ink-dim">
          Confirmed batches stay locked. Each later batch is re-reviewed against
          the chain it executes on and only continues when that evidence still
          matches what you approved.
        </Text>

        <View className="mt-5 rounded-[18px] border border-line bg-[rgba(255,255,255,.02)] px-4 pt-4">
          {reviewedQueue.map((entry, index) => {
            const batch = batches[index];
            return (
              <ProgressTimelineRow
                key={`${entry.review.groupId}-${index}`}
                label={batch ? chainBatchLabel(batch) : `Batch ${index + 1}`}
                detail={`Chain ${entry.review.chainId} · reviewed wallet batch`}
                tone={queueTone({
                  index,
                  currentIndex,
                  phase: reviewedProgress.phase,
                })}
                isLast={index === lastBatchIndex && rows.length === 0}
              >
                {index === currentIndex && reviewedProgress.transactionHash ? (
                  <Text className="mt-1 font-mono text-[9px] text-accent">
                    {reviewedProgress.transactionHash.slice(0, 12)}… submitted
                  </Text>
                ) : null}
              </ProgressTimelineRow>
            );
          })}
          {rows.map((row, index) => (
            <ProgressTimelineRow
              key={row.key}
              label={hlpRowLabel(row.key)}
              detail={hlpRowDetail(row.key, wizard.hlp)}
              tone={row.state}
              isLast={index === rows.length - 1}
            />
          ))}
        </View>

        {reviewedProgress.phase === 'checkpoint' && nextEntry ? (
          <View className="mt-5">
            <Text className="mb-2 font-sans-semibold text-[13px] text-ink">
              Next reviewed batch
            </Text>
            {nextBatch ? (
              <ChainBatchReviewCard
                batch={{
                  draft: nextBatch,
                  plan: nextEntry.plan,
                  review: nextEntry.review,
                }}
              />
            ) : null}
            {checkpointError ? (
              <>
                <Text
                  accessibilityRole="alert"
                  className="mt-3 text-[10.5px] leading-4 text-error"
                >
                  {checkpointError}
                </Text>
                <PrimaryButton
                  className="mt-4"
                  disabled={
                    checkpointPending ||
                    reviewGroupBlocked(nextEntry.review, checkpointNow)
                  }
                  onPress={() => void advanceToNextBatch()}
                >
                  Retry next batch
                </PrimaryButton>
              </>
            ) : (
              <Text className="mt-3 text-[10.5px] leading-4 text-ink-dim">
                {checkpointPending
                  ? 'Sending the next batch to your wallet…'
                  : 'Re-reviewing the next batch against its chain…'}
              </Text>
            )}
          </View>
        ) : null}

        {reviewedProgress.phase === 'failed' ? (
          <View className="mt-5">
            <InlineErrorCard
              title="Reviewed batch needs attention"
              body={
                reviewedProgress.statusNote ??
                'The wallet reported a failed reviewed batch. It will not be resubmitted automatically.'
              }
              action={{
                label: 'Create fresh review',
                onPress: () => {
                  resetReviewedExecution();
                  router.replace('/invest/route');
                },
              }}
            />
          </View>
        ) : null}

        {visibleError ? (
          <View className="mt-5">
            <InlineErrorCard
              title="HLP settlement needs attention"
              body={visibleError}
              action={
                retryMode === 'hlp-signature' && agent.isReady
                  ? {
                      label: 'Retry HLP deposit',
                      onPress: () => {
                        retryHlp();
                        runGuarded(runHlpDeposit);
                      },
                    }
                  : retryMode === 'tracking'
                    ? {
                        label: 'Retry tracking',
                        onPress: () => {
                          resumedKeyRef.current = currentResumeKey;
                          autoDepositAttemptedRef.current = false;
                          runGuarded(trackHlpDeposit);
                        },
                      }
                    : {
                        label: 'Return home',
                        onPress: () => router.replace('/home'),
                      }
              }
            />
          </View>
        ) : null}

        {shouldOfferAgentEnable(hlpModel) ? (
          <PrimaryButton
            className="mt-5"
            disabled={
              agent.status === 'checking' || agent.status === 'approving'
            }
            onPress={() => {
              autoDepositAttemptedRef.current = false;
              runGuarded(() => agent.approve());
            }}
          >
            {agent.status === 'approving'
              ? 'Confirm in your wallet…'
              : 'Enable Hyperliquid signing and deposit'}
          </PrimaryButton>
        ) : null}

        {wizard.hlp.status === 'confirming' ? (
          <PrimaryButton className="mt-5" disabled onPress={() => undefined}>
            Verifying HLP position…
          </PrimaryButton>
        ) : null}
      </View>
    </ScreenScrollView>
  );
}
