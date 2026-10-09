import { Linking, View } from 'react-native';
import { formatUnits } from 'viem';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { ProgressTimelineRow } from '@/components/invest/ProgressTimelineRow';
import { ChainBatchReviewCard } from '@/components/invest/ChainBatchReviewCard';
import { ChainMark } from '@/components/token/ChainMark';
import { queueTone } from '@/integration/investReviewModel';
import {
  HLP_VENUE,
  chainBatchActionSummary,
  chainBatchLabel,
} from '@/integration/investTargetsModel';
import { shouldOfferAgentEnable } from '@/integration/hlpProgressModel';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';
import { useFundFlow } from '@/providers/FundFlowProvider';
import { FundSheet } from './FundSheet';
import type { useFundExecutionController } from './useFundExecutionController';
export function FundProgressStep({
  controller: c,
}: {
  controller: ReturnType<typeof useFundExecutionController>;
}) {
  const { t } = useContentLanguage();
  const fund = useFundFlow();
  const progress = c.reviewedProgress;
  if (!progress) return null;
  const venue = HLP_VENUE;
  const hlpChainKey = 'hyperliquid';
  const finish = () => {
    c.resetHlp();
    c.resetReviewedExecution();
    c.invest.resetDraft();
    fund.close();
  };
  const footer = c.routeComplete ? (
    <Button onPress={finish}>{t('fund.done')}</Button>
  ) : shouldOfferAgentEnable(c.hlpModel) ? (
    <Button
      disabled={c.agent.status === 'checking' || c.agent.status === 'approving'}
      onPress={c.approveAgent}
    >
      {c.agent.status === 'approving'
        ? t('fund.agentSigning')
        : t('fund.agent', { venue })}
    </Button>
  ) : undefined;
  return (
    <FundSheet footer={footer}>
      <View className="gap-4 pb-4">
        {c.routeComplete ? (
          <>
            <Text variant="heading">{t('fund.complete')}</Text>
            <Text variant="body-sm" tone="secondary">
              {t('fund.completeBody')}
            </Text>
          </>
        ) : null}
        <View className="rounded-panel border border-rule bg-well px-4 pt-4">
          {c.reviewedQueue.map((entry, index) => {
            const batch = c.batches[index];
            const rowKey = `${entry.review.groupId}:${index}`;
            return (
              <ProgressTimelineRow
                key={rowKey}
                leadingVisual={
                  batch?.positions[0] ? (
                    <ChainMark
                      chainKey={batch.positions[0].sourceToken.chainKey}
                      size={20}
                    />
                  ) : undefined
                }
                label={
                  batch
                    ? chainBatchLabel(batch)
                    : t('fund.batch', { number: index + 1 })
                }
                detail={
                  batch
                    ? chainBatchActionSummary(batch)
                    : t('fund.batchChain', { chain: entry.review.chainId })
                }
                tone={queueTone({
                  index,
                  currentIndex: c.currentIndex,
                  phase: progress.phase,
                })}
                isLast={index === c.lastBatchIndex && c.rows.length === 0}
              >
                {index === c.currentIndex && progress.transactionHash ? (
                  <Text variant="data">
                    {t('fund.submitted', {
                      hash: progress.transactionHash.slice(0, 12),
                    })}
                  </Text>
                ) : null}
              </ProgressTimelineRow>
            );
          })}
          {c.rows.map((row, index) => (
            <ProgressTimelineRow
              key={row.key}
              leadingVisual={<ChainMark chainKey={hlpChainKey} size={20} />}
              label={t(`fund.${row.key === 'vault' ? 'deposit' : row.key}`, {
                venue,
              })}
              detail={
                row.key === 'bridge'
                  ? t('fund.trackBridge')
                  : row.key === 'arrival'
                    ? c.wizard.hlp.arrivedUsd6 !== null
                      ? t('fund.received', {
                          amount: formatUnits(c.wizard.hlp.arrivedUsd6, 6),
                        })
                      : t('fund.trackArrival')
                    : c.wizard.hlp.status === 'confirming'
                      ? t('fund.confirmDeposit')
                      : t('fund.trackDeposit')
              }
              tone={row.state}
              isLast={index === c.rows.length - 1}
            />
          ))}
        </View>
        {progress.phase === 'checkpoint' && c.nextEntry ? (
          <View className="gap-3">
            <Text variant="label">{t('fund.checkpoint')}</Text>
            {c.nextBatch ? (
              <ChainBatchReviewCard
                batch={{
                  draft: c.nextBatch,
                  plan: c.nextEntry.plan,
                  review: c.nextEntry.review,
                }}
              />
            ) : null}
            {c.checkpointError ? (
              <>
                <Text variant="body-sm" tone="alert" accessibilityRole="alert">
                  {c.checkpointError}
                </Text>
                {c.checkpointNeedsConfirmation ? (
                  <Text variant="caption" tone="secondary">
                    {t('fund.refreshed')}
                  </Text>
                ) : null}
                <Button
                  disabled={c.checkpointPending}
                  onPress={() =>
                    void (c.checkpointNeedsConfirmation
                      ? c.confirmUpdatedNextBatch()
                      : c.advanceToNextBatch())
                  }
                >
                  {c.checkpointNeedsConfirmation
                    ? t('fund.confirmUpdated')
                    : t('fund.retryNext')}
                </Button>
              </>
            ) : (
              <Text variant="caption" tone="muted">
                {c.checkpointPending
                  ? t('fund.sendingNext')
                  : t('fund.checkingNext')}
              </Text>
            )}
          </View>
        ) : null}
        {progress.phase === 'failed' ? (
          <Callout
            tone="alert"
            title={t('fund.failed')}
            body={progress.statusNote ?? t('fund.failedBody')}
            action={{
              label: t('fund.freshReview'),
              onPress: () => c.resetReviewedExecution(),
            }}
          />
        ) : null}
        {c.visibleError ? (
          <Callout
            tone="alert"
            title={t('fund.settlement')}
            body={c.visibleError}
            action={
              c.retryMode === 'hlp-signature' && c.agent.isReady
                ? {
                    label: t('fund.retryDeposit'),
                    onPress: () => {
                      c.retryHlp();
                      c.runGuarded(c.runHlpDeposit);
                    },
                  }
                : c.retryMode === 'tracking'
                  ? { label: t('fund.retryTracking'), onPress: c.retryTracking }
                  : { label: t('common.close'), onPress: fund.close }
            }
          />
        ) : null}
        {c.accountUrl ? (
          <Button
            variant="secondary"
            onPress={() => void Linking.openURL(c.accountUrl!)}
          >
            {t('fund.account', { venue })}
          </Button>
        ) : null}
        {c.wizard.hlp.status === 'confirming' ? (
          <Text variant="caption" tone="muted">
            {t('fund.verifying')}
          </Text>
        ) : null}
      </View>
    </FundSheet>
  );
}
