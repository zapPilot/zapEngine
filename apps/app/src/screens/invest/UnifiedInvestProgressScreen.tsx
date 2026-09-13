import { useDepositWizard } from '@zapengine/app-core/hooks/useDepositWizard';
import { hlpStepFromPlan } from '@zapengine/app-core/lib/wallet/depositWizardMachine';
import {
  getDepositReview,
  getHyperCoreSpendableUsdc,
  waitForBridgeCompletion,
} from '@zapengine/app-core/services';
import {
  SUPPORTED_DEPOSIT_CHAINS,
  type DepositPlan,
  type DepositReviewGroup,
  type ReviewedDepositPlan,
} from '@zapengine/types/api';
import { Redirect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { formatUnits, type Address, type Hash } from 'viem';

import { ProgressTimelineRow } from '@/components/invest/ProgressTimelineRow';
import { SimulationReviewBody } from '@/components/invest/simulation/SimulationReviewBody';
import { StepHeader } from '@/components/invest/StepHeader';
import { WizardDoneCard } from '@/components/invest/WizardDoneCard';
import { InlineErrorCard } from '@/components/ui/InlineErrorCard';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { ScreenScrollView } from '@/components/ui/ScreenScrollView';
import { useHyperliquidAgent } from '@/hooks/useHyperliquidAgent';
import { useAccount } from '@/integration/useAccount';
import { useInvest } from '@/integration/useInvest';
import { useInvestExecution } from '@/integration/useInvestExecution';
import { resolveRouteProtocols } from '@/integration/simulationPreviewModel';
import { buildHlpBridge2Request } from '@/integration/unifiedInvestModel';
import {
  singleUnifiedReview,
  useUnifiedInvestReview,
} from '@/integration/useUnifiedInvestReview';
import { formatUsd } from '@/lib/format';

function reviewBlocked(review: DepositReviewGroup): boolean {
  return (
    review.blocked ||
    !review.executionAllowed ||
    review.status === 'failed' ||
    review.expiresAt <= Date.now()
  );
}

function asDepositPlan(plan: ReviewedDepositPlan | undefined): DepositPlan | null {
  if (!plan || 'executionGroups' in plan) return null;
  return plan as DepositPlan;
}

function asHlpPlan(plan: ReviewedDepositPlan | undefined): DepositPlan | null {
  const deposit = asDepositPlan(plan);
  return deposit && hlpStepFromPlan(deposit) ? deposit : null;
}

function ingressToArbitrum(plan: ReviewedDepositPlan | undefined) {
  const deposit = asDepositPlan(plan);
  if (!deposit) return null;
  const leg = deposit.legs.find(
    (candidate) =>
      candidate.kind === 'bridge' &&
      candidate.chainId === SUPPORTED_DEPOSIT_CHAINS.ARBITRUM &&
      candidate.protocol !== 'hyperliquid',
  );
  return leg ? { plan: deposit, leg } : null;
}

function sameReview(left: DepositReviewGroup, right: DepositReviewGroup): boolean {
  return (
    left.groupFingerprint === right.groupFingerprint &&
    left.batchFingerprint === right.batchFingerprint &&
    left.expectedSimulationFingerprint === right.expectedSimulationFingerprint &&
    left.expectedRiskHash === right.expectedRiskHash
  );
}

function queueTone(params: {
  index: number;
  currentIndex: number;
  phase: string | undefined;
}): 'waiting' | 'active' | 'done' | 'failed' {
  if (params.index < params.currentIndex) return 'done';
  if (params.index > params.currentIndex) return 'waiting';
  if (params.phase === 'failed') return 'failed';
  if (params.phase === 'checkpoint' || params.phase === 'complete') return 'done';
  return 'active';
}

export function UnifiedInvestProgressScreen() {
  const router = useRouter();
  const account = useAccount();
  const invest = useInvest();
  const review = useUnifiedInvestReview();
  const execution = useInvestExecution();
  const {
    reviewedSubmission,
    reviewedProgress,
    reviewedQueue,
    updateReviewedQueueEntry,
    appendReviewedQueueEntry,
    submitNextReviewedBatch,
    reset: resetReviewedExecution,
  } = execution;

  const currentIndex = reviewedProgress?.groupIndex ?? 0;
  const currentEntry = reviewedQueue[currentIndex];
  const nextIndex = currentIndex + 1;
  const nextEntry = reviewedQueue[nextIndex];
  const finalEntry = reviewedQueue[reviewedQueue.length - 1];
  const finalHlpPlan = asHlpPlan(finalEntry?.plan);
  const finalHlpStep = finalHlpPlan ? hlpStepFromPlan(finalHlpPlan) : null;
  const agent = useHyperliquidAgent(finalHlpStep?.signing ?? null);
  const {
    wizard: hlpWizard,
    resumeReviewedPlan,
    runHlpDeposit,
    retry: retryHlp,
    reset: resetHlp,
  } = useDepositWizard({ hyperliquidAgent: agent });

  const [checkpointPending, setCheckpointPending] = useState(false);
  const [checkpointError, setCheckpointError] = useState<string | null>(null);
  const [ingressStatus, setIngressStatus] = useState<
    'idle' | 'waiting' | 'ready' | 'failed'
  >('idle');
  const [ingressError, setIngressError] = useState<string | null>(null);
  const [ingressRetryNonce, setIngressRetryNonce] = useState(0);
  const hlpResumeKey = useRef<string | null>(null);
  const hlpAutoRun = useRef(false);
  const deferredBridge2Key = useRef<string | null>(null);

  const ingress = ingressToArbitrum(currentEntry?.plan);
  const sourceTxHash = reviewedProgress?.transactionHash as Hash | undefined;

  useEffect(() => {
    const phase = reviewedProgress?.phase;
    const shouldTrackIngress =
      Boolean(ingress) &&
      !nextEntry &&
      (phase === 'complete' || phase === 'checkpoint');
    if (!shouldTrackIngress) {
      setIngressStatus('ready');
      setIngressError(null);
      return;
    }
    if (!sourceTxHash || !ingress) {
      setIngressStatus('waiting');
      return;
    }

    const controller = new AbortController();
    setIngressStatus('waiting');
    setIngressError(null);
    void waitForBridgeCompletion({
      txHash: sourceTxHash,
      fromChain: ingress.plan.sourceChainId,
      toChain: SUPPORTED_DEPOSIT_CHAINS.ARBITRUM,
      signal: controller.signal,
    })
      .then(() => {
        if (!controller.signal.aborted) setIngressStatus('ready');
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setIngressStatus('failed');
        setIngressError(error instanceof Error ? error.message : String(error));
      });
    return () => controller.abort();
  }, [
    ingress?.plan.sourceChainId,
    ingressRetryNonce,
    nextEntry,
    reviewedProgress?.callsId,
    reviewedProgress?.phase,
    sourceTxHash,
  ]);

  useEffect(() => {
    if (
      reviewedProgress?.phase !== 'complete' ||
      !ingress ||
      ingressStatus !== 'ready' ||
      nextEntry ||
      !account.address
    ) {
      return;
    }

    const key = `${reviewedProgress.callsId}:${ingress.leg.toAmountMin}`;
    if (deferredBridge2Key.current === key) return;
    deferredBridge2Key.current = key;
    setCheckpointPending(true);
    setCheckpointError(null);

    void getDepositReview(
      buildHlpBridge2Request({
        userAddress: account.address as `0x${string}`,
        amountUsd6: ingress.leg.toAmountMin,
      }),
    )
      .then((response) => {
        const bridge2Review = singleUnifiedReview(response);
        if (!response.plan || !bridge2Review) {
          throw new Error(
            'Bridge2 review did not return one executable Arbitrum batch.',
          );
        }
        appendReviewedQueueEntry({
          plan: response.plan,
          review: bridge2Review,
        });
      })
      .catch((error: unknown) => {
        deferredBridge2Key.current = null;
        setCheckpointError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => setCheckpointPending(false));
  }, [
    account.address,
    appendReviewedQueueEntry,
    ingress,
    ingressStatus,
    nextEntry,
    reviewedProgress?.callsId,
    reviewedProgress?.phase,
  ]);

  const finalBatchComplete =
    reviewedProgress?.phase === 'complete' &&
    currentIndex === reviewedQueue.length - 1;
  const finalBatchHash = reviewedProgress?.transactionHash as Hash | undefined;
  const baselineUsd6 = invest.hlpBaselineUsd6;

  useEffect(() => {
    if (!finalBatchComplete || !finalHlpPlan || !finalBatchHash || !baselineUsd6) {
      return;
    }
    const key = `${reviewedProgress?.callsId ?? ''}:${finalBatchHash}`;
    if (hlpResumeKey.current === key) return;
    hlpResumeKey.current = key;
    hlpAutoRun.current = false;
    void resumeReviewedPlan({
      plan: finalHlpPlan,
      baselineUsd6: BigInt(baselineUsd6),
      sourceTxHash: finalBatchHash,
    });
  }, [
    baselineUsd6,
    finalBatchComplete,
    finalBatchHash,
    finalHlpPlan,
    resumeReviewedPlan,
    reviewedProgress?.callsId,
  ]);

  useEffect(() => {
    if (
      hlpWizard.hlp.status !== 'arrived' ||
      !agent.isReady ||
      hlpAutoRun.current
    ) {
      return;
    }
    hlpAutoRun.current = true;
    void runHlpDeposit().catch(() => {
      hlpAutoRun.current = false;
    });
  }, [agent.isReady, hlpWizard.hlp.status, runHlpDeposit]);

  const refreshNext = useCallback(async () => {
    if (!nextEntry) {
      throw new Error('The next reviewed batch is unavailable.');
    }

    const nextHlpPlan = asHlpPlan(nextEntry.plan);
    const nextHlpStep = nextHlpPlan ? hlpStepFromPlan(nextHlpPlan) : null;
    if (nextHlpStep?.expectedUsd && account.address) {
      const response = await getDepositReview(
        buildHlpBridge2Request({
          userAddress: account.address as `0x${string}`,
          amountUsd6: nextHlpStep.expectedUsd,
        }),
      );
      const freshReview = singleUnifiedReview(response);
      if (!response.plan || !freshReview) {
        throw new Error('The Bridge2 review is unavailable.');
      }
      return { plan: response.plan, review: freshReview };
    }

    const freshStages = await review.refresh();
    const fresh = freshStages[nextIndex];
    if (!fresh) throw new Error('The next reviewed batch is unavailable.');
    return fresh;
  }, [account.address, nextEntry, nextIndex, review]);

  const confirmNext = async () => {
    if (!nextEntry || checkpointPending || ingressStatus !== 'ready') return;
    setCheckpointPending(true);
    setCheckpointError(null);
    try {
      const fresh = await refreshNext();
      if (!sameReview(nextEntry.review, fresh.review)) {
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
      if (reviewBlocked(fresh.review)) {
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

      const hlpPlan = asHlpPlan(fresh.plan);
      if (hlpPlan) {
        const step = hlpStepFromPlan(hlpPlan);
        const user = account.address as Address | null;
        if (!step || !user) throw new Error('HLP preflight is unavailable.');
        const baseline = await getHyperCoreSpendableUsdc({
          user,
          apiUrl: step.signing.apiUrl,
        });
        invest.setHlpBaselineUsd6(baseline.spendableUsd6.toString());
      }

      const result = await submitNextReviewedBatch({
        plan: fresh.plan,
        review: fresh.review,
        ...(fresh.review.requiresRiskAcknowledgement
          ? { acknowledgedRiskHash: fresh.review.expectedRiskHash }
          : {}),
      });
      if (result.status !== 'submitted') setCheckpointError(result.reason);
    } catch (error: unknown) {
      setCheckpointError(error instanceof Error ? error.message : String(error));
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

  const awaitingDeferredBridge2 =
    finalBatchComplete && ingress !== null && finalHlpPlan === null;
  const routeComplete =
    finalBatchComplete && !finalHlpPlan && !awaitingDeferredBridge2;
  const hlpDone = hlpWizard.stage === 'done';
  const hlpNeedsAgent =
    finalBatchComplete &&
    finalHlpPlan !== null &&
    hlpWizard.hlp.status === 'arrived' &&
    !agent.isReady;
  const allDone = routeComplete || hlpDone;

  if (allDone) {
    return (
      <ScreenScrollView>
        <StepHeader title="Invest" step="Done" />
        <View className="px-5 pt-6">
          <Text className="font-serif text-[28px] leading-[32px] text-ink">
            Investment complete
          </Text>
          <Text className="mt-2 text-[12px] leading-[18px] text-ink-dim">
            Every reviewed wallet batch was submitted once. Protocol and HLP
            settlement finished without replaying a confirmed batch.
          </Text>
          <WizardDoneCard
            amountLabel={formatUsd(invest.amountUsd)}
            statusLabel={hlpDone ? 'HLP deposited' : 'Route complete'}
            onDone={finish}
          />
        </View>
      </ScreenScrollView>
    );
  }

  return (
    <ScreenScrollView>
      <StepHeader title="Invest" step="In progress" />
      <View className="px-5 pt-6">
        <Text className="font-serif text-[28px] leading-[32px] text-ink">
          One checkpoint at a time
        </Text>
        <Text className="mt-2 text-[12px] leading-[18px] text-ink-dim">
          Confirmed batches stay locked. Cross-chain HLP funding waits for
          Arbitrum arrival before Bridge2 is reviewed and submitted.
        </Text>

        <View className="mt-5 rounded-[18px] border border-line bg-[rgba(255,255,255,.02)] px-4 pt-4">
          {reviewedQueue.map((entry, index) => (
            <ProgressTimelineRow
              key={`${entry.review.groupId}-${index}`}
              label={`Batch ${index + 1} · ${entry.review.groupId}`}
              detail={`Chain ${entry.review.chainId} · reviewed wallet batch`}
              tone={queueTone({
                index,
                currentIndex,
                phase: reviewedProgress.phase,
              })}
              isLast={
                index === reviewedQueue.length - 1 &&
                !finalHlpPlan &&
                !awaitingDeferredBridge2
              }
            />
          ))}
          {awaitingDeferredBridge2 ? (
            <ProgressTimelineRow
              label="Prepare Arbitrum → Hyperliquid"
              detail={
                ingressStatus === 'ready'
                  ? 'Arbitrum USDC arrived. Creating a fresh Bridge2 review.'
                  : 'Waiting for the source bridge to settle on Arbitrum.'
              }
              tone={ingressStatus === 'failed' ? 'failed' : 'active'}
              isLast
            />
          ) : null}
          {finalHlpPlan ? (
            <>
              <ProgressTimelineRow
                label="HyperCore USDC arrived"
                detail={
                  hlpWizard.hlp.arrivedUsd6 !== null
                    ? `${formatUnits(hlpWizard.hlp.arrivedUsd6, 6)} USDC credited`
                    : 'Waiting for the Bridge2 balance delta.'
                }
                tone={
                  hlpWizard.hlp.status === 'idle' ||
                  hlpWizard.hlp.status === 'awaitingArrival'
                    ? finalBatchComplete
                      ? 'active'
                      : 'waiting'
                    : 'done'
                }
              />
              <ProgressTimelineRow
                label="Deposit into official HLP vault"
                detail="Signed by the approved Hyperliquid agent; no EVM wallet signature."
                tone={
                  hlpWizard.hlp.status === 'deposited' ||
                  hlpWizard.stage === 'done'
                    ? 'done'
                    : hlpWizard.hlp.status === 'arrived' ||
                        hlpWizard.hlp.status === 'confirming'
                      ? 'active'
                      : 'waiting'
                }
                isLast
              />
            </>
          ) : null}
        </View>

        {awaitingDeferredBridge2 && (ingressError || checkpointError) ? (
          <View className="mt-5">
            <InlineErrorCard
              title="HLP route preparation needs attention"
              body={
                ingressError ??
                checkpointError ??
                'The Bridge2 review could not be prepared.'
              }
              action={{
                label: 'Retry route preparation',
                onPress: () => {
                  deferredBridge2Key.current = null;
                  setCheckpointError(null);
                  setIngressError(null);
                  setIngressRetryNonce((current) => current + 1);
                },
              }}
            />
          </View>
        ) : null}

        {reviewedProgress.phase === 'checkpoint' && nextEntry ? (
          <View className="mt-5 rounded-[18px] border border-line bg-[#111113] p-4">
            <Text className="font-sans-semibold text-[13px] text-ink">
              Next reviewed batch
            </Text>
            {ingress ? (
              <Text className="mt-1 text-[10.5px] leading-4 text-ink-dim">
                Arbitrum USDC arrived. Bridge2 can now use the received funds.
              </Text>
            ) : null}
            <View className="mt-4">
              <SimulationReviewBody
                review={nextEntry.review}
                protocols={resolveRouteProtocols(
                  nextEntry.plan,
                  nextEntry.review.groupId,
                )}
              />
            </View>
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
                ingressStatus !== 'ready' ||
                reviewBlocked(nextEntry.review)
              }
              onPress={() => void confirmNext()}
            >
              {checkpointPending ? 'Refreshing & confirming…' : 'Confirm next batch'}
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
                label: 'Return to route',
                onPress: () => {
                  resetReviewedExecution();
                  router.replace('/invest/route');
                },
              }}
            />
          </View>
        ) : null}

        {finalBatchComplete && finalHlpPlan && hlpWizard.error ? (
          <View className="mt-5">
            <InlineErrorCard
              title="HLP settlement needs attention"
              body={hlpWizard.error.message}
              action={{
                label: 'Retry HLP tracking',
                onPress: () => {
                  hlpResumeKey.current = null;
                  retryHlp();
                },
              }}
            />
          </View>
        ) : null}

        {hlpNeedsAgent ? (
          <PrimaryButton
            className="mt-5"
            disabled={
              agent.status === 'checking' || agent.status === 'approving'
            }
            onPress={() => void agent.approve()}
          >
            {agent.status === 'approving'
              ? 'Confirm Hyperliquid agent…'
              : 'Enable Hyperliquid signing'}
          </PrimaryButton>
        ) : null}

        {hlpWizard.hlp.status === 'confirming' ? (
          <PrimaryButton className="mt-5" disabled onPress={() => undefined}>
            Verifying HLP position…
          </PrimaryButton>
        ) : null}
      </View>
    </ScreenScrollView>
  );
}
