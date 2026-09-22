import { tokens } from '@zapengine/design-tokens/tokens';
import { useRouter } from 'expo-router';
import { ArrowDown, ArrowUp, Scale } from 'lucide-react-native';
import { View } from 'react-native';

import { HomeActionButton } from '@/components/home/HomeActionButton';
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
      <HomeActionButton
        primary={!isStrategyActionRequired}
        label={t('home.invest')}
        onPress={() => router.push('/invest/amount')}
        icon={
          <ArrowDown size={17} color={tokens.color.accent} strokeWidth={1.8} />
        }
      />
      <HomeActionButton
        accessibilityLabel={
          isStrategyActionRequired
            ? t('home.rebalanceActionRequiredA11y')
            : undefined
        }
        primary={isStrategyActionRequired}
        showIndicator={isStrategyActionRequired}
        label={t('home.rebalance')}
        onPress={() => router.push(STRATEGY_DECISION_FOCUS_HREF)}
        icon={<Scale size={17} color={tokens.color.accent} strokeWidth={1.8} />}
      />
      <HomeActionButton
        label={t('home.send')}
        onPress={() => router.push('/send')}
        icon={
          <ArrowUp size={17} color={tokens.color.accent} strokeWidth={1.8} />
        }
      />
    </View>
  );
}
