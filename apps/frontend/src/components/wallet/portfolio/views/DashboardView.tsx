import type { WalletPortfolioDataWithDirection } from '@/adapters/walletPortfolioDataAdapter';
import { GhostModeOverlay } from '@/components/layout/overlays/GhostModeOverlay';
import { SectionWrapper } from '@/components/shared/SectionWrapper';
import {
  BalanceCard,
  PortfolioComposition,
} from '@/components/wallet/portfolio/components/shared';
import { StrategyCard } from '@/components/wallet/portfolio/components/strategy';
import {
  BalanceCardSkeleton,
  PortfolioCompositionSkeleton,
} from '@/components/wallet/portfolio/views/DashboardSkeleton';
import type { Regime } from '@/components/wallet/regime/regimeData';
import { useAppSearchParams } from '@/lib/routing';
import type { ModalType } from '@/types/portfolio';
import type { DashboardSections } from '@/types/portfolio-progressive';

/** Layout styling constants */
const STYLES = {
  container: 'animate-in fade-in duration-300 space-y-8', // Added space-y-8 for spacing
  heroGrid: 'grid grid-cols-1 md:grid-cols-2 gap-6',
} as const;

interface DashboardViewProps {
  /** Unified data for components (backward compatible) */
  data: WalletPortfolioDataWithDirection;
  /** Section states for progressive loading */
  sections: DashboardSections;
  currentRegime: Regime | undefined;
  isEmptyState: boolean;
  /** Whether user is viewing their own bundle (enables wallet actions) */
  isOwnBundle?: boolean;
  isLoading?: boolean;
  onOpenModal: (type: ModalType) => void;
  /** User ID for fetching detailed borrowing positions */
  userId?: string | undefined;
}

export function DashboardView({
  data,
  sections,
  currentRegime,
  isEmptyState,
  isOwnBundle = true,
  onOpenModal,
  userId,
}: DashboardViewProps) {
  const searchParams = useAppSearchParams();
  const urlUserId = searchParams.get('userId');

  // Only enable ghost mode on root path (no userId param)
  // Bundle URLs (/bundle?userId=xxx) are public - anyone can view without connecting wallet
  const shouldShowGhostMode = !urlUserId;

  const balanceCard = (
    <BalanceCard
      balance={data.balance}
      isEmptyState={isEmptyState}
      isOwnBundle={isOwnBundle}
      isLoading={false}
      onOpenModal={onOpenModal}
      lastUpdated={data.lastUpdated}
      riskMetrics={data.riskMetrics}
      borrowingSummary={data.borrowingSummary}
      userId={userId}
    />
  );

  const composition = (targetAllocation?: {
    crypto: number;
    stable: number;
  }) => (
    <PortfolioComposition
      data={data}
      currentRegime={currentRegime}
      targetAllocation={targetAllocation}
      isEmptyState={isEmptyState}
      isOwnBundle={isOwnBundle}
      isLoading={false}
      onRebalance={() => onOpenModal('rebalance')}
    />
  );

  const renderBalanceSection = () => {
    if (isEmptyState && shouldShowGhostMode) {
      return <GhostModeOverlay enabled={true}>{balanceCard}</GhostModeOverlay>;
    }

    if (isEmptyState) {
      return balanceCard;
    }

    return (
      <SectionWrapper
        state={sections.balance}
        skeleton={<BalanceCardSkeleton />}
      >
        {() => balanceCard}
      </SectionWrapper>
    );
  };

  const renderCompositionSection = () => {
    if (isEmptyState && shouldShowGhostMode) {
      return (
        <GhostModeOverlay enabled={true} showCTA={false}>
          {composition(data.targetAllocation)}
        </GhostModeOverlay>
      );
    }

    if (isEmptyState) {
      return composition(data.targetAllocation);
    }

    return (
      <SectionWrapper
        state={sections.composition}
        skeleton={<PortfolioCompositionSkeleton />}
      >
        {() => composition(sections.composition.data?.targetAllocation)}
      </SectionWrapper>
    );
  };

  return (
    <div data-testid="dashboard-content" className={STYLES.container}>
      {/* Hero Section: Balance + Expandable Strategy Card */}
      <div className={STYLES.heroGrid}>
        {/* Balance Card - Ghost Mode only on root path without wallet */}
        {renderBalanceSection()}

        {/* Strategy Card shows market data - no blur needed */}
        <StrategyCard
          data={data}
          // If strategy is loading, suppress the default regime to show skeletons
          // This allows sentiment to load independently without showing "Neutral" fallback
          currentRegime={
            sections.strategy.isLoading ? undefined : currentRegime
          }
          isLoading={false} // Allow partial rendering
          sentimentSection={sections.sentiment}
        />
      </div>

      {/* Unified Composition Bar - Ghost Mode only on root path without wallet */}
      {renderCompositionSection()}
    </div>
  );
}
