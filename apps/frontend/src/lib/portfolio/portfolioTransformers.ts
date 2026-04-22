/**
 * Portfolio Data Transformation Functions
 *
 * Pure transformation functions for converting API responses into dashboard section data.
 * These functions are UI-agnostic and can be used across different contexts.
 */

import { calculateAllocation } from '@/adapters/portfolio/allocationAdapter';
import {
  getRegimeStrategyInfo,
  getTargetAllocation,
} from '@/adapters/portfolio/regimeAdapter';
import { processSentimentData } from '@/adapters/portfolio/sentimentAdapter';
import { extractROIChanges } from '@/lib/portfolio/portfolioUtils';
import type {
  LandingPageResponse,
  MarketSentimentData,
  RegimeHistoryData,
} from '@/services';
import type {
  BalanceData,
  CompositionData,
  SentimentData,
  StrategyData,
} from '@/types/portfolio-progressive';

/**
 * Extract balance section data from landing response
 *
 * @param landing - Landing page API response
 * @returns Formatted balance data for dashboard
 */
export function extractBalanceData(landing: LandingPageResponse): BalanceData {
  const roiChanges = extractROIChanges(landing);

  return {
    balance: landing.net_portfolio_value ?? 0,
    roi: landing.portfolio_roi?.recommended_yearly_roi ?? 0,
    roiChange7d: roiChanges.change7d,
    roiChange30d: roiChanges.change30d,
    lastUpdated: landing.last_updated ?? null,
  };
}

/**
 * Extract composition section data from landing response
 *
 * @param landing - Landing page API response
 * @returns Formatted composition data for dashboard
 */
export function extractCompositionData(
  landing: LandingPageResponse,
): CompositionData {
  const currentAllocation = calculateAllocation(landing);

  // Use imported utilities
  const sentimentInfo = processSentimentData(null); // Fallback to neutral for composition which is acceptable
  const targetAllocation = getTargetAllocation(sentimentInfo.regime);

  const delta = Math.abs(currentAllocation.crypto - targetAllocation.crypto);

  return {
    currentAllocation,
    targetAllocation,
    delta,
    positions: landing.positions ?? 0,
    protocols: landing.protocols ?? 0,
    chains: landing.chains ?? 0,
  };
}

/**
 * Type guard to validate landing data at runtime
 *
 * @param data - Unknown data to validate
 * @returns True if data is valid LandingPageResponse
 */
export function isValidLandingData(data: unknown): data is LandingPageResponse {
  return (
    data !== null &&
    data !== undefined &&
    typeof data === 'object' &&
    'total_value' in data
  );
}

/**
 * Combine strategy data from all sources
 *
 * @param landingData - Landing page response (may be undefined during loading)
 * @param sentimentData - Market sentiment data (optional)
 * @param regimeHistoryData - Regime history data (optional)
 * @returns Combined strategy data or null if landing data unavailable
 */
export function combineStrategyData(
  landingData: LandingPageResponse | undefined,
  sentimentData: MarketSentimentData | undefined,
  regimeHistoryData: RegimeHistoryData | undefined,
): StrategyData | null {
  if (!isValidLandingData(landingData)) return null;

  // Process sentiment (with fallback to neutral if undefined)
  // If strict independent loading is required, this might be adjusted,
  // but StrategyCard traditionally needs some strategy to display.
  // For V2 independent sentiment, the StrategyCard will handle nullish parts gracefully.
  const sentimentInfo = processSentimentData(sentimentData ?? null);

  // Get target allocation for current regime
  const targetAllocation = getTargetAllocation(sentimentInfo.regime);

  // Get regime history info (with defaults if unavailable)
  const strategyInfo = getRegimeStrategyInfo(regimeHistoryData ?? null);

  return {
    currentRegime: sentimentInfo.regime,
    sentimentValue: sentimentData?.value ?? null,
    sentimentStatus: sentimentInfo.status,
    sentimentQuote: sentimentInfo.quote,
    targetAllocation,
    strategyDirection: strategyInfo.strategyDirection,
    previousRegime: strategyInfo.previousRegime,
    hasSentiment: !!sentimentData,
    hasRegimeHistory: !!regimeHistoryData,
  };
}

/**
 * Extract sentiment section data
 *
 * @param sentiment - Raw sentiment data with value, status, and quote
 * @returns Formatted sentiment data for dashboard
 */
export function extractSentimentData(sentiment: {
  value: number;
  status: string;
  quote: { quote: string };
}): SentimentData {
  return {
    value: sentiment.value,
    status: sentiment.status,
    quote: sentiment.quote.quote,
  };
}
