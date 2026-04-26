/**
 * Progressive Portfolio Data Hook
 *
 * Exposes section-specific loading states for progressive rendering.
 * Each dashboard section can render independently as its data becomes available.
 *
 * Sections:
 * - Balance: Requires landing data only
 * - Composition: Requires landing data only
 * - Strategy: Requires landing + sentiment + regime history
 * - Sentiment: Requires sentiment data only (independent)
 */

import {
  transformToWalletPortfolioDataWithDirection,
  type WalletPortfolioDataWithDirection,
} from '@/adapters/walletPortfolioDataAdapter';
import { useRegimeHistory } from '@/hooks/queries/market/useRegimeHistoryQuery';
import { useSentimentData } from '@/hooks/queries/market/useSentimentQuery';
import {
  combineStrategyData,
  extractBalanceData,
  extractCompositionData,
  extractSentimentData,
} from '@/lib/portfolio/portfolioTransformers';
import { createSectionState } from '@/lib/portfolio/sectionHelpers';
import type { DashboardProgressiveState } from '@/types/portfolio-progressive';
import { logger } from '@/utils';

import { useLandingPageData } from './usePortfolioQuery';

type LandingQuery = ReturnType<typeof useLandingPageData>;
type SentimentQuery = ReturnType<typeof useSentimentData>;
type RegimeQuery = ReturnType<typeof useRegimeHistory>;

function logProgressiveQueryStates(
  userId: string,
  isEtlInProgress: boolean,
  landingQuery: LandingQuery,
  sentimentQuery: SentimentQuery,
  regimeQuery: RegimeQuery,
): void {
  logger.debug('[usePortfolioDataProgressive] Query States:', {
    userId,
    isEtlInProgress,
    landingQuery: {
      data: landingQuery.data ? 'exists' : 'null',
      isLoading: landingQuery.isLoading,
      error: landingQuery.error ? (landingQuery.error as Error).message : null,
    },
    sentimentQuery: {
      data: sentimentQuery.data ? 'exists' : 'null',
      isLoading: sentimentQuery.isLoading,
    },
    regimeQuery: {
      data: regimeQuery.data ? 'exists' : 'null',
      isLoading: regimeQuery.isLoading,
    },
  });
}

function buildUnifiedData(
  landingQuery: LandingQuery,
  sentimentQuery: SentimentQuery,
  regimeQuery: RegimeQuery,
): WalletPortfolioDataWithDirection | null {
  if (!landingQuery.data) {
    return null;
  }

  return transformToWalletPortfolioDataWithDirection(
    landingQuery.data,
    sentimentQuery.data ?? null,
    regimeQuery.data ?? null,
  );
}

function hasAnyLoadingState(
  landingQuery: LandingQuery,
  sentimentQuery: SentimentQuery,
  regimeQuery: RegimeQuery,
): boolean {
  return Boolean(
    landingQuery.isLoading || sentimentQuery.isLoading || regimeQuery.isLoading,
  );
}

function getProgressiveError(
  landingQuery: LandingQuery,
  sentimentQuery: SentimentQuery,
  regimeQuery: RegimeQuery,
): Error | null {
  const firstError =
    (landingQuery.error as Error) ||
    (sentimentQuery.error as Error) ||
    (regimeQuery.error as Error) ||
    null;
  return firstError;
}

/**
 * Progressive portfolio data hook
 *
 * Composes existing hooks and exposes section-specific states.
 * Allows each dashboard section to render independently.
 *
 * @param userId - User wallet address or user ID
 * @param isEtlInProgress - Whether ETL data fetch is currently in progress (disables landing query during ETL)
 * @param isLandingActive - Whether the dashboard view (the only real consumer of
 *   landing data) is currently active. Gates the landing query so non-dashboard
 *   tabs (Analytics, Invest sub-views) don't generate `/landing` traffic.
 * @returns Section states with loading/error information
 */
export function usePortfolioDataProgressive(
  userId: string,
  isEtlInProgress = false,
  isLandingActive = true,
): DashboardProgressiveState {
  // Fetch data from independent sources
  const landingQuery = useLandingPageData(
    userId,
    isEtlInProgress,
    isLandingActive,
  );
  const sentimentQuery = useSentimentData();
  const regimeQuery = useRegimeHistory();

  // 1. Balance Section (Depends only on Landing)
  const balanceSection = createSectionState([landingQuery], extractBalanceData);

  // 2. Composition Section (Depends only on Landing, uses static sentiment fallback)
  const compositionSection = createSectionState(
    [landingQuery],
    extractCompositionData,
  );

  // 3. Strategy Section (Depends on Landing + Sentiment + Regime)
  // Logic: Strategy needs landing data to exist basically.
  // Sentiment and Regime are technically optional but usually preferred.
  // We'll mark it loading if landing is loading.
  const strategySection = createSectionState(
    [landingQuery, sentimentQuery, regimeQuery],
    combineStrategyData,
  );

  // 4. Independent Sentiment Section (Depends only on Sentiment)
  const sentimentSection = createSectionState(
    [sentimentQuery],
    extractSentimentData,
  );

  logProgressiveQueryStates(
    userId,
    isEtlInProgress,
    landingQuery,
    sentimentQuery,
    regimeQuery,
  );
  const unifiedData = buildUnifiedData(
    landingQuery,
    sentimentQuery,
    regimeQuery,
  );

  const refetchAll = async () => {
    await Promise.all([
      landingQuery.refetch(),
      sentimentQuery.refetch(),
      regimeQuery.refetch(),
    ]);
  };

  return {
    unifiedData,
    sections: {
      balance: balanceSection,
      composition: compositionSection,
      strategy: strategySection,
      sentiment: sentimentSection,
    },
    sentimentData: sentimentQuery.data,
    regimeHistoryData: regimeQuery.data,
    isLoading: hasAnyLoadingState(landingQuery, sentimentQuery, regimeQuery),
    error: getProgressiveError(landingQuery, sentimentQuery, regimeQuery),
    refetch: refetchAll,
  };
}
