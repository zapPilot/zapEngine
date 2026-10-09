import { View } from 'react-native';
import { humanizeSlug } from '@zapengine/types/shared';
import type { BacktestResponse } from '@zapengine/app-core/types/backtesting';
import { Text } from '@/components/ui/Text';
import { TimelineItem } from '@/components/ui/TimelineItem';
import { StatusGlyph } from '@/components/ui/StatusGlyph';
import { decisionLogEntries } from '@/integration/decisionLogModel';
import { RULE_LABEL_KEYS } from '@/integration/decisionTraceModel';
import { formatUsd } from '@/lib/format';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';
export function DecisionLog({
  response,
  rules,
}: {
  response: BacktestResponse | null;
  rules: readonly { name: string; number: number }[];
}) {
  const { t } = useContentLanguage();
  const rows = response ? decisionLogEntries(response, rules).slice(0, 8) : [];
  return (
    <View className="gap-4">
      <View className="gap-1">
        <Text variant="heading">{t('today.log')}</Text>
        <Text variant="label" tone="muted">
          {t('today.reference')}
        </Text>
      </View>
      {rows.map((row, index) => {
        const key =
          row.kind === 'held'
            ? undefined
            : row.ruleName
              ? RULE_LABEL_KEYS[row.ruleName]
              : undefined;
        const name =
          row.kind === 'held'
            ? t('today.held')
            : key
              ? t(key)
              : row.ruleName
                ? humanizeSlug(row.ruleName, {}, row.ruleName)
                : t('today.targetUpdated');
        const title =
          row.kind === 'rule' && row.ruleNumber !== null
            ? t('today.ruleKicker', { number: row.ruleNumber, name })
            : name;
        const date =
          row.kind === 'rule'
            ? row.date
            : row.start === row.end
              ? row.start
              : [row.start, row.end].join(' – ');
        return (
          <TimelineItem
            key={index}
            marker={
              <StatusGlyph status={row.kind === 'rule' ? 'live' : 'planned'} />
            }
            eyebrow={date}
            title={title}
          >
            {row.kind === 'rule'
              ? row.transfers.map((transfer, i) => {
                  const from =
                    transfer.from_bucket === 'spot'
                      ? t('today.sleeve.btc')
                      : t(`today.sleeve.${transfer.from_bucket}`);
                  const to =
                    transfer.to_bucket === 'spot'
                      ? t('today.sleeve.btc')
                      : t(`today.sleeve.${transfer.to_bucket}`);
                  return (
                    <Text key={i} variant="caption" tone="secondary">
                      {t('today.transfer', {
                        from,
                        to,
                        amount: formatUsd(transfer.amount_usd),
                      })}
                    </Text>
                  );
                })
              : null}
          </TimelineItem>
        );
      })}
    </View>
  );
}
