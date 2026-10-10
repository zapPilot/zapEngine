import { Platform, View } from 'react-native';
import { PageHeader } from '@/components/ui/PageHeader';
import { Columns } from '@/components/ui/Columns';
import { ScreenScrollView } from '@/components/ui/ScreenScrollView';
import { WalletChip } from '@/components/today/WalletChip';
import { VerdictSection } from '@/components/today/VerdictSection';
import { DecisionPipeline } from '@/components/today/DecisionPipeline';
import { DriftCard } from '@/components/today/DriftCard';
import { TodayMoneyStrip } from '@/components/today/TodayMoneyStrip';
import { DecisionRhythm } from '@/components/today/DecisionRhythm';
import { useTodayView } from '@/components/today/useTodayView';
import { driftSubject, todaySteps } from '@/integration/todayModel';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';
export function TodayScreen() {
  const { t } = useContentLanguage();
  const { portfolio, account, decision, fund, rules } = useTodayView();
  const demo = Platform.OS !== 'ios' && account.isDemo;
  const { suggestion } = decision;
  const drift = driftSubject({ demo, source: decision.source, suggestion });
  return (
    <ScreenScrollView width="dashboard">
      <PageHeader title={t('tabs.today')} brand actions={<WalletChip />} />
      <View className="gap-6 pb-6 pt-4">
        <TodayMoneyStrip portfolio={portfolio} />
        <Columns>
          <View key="decision" className="gap-4">
            <VerdictSection
              suggestion={suggestion}
              source={decision.source}
              rules={rules}
              loading={decision.isLoading}
              error={decision.isError}
              retry={decision.retry}
            />
            <DecisionPipeline
              steps={todaySteps(suggestion, rules, fund.signRequest)}
            />
          </View>
          <DriftCard
            key="drift"
            target={suggestion?.context.target.allocation ?? null}
            yours={drift.yours}
            totalUsd={drift.totalUsd}
            kind={drift.kind}
            transfers={suggestion?.action.transfers ?? []}
            loading={decision.isLoading}
          />
        </Columns>
        <DecisionRhythm
          response={decision.reference.data?.response ?? null}
          rules={rules}
          loading={decision.reference.isLoading}
        />
      </View>
    </ScreenScrollView>
  );
}
