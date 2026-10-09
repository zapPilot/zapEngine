import { Platform, View } from 'react-native';
import { PageHeader } from '@/components/ui/PageHeader';
import { ScreenScrollView } from '@/components/ui/ScreenScrollView';
import { WalletChip } from '@/components/today/WalletChip';
import { VerdictSection } from '@/components/today/VerdictSection';
import { DecisionStepsGrid } from '@/components/today/DecisionStepsGrid';
import { TargetVsYoursCard } from '@/components/today/TargetVsYoursCard';
import { RebalancePlanCard } from '@/components/today/RebalancePlanCard';
import { NetWorthCard } from '@/components/today/NetWorthCard';
import { DecisionLog } from '@/components/today/DecisionLog';
import { TodaysBriefCard } from '@/components/today/TodaysBriefCard';
import { useTodayView } from '@/components/today/useTodayView';
import { DEMO } from '@/data/demo';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';
export function TodayScreen() {
  const { t } = useContentLanguage();
  const { portfolio, account, decision, fund, rules } = useTodayView();
  const demo = Platform.OS !== 'ios' && account.isDemo;
  const yours = demo
    ? DEMO.home.sleeveAllocation
    : (decision.suggestion?.context.portfolio.asset_allocation ?? null);
  return (
    <ScreenScrollView width="dashboard">
      <PageHeader title={t('tabs.today')} brand actions={<WalletChip />} />
      <View className="gap-6 pb-6">
        <VerdictSection
          suggestion={decision.suggestion}
          source={decision.source}
          rules={rules}
          loading={decision.isLoading}
          error={decision.isError}
          retry={decision.retry}
        />
        <DecisionStepsGrid
          suggestion={decision.suggestion}
          rules={rules}
          signRequest={fund.signRequest}
        />
        <TargetVsYoursCard
          target={decision.suggestion?.context.target.allocation ?? null}
          yours={yours}
          kind={
            demo
              ? 'demoWallet'
              : decision.source === 'personal'
                ? 'personal'
                : 'referencePortfolio'
          }
        />
        <RebalancePlanCard suggestion={decision.suggestion} />
        <NetWorthCard portfolio={portfolio} />
        <DecisionLog
          response={decision.reference.data?.response ?? null}
          rules={rules}
        />
        <TodaysBriefCard />
      </View>
    </ScreenScrollView>
  );
}
