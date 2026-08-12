import { Text, View } from 'react-native';

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
import type { DepositExecutionCapability } from '@/integration/investExecutionModel';
import { useInvestExecution } from '@/integration/useInvestExecution';
import { resolveRouteProtocols } from '@/integration/simulationPreviewModel';
import { useInvestRouteSubmit } from './useInvestRouteSubmit';

const CAPABILITY_NOTICE = {
  'unsupported-wallet': {
    title: 'Wallet execution unavailable',
    body: 'This wallet cannot submit the guided transactions.',
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
  return null;
}

export function InvestRouteScreen() {
  const invest = useInvest();
  const review = useInvestDepositReview();
  const { capability } = useInvestExecution();
  const isBoth = invest.scope === 'both';
  const hasPlanForScope = isDepositPlanForScope(review.plan, invest.scope);
  const notice = capabilityNotice(
    capability,
    invest.scope,
    invest.baseFundingToken.symbol,
  );
  const {
    handleConfirm,
    ctaLabel,
    ctaDisabled,
    reviewNow,
    submissionError,
    dismissSubmissionError,
  } = useInvestRouteSubmit({ review, capability, hasPlanForScope });

  return (
    <ScreenScrollView>
      <StepHeader title="Route" step="Step 2 of 2" />
      <StepProgress current={2} />
      <View className="px-5 pt-6">
        <Text className="font-serif text-[28px] leading-[32px] text-ink">
          Preview route
        </Text>

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
          ) : review.reviewGroups.length > 0 ? (
            <View className="gap-4">
              {review.reviewGroups.some(
                (group) => group.expiresAt <= reviewNow,
              ) ? (
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
              {review.reviewGroups.map((group) => (
                <Card key={group.groupId} className="p-4">
                  <SimulationReviewBody
                    review={group}
                    protocols={resolveRouteProtocols(
                      review.plan,
                      group.groupId,
                    )}
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
                dismissSubmissionError();
                review.retry();
              }}
            >
              <Text className="font-sans-semibold text-[10.5px] text-error">
                Retry
              </Text>
            </Tap>
          </View>
        ) : null}

        <StrategyPlanSummary
          variant="confirm"
          plan={review.plan}
          amountUsd={review.amountUsd}
          scope={invest.scope}
          singleChainFundingDraft={invest.singleChainFundingDraft}
          baseToken={invest.baseFundingToken}
          arbitrumToken={invest.arbitrumFundingToken}
        />

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
