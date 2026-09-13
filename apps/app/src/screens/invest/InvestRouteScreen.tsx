import { Redirect } from 'expo-router';
import { Text, View } from 'react-native';

import { StageReviewCard } from '@/components/invest/StageReviewCard';
import { StepHeader } from '@/components/invest/StepHeader';
import { StepProgress } from '@/components/invest/StepProgress';
import { InlineErrorCard } from '@/components/ui/InlineErrorCard';
import { NonCustodialCard } from '@/components/ui/NonCustodialCard';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { ScreenScrollView } from '@/components/ui/ScreenScrollView';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import type { DepositExecutionCapability } from '@/integration/investExecutionModel';
import { useInvest } from '@/integration/useInvest';
import { useInvestExecution } from '@/integration/useInvestExecution';
import { useInvestReview } from '@/integration/useInvestReview';
import { formatUsd } from '@/lib/format';

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
  const invest = useInvest();
  const review = useInvestReview();
  const { capability } = useInvestExecution();
  const {
    handleConfirm,
    ctaLabel,
    ctaDisabled,
    reviewBlocked,
    reviewExecutionLocked,
    submissionError,
    dismissSubmissionError,
  } = useInvestRouteSubmit({ review, capability });

  if (invest.stageDrafts.length === 0 && !reviewExecutionLocked) {
    return <Redirect href="/invest/amount" />;
  }

  const notice = capabilityNotice(capability);

  return (
    <ScreenScrollView>
      <StepHeader title="Route" step="Step 2 of 2" />
      <StepProgress current={2} />
      <View className="px-5 pt-6">
        <Text className="font-serif text-[28px] leading-[32px] text-ink">
          Review one investment route
        </Text>
        <Text className="mt-2 text-[12px] leading-[18px] text-ink-dim">
          {formatUsd(invest.amountUsd)} splits into {invest.stageDrafts.length}{' '}
          reviewed wallet{' '}
          {invest.stageDrafts.length === 1 ? 'batch' : 'batches'}. Only the
          first is submitted now; each later batch waits for its own checkpoint
          and is never sent twice.
        </Text>

        <Text className="mb-2.5 mt-5 font-mono-semibold text-[9px] uppercase tracking-[.8px] text-ink-faint">
          Tenderly review · authoritative source batches
        </Text>
        <View className="gap-4">
          {review.isLoading ? (
            <>
              <SkeletonBlock className="h-[180px] w-full rounded-2xl" />
              <SkeletonBlock className="h-[180px] w-full rounded-2xl" />
            </>
          ) : review.isError ? (
            <InlineErrorCard
              title="Tenderly review unavailable"
              body={
                review.errorMessage ?? 'The transaction could not be verified.'
              }
              action={{ label: 'Retry review', onPress: review.retry }}
            />
          ) : (
            review.stages.map((stage) => (
              <StageReviewCard key={stage.draft.positionId} stage={stage} />
            ))
          )}
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
          No custody and no automatic signatures. HLP ends with your approved
          Hyperliquid agent signing the vault deposit once the bridged USDC
          lands.
        </Text>
      </View>
    </ScreenScrollView>
  );
}
