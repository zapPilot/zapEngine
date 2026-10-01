import { useContentLanguage } from '@/providers/ContentLanguageProvider';
import { DecisionPacketCard } from '@/components/strategy/DecisionPacketCard';
import { MarketSignalsCard } from '@/components/strategy/MarketSignalsCard';
import { PageHeader } from '@/components/ui/PageHeader';
import { ScreenScrollView } from '@/components/ui/ScreenScrollView';
import { useAccount } from '@/integration/useAccount';
import { useMarketSignals } from '@/integration/useMarketSignals';
import { useStrategyDecisionPacket } from '@/integration/useStrategyDecisionPacket';

// Read-only on iOS: the decision and its market evidence, without the backtest
// hooks (they reach app-core barrels) or the invest CTA the iOS bundle excludes.
export function StrategyScreen() {
  const { t } = useContentLanguage();
  const account = useAccount();
  const decision = useStrategyDecisionPacket(account.userId);
  const signals = useMarketSignals();

  return (
    <ScreenScrollView width="dashboard">
      <PageHeader title={t('tabs.strategy')} />
      <DecisionPacketCard packet={decision.data} loading={decision.isLoading} />
      <MarketSignalsCard
        signals={signals.data}
        loading={signals.isLoading}
        highlightedSignalId={decision.data?.trigger.chartSeriesId ?? null}
      />
    </ScreenScrollView>
  );
}
