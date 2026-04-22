import { Loader2 } from 'lucide-react';
import { type ReactElement, type ReactNode, useRef, useState } from 'react';

import type { WalletPortfolioDataWithDirection } from '@/adapters/walletPortfolioDataAdapter';
import { Footer } from '@/components/Footer/Footer';
import { InitialDataLoadingState } from '@/components/wallet/InitialDataLoadingState';
import { WalletNavigation } from '@/components/wallet/portfolio/components/navigation';
import { usePortfolioModalState } from '@/components/wallet/portfolio/hooks/usePortfolioModalState';
import { DashboardView } from '@/components/wallet/portfolio/views/DashboardView';
import { getRegimeById } from '@/components/wallet/regime/regimeData';
import type { EtlJobPollingState } from '@/hooks/wallet';
import { lazyImport } from '@/lib/lazy/lazyImport';
import {
  buildPortfolioRouteSearchParams,
  readPortfolioRouteState,
} from '@/lib/portfolio/portfolioRouteState';
import {
  useAppPathname,
  useAppRouter,
  useAppSearchParams,
} from '@/lib/routing';
import { useToast } from '@/providers/ToastProvider';
import { connectWallet } from '@/services';
import type {
  DashboardSections,
  InvestSubTab,
  MarketSection,
  TabType,
} from '@/types';

/** Layout class constants for consistent styling */
const LAYOUT = {
  container:
    'min-h-screen bg-gray-950 flex flex-col font-sans selection:bg-purple-500/30',
  main: 'flex-1 flex justify-center p-4 md:p-8',
  content: 'w-full max-w-4xl flex flex-col gap-8 min-h-[600px]',
} as const;

function PortfolioTabLoadingState(): ReactElement {
  return (
    <div
      className="min-h-[16rem] rounded-3xl border border-gray-800/60 bg-gray-900/40 flex items-center justify-center"
      data-testid="portfolio-tab-loading"
    >
      <div className="flex items-center gap-3 text-sm text-gray-400">
        <Loader2 className="h-5 w-5 animate-spin text-purple-400" />
        Loading view...
      </div>
    </div>
  );
}

const LazyAnalyticsView = lazyImport(
  // v8 ignore next -- dynamic import; loader is not invoked in unit tests
  async () => import('@/components/wallet/portfolio/analytics'),
  (mod) => mod.AnalyticsView,
  { fallback: <PortfolioTabLoadingState /> },
);

const LazyInvestView = lazyImport(
  // v8 ignore next -- dynamic import; loader is not invoked in unit tests
  async () => import('@/components/wallet/portfolio/views/invest/InvestView'),
  (mod) => mod.InvestView,
  { fallback: <PortfolioTabLoadingState /> },
);

const LazyPortfolioModals = lazyImport(
  // v8 ignore next -- dynamic import; loader is not invoked in unit tests
  async () => import('@/components/wallet/portfolio/modals'),
  (mod) => mod.PortfolioModals,
);

const LazyWalletManager = lazyImport(
  // v8 ignore next -- dynamic import; loader is not invoked in unit tests
  async () => import('@/components/WalletManager'),
  (mod) => mod.WalletManager,
);

interface WalletPortfolioPresenterProps {
  data: WalletPortfolioDataWithDirection;
  userId?: string;
  /** Whether user is viewing their own bundle (enables wallet actions) */
  isOwnBundle?: boolean;
  isEmptyState?: boolean;
  isLoading?: boolean;
  /** ETL job polling state (from DashboardShell) */
  etlState: EtlJobPollingState;
  /** Section states for progressive loading */
  sections: DashboardSections;
  headerBanners?: ReactNode;
  footerOverlays?: ReactNode;
}

function isValidationSearchError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.message.includes('Invalid wallet') ||
    error.message.includes('42-character')
  );
}

function buildBundleUrlFromSearchResult(params: {
  searchedUserId: string;
  etlJobId?: string | null | undefined;
  searchedIsNewUser?: boolean;
  currentSearchParams: Pick<URLSearchParams, 'toString'>;
}): string {
  const { searchedUserId, etlJobId, searchedIsNewUser, currentSearchParams } =
    params;
  const searchParams = new URLSearchParams(currentSearchParams.toString());

  searchParams.set('userId', searchedUserId);
  searchParams.delete('walletId');

  if (etlJobId) {
    searchParams.set('etlJobId', etlJobId);
  } else {
    searchParams.delete('etlJobId');
  }

  if (searchedIsNewUser) {
    searchParams.set('isNewUser', 'true');
  } else {
    searchParams.delete('isNewUser');
  }

  return `/bundle?${searchParams.toString()}`;
}

function buildPathWithSearchParams(
  pathname: string,
  nextSearchParams: URLSearchParams,
): string {
  const queryString = nextSearchParams.toString();

  // v8 ignore next -- queryString is always non-empty when called via syncRouteState
  return queryString ? `${pathname}?${queryString}` : pathname;
}

export function WalletPortfolioPresenter({
  data,
  userId,
  isOwnBundle = true,
  isEmptyState = false,
  isLoading = false,
  etlState,
  sections,
  headerBanners,
  footerOverlays,
}: WalletPortfolioPresenterProps): ReactElement {
  const router = useAppRouter();
  const pathname = useAppPathname();
  const searchParams = useAppSearchParams();
  const { showToast } = useToast();
  const currentRegime = getRegimeById(data.currentRegime);
  const [isWalletManagerOpen, setIsWalletManagerOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const pendingSearchCountRef = useRef(0);
  const [showNewWalletLoading, setShowNewWalletLoading] = useState(false);
  const routeState = readPortfolioRouteState(searchParams);
  const activeTab = routeState.tab;

  const {
    activeModal,
    isSettingsOpen,
    openModal,
    closeModal,
    openSettings,
    setIsSettingsOpen,
  } = usePortfolioModalState();

  function syncRouteState(patch: {
    tab?: TabType;
    invest?: InvestSubTab;
    market?: MarketSection;
  }): void {
    const nextSearchParams = buildPortfolioRouteSearchParams(
      searchParams,
      patch,
    );

    router.replace(buildPathWithSearchParams(pathname, nextSearchParams), {
      scroll: false,
    });
  }

  function handleTabChange(tab: TabType): void {
    syncRouteState({ tab });
  }

  function handleInvestSubTabChange(invest: InvestSubTab): void {
    syncRouteState({ tab: 'invest', invest });
  }

  function handleMarketSectionChange(market: MarketSection): void {
    syncRouteState({ tab: 'invest', invest: 'market', market });
  }

  async function handleSearch(address: string): Promise<void> {
    const trimmedAddress = address.trim();
    if (!trimmedAddress) {
      return;
    }

    // Guard against multiple overlapping searches (e.g. rapid submits) so the
    // searching indicator doesn't flicker off while a later request is pending.
    pendingSearchCountRef.current += 1;
    if (pendingSearchCountRef.current === 1) {
      setIsSearching(true);
    }

    try {
      // Convert wallet address to userId via backend
      const response = await connectWallet(trimmedAddress);

      const {
        user_id: searchedUserId,
        etl_job: etlJob,
        is_new_user: searchedIsNewUser,
      } = response;

      const bundleUrl = buildBundleUrlFromSearchResult({
        searchedUserId,
        etlJobId: etlJob?.job_id,
        searchedIsNewUser,
        currentSearchParams: searchParams,
      });

      // Navigate through the app router adapter
      router.push(bundleUrl);
    } catch (error) {
      if (isValidationSearchError(error)) {
        showToast({
          type: 'error',
          title: 'Invalid Address',
          message: 'Please enter a valid 42-character Ethereum address.',
        });
      } else {
        // For connection errors, show the loading state
        setShowNewWalletLoading(true);
      }
    } finally {
      pendingSearchCountRef.current = Math.max(
        0,
        pendingSearchCountRef.current - 1,
      );
      if (pendingSearchCountRef.current === 0) {
        setIsSearching(false);
      }
    }
  }

  /** Tab view mapping for cleaner conditional rendering */
  const tabViews: Record<TabType, ReactNode> = {
    dashboard: (
      <DashboardView
        data={data}
        sections={sections}
        currentRegime={currentRegime}
        isEmptyState={isEmptyState}
        isOwnBundle={isOwnBundle}
        isLoading={isLoading}
        onOpenModal={openModal}
        userId={userId}
      />
    ),
    analytics: userId ? (
      <div data-testid="analytics-content">
        <LazyAnalyticsView userId={userId} />
      </div>
    ) : null,
    invest: (
      <div data-testid="invest-content">
        <LazyInvestView
          userId={userId}
          activeSubTab={routeState.invest}
          activeMarketSection={routeState.market}
          onSubTabChange={handleInvestSubTabChange}
          onMarketSectionChange={handleMarketSectionChange}
        />
      </div>
    ),
  };

  // Determine if ETL loading screen should be shown
  const isEtlInProgress = etlState.isInProgress;
  const shouldShowEtlLoading = isEtlInProgress || etlState.isLoading;
  const isNavigationSearching =
    isSearching || etlState.isLoading || isEtlInProgress;

  function openWalletManager(): void {
    setIsWalletManagerOpen(true);
  }

  function closeWalletManager(): void {
    setIsWalletManagerOpen(false);
  }

  if (showNewWalletLoading) {
    return <InitialDataLoadingState status="pending" />;
  }

  if (shouldShowEtlLoading) {
    return <InitialDataLoadingState status={etlState.status} />;
  }

  return (
    <div className={LAYOUT.container} data-testid="v22-dashboard">
      {/* Top navigation */}
      <WalletNavigation
        activeTab={activeTab}
        setActiveTab={handleTabChange}
        onOpenWalletManager={openWalletManager}
        onOpenSettings={openSettings}
        onSearch={handleSearch}
        showSearch={true}
        isSearching={isNavigationSearching}
      />

      {/* Header banners (Bundle-specific: SwitchPrompt, EmailReminder) */}
      {headerBanners}

      {/* Main content */}
      <main className={LAYOUT.main}>
        <div className={LAYOUT.content}>{tabViews[activeTab]}</div>
      </main>

      {/* Footer */}
      <Footer
        className="bg-gray-950 border-gray-800/50"
        containerClassName="max-w-4xl"
      />

      <LazyPortfolioModals
        activeModal={activeModal}
        onClose={closeModal}
        data={data}
        isSettingsOpen={isSettingsOpen}
        setIsSettingsOpen={setIsSettingsOpen}
        userId={userId}
      />

      {/* Wallet Manager Modal */}
      <LazyWalletManager
        isOpen={isWalletManagerOpen}
        onClose={closeWalletManager}
        {...(userId ? { urlUserId: userId } : {})}
      />

      {/* Footer overlays (Bundle-specific: QuickSwitchFAB) */}
      {footerOverlays}
    </div>
  );
}
