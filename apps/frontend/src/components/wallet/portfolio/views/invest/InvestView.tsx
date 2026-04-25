import { Loader2 } from 'lucide-react';
import { type JSX } from 'react';

import { INVEST_SUB_TABS } from '@/components/wallet/portfolio/components/navigation';
import { lazyImport } from '@/lib/lazy/lazyImport';
import type { InvestSubTab } from '@/types';

interface InvestViewProps {
  userId: string | undefined;
  activeSubTab?: InvestSubTab;
  onSubTabChange?: (subTab: InvestSubTab) => void;
}

const noop = (): void => {
  /* no-op */
};

function InvestContentLoadingState(): JSX.Element {
  return (
    <div
      className="min-h-[20rem] rounded-3xl border border-gray-800/60 bg-gray-900/40 flex items-center justify-center"
      data-testid="invest-content-loading"
    >
      <div className="flex items-center gap-3 text-sm text-gray-400">
        <Loader2 className="h-5 w-5 animate-spin text-blue-400" />
        Loading invest tools...
      </div>
    </div>
  );
}

const LazyTradingView = lazyImport(
  async () => import('./trading/TradingView'),
  (mod) => mod.TradingView,
  { fallback: <InvestContentLoadingState /> },
);

const LazyBacktestingView = lazyImport(
  async () => import('../BacktestingView'),
  (mod) => mod.BacktestingView,
  { fallback: <InvestContentLoadingState /> },
);

const LazyMarketDashboardView = lazyImport(
  async () => import('./market/MarketDashboardView'),
  (mod) => mod.MarketDashboardView,
  { fallback: <InvestContentLoadingState /> },
);

const LazyConfigManagerView = lazyImport(
  async () => import('./configManager'),
  (mod) => mod.ConfigManagerView,
  { fallback: <InvestContentLoadingState /> },
);

function getSubTabClassName(isActive: boolean): string {
  const state = isActive ? 'text-white' : 'text-gray-500 hover:text-gray-300';
  return `pb-4 text-sm font-medium transition-colors relative ${state}`;
}

function renderActiveSubTab(
  activeSubTab: InvestSubTab,
  userId: string | undefined,
): JSX.Element {
  switch (activeSubTab) {
    case 'trading':
      return <LazyTradingView userId={userId} />;
    case 'backtesting':
      return <LazyBacktestingView />;
    case 'market':
      return <LazyMarketDashboardView />;
    case 'config-manager':
      return <LazyConfigManagerView />;
  }
}

export function InvestView({
  userId,
  activeSubTab = 'trading',
  onSubTabChange = noop,
}: InvestViewProps): JSX.Element {
  return (
    <div className="space-y-8">
      <div className="border-b border-gray-800">
        <div className="flex items-center gap-8">
          {INVEST_SUB_TABS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => onSubTabChange(id)}
              className={getSubTabClassName(activeSubTab === id)}
            >
              <span className="capitalize">{label}</span>
              {activeSubTab === id && (
                <div className="absolute bottom-0 left-0 w-full h-0.5 bg-gradient-to-r from-purple-500 to-blue-500" />
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
        {renderActiveSubTab(activeSubTab, userId)}
      </div>
    </div>
  );
}
