/**
 * Portfolio Data Adapter
 *
 * Transforms API responses from analyticsService and sentimentService
 * into the wallet portfolio data structure.
 *
 * Orchestrates sub-adapters for specific domain logic:
 * - allocationAdapter: Portfolio math and constituent checking
 * - regimeAdapter: Regime targets and history
 * - sentimentAdapter: Sentiment value and text processing
 */

import {
  calculateAllocation,
  calculateDelta,
  type PortfolioAllocation,
} from "@/adapters/portfolio/allocationAdapter";
import {
  getRegimeStrategyInfo,
  getTargetAllocation,
} from "@/adapters/portfolio/regimeAdapter";
import { processSentimentData } from "@/adapters/portfolio/sentimentAdapter";
import type { RegimeId } from "@/components/wallet/regime/regimeData";
import { GHOST_MODE_PREVIEW } from "@/constants/ghostModeData";
import { getDefaultQuoteForRegime } from "@/constants/regimes";
import { getRegimeFromStatus } from "@/lib/domain/regimeMapper";
import { extractROIChanges } from "@/lib/portfolio/portfolioUtils";
import type {
  DirectionType,
  DurationInfo,
} from "@/schemas/api/regimeHistorySchemas";
import type {
  BorrowingSummary,
  LandingPageResponse,
  MarketSentimentData,
  RegimeHistoryData,
  RiskMetrics,
} from "@/services";

/**
 * Wallet Portfolio Data Structure
 * Matches the structure expected by WalletPortfolioPresenter
 */
interface WalletPortfolioData {
  // Portfolio metrics
  balance: number;
  roi: number;
  roiChange7d: number;
  roiChange30d: number;

  // Market sentiment
  sentimentValue: number;
  sentimentStatus: string;
  sentimentQuote: string;

  // Regime data
  currentRegime: RegimeId;

  // Allocations
  currentAllocation: PortfolioAllocation;
  targetAllocation: {
    crypto: number;
    stable: number;
  };
  delta: number;

  // Portfolio details
  positions: number;
  protocols: number;
  chains: number;

  // Risk metrics (for leveraged positions)
  riskMetrics: RiskMetrics | null;

  // Borrowing summary (for debt positions)
  borrowingSummary: BorrowingSummary | null;

  // Data freshness
  /** ISO date string of last data update */
  lastUpdated: string | null;

  // Loading states
  isLoading: boolean;
  hasError: boolean;
}

/**
 * Wallet Portfolio Data with Directional Strategy Support
 *
 * Extends WalletPortfolioData with regime transition context for
 * directional portfolio visualization and strategy guidance.
 */
export interface WalletPortfolioDataWithDirection extends WalletPortfolioData {
  // Regime history fields
  /** Previous regime for context (null if no history) */
  previousRegime: RegimeId | null;
  /** Computed strategy direction (fromLeft/fromRight/default) */
  strategyDirection: DirectionType;
  /** Duration in current regime */
  regimeDuration: DurationInfo;
}

/**
 * Transforms Landing Page Response and Sentiment Data into wallet portfolio data
 *
 * @param landingData - Portfolio data from /api/v2/portfolio/{userId}/landing
 * @param sentimentData - Market sentiment from /api/v2/market/sentiment
 * @returns Portfolio data structure
 */
export function transformToWalletPortfolioData(
  landingData: LandingPageResponse,
  sentimentData: MarketSentimentData | null
): WalletPortfolioData {
  // Process sentiment
  const sentimentInfo = processSentimentData(sentimentData);

  // Get target allocation for current regime
  const targetAllocation = getTargetAllocation(sentimentInfo.regime);

  // Calculate current allocation from portfolio data
  const currentAllocation = calculateAllocation(landingData);

  // Calculate drift (delta) between current and target allocation
  const delta = calculateDelta(
    currentAllocation.crypto,
    targetAllocation.crypto
  );

  // Extract ROI changes
  const roiChanges = extractROIChanges(landingData);

  return {
    // Portfolio metrics
    balance: landingData.net_portfolio_value ?? 0,
    roi: landingData.portfolio_roi?.recommended_yearly_roi ?? 0,
    roiChange7d: roiChanges.change7d,
    roiChange30d: roiChanges.change30d,

    // Market sentiment
    sentimentValue: sentimentInfo.value,
    sentimentStatus: sentimentInfo.status,
    sentimentQuote: sentimentInfo.quote,

    // Regime
    currentRegime: sentimentInfo.regime,

    // Allocations
    currentAllocation,
    targetAllocation,
    delta,

    // Portfolio details
    positions: landingData.positions ?? 0,
    protocols: landingData.protocols ?? 0,
    chains: landingData.chains ?? 0,

    // Risk metrics
    riskMetrics: landingData.risk_metrics ?? null,

    // Borrowing summary
    borrowingSummary: landingData.borrowing_summary ?? null,

    // Data freshness
    lastUpdated: landingData.last_updated ?? null,

    // Loading states
    isLoading: false,
    hasError: false,
  };
}

function applyRegimeHistoryFields(
  baseData: WalletPortfolioData,
  regimeHistoryData: RegimeHistoryData | null
): WalletPortfolioDataWithDirection {
  const strategyInfo = getRegimeStrategyInfo(regimeHistoryData);

  return {
    ...baseData,
    ...strategyInfo,
  };
}

/**
 * Transforms Landing Page, Sentiment, and Regime History Data into wallet portfolio data with direction
 *
 * Enhanced version of transformToWalletPortfolioData that includes regime transition context
 * for directional strategy visualization.
 *
 * @param landingData - Portfolio data from /api/v2/portfolio/{userId}/landing
 * @param sentimentData - Market sentiment from /api/v2/market/sentiment
 * @param regimeHistoryData - Regime history from /api/v2/market/regime/history
 * @returns Portfolio data with directional strategy fields
 */
export function transformToWalletPortfolioDataWithDirection(
  landingData: LandingPageResponse,
  sentimentData: MarketSentimentData | null,
  regimeHistoryData: RegimeHistoryData | null
): WalletPortfolioDataWithDirection {
  // Start with base portfolio data
  const baseData = transformToWalletPortfolioData(landingData, sentimentData);

  return applyRegimeHistoryFields(baseData, regimeHistoryData);
}

/**
 * Creates an empty portfolio state with real sentiment data
 * Used for disconnected users to show intriguing market regime preview
 *
 * @param sentimentData - Real-time market sentiment from /api/v2/market/sentiment
 * @param regimeHistoryData - Regime history from /api/v2/market/regime/history
 * @returns Empty portfolio state with real sentiment and regime-based targets
 */
export function createEmptyPortfolioState(
  sentimentData: MarketSentimentData | null,
  regimeHistoryData: RegimeHistoryData | null
): WalletPortfolioDataWithDirection {
  const sentimentValue = sentimentData?.value ?? 50;
  const sentimentStatus = sentimentData?.status ?? "Neutral";
  const currentRegime = getRegimeFromStatus(sentimentStatus);
  const targetAllocation = getTargetAllocation(currentRegime);

  // Use Ghost Mode preview data for enticing visual preview
  // This shows unconnected users what their dashboard could look like
  const previewAllocation = {
    crypto: GHOST_MODE_PREVIEW.currentAllocation.crypto,
    stable: GHOST_MODE_PREVIEW.currentAllocation.stable,
    constituents: GHOST_MODE_PREVIEW.currentAllocation.constituents,
    simplifiedCrypto: GHOST_MODE_PREVIEW.currentAllocation.simplifiedCrypto,
  };

  const baseData: WalletPortfolioData = {
    // Portfolio metrics - use preview values for visual appeal
    balance: GHOST_MODE_PREVIEW.balance,
    roi: GHOST_MODE_PREVIEW.roi,
    roiChange7d: GHOST_MODE_PREVIEW.roiChange7d,
    roiChange30d: GHOST_MODE_PREVIEW.roiChange30d,

    // Market sentiment - REAL data
    sentimentValue,
    sentimentStatus: sentimentData?.status ?? "Neutral",
    sentimentQuote:
      sentimentData?.quote?.quote ?? getDefaultQuoteForRegime(currentRegime),

    // Regime - derived from REAL sentiment
    currentRegime,

    // Allocations - use preview for visual, real target from regime
    currentAllocation: previewAllocation,
    targetAllocation, // Real target from regime
    delta: GHOST_MODE_PREVIEW.delta,

    // Portfolio details - use preview values
    positions: GHOST_MODE_PREVIEW.positions,
    protocols: GHOST_MODE_PREVIEW.protocols,
    chains: GHOST_MODE_PREVIEW.chains,

    // Risk metrics - null for empty state (no leverage in preview)
    riskMetrics: null,

    // Borrowing summary - null for empty state (no debt in preview)
    borrowingSummary: null,

    // Data freshness
    lastUpdated: null,

    // States
    isLoading: false,
    hasError: false,
  };

  return applyRegimeHistoryFields(baseData, regimeHistoryData);
}
