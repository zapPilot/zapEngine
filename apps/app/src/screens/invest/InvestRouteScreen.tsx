import { Redirect, useRouter } from 'expo-router';
import { Text, View } from 'react-native';

import { ChainBatchReviewCard } from '@/components/invest/ChainBatchReviewCard';
import { HyperCoreLegReviewCard } from '@/components/invest/HyperCoreLegReviewCard';
import { StepHeader } from '@/components/invest/StepHeader';
import { StepProgress } from '@/components/invest/StepProgress';
import { InlineErrorCard } from '@/components/ui/InlineErrorCard';
import { NonCustodialCard } from '@/components/ui/NonCustodialCard';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { ScreenScrollView } from '@/components/ui/ScreenScrollView';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import type { DepositExecutionCapability } from '@/integration/investExecutionModel';
import { useHyperliquidAgent } from '@/hooks/useHyperliquidAgent';
import { chainBatchDrafts } from '@/integration/investTargetsModel';
import { useInvest } from '@/integration/useInvest';
import { useInvestExecution } from '@/integration/useInvestExecution';
import { useInvestReview } from '@/integration/useInvestReview';
import { formatUsd6 } from '@/lib/format';
import { sectorWeightsFromDrafts } from '@/integration/investSectorModel';
import { InvestPreviewSummary } from '@/components/invest/InvestPreviewSummary';

import {
  investAgentDisclaimer,
  investSignatureSummary,
} from '@/integration/hyperCoreLegModel';

import { useHyperCoreLegPlan } from './useHyperCoreLegPlan';
import { useInvestRouteSubmit } from './useInvestRouteSubmit';

function capabilityNotice(
  capability: DepositExecutionCapability,
): { title: string; body: string } | null {
  if (capability === 'connect-wallet') {
    return {
      title: 'Connect your wallet',
      body: 'Connect the wallet that holds the funding balances shown in step 1.',
    };
  }
  if (capability === 'unsupported-wallet') {
    return {
      title: 'Wallet execution unavailable',
      body: 'Use Privy or an Ambire EIP-7702 wallet to submit these reviewed batches.',
    };
  }
  return null;
}

export function InvestRouteScreen() {
  const router = useRouter();
  const invest = useInvest();
  const review = useInvestReview();
  const hyperCoreDraft = invest.hyperCoreFundingDraft;
  const legPlan = useHyperCoreLegPlan(hyperCoreDraft);
  const leg = hyperCoreDraft ? legPlan : null;
  // Reading the agent session here is what turns "Signatures" into a fact
  // rather than a guess: signing may already be enabled from an earlier run.
  const agent = useHyperliquidAgent(leg?.plan?.step.signing ?? null);
  const totalUsd6 =
    invest.stageDrafts.reduce((n, draft) => n + BigInt(draft.usd6), 0n) +
    BigInt(hyperCoreDraft?.requestedUsd6 ?? '0');
  const weights = sectorWeightsFromDrafts(
    invest.stageDrafts,
    hyperCoreDraft?.weightBps ?? 0,
  );
  const batchCount = chainBatchDrafts(invest.stageDrafts).length;
  const stepCount = batchCount + (leg ? 1 : 0);
  const { capability } = useInvestExecution();
  const {
    handleConfirm,
    ctaLabel,
    ctaDisabled,
    reviewBlocked,
    reviewExecutionLocked,
    submissionError,
    dismissSubmissionError,
  } = useInvestRouteSubmit({ review, capability, hyperCoreLeg: leg });

  if (invest.stageDrafts.length === 0 && !reviewExecutionLocked) {
    return <Redirect href="/invest/amount" />;
  }

  const notice = capabilityNotice(capability);

  return (
    <ScreenScrollView>
      <StepHeader title="Preview" step="Step 2 of 2" />
      <StepProgress current={2} />
      <View className="px-5 pt-6">
        <Text className="font-serif text-[28px] leading-[32px] text-ink">
          Preview investment
        </Text>
        <Text className="mt-2 text-[12px] leading-[18px] text-ink-dim">
          {formatUsd6(totalUsd6)} across Crypto and Stable.{' '}
          {investSignatureSummary({
            batchCount,
            hasHyperCoreLeg: leg !== null,
          })}
        </Text>

        <InvestPreviewSummary totalUsd6={totalUsd6} weights={weights} />
        <Text className="mb-2.5 mt-5 font-mono-semibold text-[9px] uppercase tracking-[.8px] text-ink-faint">
          Transaction sequence
        </Text>
        <View className="gap-4">
          {review.isLoading ? (
            <>
              <SkeletonBlock className="h-[180px] w-full rounded-2xl" />
              <SkeletonBlock className="h-[180px] w-full rounded-2xl" />
            </>
          ) : review.isError && review.amountTooSmall ? (
            // Retrying the same frozen amounts cannot succeed, so the only
            // useful action is back to the amount step.
            <InlineErrorCard
              title={review.amountTooSmall.title}
              body={review.amountTooSmall.message}
              action={{ label: 'Change amount', onPress: () => router.back() }}
            />
          ) : review.isError ? (
            <InlineErrorCard
              title="Tenderly review unavailable"
              body={
                review.errorMessage ?? 'The transaction could not be verified.'
              }
              action={{ label: 'Retry review', onPress: review.retry }}
            />
          ) : (
            review.batches.map((batch, index) => (
              <ChainBatchReviewCard
                key={batch.draft.chainId}
                batch={batch}
                stepLabel={`Step ${index + 1} of ${stepCount}`}
              />
            ))
          )}
          {leg ? (
            <HyperCoreLegReviewCard
              leg={leg}
              agentStatus={agent.status}
              stepLabel={`Step ${stepCount} of ${stepCount}`}
            />
          ) : null}
        </View>

        {reviewBlocked ? (
          <Text
            accessibilityRole="alert"
            className="mt-4 text-[11px] leading-4 text-error"
          >
            A reviewed batch is blocked or expired. Refresh the review before
            signing.
          </Text>
        ) : null}

        {notice ? (
          <View className="mt-4">
            <NonCustodialCard title={notice.title} body={notice.body} />
          </View>
        ) : null}

        {submissionError ? (
          <View className="mt-4">
            <InlineErrorCard
              title="Wallet submission did not start"
              body={submissionError}
              action={{
                label: 'Refresh route',
                onPress: () => {
                  dismissSubmissionError();
                  review.retry();
                },
              }}
            />
          </View>
        ) : null}

        <PrimaryButton
          className="mt-5"
          disabled={ctaDisabled}
          onPress={() => void handleConfirm()}
        >
          {ctaLabel}
        </PrimaryButton>
        <Text className="mt-3 text-center text-[10.5px] leading-[16px] text-ink-faint">
          Zap Pilot never holds your funds. You sign each transaction yourself
          {investAgentDisclaimer({
            hasBridgedHlp: invest.stageDrafts.some(
              (d) => d.positionId === 'hlp',
            ),
            hasHyperCoreLeg: leg !== null,
          })}
        </Text>
      </View>
    </ScreenScrollView>
  );
}
