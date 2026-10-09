import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';
import { markFirstRunSeen } from '@/storage/firstRunStorage';
export function FirstRunActionsFrame({
  children,
  error,
  onExplore,
}: {
  children: ReactNode;
  error: string | null;
  onExplore: () => void;
}) {
  const { t } = useContentLanguage();
  return (
    <View className="gap-3">
      {children}
      <Button
        variant="ghost"
        onPress={() => void markFirstRunSeen().then(onExplore)}
      >
        {t('firstRun.explore')}
      </Button>
      {error ? (
        <Text variant="caption" tone="alert" accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </View>
  );
}
