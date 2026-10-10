import { View } from 'react-native';
import { RuntimeStatusRow } from '@/components/runtime/CapabilityRow';
import { CAPABILITY_STATUS } from '@zapengine/zap-pilot-story/status';
import { hostedRuntimeStatus } from '@/integration/runtimeStatusModel';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';
export function FirstRunStatusRows() {
  const { t } = useContentLanguage();
  return (
    <View>
      <RuntimeStatusRow
        status={CAPABILITY_STATUS['reference-strategy']}
        label={t('firstRun.strategy')}
        body={t('firstRun.strategyBody')}
      />
      <RuntimeStatusRow
        status={hostedRuntimeStatus()}
        label={t('runtime.hosted')}
        body={t('runtime.hostedBody')}
      />
      <RuntimeStatusRow
        status={CAPABILITY_STATUS['wallet-signing']}
        label={t('firstRun.sign')}
        body={t('firstRun.signBody')}
      />
    </View>
  );
}
