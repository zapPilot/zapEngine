import { View } from 'react-native';
import { humanizeSlug } from '@zapengine/types/shared';
import type { BacktestResponse } from '@zapengine/app-core/types/backtesting';
import { Text } from '@/components/ui/Text';
import { TimelineItem } from '@/components/ui/TimelineItem';
import { StatusGlyph } from '@/components/ui/StatusGlyph';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';
import { decisionRhythm } from '@/integration/decisionLogModel';
import { RULE_LABEL_KEYS } from '@/integration/decisionTraceModel';
import { formatSnapshotDate } from '@/lib/portfolioDates';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';
import { TransferLines } from './TransferLines';
export function DecisionRhythm({
  response,
  rules,
  loading,
}: {
  response: BacktestResponse | null;
  rules: readonly { name: string; number: number }[];
  loading: boolean;
}) {
  const { t, languageCode } = useContentLanguage();
  const rhythm = response ? decisionRhythm(response, rules) : null;
  const days = rhythm?.days ?? [];
  const known = days.filter((day) => day.fired !== null).length;
  const fired = days.filter((day) => day.fired === true).length;
  const first = days.at(0);
  const last = days.at(-1);
  return (
    <View className="gap-5">
      <View className="gap-1">
        <Text variant="heading">{t('today.rhythm')}</Text>
        <Text variant="label" tone="muted">
          {t('today.reference')}
        </Text>
      </View>
      {loading && rhythm === null ? (
        <SkeletonBlock className="h-24 rounded-panel" />
      ) : null}
      {first && last ? (
        <View className="gap-2">
          <View
            accessible
            accessibilityRole="image"
            accessibilityLabel={t('today.rhythmA11y', { days: known, fired })}
            className="h-8 flex-row gap-1"
          >
            {days.map((day) => (
              <View
                key={day.date}
                className={cn(
                  'flex-1 rounded-tag',
                  day.fired === true
                    ? 'bg-ink'
                    : day.fired === false
                      ? 'bg-rule'
                      : 'border border-rule',
                )}
              />
            ))}
          </View>
          <View className="flex-row justify-between">
            <Text variant="label" tone="muted">
              {formatSnapshotDate(first.date, languageCode)}
            </Text>
            <Text variant="label" tone="muted">
              {formatSnapshotDate(last.date, languageCode)}
            </Text>
          </View>
          <View className="flex-row gap-5">
            <View className="flex-row items-center gap-2">
              <View className="h-2.5 w-2.5 rounded-tag bg-ink" />
              <Text variant="caption" tone="secondary">
                {[t('decision.ruleStatus.fired'), fired].join(' ')}
              </Text>
            </View>
            <View className="flex-row items-center gap-2">
              <View className="h-2.5 w-2.5 rounded-tag bg-rule" />
              <Text variant="caption" tone="secondary">
                {[t('today.held'), known - fired].join(' ')}
              </Text>
            </View>
          </View>
        </View>
      ) : null}
      {rhythm && rhythm.moves.length === 0 ? (
        <Text variant="body-sm" tone="secondary">
          {t('today.noMoves', { days: days.length })}
        </Text>
      ) : null}
      <View>
        {(rhythm?.moves ?? []).map((move) => {
          const key = move.ruleName
            ? RULE_LABEL_KEYS[move.ruleName]
            : undefined;
          const name = key
            ? t(key)
            : move.ruleName
              ? humanizeSlug(move.ruleName, {}, move.ruleName)
              : t('today.targetUpdated');
          return (
            <TimelineItem
              key={move.date}
              marker={<StatusGlyph status="live" />}
              eyebrow={move.date}
              title={
                move.ruleNumber !== null
                  ? t('today.ruleKicker', { number: move.ruleNumber, name })
                  : name
              }
            >
              <TransferLines transfers={move.transfers} />
            </TimelineItem>
          );
        })}
      </View>
    </View>
  );
}
