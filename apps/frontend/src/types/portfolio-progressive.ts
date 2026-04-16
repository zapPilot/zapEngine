import type { WalletPortfolioDataWithDirection } from "@/adapters/walletPortfolioDataAdapter";
import type { RegimeId } from "@/components/wallet/regime/regimeData";
import type { MarketSentimentData, RegimeHistoryData } from "@/services";

/**
 * Generic state for a dashboard section
 */
export interface SectionState<T> {
  data: T | null;
  isLoading: boolean;
  error: Error | null;
}

/**
 * Data needed for the Balance Card
 */
export interface BalanceData {
  balance: number;
  roi: number;
  roiChange7d: number;
  roiChange30d: number;
  /** ISO date string of last data update */
  lastUpdated: string | null;
}

/**
 * Data needed for the Composition Bar
 */
export interface CompositionData {
  currentAllocation: {
    crypto: number;
    stable: number;
  };
  targetAllocation: {
    crypto: number;
    stable: number;
  };
  delta: number;
  positions: number;
  protocols: number;
  chains: number;
}

/**
 * Independent Sentiment Data
 */
export interface SentimentData {
  value: number;
  status: string;
  quote: string;
}

/**
 * Strategy Card Data
 */
export interface StrategyData {
  currentRegime: RegimeId;
  sentimentValue: number | null;
  sentimentStatus: string;
  sentimentQuote: string;
  targetAllocation: {
    crypto: number;
    stable: number;
  };
  strategyDirection: string;
  previousRegime: string | null;
  hasSentiment: boolean;
  hasRegimeHistory: boolean;
}

/**
 * Dashboard Sections State
 * Shared type for section states used by presenter and view components
 */
export interface DashboardSections {
  balance: SectionState<BalanceData>;
  composition: SectionState<CompositionData>;
  strategy: SectionState<StrategyData>;
  sentiment: SectionState<SentimentData>;
}

/**
 * Full Progressive Dashboard State
 */
export interface DashboardProgressiveState {
  // Legacy unified data (for backward compatibility during migration)
  unifiedData: WalletPortfolioDataWithDirection | null;

  // Progressive sections
  sections: DashboardSections;

  // Raw query data (for fallback scenarios like empty portfolio state)
  sentimentData: MarketSentimentData | undefined;
  regimeHistoryData: RegimeHistoryData | undefined;

  // Global states
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}
