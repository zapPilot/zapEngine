import { extractErrorMessage } from '@zapengine/app-core/lib/errors';
import { hlpStepFromPlan } from '@zapengine/app-core/lib/wallet/depositWizardMachine';
import { getPerpUsdcBalance } from '@zapengine/app-core/services';
import type { DepositPlan } from '@zapengine/types/api';
import { useState } from 'react';
import { Text, View } from 'react-native';
import type { Address } from 'viem';

import { HlpPlanSummary } from '@/components/invest/HlpPlanSummary';
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
import { startHlpSubmission } from '@/integration/hlpSubmissionModel';
import type { DepositExecutionCapability } from '@/integration/investExecutionModel';
import { useAccount } from '@/integration/useAccount';
import { useInvest, useInvestDepositReview } from '@/integration/useInvest';
import { useInvestExecution } from '@/integration/useInvestExecution';
import {
  isStrategyDepositPlan,
  resolveRouteProtocols,
} from '@/integration/simulationPreviewModel';
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

function reviewedHlpStep(
  plan: ReturnType<typeof useInvestDepositReview>['plan'],
) {
  if (!plan || isStrategyDepositPlan(plan)) return null;
  return hlpStepFromPlan(plan as DepositPlan);
}

export function InvestRouteScreen() {
  const invest = useInvest();
  const account = useAccount();
  const review = useInvestDepositReview();
  const { capability } = useInvestExecution();
  const [hlpPreparing, setHlpPreparing] = useState(false);
  const [hlpPreparationError, setHlpPreparationError] = useState<string | null>(
    null,
  );
  const isBoth = invest.scope === 'both';
  const isHlp = invest.destination === 'hlp';
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
    reviewExecutionLocked,
    submissionError,
    dismissSubmissionError,
  } = useInvestRouteSubmit({
    review,
    capability,
    hasPlanForScope,
    successRoute: isHlp ? '/invest/hlp-progress' : '/invest/progress',
  });

  const handleRouteConfirm = async () => {
    if (!isHlp || capability !== 'ready' || reviewExecutionLocked) {
      await handleConfirm();
      return;
    }

    const step = reviewedHlpStep(review.plan);
    const userAddress = account.address as Address | undefined;
    if (!step || !userAddress) {
      setHlpPreparationError(
        'The reviewed route is missing the HLP follow-up or wallet address.',
      );
      return;
    }

    setHlpPreparing(true);
    setHlpPreparationError(null);
    try {
      await startHlpSubmission(
        { user: userAddress, apiUrl: step.signing.apiUrl },
        {
          readWithdrawableUsd6: async (input) =>
            (await getPerpUsdcBalance(input)).withdrawableUsd6,
          setBaselineUsd6: invest.setHlpBaselineUsd6,
          submitReviewedBatch: handleConfirm,
        },
      );
    } catch (error: unknown) {
      setHlpPreparationError(extractErrorMessage(error));
    } finally {
      setHlpPreparing(false);
    }
  };

  return (
    <ScreenScrollView>
      <StepHeader
        title="Route"
        step={isHlp ? 'HLP · Step 2 of 2' : 'Step 2 of 2'}
      />
      <StepProgress current={2} />
      <View className="px-5 pt-6">
        <Text className="font-serif text-[28px] leading-[32px] text-ink">
          {isHlp ? 'Review HLP route' : 'Preview route'}
        </Text>

        <View className="mt-5">
          <Text className="mb-2.5 font-mono-semibold text-[9px] uppercase tracking-[.8px] text-ink-faint">
            Tenderly review · authoritative source batch
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

        {isHlp ? (
          <View className="mt-4">
            <NonCustodialCard
              title="Two signatures, one guided flow"
              body="The reviewed Base batch bridges USDC to Hyperliquid. After it arrives, your wallet signs a separate gasless Hyperliquid HLP vault action; Zap Pilot never signs it automatically."
            />
          </View>
        ) : null}

        {notice ? (
          <View className="mt-4">
            <NonCustodialCard title={notice.title} body={notice.body} />
          </View>
        ) : null}

        {submissionError || hlpPreparationError ? (
          <View
            accessibilityRole="alert"
            className="mt-4 rounded-2xl border border-error/30 bg-error/10 p-3"
          >
            <Text className="font-sans-semibold text-[11px] text-error">
              Wallet submission did not start
            </Text>
            <Text className="mt-1 text-[10.5px] leading-4 text-error">
              {hlpPreparationError ?? submissionError}
            </Text>
            <Tap
              accessibilityRole="button"
              accessibilityLabel="Retry wallet submission"
              className="mt-2 self-start rounded-full border border-error/30 px-3 py-1.5"
              onPress={() => {
                setHlpPreparationError(null);
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

        {isHlp ? (
          <HlpPlanSummary
            plan={review.plan}
            amountUsd={review.amountUsd}
            singleChainFundingDraft={invest.singleChainFundingDraft}
          />
        ) : (
          <StrategyPlanSummary
            variant="confirm"
            plan={review.plan}
            amountUsd={review.amountUsd}
            scope={invest.scope}
            singleChainFundingDraft={invest.singleChainFundingDraft}
            baseToken={invest.baseFundingToken}
            arbitrumToken={invest.arbitrumFundingToken}
          />
        )}

        <PrimaryButton
          className="mt-5"
          disabled={ctaDisabled || hlpPreparing}
          onPress={() => void handleRouteConfirm()}
        >
          {hlpPreparing
            ? 'Checking Hyperliquid…'
            : isHlp && !reviewExecutionLocked
              ? 'Confirm & deposit to HLP'
              : ctaLabel}
        </PrimaryButton>
        <Text className="mt-3 text-center text-[10.5px] leading-[16px] text-ink-faint">
          {isHlp
            ? 'One guided flow, no custody: confirm the reviewed Base batch now; the HLP signature is requested only after your USDC reaches Hyperliquid.'
            : isBoth
              ? 'No custody and no automatic signatures. Confirm the reviewed Base batch first; Arbitrum follows after the checkpoint.'
              : 'No custody and no automatic signatures. Confirm the reviewed wallet batch to send.'}
        </Text>
      </View>
    </ScreenScrollView>
  );
}
