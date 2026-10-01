import { useRouter } from 'expo-router';
import { ArrowDown, ArrowUp, Scale } from 'lucide-react-native';
import { View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { STRATEGY_DECISION_FOCUS_HREF } from '@/integration/strategyFocus';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';

export function HomeActionRow({
  isStrategyActionRequired,
}: {
  isStrategyActionRequired: boolean;
}) {
  const router = useRouter();
  const { t } = useContentLanguage();
  return (
    <View className="mt-5 flex-row gap-3 px-5">
      <Button
        className="flex-1"
        variant={isStrategyActionRequired ? 'secondary' : 'primary'}
        leadingIcon={ArrowDown}
        onPress={() => router.push('/invest/amount')}
      >
        {t('home.invest')}
      </Button>
      <Button
        className="flex-1"
        variant={isStrategyActionRequired ? 'tonal' : 'secondary'}
        leadingIcon={Scale}
        showIndicator={isStrategyActionRequired}
        {...(isStrategyActionRequired
          ? { accessibilityLabel: t('home.rebalanceActionRequiredA11y') }
          : {})}
        onPress={() => router.push(STRATEGY_DECISION_FOCUS_HREF)}
      >
        {t('home.rebalance')}
      </Button>
      <Button
        className="flex-1"
        variant="secondary"
        leadingIcon={ArrowUp}
        onPress={() => router.push('/send')}
      >
        {t('home.send')}
      </Button>
    </View>
  );
}
