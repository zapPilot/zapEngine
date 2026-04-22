/**
 * Available tabs in the portfolio view
 */
export const PORTFOLIO_TAB_IDS = ['dashboard', 'analytics', 'invest'] as const;

/**
 * Available tabs in the portfolio view
 */
export type TabType = (typeof PORTFOLIO_TAB_IDS)[number];

/**
 * Available sub-tabs within the invest view.
 */
export const INVEST_SUB_TAB_IDS = [
  'trading',
  'backtesting',
  'market',
  'config-manager',
] as const;

/**
 * Available sub-tabs within the invest view.
 */
export type InvestSubTab = (typeof INVEST_SUB_TAB_IDS)[number];

/**
 * Shareable section targets within the market sub-tab.
 */
export const MARKET_SECTION_IDS = ['overview', 'relative-strength'] as const;

/**
 * Shareable section targets within the market sub-tab.
 */
export type MarketSection = (typeof MARKET_SECTION_IDS)[number];

/**
 * Modal types for portfolio actions
 */
export type ModalType = 'deposit' | 'withdraw' | 'rebalance';

/**
 * Portfolio allocation type definitions shared across adapters and UI.
 */
export interface AllocationConstituent {
  asset: string;
  symbol: string;
  name: string;
  value: number;
  color: string;
}
