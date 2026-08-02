import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import {
  CONNECT_WALLET_CTA,
  CONNECTING_LABEL,
} from '@/components/connect/connectCopy';

import { MockBridgeNotice } from '@/components/invest/MockBridgeNotice';
import { SimulationReviewBody } from '@/components/invest/simulation/SimulationReviewBody';
import {
  isDepositPlanForScope,
  StrategyPlanSummary,
} from '@/components/invest/StrategyPlanSummary';
import { StepHeader } from '@/components/invest/StepHeader';
import { StepProgress } from '@/components/invest/StepProgress';
import { Card } from '@/components/ui/Card';
import { NonCustodialCard } from '@/components/ui/NonCustodialCard';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { ScreenScrollView } from '@/components/ui/ScreenScrollView';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import { Tap } from '@/components/ui/Tap';
import { useInvest, useInvestDepositReview } from '@/integration/useInvest';
import { useAccount } from '@/integration/useAccount';
import type { DepositExecutionCapability } from '@/integration/investExecutionModel';
import { useInvestExecution } from '@/integration/useInvestExecution';
import { formatUsd } from '@/lib/format';

const CAPABILITY_NOTICE = {
  'unsupported-wallet': {
    title: 'Wallet execution unavailable',
    body: 'This wallet cannot submit the guided transactions.',
  },
  'unsupported-path': {
    title: 'Strategy route unavailable',
    body: 'Return to the amount step and choose supported funding tokens.',
  },
} as const;

function connectWalletBody(
  scope: 'base' | 'arbitrum' | 'both',
  baseToken: string,
) {
  if (scope === 'base')
    return `Connect the wallet that holds Base ${baseToken}.`;
  if (scope === 'arbitrum')
    return 'Connect the wallet that holds Arbitrum USDC.';
  return 'Connect the wallet that holds both Base and Arbitrum funding balances.';
}

function capabilityNotice(
  capability: DepositExecutionCapability,
  scope: 'base' | 'arbitrum' | 'both',
  baseToken: string,
): { title: string; body: string } | null {
  if (capability === 'connect-wallet') {
    return {
      title: 'Connect your wallet',
      body: connectWalletBody(scope, baseToken),
    };
  }
  if (capability === 'unsupported-wallet') {
    return {
      ...CAPABILITY_NOTICE[capability],
      body:
        scope === 'both'
          ? CAPABILITY_NOTICE[capability].body
          : 'Use Privy or an Ambire EIP-7702 wallet to submit this batch.',
    };
  }
  if (capability === 'unsupported-path') return CAPABILITY_NOTICE[capability];
  return null;
}

function RailNode({
  title,
  badge,
  body,
  tone = 'chain',
}: {
  title: string;
  badge: string;
  body: string;
  tone?: 'chain' | 'mock';
}) {
  const color = tone === 'mock' ? '#d7bd70' : '#d4c5a3';
  return (
    <View className="flex-row gap-3">
      <View className="items-center">
        <View
          className="h-8 w-8 items-center justify-center rounded-full border"
          style={{ borderColor: `${color}66`, backgroundColor: `${color}14` }}
        >
          <View
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: color }}
          />
        </View>
        <View className="h-8 w-px bg-[rgba(212,197,163,.22)]" />
      </View>
      <View className="flex-1 pb-5 pt-0.5">
        <View className="flex-row items-center gap-2">
          <Text className="font-sans-semibold text-[14px] text-ink">
            {title}
          </Text>
          <Text
            className="rounded-full px-2 py-0.5 font-mono text-[8px] uppercase tracking-[.5px]"
            style={{ color, backgroundColor: `${color}12` }}
          >
            {badge}
          </Text>
        </View>
        <Text className="mt-1 text-[11.5px] leading-[17px] text-ink-dim">
          {body}
        </Text>
      </View>
    </View>
  );
}

export function InvestRouteScreen() {
  const router = useRouter();
  const account = useAccount();
  const invest = useInvest();
  const review = useInvestDepositReview();
  const { capability, pending, reviewedProgress, submitReviewedBatch } =
    useInvestExecution();
  const [launchRequested, setLaunchRequested] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [reviewNow, setReviewNow] = useState(() => Date.now());
  const [acknowledgedRiskHashes, setAcknowledgedRiskHashes] = useState<
    Record<string, string>
  >({});
  const isBoth = invest.scope === 'both';
  const hasPlanForScope = isDepositPlanForScope(review.plan, invest.scope);
  const routeDescription =
    invest.scope === 'base'
      ? `${formatUsd(review.amountUsd)} on Base into Morpho Moonwell.`
      : invest.scope === 'arbitrum'
        ? `${formatUsd(review.amountUsd)} on Arbitrum into GMX BTC/USDC.`
        : `${formatUsd(review.amountUsd)} across Morpho and two GMX markets.`;

  const notice = capabilityNotice(
    capability,
    invest.scope,
    invest.baseFundingToken.symbol,
  );
  const reviewGroupKeys =
    invest.scope === 'both'
      ? (['base-morpho', 'arbitrum-gmx'] as const)
      : review.plan
        ? ([
            `chain-${
              'sourceChainId' in review.plan
                ? review.plan.sourceChainId
                : invest.scope === 'base'
                  ? 8453
                  : 42161
            }`,
          ] as const)
        : ([] as const);
  const reviewGroups = reviewGroupKeys
    .map((key) => review.review?.reviews[key])
    .filter((group): group is NonNullable<typeof group> => Boolean(group));
  const reviewExpiryKey = reviewGroups
    .map((group) => `${group.groupId}:${group.expiresAt}`)
    .join('|');
  const reviewGroupCount = reviewGroups.length;
  useEffect(() => {
    if (reviewGroupCount === 0) return;
    const timer = setInterval(() => setReviewNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [reviewExpiryKey, reviewGroupCount]);
  const reviewHasAllGroups =
    reviewGroupKeys.length > 0 &&
    reviewGroups.length === reviewGroupKeys.length;
  const firstReviewForGate =
    reviewGroups.find((group) => group.groupId === 'base-morpho') ??
    reviewGroups[0];
  const reviewBlocked =
    reviewGroups.some(
      (group) =>
        group.blocked ||
        !group.executionAllowed ||
        group.expiresAt <= reviewNow,
    ) ||
    Boolean(
      firstReviewForGate?.requiresRiskAcknowledgement &&
      acknowledgedRiskHashes[firstReviewForGate.groupId] !==
        firstReviewForGate.expectedRiskHash,
    );
  const reviewNotReadyForSend =
    capability === 'ready' &&
    (review.isLoading ||
      review.isError ||
      !reviewHasAllGroups ||
      reviewBlocked);
  const reviewExecutionLocked = reviewedProgress !== null;

  const handleConfirm = async () => {
    if (reviewExecutionLocked) {
      router.replace('/invest/progress');
      return;
    }
    if (capability === 'connect-wallet') {
      void account.connect();
      return;
    }
    if (
      capability !== 'ready' ||
      !hasPlanForScope ||
      reviewNotReadyForSend ||
      launchRequested
    ) {
      return;
    }
    setLaunchRequested(true);
    setSubmissionError(null);
    try {
      const displayed = review.review;
      const fresh = await review.refresh();
      const displayedGroups = displayed?.reviews ?? {};
      const freshGroups = reviewGroupKeys
        .map((key) => fresh?.reviews[key])
        .filter((group): group is NonNullable<typeof group> => Boolean(group));
      const firstReview =
        freshGroups.find((group) => group.groupId === 'base-morpho') ??
        freshGroups[0];
      const displayedFirst = firstReview
        ? displayedGroups[firstReview.groupId]
        : undefined;
      const freshGroupsSafe =
        freshGroups.length === reviewGroupKeys.length &&
        freshGroups.every(
          (group) =>
            !group.blocked &&
            group.executionAllowed &&
            group.expiresAt > Date.now() &&
            (group.groupId !== firstReview?.groupId ||
              !group.requiresRiskAcknowledgement ||
              acknowledgedRiskHashes[group.groupId] === group.expectedRiskHash),
        );
      const anyGroupDrift = reviewGroupKeys.some((key) => {
        const before = displayedGroups[key];
        const after = fresh?.reviews[key];
        return (
          !before ||
          !after ||
          before.groupFingerprint !== after.groupFingerprint ||
          before.batchFingerprint !== after.batchFingerprint ||
          before.expectedSimulationFingerprint !==
            after.expectedSimulationFingerprint ||
          before.expectedRiskHash !== after.expectedRiskHash
        );
      });
      const drifted =
        !fresh ||
        !review.plan ||
        !firstReview ||
        !displayed ||
        fresh.planFingerprint !== displayed.planFingerprint ||
        !displayedFirst ||
        displayedFirst.groupFingerprint !== firstReview.groupFingerprint ||
        displayedFirst.expectedSimulationFingerprint !==
          firstReview.expectedSimulationFingerprint ||
        displayedFirst.expectedRiskHash !== firstReview.expectedRiskHash ||
        displayedFirst.batchFingerprint !== firstReview.batchFingerprint ||
        anyGroupDrift ||
        !freshGroupsSafe;
      if (drifted) {
        setSubmissionError(
          'The review changed while you were deciding. Review the updated Tenderly evidence and confirm again.',
        );
        if (
          firstReview &&
          displayedFirst?.expectedRiskHash !== firstReview.expectedRiskHash
        ) {
          setAcknowledgedRiskHashes((current) => {
            const next = { ...current };
            delete next[firstReview.groupId];
            return next;
          });
        }
        return;
      }
      const result = await submitReviewedBatch({
        plan: fresh.plan,
        review: firstReview,
        queue: freshGroups.map((group) => ({
          plan: fresh.plan,
          review: group,
        })),
        ...(firstReview.requiresRiskAcknowledgement &&
        acknowledgedRiskHashes[firstReview.groupId] ===
          firstReview.expectedRiskHash
          ? { acknowledgedRiskHash: firstReview.expectedRiskHash }
          : {}),
      });
      if (result.status === 'submitted') {
        router.replace('/invest/progress');
        return;
      }
      setSubmissionError(result.reason);
      if (result.status === 'review-changed') void review.refresh();
    } catch (error: unknown) {
      setSubmissionError(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setLaunchRequested(false);
    }
  };

  const ctaLabel = reviewExecutionLocked
    ? 'Return to progress'
    : capability === 'connect-wallet'
      ? account.isConnecting
        ? CONNECTING_LABEL
        : CONNECT_WALLET_CTA
      : pending || launchRequested
        ? 'Confirm in wallet…'
        : 'Confirm & send';
  const ctaDisabled = reviewExecutionLocked
    ? false
    : capability === 'connect-wallet'
      ? account.isConnecting
      : account.isConnecting ||
        pending ||
        launchRequested ||
        review.amountUsd <= 0 ||
        !hasPlanForScope ||
        reviewNotReadyForSend ||
        capability === 'unsupported-wallet' ||
        capability === 'unsupported-path';

  return (
    <ScreenScrollView>
      <StepHeader title="Route" step="Step 2 of 2" />
      <StepProgress current={2} />
      <View className="px-5 pt-6">
        <Text className="font-serif text-[28px] leading-[32px] text-ink">
          Preview route
        </Text>
        <Text className="mt-2 text-[12.5px] leading-[19px] text-ink-dim">
          {routeDescription}
        </Text>

        <StrategyPlanSummary
          variant="confirm"
          plan={review.plan}
          amountUsd={review.amountUsd}
          scope={invest.scope}
          singleChainFundingDraft={invest.singleChainFundingDraft}
          baseToken={invest.baseFundingToken}
          arbitrumToken={invest.arbitrumFundingToken}
        />

        <Card className="mt-4 px-4 pb-1 pt-4">
          {review.isLoading ? (
            <View className="gap-3 pb-4">
              <SkeletonBlock className="h-[68px] w-full rounded-xl" />
              {isBoth ? (
                <>
                  <SkeletonBlock className="h-[68px] w-full rounded-xl" />
                  <SkeletonBlock className="h-[68px] w-full rounded-xl" />
                </>
              ) : null}
            </View>
          ) : hasPlanForScope ? (
            isBoth ? (
              <>
                <RailNode
                  title="Morpho Moonwell USDC"
                  badge="Base · 40%"
                  body={`${invest.baseFundingToken.symbol} funding with separate approval, same-chain swap when needed, and vault deposit confirmations.`}
                />
                <RailNode
                  title="Mock bridge checkpoint"
                  badge="No transaction"
                  tone="mock"
                  body="No assets move between chains. The next group rechecks the wallet's real Arbitrum balance."
                />
                <RailNode
                  title="GMX BTC/USDC + ETH/USDC"
                  badge="Arbitrum · 30/30"
                  body={`${invest.arbitrumFundingToken.symbol} funding with separate approvals, same-chain USDC swaps when needed, and two asynchronous GMX deposits.`}
                />
              </>
            ) : invest.scope === 'base' ? (
              <RailNode
                title="Morpho Moonwell USDC"
                badge="Base · 100%"
                body={
                  invest.baseFundingToken.symbol === 'ETH'
                    ? 'ETH funding in one wallet batch with a same-chain USDC swap and Morpho vault supply.'
                    : 'USDC funding in one wallet batch with approval when required and a Morpho vault supply.'
                }
              />
            ) : (
              <RailNode
                title="GMX BTC/USDC"
                badge="Arbitrum · 100%"
                body="USDC funding in one wallet batch with approval when required and asynchronous GMX settlement."
              />
            )
          ) : (
            <View className="pb-4">
              <Text className="font-sans-semibold text-[14px] text-ink">
                {review.isError ? 'Route unavailable' : 'Route preview pending'}
              </Text>
              <Text className="mt-2 text-[12px] leading-[18px] text-ink-dim">
                {review.isError
                  ? 'The live quote could not be prepared.'
                  : 'Connect a wallet and enter an amount to fetch the live plan.'}
              </Text>
              {review.isError && review.errorMessage ? (
                <Text className="mt-2 text-[11.5px] leading-[17px] text-[#ef9292]">
                  {review.errorMessage}
                </Text>
              ) : null}
              {review.isError ? (
                <Tap
                  accessibilityRole="button"
                  accessibilityLabel="Retry route preview"
                  className="mt-3 self-start rounded-full border px-3 py-1.5"
                  style={{
                    borderColor: 'rgba(212,197,163,.22)',
                    backgroundColor: 'rgba(212,197,163,.07)',
                  }}
                  onPress={review.retry}
                >
                  <Text className="font-sans-semibold text-[11px] text-accent">
                    Retry
                  </Text>
                </Tap>
              ) : null}
            </View>
          )}
        </Card>

        <View className="mt-5">
          <Text className="mb-2.5 font-mono-semibold text-[9px] uppercase tracking-[.8px] text-ink-faint">
            Tenderly review · authoritative plan
          </Text>
          {review.isLoading ? (
            <View className="gap-3">
              <SkeletonBlock className="h-[180px] w-full rounded-2xl" />
              {isBoth ? (
                <SkeletonBlock className="h-[180px] w-full rounded-2xl" />
              ) : null}
            </View>
          ) : review.isError ? (
            <View
              accessibilityRole="alert"
              className="rounded-2xl border border-error/30 bg-error/10 p-4"
            >
              <Text className="font-sans-semibold text-[12px] text-error">
                Tenderly review unavailable
              </Text>
              <Text className="mt-1 text-[11px] leading-4 text-error">
                {review.errorMessage ??
                  'The transaction could not be verified.'}
              </Text>
              <Tap
                accessibilityRole="button"
                accessibilityLabel="Retry Tenderly review"
                className="mt-3 self-start rounded-full border border-error/30 px-3 py-1.5"
                onPress={review.retry}
              >
                <Text className="font-sans-semibold text-[10.5px] text-error">
                  Retry review
                </Text>
              </Tap>
            </View>
          ) : reviewGroups.length > 0 ? (
            <View className="gap-4">
              {reviewGroups.some((group) => group.expiresAt <= reviewNow) ? (
                <View
                  accessibilityRole="alert"
                  className="rounded-2xl border border-error/30 bg-error/10 p-3"
                >
                  <Text className="font-sans-semibold text-[11px] text-error">
                    This review has expired
                  </Text>
                  <Text className="mt-1 text-[10.5px] leading-4 text-error">
                    Refresh the Tenderly review before signing.
                  </Text>
                  <Tap
                    accessibilityRole="button"
                    accessibilityLabel="Refresh expired Tenderly review"
                    className="mt-2 self-start rounded-full border border-error/30 px-3 py-1.5"
                    onPress={review.retry}
                  >
                    <Text className="font-sans-semibold text-[10.5px] text-error">
                      Refresh review
                    </Text>
                  </Tap>
                </View>
              ) : null}
              {reviewGroups.map((group) => (
                <Card key={group.groupId} className="p-4">
                  <SimulationReviewBody
                    review={group}
                    acknowledged={
                      acknowledgedRiskHashes[group.groupId] ===
                      group.expectedRiskHash
                    }
                    disabled={pending || launchRequested}
                    onAcknowledgedChange={(acknowledged) => {
                      setAcknowledgedRiskHashes((current) => {
                        const next = { ...current };
                        if (acknowledged) {
                          next[group.groupId] = group.expectedRiskHash;
                        } else {
                          delete next[group.groupId];
                        }
                        return next;
                      });
                    }}
                  />
                </Card>
              ))}
            </View>
          ) : (
            <View className="rounded-2xl border border-line-hi bg-surface p-4">
              <Text className="text-[11px] leading-4 text-ink-dim">
                Enter an amount and connect a wallet to load the Tenderly
                review.
              </Text>
            </View>
          )}
        </View>

        {isBoth ? (
          <MockBridgeNotice
            title="Mock bridge — development only"
            body={`Arbitrum must already hold enough ${invest.arbitrumFundingToken.symbol} plus ETH for gas and GMX keeper execution fees.`}
          />
        ) : null}

        {notice ? (
          <View className="mt-4">
            <NonCustodialCard title={notice.title} body={notice.body} />
          </View>
        ) : null}

        {submissionError ? (
          <View
            accessibilityRole="alert"
            className="mt-4 rounded-2xl border border-error/30 bg-error/10 p-3"
          >
            <Text className="font-sans-semibold text-[11px] text-error">
              Wallet submission did not start
            </Text>
            <Text className="mt-1 text-[10.5px] leading-4 text-error">
              {submissionError}
            </Text>
            <Tap
              accessibilityRole="button"
              accessibilityLabel="Retry wallet submission"
              className="mt-2 self-start rounded-full border border-error/30 px-3 py-1.5"
              onPress={() => {
                setSubmissionError(null);
                setLaunchRequested(false);
                review.retry();
              }}
            >
              <Text className="font-sans-semibold text-[10.5px] text-error">
                Retry
              </Text>
            </Tap>
          </View>
        ) : null}

        <PrimaryButton
          className="mt-5"
          disabled={ctaDisabled}
          onPress={handleConfirm}
        >
          {ctaLabel}
        </PrimaryButton>
        <Text className="mt-3 text-center text-[10.5px] leading-[16px] text-ink-faint">
          {isBoth
            ? 'No custody and no automatic signatures. Confirm the reviewed Base batch first; Arbitrum follows after the checkpoint.'
            : 'No custody and no automatic signatures. Confirm the reviewed wallet batch to send.'}
        </Text>
      </View>
    </ScreenScrollView>
  );
}
