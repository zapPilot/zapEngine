import type { TabType } from '@/types/portfolio';

import { PORTFOLIO_TABS } from './portfolioNavigationConfig';
import { WalletSearchNav } from './search/WalletSearchNav';
import { WalletMenu } from './WalletMenu';

/** Navigation styling constants */
const STYLES = {
  nav: 'h-16 border-b border-gray-800/50 bg-gray-950/80 backdrop-blur-md sticky top-0 z-50 px-4 md:px-8 flex items-center justify-between',
  logo: 'w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-purple-500/20',
  tabContainer:
    'flex items-center gap-1 bg-gray-900/50 p-1 rounded-full border border-gray-800/50',
  tabBase:
    'px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-200 flex items-center gap-2 cursor-pointer',
  tabActive:
    'bg-gradient-to-r from-purple-500/10 to-blue-600/10 border border-purple-500/30 text-white shadow-sm',
  tabInactive:
    'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50 hover:border-purple-500/20 border border-transparent',
} as const;

/** Get tab button className based on active state */
function getTabClassName(isActive: boolean): string {
  return `${STYLES.tabBase} ${isActive ? STYLES.tabActive : STYLES.tabInactive}`;
}

interface WalletNavigationProps {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  onOpenWalletManager?: () => void;
  onOpenSettings: () => void;
  onSearch?: (address: string) => void;
  showSearch?: boolean;
  isSearching?: boolean;
}

export function WalletNavigation({
  activeTab,
  setActiveTab,
  onOpenWalletManager,
  onOpenSettings,
  onSearch,
  showSearch = false,
  isSearching = false,
}: WalletNavigationProps) {
  return (
    <nav className={STYLES.nav}>
      <div className="flex items-center gap-2">
        <div className={STYLES.logo}>ZP</div>
        <span className="text-white font-bold tracking-tight hidden md:block">
          Zap Pilot
        </span>
      </div>

      <div className="flex items-center gap-2 md:gap-4">
        <div className={STYLES.tabContainer}>
          {PORTFOLIO_TABS.map((tab) => (
            <button
              key={tab.id}
              data-testid={`v22-tab-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              role="button"
              aria-label={`${tab.label} tab`}
              className={getTabClassName(activeTab === tab.id)}
            >
              <tab.icon className="w-4 h-4" />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>

        {showSearch && onSearch && (
          <WalletSearchNav onSearch={onSearch} isSearching={isSearching} />
        )}
      </div>

      <div className="flex items-center gap-2 md:gap-4">
        {onOpenWalletManager ? (
          <WalletMenu
            onOpenSettings={onOpenSettings}
            onOpenWalletManager={onOpenWalletManager}
          />
        ) : (
          <WalletMenu onOpenSettings={onOpenSettings} />
        )}
      </div>
    </nav>
  );
}
