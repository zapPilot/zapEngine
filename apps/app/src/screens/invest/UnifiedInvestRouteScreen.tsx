import { hlpStepFromPlan } from '@zapengine/app-core/lib/wallet/depositWizardMachine';
import { getHyperCoreSpendableUsdc } from '@zapengine/app-core/services';
import type {
  DepositPlan,
  DepositReviewGroup,
  ReviewedDepositPlan,
} from '@zapengine/types/api';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import type { Address } from 'viem';

import { SimulationReviewBody } from '@/components/invest/simulation/SimulationReviewBody';
import { StepHeader } from '@/components/invest/StepHeader';
import { StepProgress } from '@/components/invest/StepProgress';
import { Card } from '@/components/ui/Card';
import { InlineErrorCard } from '@/components/ui/InlineErrorCard';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { ScreenScrollView } from '@/components/ui/ScreenScrollView';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import { useAccount } from '@/integration/useAccount';
import { useInvest } from '@/integration/useInvest';
import { useInvestExecution } from '@/integration/useInvestExecution';
import { resolveRouteProtocols } from '@/integration/simulationPreviewModel';
import { useUnifiedInvestReview } from '@/integration/useUnifiedInvestReview';
import { formatUsd } from '@/lib/format';

function reviewBlocked(review: DepositReviewGroup, nowMs: number): boolean {
  return (
    review.blocked ||
    !review.executionAllowed ||
    review.status === 'failed' ||
    review.expiresAt <= nowMs
  );
}

function hlpDepositPlan(plan: ReviewedDepositPlan): DepositPlan | null {
  if ('executionGroups' in plan) return null;
  return hlpStepFromPlan(plan as DepositPlan) ? (plan as DepositPlan) : null;
}

function stageLabel(id: string, detail: string, index: number): string {
  if (id === 'morpho') return 'Morpho · Base';
  if (id === 'gmx') return 'GMX · Arbitrum';
  if (detail.includes('→')) return detail;
  return `Execution ${index + 1}`;
}

export function UnifiedInvestRouteScreen() {
  const router = useRouter();
  const account = useAccount();
  const invest = useInvest();
  const review = useUnifiedInvestReview();
  const execution = useInvestExecution();
  const [submitting, setSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);

  const blockedStage = useMemo(
    () => review.stages.find((stage) => reviewBlocked(stage.review, now)),
    [now, review.stages],
  );
  const canSubmit =
    execution.capability === 'ready' &&
    review.reviewHasAllStages &&
    review.stages.length > 0 &&
    !blockedStage &&
    !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    const first = review.stages[0];
    const user = account.address as Address | null;
    if (!first || !user) return;

    setSubmitting(true);
    setSubmissionError(null);
    try {
      execution.reset();
      const firstHlpPlan = hlpDepositPlan(first.plan);
      if (firstHlpPlan) {
        const step = hlpStepFromPlan(firstHlpPlan);
        if (!step) throw new Error('HLP execution step is missing.');
        const baseline = await getHyperCoreSpendableUsdc({
          user,
          apiUrl: step.signing.apiUrl,
        });
        invest.setHlpBaselineUsd6(baseline.spendableUsd6.toString());
      }

      const result = await execution.submitReviewedBatch({
        plan: first.plan,
        review: first.review,
        queue: review.stages.map((stage) => ({
          plan: stage.plan,
          review: stage.review,
        })),
        ...(first.review.requiresRiskAcknowledgement
          ? { acknowledgedRiskHash: first.review.expectedRiskHash }
          : {}),
      });
      if (result.status !== 'submitted') {
        setSubmissionError(result.reason);
        return;
      }
      router.push('/invest/progress');
    } catch (error: unknown) {
      setSubmissionError(error instanceof Error ? error.message : String(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScreenScrollView>
      <StepHeader title="Route" step="Step 2 of 2" />
      <StepProgress current={2} />
      <View className="px-5 pt-6">
        <Text className="font-serif text-[28px] leading-[32px] text-ink">
          Review one investment route
        </Text>
        <Text className="mt-2 text-[12px] leading-[18px] text-ink-dim">
          {formatUsd(invest.amountUsd)} is split into reviewed batches. Zap Pilot
          pauses at every chain checkpoint; a confirmed batch is never sent
          twice.
        </Text>

        <View className="mt-5 gap-4">
          {review.isLoading ? (
            <>
              <SkeletonBlock className="h-[170px] w-full rounded-2xl" />
              <SkeletonBlock className="h-[170px] w-full rounded-2xl" />
            </>
          ) : review.isError ? (
            <InlineErrorCard
              title="Route review unavailable"
              body={review.errorMessage ?? 'The route could not be reviewed.'}
              action={{ label: 'Retry review', onPress: () => void review.refresh() }}
            />
          ) : (
            review.stages.map((stage, index) => (
              <Card key={`${stage.id}-${stage.stage}-${index}`} className="p-4">
                <View className="mb-3 flex-row items-center justify-between gap-3">
                  <View className="min-w-0 flex-1">
                    <Text className="font-sans-semibold text-[12.5px] text-ink">
                      {stageLabel(stage.id, stage.detail, index)}
                    </Text>
                    <Text className="mt-1 text-[10.5px] leading-4 text-ink-dim">
                      {stage.detail}
                    </Text>
                  </View>
                  <Text className="font-mono-semibold text-[11px] text-accent">
                    {Math.round(stage.allocationBps / 100)}%
                  </Text>
                </View>
                <SimulationReviewBody
                  review={stage.review}
                  protocols={resolveRouteProtocols(stage.plan, stage.review.groupId)}
                />
              </Card>
            ))
          )}
        </View>

        {blockedStage ? (
          <Text accessibilityRole="alert" className="mt-4 text-[11px] leading-4 text-error">
            A reviewed batch is blocked or expired. Refresh the route before signing.
          </Text>
        ) : null}
        {submissionError ? (
          <View className="mt-4">
            <InlineErrorCard
              title="Wallet submission did not start"
              body={submissionError}
              action={{ label: 'Refresh route', onPress: () => void review.refresh() }}
            />
          </View>
        ) : null}

        <PrimaryButton
          className="mt-5"
          disabled={!canSubmit}
          onPress={() => void submit()}
        >
          {submitting ? 'Submitting first batch…' : 'Confirm investment route'}
        </PrimaryButton>
        <Text className="mt-3 text-center text-[10.5px] leading-4 text-ink-faint">
          Only the first reviewed batch is submitted now. Each later chain action
          requires its own checkpoint confirmation. HLP ends with the approved
          Hyperliquid agent signing the vault deposit after Bridge2 credits arrive.
        </Text>
      </View>
    </ScreenScrollView>
  );
}
