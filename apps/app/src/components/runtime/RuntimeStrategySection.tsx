import { Linking, View } from 'react-native';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { RULE_LABEL_KEYS } from '@/integration/decisionTraceModel';
import { STRATEGY_PARTS } from '@/integration/runtimeStatusModel';
import { useReferenceStrategy } from '@/integration/useReferenceStrategy';
import { formatOr, formatSignedPct } from '@/lib/format';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';
import { CapabilityRow } from './CapabilityRow';
export function RuntimeStrategySection() {
  const reference = useReferenceStrategy();
  const { t } = useContentLanguage();
  const stats = reference.data?.stats;
  const metrics = [
    { key: 'rulesRoi', value: stats?.rulesRoi },
    { key: 'dcaRoi', value: stats?.dcaRoi },
    { key: 'maxDd', value: stats?.maxDrawdown },
  ] as const;
  return (
    <View className="gap-4">
      <Text variant="heading">{t('runtime.strategy')}</Text>
      <Card padding="md" className="gap-4">
        <Text variant="heading">{t('runtime.reference')}</Text>
        {reference.isError ? (
          <Callout
            tone="alert"
            body={t('strategy.backtestUnavailable')}
            action={{
              label: t('common.retry'),
              onPress: () => void reference.refetch(),
            }}
          />
        ) : null}
        <View className="flex-row flex-wrap gap-3">
          {reference.data?.rules.map((rule) => (
            <View key={rule.name} className="min-w-0 w-full flex-row gap-2">
              <Text variant="data">{rule.number}</Text>
              <Text variant="body-sm" tone="secondary">
                {RULE_LABEL_KEYS[rule.name]
                  ? t(RULE_LABEL_KEYS[rule.name]!)
                  : rule.name}
              </Text>
            </View>
          ))}
        </View>
        <View className="flex-row gap-3 border-t border-rule pt-3">
          {metrics.map((metric) => (
            <View key={metric.key} className="flex-1 gap-1">
              <Text variant="caption" tone="muted">
                {t(`runtime.${metric.key}`)}
              </Text>
              <Text variant="data">
                {formatOr(metric.value ?? null, formatSignedPct)}
              </Text>
            </View>
          ))}
        </View>
        <Text variant="caption" tone="muted">
          {t('runtime.hypothetical')}
        </Text>
        <Button
          variant="secondary"
          onPress={() =>
            void Linking.openURL('https://zap-pilot.org/track-record/')
          }
        >
          {t('runtime.replay')}
        </Button>
      </Card>
      {STRATEGY_PARTS.map((id) => (
        <CapabilityRow key={id} id={id} />
      ))}
    </View>
  );
}
