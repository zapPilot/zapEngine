import { useWalletProvider } from '@zapengine/app-core/providers/walletContext';
import { Redirect, useRouter } from 'expo-router';
import { Check, Circle, LoaderCircle, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import type { DepositReviewGroup } from '@zapengine/types/api';

import { StepHeader } from '@/components/invest/StepHeader';
import { WizardDoneCard } from '@/components/invest/WizardDoneCard';
import { SimulationReviewBody } from '@/components/invest/simulation/SimulationReviewBody';
import { InlineErrorCard } from '@/components/ui/InlineErrorCard';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { ScreenScrollView } from '@/components/ui/ScreenScrollView';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import { useInvest, useInvestDepositReview } from '@/integration/useInvest';
import {
  type InvestExecutionWizardStep,
  useInvestExecution,
} from '@/integration/useInvestExecution';
import { resolveRouteProtocols } from '@/integration/simulationPreviewModel';
import { formatUsd } from '@/lib/format';

function StepIcon({ step }: { step: InvestExecutionWizardStep }) {
  if (step.status === 'confirmed') {
    return <Check size={14} color="#0a0a0a" strokeWidth={2.5} />;
  }
  if (step.status === 'submitting' || step.status === 'confirming') {
    return <LoaderCircle size={14} color="#d4c5a3" />;
  }
  if (step.status === 'failed') {
    return <X size={14} color="#ef7474" strokeWidth={2.5} />;
  }
  return (
    <Circle
      size={8}
      color={step.status === 'ready' ? '#d4c5a3' : '#52525b'}
      fill={step.status === 'ready' ? '#d4c5a3' : 'transparent'}
    />
  );
}

function StepRow({
  step,
  isLast,
}: {
  step: InvestExecutionWizardStep;
  isLast: boolean;
}) {
  const confirmed = step.status === 'confirmed';
  const active = step.status !== 'locked';
  return (
    <View className="flex-row gap-3">
      <View className="items-center">
        <View
          className="h-8 w-8 items-center justify-center rounded-full border"
          style={{
            borderColor: confirmed
              ? '#d4c5a3'
              : active
                ? 'rgba(212,197,163,.45)'
                : 'rgba(255,255,255,.08)',
            backgroundColor: confirmed
              ? '#d4c5a3'
              : active
                ? 'rgba(212,197,163,.09)'
                : 'rgba(255,255,255,.02)',
          }}
        >
          <StepIcon step={step} />
        </View>
        {!isLast ? (
          <View
            className="min-h-7 flex-1 w-px"
            style={{
              backgroundColor: confirmed
                ? 'rgba(212,197,163,.45)'
                : 'rgba(255,255,255,.07)',
            }}
          />
        ) : null}
      </View>
      <View className="flex-1 pb-5 pt-1">
        <Text
          className="font-sans-semibold text-[13.5px]"
          style={{ color: active ? '#f4f4f5' : '#71717a' }}
        >
          {step.label}
        </Text>
        <Text className="mt-1 text-[11px] leading-[16px] text-ink-dim">
          {step.detail}
        </Text>
        {step.transactionHash ? (
          <Text className="mt-1 font-mono text-[9px] text-accent">
            {step.transactionHash.slice(0, 10)}… submitted
          </Text>
        ) : null}
        {'callsId' in step && step.callsId ? (
          <Text className="mt-1 font-mono text-[9px] text-accent">
            Batch {step.callsId.slice(0, 10)}… submitted
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function ctaLabel(
  step: InvestExecutionWizardStep | undefined,
  pending: boolean,
) {
  if (pending) {
    return step?.status === 'confirming'
      ? 'Waiting for confirmation…'
      : 'Working…';
  }
  if (!step) return 'Continue';
  if (step.kind === 'switch-chain') return step.label;
  if (step.kind === 'mock-bridge') return 'Confirm mock checkpoint';
  if (step.kind === 'batch') return 'Execute wallet batch';
  if (step.kind === 'settlement') return 'Verify protocol position';
  if (step.kind === 'prepare') return 'Prepare plan';
  if (step.status === 'confirming') return 'Retry confirmation check';
  return step.label;
}

function reviewIsBlocked(
  review: DepositReviewGroup | undefined,
  nowMs = Date.now(),
) {
  return Boolean(
    review &&
    (review.blocked ||
      !review.executionAllowed ||
      review.expiresAt <= nowMs ||
      review.status === 'failed'),
  );
}

export function InvestProgressScreen() {
  const router = useRouter();
  const wallet = useWalletProvider();
  const { amountUsd, scope } = useInvest();
  const review = useInvestDepositReview();
  const {
    wizard,
    pending,
    mode,
    startFromDraft,
    advance,
    retry,
    reset,
    reviewedSubmission,
    reviewedProgress,
    reviewedQueue,
    updateReviewedQueueEntry,
    submitNextReviewedBatch,
  } = useInvestExecution();
  const [checkpointPending, setCheckpointPending] = useState(false);
  const [checkpointError, setCheckpointError] = useState<string | null>(null);
  const [checkpointNow, setCheckpointNow] = useState(() => Date.now());

  useEffect(() => {
    if (reviewedProgress?.phase !== 'checkpoint') return;
    const timer = setInterval(() => setCheckpointNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [reviewedProgress?.phase]);

  if (
    wizard.status === 'idle' &&
    !pending &&
    !wizard.error &&
    !reviewedSubmission
  ) {
    return <Redirect href="/invest/amount" />;
  }

  const currentStep = wizard.steps[wizard.currentIndex];
  const isDone = wizard.status === 'done';
  const planUnavailable = wizard.steps.length === 0 && wizard.status !== 'idle';
  const shouldStartPlan = planUnavailable || currentStep?.kind === 'prepare';
  const shouldRetryPlan = shouldStartPlan && Boolean(wizard.error);
  const needsWalletRecovery = wizard.recovery === 'wallet-delegation';
  const reviewedOnly = Boolean(reviewedSubmission && wizard.status === 'idle');
  const reviewedComplete = reviewedProgress?.phase === 'complete';
  const reviewedCheckpoint = reviewedProgress?.phase === 'checkpoint';
  const reviewedFailed = reviewedProgress?.phase === 'failed';
  const reviewedMultiple = (reviewedProgress?.groupCount ?? 1) > 1;
  const reviewedCanExit =
    reviewedOnly &&
    (reviewedProgress?.phase === 'submitted' ||
      reviewedProgress?.phase === 'complete');
  const nextQueuedReview =
    reviewedProgress && reviewedQueue[reviewedProgress.groupIndex + 1];
  const nextReviewIndex = reviewedProgress
    ? reviewedProgress.groupIndex + 1
    : -1;
  const nextReviewBlocked = reviewIsBlocked(
    nextQueuedReview?.review,
    checkpointNow,
  );

  const refreshNextQueuedReview = async () => {
    const fresh = await review.refresh();
    return {
      fresh,
      freshGroup: fresh?.reviews[nextQueuedReview?.review.groupId ?? ''],
    };
  };
  const updateCheckpointQueue = (
    plan: NonNullable<typeof review.plan>,
    freshGroup: DepositReviewGroup,
  ) => {
    updateReviewedQueueEntry({
      index: nextReviewIndex,
      plan,
      review: freshGroup,
    });
  };

  const runCheckpointAction = async (action: () => Promise<void>) => {
    setCheckpointPending(true);
    setCheckpointError(null);
    try {
      await action();
    } catch (error: unknown) {
      setCheckpointError(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setCheckpointPending(false);
    }
  };

  const confirmNextReviewedBatch = async () => {
    if (!nextQueuedReview || checkpointPending) return;
    await runCheckpointAction(async () => {
      const { fresh, freshGroup } = await refreshNextQueuedReview();
      const queuedGroup = nextQueuedReview.review;
      const drifted =
        !fresh ||
        !freshGroup ||
        freshGroup.groupFingerprint !== queuedGroup.groupFingerprint ||
        freshGroup.expectedSimulationFingerprint !==
          queuedGroup.expectedSimulationFingerprint ||
        freshGroup.expectedRiskHash !== queuedGroup.expectedRiskHash ||
        freshGroup.batchFingerprint !== queuedGroup.batchFingerprint;
      if (drifted) {
        setCheckpointError(
          'The Arbitrum review changed. Review the updated evidence and confirm again.',
        );
        if (fresh && freshGroup && fresh.plan && nextReviewIndex >= 0) {
          updateCheckpointQueue(fresh.plan, freshGroup);
        }
        return;
      }
      if (!freshGroup || !fresh.plan) {
        throw new Error('The Arbitrum review is unavailable.');
      }
      if (reviewIsBlocked(freshGroup)) {
        updateCheckpointQueue(fresh.plan, freshGroup);
        setCheckpointError(
          'The Arbitrum review is blocked or expired. Refresh it before signing.',
        );
        return;
      }
      const result = await submitNextReviewedBatch({
        plan: fresh.plan,
        review: freshGroup,
        ...(freshGroup.requiresRiskAcknowledgement
          ? { acknowledgedRiskHash: freshGroup.expectedRiskHash }
          : {}),
      });
      if (result.status !== 'submitted') {
        setCheckpointError(result.reason);
      }
    });
  };

  const refreshCheckpointReview = async () => {
    if (!nextQueuedReview || checkpointPending) return;
    await runCheckpointAction(async () => {
      const { fresh, freshGroup } = await refreshNextQueuedReview();
      if (!fresh || !freshGroup || !fresh.plan) {
        throw new Error('The Arbitrum review is unavailable.');
      }
      updateCheckpointQueue(fresh.plan, freshGroup);
      if (reviewIsBlocked(freshGroup)) {
        setCheckpointError(
          'Tenderly could not clear this review yet. Try refreshing again later.',
        );
      }
    });
  };

  return (
    <ScreenScrollView>
      <StepHeader
        title={
          reviewedOnly
            ? reviewedComplete
              ? 'Complete'
              : 'Reviewed execution'
            : isDone
              ? 'Complete'
              : 'Guided execution'
        }
        step={
          reviewedOnly
            ? reviewedComplete
              ? 'Done'
              : reviewedCheckpoint
                ? 'Checkpoint'
                : reviewedFailed
                  ? 'Needs attention'
                  : 'Submitted'
            : isDone
              ? 'Done'
              : wizard.steps.length > 0
                ? `${wizard.currentIndex + 1} / ${wizard.steps.length}`
                : 'Preparing'
        }
      />
      <View className="px-5 pt-6">
        <Text className="font-serif text-[28px] leading-[32px] text-ink">
          {isDone ? 'Investment complete' : 'One action at a time'}
        </Text>
        <Text className="mt-2 text-[12px] leading-[18px] text-ink-dim">
          {reviewedOnly
            ? reviewedCheckpoint
              ? 'The Base batch was accepted. Review and confirm the Arbitrum batch below; no batch will be submitted twice.'
              : reviewedFailed
                ? 'The reviewed batch status reported a failure. Do not retry the wallet batch; return to the route to create a fresh review.'
                : reviewedComplete
                  ? reviewedMultiple
                    ? 'Both reviewed batches were accepted. Position settlement is not marked complete here; no batch will be submitted twice.'
                    : 'The reviewed batch was accepted. Position settlement is not marked complete here; no batch will be submitted twice.'
                  : 'Your reviewed wallet batch was accepted. No batch will be submitted twice.'
            : mode === 'strategy'
              ? 'Each successful wallet action unlocks the next. Confirmed transactions are never submitted again on retry.'
              : 'Submit one wallet batch, then verify that the protocol position increased. A submitted batch is never sent again on retry.'}
        </Text>

        {reviewedSubmission ? (
          <View className="mt-5 rounded-[18px] border border-line bg-[rgba(255,255,255,.02)] px-4 py-4">
            <Text className="font-sans-semibold text-[13.5px] text-ink">
              {reviewedComplete
                ? reviewedMultiple
                  ? 'Reviewed batches accepted'
                  : 'Reviewed batch accepted'
                : 'Batch accepted'}{' '}
              · {reviewedSubmission.groupId}
            </Text>
            <Text className="mt-1 text-[11px] leading-[16px] text-ink-dim">
              Calls {reviewedSubmission.callsId.slice(0, 14)}… submitted on{' '}
              {reviewedSubmission.chainId === 8453 ? 'Base' : 'Arbitrum'}.
            </Text>
            {reviewedCheckpoint ? (
              <>
                {nextQueuedReview ? (
                  <View className="mt-4">
                    <SimulationReviewBody
                      review={nextQueuedReview.review}
                      protocols={resolveRouteProtocols(
                        nextQueuedReview.plan,
                        nextQueuedReview.review.groupId,
                      )}
                    />
                  </View>
                ) : null}
                {checkpointError ? (
                  <Text
                    accessibilityRole="alert"
                    className="mt-2 text-[10.5px] leading-4 text-error"
                  >
                    {checkpointError}
                  </Text>
                ) : null}
                <PrimaryButton
                  className="mt-4"
                  disabled={pending || checkpointPending || nextReviewBlocked}
                  onPress={() => void confirmNextReviewedBatch()}
                >
                  {checkpointPending ? 'Confirming…' : 'Confirm Arbitrum batch'}
                </PrimaryButton>
                {nextReviewBlocked ? (
                  <PrimaryButton
                    className="mt-3"
                    variant="secondary"
                    disabled={pending || checkpointPending}
                    onPress={() => void refreshCheckpointReview()}
                  >
                    Refresh review
                  </PrimaryButton>
                ) : null}
              </>
            ) : (
              <>
                <Text
                  accessibilityRole={reviewedFailed ? 'alert' : undefined}
                  className="mt-3 text-[10.5px] leading-4 text-ink-faint"
                >
                  {reviewedFailed
                    ? (reviewedProgress?.statusNote ??
                      'The reviewed batch failed.')
                    : (reviewedProgress?.statusNote ??
                      (reviewedComplete
                        ? 'All required wallet batches were accepted. Position settlement remains pending.'
                        : 'Batch status is unavailable; it was not resubmitted.'))}
                </Text>
                {reviewedFailed ? (
                  <PrimaryButton
                    className="mt-4"
                    variant="secondary"
                    onPress={() => {
                      reset();
                      router.replace('/invest/route');
                    }}
                  >
                    Create fresh review
                  </PrimaryButton>
                ) : reviewedCanExit ? (
                  <PrimaryButton
                    className="mt-4"
                    variant="secondary"
                    onPress={() => {
                      reset();
                      router.replace('/home');
                    }}
                  >
                    Done
                  </PrimaryButton>
                ) : null}
              </>
            )}
          </View>
        ) : null}

        {wizard.error ? (
          <View className="mt-5">
            <InlineErrorCard
              title={
                needsWalletRecovery
                  ? 'Wallet recovery needed'
                  : 'Something went wrong'
              }
              body={wizard.error}
              action={
                needsWalletRecovery
                  ? {
                      label: 'Try with current wallet',
                      variant: 'primary',
                      onPress: () => {
                        retry();
                        void advance().catch(() => undefined);
                      },
                    }
                  : shouldStartPlan
                    ? {
                        label: 'Retry plan',
                        onPress: () => {
                          retry();
                          void startFromDraft().catch(() => undefined);
                        },
                      }
                    : { label: 'Dismiss', onPress: retry }
              }
              {...(needsWalletRecovery
                ? {
                    secondaryAction: {
                      label: 'Switch wallet',
                      onPress: () => {
                        void (async () => {
                          await wallet.disconnect();
                          reset();
                          await wallet.connect();
                        })().catch(() => undefined);
                      },
                    },
                  }
                : {})}
            />
          </View>
        ) : null}

        {wizard.steps.length === 0 && !wizard.error && !reviewedOnly ? (
          <View className="mt-5 gap-3">
            <SkeletonBlock className="h-[52px] rounded-2xl" />
            <SkeletonBlock className="h-[52px] rounded-2xl" />
          </View>
        ) : null}

        {wizard.steps.length > 0 ? (
          <View className="mt-5 rounded-[18px] border border-line bg-[rgba(255,255,255,.02)] px-4 pt-4">
            {wizard.steps.map((step, index) => (
              <StepRow
                key={step.id}
                step={step}
                isLast={index === wizard.steps.length - 1}
              />
            ))}
          </View>
        ) : null}

        {scope === 'both' && currentStep?.kind === 'mock-bridge' && !isDone ? (
          <View className="mt-4 rounded-xl border border-[rgba(234,179,8,.2)] bg-[rgba(234,179,8,.06)] p-3">
            <Text className="font-sans-semibold text-[12px] text-[#d7bd70]">
              This is a UI checkpoint only
            </Text>
            <Text className="mt-1 text-[11px] leading-[17px] text-[#aa9760]">
              No bridge API is called and no transaction hash is created.
              Arbitrum balance preflight happens at the next step.
            </Text>
          </View>
        ) : null}

        {!isDone && !needsWalletRecovery && !reviewedOnly ? (
          <PrimaryButton
            className="mt-5"
            disabled={pending || (!currentStep && !shouldStartPlan)}
            onPress={() => {
              if (shouldStartPlan) {
                if (wizard.error) retry();
                void startFromDraft().catch(() => undefined);
                return;
              }
              if (wizard.error) retry();
              void advance().catch(() => undefined);
            }}
          >
            {shouldRetryPlan ? 'Retry plan' : ctaLabel(currentStep, pending)}
          </PrimaryButton>
        ) : null}

        {/* jscpd:ignore-start -- current and legacy execution screens intentionally share the completion card contract */}
        {isDone ? (
          <WizardDoneCard
            amountLabel={formatUsd(amountUsd)}
            statusLabel={
              scope === 'base'
                ? 'Morpho supplied'
                : scope === 'arbitrum'
                  ? 'GMX settled'
                  : 'Morpho supplied · GMX settled'
            }
            onDone={() => {
              reset();
              router.replace('/home');
            }}
          />
        ) : null}
        {/* jscpd:ignore-end */}
      </View>
    </ScreenScrollView>
  );
}
