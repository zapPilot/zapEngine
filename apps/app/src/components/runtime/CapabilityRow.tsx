import { View } from 'react-native';
import {
  CAPABILITY_STATUS,
  type CapabilityStatus,
} from '@zapengine/zap-pilot-story/status';
import type { RuntimeRowId } from '@/integration/runtimeStatusModel';
import { Text } from '@/components/ui/Text';
import { StatusGlyph } from '@/components/ui/StatusGlyph';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';
export function CapabilityRow({ id }: { id: RuntimeRowId }) {
  const { t } = useContentLanguage();
  return (
    <RuntimeStatusRow
      status={CAPABILITY_STATUS[id]}
      label={t(`runtime.capability.${id}`)}
      body={t(`runtime.detail.${id}`)}
    />
  );
}
export function RuntimeStatusRow({
  status,
  label,
  body,
}: {
  status: CapabilityStatus;
  label: string;
  body: string;
}) {
  const { t } = useContentLanguage();
  return (
    <View className="flex-row items-start gap-3 border-t border-rule py-4">
      <StatusGlyph status={status} />
      <View className="min-w-0 flex-1 gap-1">
        <Text variant="label">{label}</Text>
        <Text variant="caption" tone="muted">
          {t(`runtime.status.${status}`)}
        </Text>
        <Text variant="body-sm" tone="secondary">
          {body}
        </Text>
      </View>
    </View>
  );
}
