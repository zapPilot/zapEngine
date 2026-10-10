import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Text } from '@/components/ui/Text';
import { PageHeader } from '@/components/ui/PageHeader';
import { ScreenScrollView } from '@/components/ui/ScreenScrollView';
import { ShareDecisionButton } from '@/components/decision/ShareDecisionButton';
import { DecisionTrace } from '@/components/decision/DecisionTrace';
import { DecisionStepsGrid } from '@/components/today/DecisionStepsGrid';
import { useTodayView } from '@/components/today/useTodayView';
import { useMarketSignals } from '@/integration/useMarketSignals';
import { APP_ROUTES } from '@/integration/navigationModel';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';
export function DecisionScreen() {
  const { t } = useContentLanguage();
  const router = useRouter();
  const { decision, fund, rules } = useTodayView();
  const signals = useMarketSignals();
  return (
    <ScreenScrollView width="dashboard">
      <PageHeader
        title={t('today.openDecision')}
        mode="stack"
        onBack={() =>
          router.canGoBack() ? router.back() : router.replace(APP_ROUTES.today)
        }
        backLabel={t('common.back')}
        actions={<ShareDecisionButton />}
      />
      <View className="gap-6 pb-6">
        <Text variant="label" tone="muted">
          {t(`today.${decision.source}`)}
        </Text>
        <Text variant="headline" heading={2}>
          {t('decision.title')}
        </Text>
        <DecisionStepsGrid
          suggestion={decision.suggestion}
          rules={rules}
          signRequest={fund.signRequest}
        />
        <DecisionTrace
          suggestion={decision.suggestion}
          rules={rules}
          signals={signals.data}
          source={decision.source}
          signalsLoading={signals.isLoading}
        />
      </View>
    </ScreenScrollView>
  );
}
