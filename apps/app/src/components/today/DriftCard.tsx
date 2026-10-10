import { View } from 'react-native';
import { tokens } from '@zapengine/design-tokens/tokens';
import type { DailySuggestionResponse } from '@zapengine/app-core/types/strategy';
import { CAPABILITY_STATUS } from '@zapengine/zap-pilot-story/status';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { Badge } from '@/components/ui/Badge';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import { AllocationBar } from '@/components/charts/AllocationBar';
import {
  TARGET_SLEEVES,
  driftRows,
  type DriftKind,
  type SleeveAllocation,
} from '@/integration/todayModel';
import { formatSignedPoints, formatSignedUsd } from '@/lib/format';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';
import { TransferLines } from './TransferLines';
function SleeveBar({
  label,
  allocation,
}: {
  label: string;
  allocation: SleeveAllocation;
}) {
  return (
    <View className="flex-row items-center gap-3">
      <Text className="w-14" variant="label" tone="muted">
        {label}
      </Text>
      <AllocationBar
        className="flex-1"
        height={12}
        segments={TARGET_SLEEVES.filter((id) => allocation[id] > 0).map(
          (id) => ({ color: tokens.sleeve.night[id], value: allocation[id] }),
        )}
      />
    </View>
  );
}
/** How far the holdings sit from today's target, and what the rule would move. */
export function DriftCard({
  target,
  yours,
  totalUsd,
  kind,
  transfers,
  loading,
}: {
  target: SleeveAllocation | null;
  yours: SleeveAllocation | null;
  totalUsd: number | null;
  kind: DriftKind;
  transfers: DailySuggestionResponse['action']['transfers'];
  loading: boolean;
}) {
  const { t } = useContentLanguage();
  const { rows, aligned } = driftRows(target, yours, totalUsd);
  const status = CAPABILITY_STATUS['rebalance-plans'];
  return (
    <Card padding="md" className="gap-5">
      <View className="flex-row items-center justify-between gap-3">
        <Text variant="heading">{t('today.drift')}</Text>
        <Badge tone="secondary">{t(`today.${kind}`)}</Badge>
      </View>
      {target === null || yours === null ? (
        loading ? (
          <SkeletonBlock className="h-40 rounded-panel" />
        ) : null
      ) : (
        <>
          <View className="gap-3">
            <SleeveBar label={t('today.yours')} allocation={yours} />
            <SleeveBar label={t('today.target')} allocation={target} />
          </View>
          {aligned ? (
            <Text variant="body-sm" tone="secondary">
              {t('today.aligned')}
            </Text>
          ) : (
            <View>
              {rows.map((row) => {
                const amount =
                  row.usd === null
                    ? '—'
                    : t('today.gapUsd', {
                        amount: formatSignedUsd(row.usd, 0),
                      });
                return (
                  <View
                    key={row.id}
                    className="flex-row items-center gap-3 border-t border-rule py-3"
                  >
                    <View
                      className="h-2.5 w-2.5 rounded-tag"
                      style={{ backgroundColor: tokens.sleeve.night[row.id] }}
                    />
                    <Text className="flex-1" variant="body-sm">
                      {t(`today.sleeve.${row.id}`)}
                    </Text>
                    <Text variant="data">
                      {t('today.gapPts', { gap: formatSignedPoints(row.gap) })}
                    </Text>
                    <Text
                      className="w-24 text-right"
                      variant="data"
                      tone="muted"
                    >
                      {amount}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
        </>
      )}
      {transfers.length > 0 ? (
        <Card variant="pending" padding="md" className="gap-2">
          <View className="flex-row items-center justify-between gap-3">
            <Text variant="heading">{t('today.moves')}</Text>
            <Badge status={status}>{t(`status.${status}`)}</Badge>
          </View>
          <TransferLines transfers={transfers} />
        </Card>
      ) : null}
      <View className="gap-1">
        <Text variant="caption" tone="muted">
          {t('today.gapLegend')}
        </Text>
        <Text variant="caption" tone="muted">
          {t('today.plannedBody')}
        </Text>
      </View>
    </Card>
  );
}
