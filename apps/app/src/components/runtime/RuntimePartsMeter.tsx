import { View } from 'react-native';
import { CAPABILITY_STATUSES } from '@zapengine/zap-pilot-story/status';
import { runtimeStatusModel } from '@/integration/runtimeStatusModel';
import { SegmentRail } from '@/components/ui/SegmentRail';
import { Text } from '@/components/ui/Text';
import { StatusGlyph } from '@/components/ui/StatusGlyph';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';
const PARTS = runtimeStatusModel();
export function RuntimePartsMeter() {
  const { t } = useContentLanguage();
  const label = t('runtime.partsLive', {
    live: PARTS.counts.live,
    total: PARTS.total,
  });
  return (
    <View className="gap-3 py-5">
      <Text variant="heading">{label}</Text>
      <SegmentRail
        statuses={PARTS.parts.map((p) => p.status)}
        accessibilityLabel={label}
      />
      <View className="flex-row flex-wrap gap-3">
        {CAPABILITY_STATUSES.map((status) => (
          <View key={status} className="flex-row items-center gap-2">
            <StatusGlyph status={status} />
            <Text variant="data" tone="secondary">
              {PARTS.counts[status]} {t(`runtime.status.${status}`)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
