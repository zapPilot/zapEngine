import { View } from 'react-native';
import { Text } from '@/components/ui/Text';
import { RuntimeStatusRow, CapabilityRow } from './CapabilityRow';
import {
  MACHINE_PARTS,
  hostedRuntimeStatus,
} from '@/integration/runtimeStatusModel';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';
import { RuntimeAlertsLink } from './RuntimeAlertsLink';
export function RuntimeMachineSection() {
  const { t } = useContentLanguage();
  return (
    <View>
      <Text variant="heading">{t('runtime.machine')}</Text>
      <RuntimeStatusRow
        status={hostedRuntimeStatus()}
        label={t('runtime.hosted')}
        body={t('runtime.hostedBody')}
      />
      {MACHINE_PARTS.map((id) => (
        <CapabilityRow key={id} id={id} />
      ))}
      <RuntimeAlertsLink />
    </View>
  );
}
