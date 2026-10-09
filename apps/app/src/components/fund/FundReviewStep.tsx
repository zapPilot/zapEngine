import {
  investAgentDisclaimer,
  investSignatureSummary,
} from '@/integration/hyperCoreLegModel';
import { HLP_VENUE, chainBatchDrafts } from '@/integration/investTargetsModel';
import { useState } from 'react';
import { View } from 'react-native';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Disclosure } from '@/components/ui/Disclosure';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import { ChainBatchReviewCard } from '@/components/invest/ChainBatchReviewCard';
import { HyperCoreLegReviewCard } from '@/components/invest/HyperCoreLegReviewCard';
import { InvestPreviewSummary } from '@/components/invest/InvestPreviewSummary';
import { useInvest } from '@/integration/useInvest';
import { useInvestExecution } from '@/integration/useInvestExecution';
import { useInvestReview } from '@/integration/useInvestReview';
import { sectorWeightsFromDrafts } from '@/integration/investSectorModel';
import { useHyperliquidAgent } from '@/hooks/useHyperliquidAgent';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';
import { FundSheet } from './FundSheet';
import { FundChecksList } from './FundChecksList';
import { useHyperCoreLegPlan } from './useHyperCoreLegPlan';
import { useFundSubmit } from './useFundSubmit';
export function FundReviewStep() {
  const { t } = useContentLanguage();
  const [details, setDetails] = useState(false);
  const invest = useInvest();
  const execution = useInvestExecution();
  const review = useInvestReview();
  const hyperCore = useHyperCoreLegPlan(invest.hyperCoreFundingDraft);
  const leg = invest.hyperCoreFundingDraft ? hyperCore : null;
  const agent = useHyperliquidAgent(leg?.plan?.step.signing ?? null);
  const submit = useFundSubmit({
    review,
    capability: execution.capability,
    hyperCoreLeg: leg,
  });
  const totalUsd6 =
    invest.stageDrafts.reduce((sum, draft) => sum + BigInt(draft.usd6), 0n) +
    BigInt(invest.hyperCoreFundingDraft?.requestedUsd6 ?? '0');
  const weights = sectorWeightsFromDrafts(
    invest.stageDrafts,
    invest.hyperCoreFundingDraft?.weightBps ?? 0,
  );
  const venue = HLP_VENUE;
  const edit = () => {
    execution.reset();
    invest.setStageDrafts([]);
    invest.setHyperCoreFundingDraft(null);
    invest.setHlpBaselineUsd6(null);
  };
  return (
    <FundSheet
      footer={
        <Button
          disabled={submit.ctaDisabled}
          onPress={() => void submit.handleConfirm()}
        >
          {submit.ctaLabel}
        </Button>
      }
    >
      <View className="gap-4 pb-4">
        <Text variant="label" tone="muted">
          {t('fund.plan')}
        </Text>
        <InvestPreviewSummary totalUsd6={totalUsd6} weights={weights} />
        <Text variant="caption" tone="secondary">
          {investSignatureSummary({
            batchCount: chainBatchDrafts(invest.stageDrafts).length,
            hasHyperCoreLeg: leg !== null,
          })}
        </Text>
        <Text variant="caption" tone="secondary">
          {investAgentDisclaimer({
            hasHyperCoreLeg: leg !== null,
            hasBridgedHlp: invest.stageDrafts.some(
              (draft) => draft.positionId === 'hlp',
            ),
          })}
        </Text>
        {leg ? (
          <HyperCoreLegReviewCard leg={leg} agentStatus={agent.status} />
        ) : null}
        {review.isLoading ? (
          <SkeletonBlock className="h-control-lg rounded-panel" />
        ) : (
          <FundChecksList
            batches={review.batches}
            hasHyperCore={leg !== null}
            venue={venue}
          />
        )}
        {review.batches
          .flatMap((batch) => batch.review.warnings)
          .map((warning, index) => (
            <Callout
              key={index}
              tone="neutral"
              title={t('fund.warning')}
              body={warning.message}
            />
          ))}
        {review.isError ? (
          <Callout
            tone="alert"
            title={review.amountTooSmall?.title ?? t('fund.failedCheck')}
            body={review.errorMessage ?? t('fund.pendingCheck')}
            action={{
              label: review.amountTooSmall ? t('fund.back') : t('fund.recheck'),
              onPress: review.amountTooSmall ? edit : review.retry,
            }}
          />
        ) : null}
        {submit.reviewBlocked && !review.isError ? (
          <Button variant="secondary" onPress={() => void review.refresh()}>
            {t('fund.recheck')}
          </Button>
        ) : null}
        {execution.capability === 'unsupported-wallet' ? (
          <Callout
            tone="neutral"
            title={t('fund.unsupportedTitle')}
            body={t('fund.unsupportedBody')}
          />
        ) : null}
        {submit.submissionError ? (
          <Callout
            tone="alert"
            title={t('fund.failed')}
            body={submit.submissionError}
            action={{
              label: t('fund.recheck'),
              onPress: () => {
                submit.dismissSubmissionError();
                void review.refresh();
              },
            }}
          />
        ) : null}
        <Disclosure
          expanded={details}
          onToggle={() => setDetails((value) => !value)}
          accessibilityLabel={t('fund.technical')}
          header={
            <Text variant="label" className="flex-1">
              {t('fund.technical')}
            </Text>
          }
        >
          <View className="gap-4">
            {review.batches.map((batch) => (
              <ChainBatchReviewCard key={batch.draft.chainId} batch={batch} />
            ))}
          </View>
        </Disclosure>
        <Button variant="secondary" onPress={edit}>
          {t('fund.back')}
        </Button>
      </View>
    </FundSheet>
  );
}
