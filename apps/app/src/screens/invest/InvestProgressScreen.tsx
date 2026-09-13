import { useDepositWizard } from '@zapengine/app-core/hooks/useDepositWizard';
import { extractErrorMessage } from '@zapengine/app-core/lib/errors';
import { hlpStepFromPlan } from '@zapengine/app-core/lib/wallet/depositWizardMachine';
import { getHyperCoreSpendableUsdc } from '@zapengine/app-core/services';
import type { DepositPlan, ReviewedDepositPlan } from '@zapengine/types/api';
import { Redirect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { formatUnits, type Address, type Hash } from 'viem';

import { ProgressTimelineRow } from '@/components/invest/ProgressTimelineRow';
import { StageReviewCard } from '@/components/invest/StageReviewCard';
import { StepHeader } from '@/components/invest/StepHeader';
import { WizardDoneCard } from '@/components/invest/WizardDoneCard';
import { InlineErrorCard } from '@/components/ui/InlineErrorCard';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { ScreenScrollView } from '@/components/ui/ScreenScrollView';
import { Tap } from '@/components/ui/Tap';
import { useHyperliquidAgent } from '@/hooks/useHyperliquidAgent';
import { useNowTicker } from '@/hooks/useNowTicker';
import {
  hlpProgressRows,
  hlpRetryMode,
  resumeKey,
  shouldAutoRunHlpDeposit,
  shouldOfferAgentEnable,
  unsafeResumeReason,
} from '@/integration/hlpProgressModel';
import {
  hlpStageProgressInput,
  investDoneStatusLabel,
  queueTone,
  reviewGroupBlocked,
  riskAcknowledgement,
  sameReviewFingerprints,
} from '@/integration/investReviewModel';
import { hyperliquidAccountUrl } from '@/integration/investExecutionModel';
import { stageLabel } from '@/integration/investTargetsModel';
import { isStrategyDepositPlan } from '@/integration/simulationPreviewModel';
import { useAccount } from '@/integration/useAccount';
import { useInvest } from '@/integration/useInvest';
import { useInvestExecution } from '@/integration/useInvestExecution';
import { useInvestReview } from '@/integration/useInvestReview';
import { formatUsd } from '@/lib/format';

function asDepositPlan(
  plan: ReviewedDepositPlan | undefined,
): DepositPlan | null {
  if (!plan || isStrategyDepositPlan(plan)) return null;
  return plan;
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

  const currentIndex = reviewedProgress?.groupIndex ?? 0;
  const nextIndex = currentIndex + 1;
  const nextEntry = reviewedQueue[nextIndex];
  // The queued entry — not a freshly fetched one — is the exact plan the
  // checkpoint will submit, so it is also what the card must show.
  const nextDraft = invest.stageDrafts[nextIndex];
  const hlpIndex = invest.stageDrafts.findIndex(
    (draft) => draft.positionId === 'hlp',
  );
  const hlpPlan =
    hlpIndex >= 0 ? asDepositPlan(reviewedQueue[hlpIndex]?.plan) : null;
  const hlpStep = hlpPlan ? hlpStepFromPlan(hlpPlan) : null;
  const agent = useHyperliquidAgent(hlpStep?.signing ?? null);
  const {
    wizard,
    resumeReviewedPlan,
    runHlpDeposit,
    retry: retryHlp,
    reset: resetHlp,
  } = useDepositWizard({ hyperliquidAgent: agent });

  const [checkpointPending, setCheckpointPending] = useState(false);
  const [checkpointError, setCheckpointError] = useState<string | null>(null);
  const [flowError, setFlowError] = useState<string | null>(null);
  const resumedKeyRef = useRef<string | null>(null);
  const autoDepositAttemptedRef = useRef(false);

  const checkpointNow = useNowTicker(reviewedProgress?.phase === 'checkpoint');
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
        wizardStage: wizard.stage,
        wizardErrorStage: wizard.error?.stage ?? null,
        hlpStatus: wizard.hlp.status,
        bridgeConfirmed,
        flowError,
        agentReady: agent.isReady,
      }),
    [
      agent.isReady,
      bridgeConfirmed,
      flowError,
      hlpBatchComplete,
      hlpPlan,
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

  const trackHlpDeposit = useCallback(async () => {
    if (!hlpPlan || !sourceTxHash || !invest.hlpBaselineUsd6) return;
    await resumeReviewedPlan({
      plan: hlpPlan,
      baselineUsd6: BigInt(invest.hlpBaselineUsd6),
      sourceTxHash,
    });
  }, [hlpPlan, invest.hlpBaselineUsd6, resumeReviewedPlan, sourceTxHash]);

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

  const confirmNextBatch = async () => {
    if (!nextEntry || checkpointPending) return;
    setCheckpointPending(true);
    setCheckpointError(null);
    try {
      const fresh = await review.reviewStage(nextIndex);
      if (!sameReviewFingerprints(nextEntry.review, fresh.review)) {
        updateReviewedQueueEntry({
          index: nextIndex,
          plan: fresh.plan,
          review: fresh.review,
        });
        setCheckpointError(
          'The next route review changed. Inspect the updated evidence and confirm again.',
        );
        return;
      }
      if (reviewGroupBlocked(fresh.review, Date.now())) {
        updateReviewedQueueEntry({
          index: nextIndex,
          plan: fresh.plan,
          review: fresh.review,
        });
        setCheckpointError(
          'The next batch is blocked or expired. Refresh and retry.',
        );
        return;
      }

      const nextHlpPlan = asDepositPlan(fresh.plan);
      const nextHlpStep = nextHlpPlan ? hlpStepFromPlan(nextHlpPlan) : null;
      const userAddress = account.address as Address | null;
      if (nextHlpStep) {
        if (!userAddress) throw new Error('HLP preflight is unavailable.');
        const baseline = await getHyperCoreSpendableUsdc({
          user: userAddress,
          apiUrl: nextHlpStep.signing.apiUrl,
        });
        invest.setHlpBaselineUsd6(baseline.spendableUsd6.toString());
      }

      const result = await submitNextReviewedBatch({
        plan: fresh.plan,
        review: fresh.review,
        ...riskAcknowledgement(fresh.review),
      });
      if (result.status !== 'submitted') setCheckpointError(result.reason);
    } catch (error: unknown) {
      setCheckpointError(extractErrorMessage(error));
    } finally {
      setCheckpointPending(false);
    }
  };

  const finish = () => {
    resetHlp();
    resetReviewedExecution();
    router.replace('/home');
  };

  if (!reviewedSubmission || !reviewedProgress) {
    return <Redirect href="/invest/amount" />;
  }

  const lastBatchIndex = reviewedQueue.length - 1;
  const allBatchesComplete =
    reviewedProgress.phase === 'complete' && currentIndex === lastBatchIndex;
  const hlpDone = wizard.stage === 'done';
  const routeComplete = allBatchesComplete && (hlpIndex < 0 || hlpDone);
  const rows = hlpProgressRows(hlpModel);
  const accountUrl =
    wizard.hlp.status === 'submittedUnverified'
      ? hyperliquidAccountUrl(wizard.hlp, account.address)
      : null;
  const visibleError =
    (hlpBatchComplete ? unsafeResumeReason(hlpModel) : null) ??
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
          the chain it executes on before you confirm it.
        </Text>

        <View className="mt-5 rounded-[18px] border border-line bg-[rgba(255,255,255,.02)] px-4 pt-4">
          {reviewedQueue.map((entry, index) => {
            const draft = invest.stageDrafts[index];
            return (
              <ProgressTimelineRow
                key={`${entry.review.groupId}-${index}`}
                label={draft ? stageLabel(draft) : `Batch ${index + 1}`}
                detail={`Chain ${entry.review.chainId} · reviewed wallet batch`}
                tone={queueTone({
                  index,
                  currentIndex,
                  phase: reviewedProgress.phase,
                })}
                isLast={index === lastBatchIndex && hlpIndex < 0}
              >
                {index === currentIndex && reviewedProgress.transactionHash ? (
                  <Text className="mt-1 font-mono text-[9px] text-accent">
                    {reviewedProgress.transactionHash.slice(0, 12)}… submitted
                  </Text>
                ) : null}
              </ProgressTimelineRow>
            );
          })}
          {hlpIndex >= 0 ? (
            <>
              <ProgressTimelineRow
                label="Bridge into Hyperliquid"
                detail="Tracks the submitted transfer; the source transaction is never resubmitted."
                tone={rows.bridge}
              />
              <ProgressTimelineRow
                label="HyperCore USDC arrived"
                detail={
                  wizard.hlp.arrivedUsd6 !== null
                    ? `${formatUnits(wizard.hlp.arrivedUsd6, 6)} USDC received for this deposit.`
                    : 'Waiting for the spendable-balance delta above the pre-bridge snapshot.'
                }
                tone={rows.arrival}
              />
              <ProgressTimelineRow
                label="Deposit into official HLP vault"
                detail={
                  wizard.hlp.status === 'confirming'
                    ? 'Hyperliquid vaultTransfer submitted; verifying vault equity.'
                    : 'Signed by your approved Zap Pilot agent once the bridge arrives.'
                }
                tone={rows.vault}
                isLast
              />
            </>
          ) : null}
        </View>

        {reviewedProgress.phase === 'checkpoint' && nextEntry ? (
          <View className="mt-5">
            <Text className="mb-2 font-sans-semibold text-[13px] text-ink">
              Next reviewed batch
            </Text>
            {nextDraft ? (
              <StageReviewCard
                stage={{
                  draft: nextDraft,
                  plan: nextEntry.plan,
                  review: nextEntry.review,
                }}
              />
            ) : null}
            {checkpointError ? (
              <Text
                accessibilityRole="alert"
                className="mt-3 text-[10.5px] leading-4 text-error"
              >
                {checkpointError}
              </Text>
            ) : null}
            <PrimaryButton
              className="mt-4"
              disabled={
                checkpointPending ||
                reviewGroupBlocked(nextEntry.review, checkpointNow)
              }
              onPress={() => void confirmNextBatch()}
            >
              {checkpointPending
                ? 'Refreshing & confirming…'
                : 'Confirm next batch'}
            </PrimaryButton>
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
