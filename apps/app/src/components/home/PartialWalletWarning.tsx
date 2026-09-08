import { Text, View } from 'react-native';

import { Tap } from '@/components/ui/Tap';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';

export function PartialWalletWarning({ onRetry }: { onRetry: () => void }) {
  const { t } = useContentLanguage();

  return (
    <View className="mb-2 flex-row items-center gap-2 rounded-xl bg-[rgba(239,146,146,.07)] px-3 py-2.5">
      <Text className="min-w-0 flex-1 text-[11px] leading-[16px] text-[#ef9292]">
        {t('home.assetsPartialBody')}
      </Text>
      <Tap
        accessibilityLabel={t('home.assetsRetryA11y')}
        accessibilityRole="button"
        className="min-h-9 justify-center px-1"
        hitSlop={8}
        onPress={onRetry}
      >
        <Text className="font-sans-semibold text-[10.5px] text-accent">
          {t('common.retry')}
        </Text>
      </Tap>
    </View>
  );
}
