import { useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { PageHeader } from '@/components/ui/PageHeader';
import { Text } from '@/components/ui/Text';
import { ScreenScrollView } from '@/components/ui/ScreenScrollView';
import { WalletChip } from '@/components/today/WalletChip';
import { RuntimeModelStage } from '@/components/runtime-model/RuntimeModelStage';
import { RuntimePartsMeter } from '@/components/runtime/RuntimePartsMeter';
import { RuntimeStrategySection } from '@/components/runtime/RuntimeStrategySection';
import { RuntimeMachineSection } from '@/components/runtime/RuntimeMachineSection';
import { RuntimeWalletSection } from '@/components/runtime/RuntimeWalletSection';
import { RuntimeYouSection } from '@/components/runtime/RuntimeYouSection';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';
export function RuntimeScreen() {
  const { t } = useContentLanguage();
  const { section } = useLocalSearchParams<{ section?: string }>();
  const scrollRef = useRef<ScrollView>(null);
  const [contentY, setContentY] = useState(0);
  const [walletY, setWalletY] = useState<number | null>(null);
  useEffect(() => {
    if (section === 'wallet' && walletY !== null)
      scrollRef.current?.scrollTo({ y: contentY + walletY, animated: false });
  }, [section, walletY, contentY]);
  return (
    <ScreenScrollView width="reading" scrollRef={scrollRef}>
      <PageHeader title={t('tabs.runtime')} actions={<WalletChip />} />
      <View
        className="gap-8 py-5"
        onLayout={(event) => setContentY(event.nativeEvent.layout.y)}
      >
        <Text variant="body-lg" tone="secondary">
          {t('runtime.subtitle')}
        </Text>
        <RuntimeModelStage variant="runtime" />
        <RuntimePartsMeter />
        <RuntimeStrategySection />
        <RuntimeMachineSection />
        <View onLayout={(event) => setWalletY(event.nativeEvent.layout.y)}>
          <RuntimeWalletSection />
        </View>
        <RuntimeYouSection />
      </View>
    </ScreenScrollView>
  );
}
