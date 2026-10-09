import { View } from 'react-native';
import { tokens } from '@zapengine/design-tokens/tokens';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { Badge } from '@/components/ui/Badge';
import { TargetTrackBar } from '@/components/charts/TargetTrackBar';
import { AllocationDial } from '@/components/charts/AllocationDial';
import { targetVsYours, type SleeveAllocation } from '@/integration/todayModel';
import { formatPct } from '@/lib/format';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';
export function TargetVsYoursCard({
  target,
  yours,
  kind,
}: {
  target: SleeveAllocation | null;
  yours: SleeveAllocation | null;
  kind: 'personal' | 'demoWallet' | 'referencePortfolio';
}) {
  const { t } = useContentLanguage();
  const rows = targetVsYours(target, yours).filter(
    (row) => row.id !== 'alt' || (row.target ?? 0) > 0 || (row.yours ?? 0) > 0,
  );
  return (
    <Card padding="md" className="gap-5">
      <View className="flex-row items-center justify-between gap-3">
        <View className="flex-1 gap-1">
          <Text variant="heading">{t('today.fit')}</Text>
          <Badge tone="secondary">{t(`today.${kind}`)}</Badge>
        </View>
        {target ? <AllocationDial allocation={target} /> : null}
      </View>
      <View className="flex-row gap-3">
        <View className="flex-1" />
        <Text className="w-1/4 text-right" variant="label" tone="muted">
          {t('today.yours')}
        </Text>
        <Text className="w-1/4 text-right" variant="label" tone="muted">
          {t('today.target')}
        </Text>
      </View>
      {rows.map((row) => {
        const label = t(`today.sleeve.${row.id}`);
        const targetLabel = row.target === null ? '—' : formatPct(row.target);
        const held = row.yours === null ? '—' : formatPct(row.yours);
        return (
          <View key={row.id} className="gap-2">
            <View className="flex-row items-baseline gap-3">
              <Text className="flex-1" variant="body-sm">
                {label}
              </Text>
              <Text
                className="w-1/4 text-right"
                variant="data"
                tone="secondary"
              >
                {held}
              </Text>
              <Text className="w-1/4 text-right" variant="data">
                {targetLabel}
              </Text>
            </View>
            <TargetTrackBar
              target={row.target}
              yours={row.yours}
              color={tokens.sleeve.night[row.id]}
              accessibilityLabel={t('today.trackA11y', {
                asset: label,
                target: targetLabel,
                held,
              })}
            />
          </View>
        );
      })}
      <Text variant="caption" tone="muted">
        {t('today.plannedBody')}
      </Text>
    </Card>
  );
}
