import { useState } from 'react';
import { Linking, View } from 'react-native';
import { humanizeSlug } from '@zapengine/types/shared';
import { deriveRuleTrace } from '@zapengine/app-core/services/suggestion';
import type { DailySuggestionResponse } from '@zapengine/app-core/types/strategy';
import { CAPABILITY_STATUS } from '@zapengine/zap-pilot-story/status';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Disclosure } from '@/components/ui/Disclosure';
import { DistanceBar } from '@/components/charts/DistanceBar';
import { TargetVsYoursCard } from '@/components/today/TargetVsYoursCard';
import { MarketSignalsCard } from '@/components/strategy/MarketSignalsCard';
import {
  defaultRuleTrace,
  observeRows,
} from '@/integration/decisionTraceModel';
import {
  ruleNameFromReason,
  ruleNumberFromReason,
} from '@/integration/referenceStrategyModel';
import type { MarketSignals } from '@/integration/marketSignalsModel';
import { formatOr, formatSignedPct } from '@/lib/format';
import { useFundFlow } from '@/providers/FundFlowProvider';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';
export function DecisionTrace({
  suggestion,
  rules,
  signals,
  signalsLoading,
  source,
}: {
  suggestion: DailySuggestionResponse | null;
  rules: readonly { name: string; number: number }[];
  signals: MarketSignals | null;
  signalsLoading: boolean;
  source: 'personal' | 'reference';
}) {
  const { t } = useContentLanguage();
  const fund = useFundFlow();
  const [expanded, setExpanded] = useState(false);
  const rows = defaultRuleTrace(
    rules,
    suggestion ? deriveRuleTrace(suggestion) : [],
  );
  const observe = observeRows(signals);
  const showResearch =
    suggestion !== null &&
    ruleNameFromReason(suggestion.action.reason_code) === 'cross_down_exit' &&
    ruleNumberFromReason(suggestion.action.reason_code, rules) === 1;
  const researchUrl = 'https://zap-pilot.org/track-record/calculator';
  return (
    <View className="gap-6">
      <Card padding="md" className="gap-4">
        <Text variant="heading">{t('today.step.observe')}</Text>
        {observe.map((signal) => {
          const asset =
            signal.id === 'eth_btc'
              ? [t('today.sleeve.eth'), t('today.sleeve.btc')].join('/')
              : t(`today.sleeve.${signal.id}`);
          const distance = formatOr(
            signal.distance === null ? null : signal.distance * 100,
            formatSignedPct,
          );
          return (
            <View key={signal.id} className="gap-2">
              <View className="flex-row justify-between">
                <Text variant="body-sm">{asset}</Text>
                <Text variant="data">{distance}</Text>
              </View>
              <DistanceBar
                distance={signal.distance}
                previous={signal.previousDistance}
                accessibilityLabel={t('decision.distanceA11y', {
                  asset,
                  distance,
                })}
              />
            </View>
          );
        })}
        <Disclosure
          expanded={expanded}
          onToggle={() => setExpanded((value) => !value)}
          accessibilityLabel={t('decision.observeDetails')}
          header={<Text variant="label">{t('decision.observeDetails')}</Text>}
        >
          <MarketSignalsCard
            signals={signals}
            loading={signalsLoading}
            highlightedSignalId={null}
          />
        </Disclosure>
      </Card>
      <Card padding="md" className="gap-4">
        <Text variant="heading">{t('today.step.evaluate')}</Text>
        {rows.map((row) => {
          const name = row.labelKey
            ? t(row.labelKey)
            : humanizeSlug(row.name, {}, row.name);
          return (
            <View key={row.name} className="gap-1 border-b border-rule pb-3">
              <Text variant="body-sm">
                {t('today.ruleKicker', { number: row.number, name })}
              </Text>
              <Text
                variant="label"
                tone={row.trace?.status === 'fired' ? 'default' : 'muted'}
              >
                {t(`decision.ruleStatus.${row.trace?.status ?? 'unavailable'}`)}
              </Text>
            </View>
          );
        })}
      </Card>
      <TargetVsYoursCard
        target={suggestion?.context.target.allocation ?? null}
        yours={suggestion?.context.portfolio.asset_allocation ?? null}
        kind={source === 'personal' ? 'personal' : 'referencePortfolio'}
      />
      <Card variant="pending" padding="md" className="gap-3">
        <Badge status={CAPABILITY_STATUS['rebalance-plans']}>
          {t(`status.${CAPABILITY_STATUS['rebalance-plans']}`)}
        </Badge>
        <Text variant="heading">{t('today.step.plan')}</Text>
        <Text variant="caption" tone="secondary">
          {t('today.plannedBody')}
        </Text>
      </Card>
      <Card padding="md" className="gap-3">
        <Text variant="heading">{t('today.step.check')}</Text>
        <Text variant="body-sm">
          {fund.signRequest ? t('today.pending') : t('today.idle')}
        </Text>
        <Text variant="caption" tone="muted">
          {t('decision.readOnly')}
        </Text>
      </Card>
      <Card padding="md" className="gap-3">
        <Text variant="heading">{t('today.step.sign')}</Text>
        <Text variant="body-sm">
          {fund.signRequest ? t('today.signWaiting') : t('today.nothingToSign')}
        </Text>
        {fund.available && fund.signRequest ? (
          <Button onPress={() => fund.open()}>{t('dock.open')}</Button>
        ) : null}
      </Card>
      {showResearch ? (
        <Card padding="md" className="gap-3">
          <Badge status={CAPABILITY_STATUS['verifiable-rule']}>
            {t('decision.research')}
          </Badge>
          <Text variant="heading">{t('decision.recompute')}</Text>
          <Text variant="caption" tone="secondary">
            {t('decision.recomputeBody')}
          </Text>
          <Button
            variant="secondary"
            onPress={() => void Linking.openURL(researchUrl)}
          >
            {t('decision.recompute')}
          </Button>
        </Card>
      ) : null}
    </View>
  );
}
