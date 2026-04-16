/**
 * Unit tests for portfolioTransformers
 *
 * Tests pure transformation functions for converting API responses into dashboard section data.
 */
import { describe, expect, it } from "vitest";

import {
  combineStrategyData,
  extractBalanceData,
  extractCompositionData,
  extractSentimentData,
  isValidLandingData,
} from "@/lib/portfolio/portfolioTransformers";
import type { LandingPageResponse } from "@/services/analyticsService";

describe("portfolioTransformers", () => {
  // Sample landing page response for testing - matches actual schema
  // Note: total_value is added because isValidLandingData checks for it
  const mockLandingResponse: LandingPageResponse = {
    total_value: 10000, // Legacy field for isValidLandingData check
    total_assets_usd: 10000,
    total_debt_usd: 500,
    total_net_usd: 9500,
    net_portfolio_value: 9500,
    weighted_apr: 0.12,
    estimated_monthly_income: 100,
    portfolio_roi: {
      recommended_roi: 0.15,
      recommended_period: "30d",
      recommended_yearly_roi: 15,
      estimated_yearly_pnl_usd: 1425,
      windows: {
        "7d": { value: 0.02, data_points: 7, start_balance: 9300 },
        "30d": { value: 0.05, data_points: 30, start_balance: 9000 },
      },
    },
    portfolio_allocation: {
      btc: {
        total_value: 3000,
        percentage_of_portfolio: 30,
        wallet_tokens_value: 2500,
        other_sources_value: 500,
      },
      eth: {
        total_value: 2000,
        percentage_of_portfolio: 20,
        wallet_tokens_value: 1800,
        other_sources_value: 200,
      },
      stablecoins: {
        total_value: 4000,
        percentage_of_portfolio: 40,
        wallet_tokens_value: 4000,
        other_sources_value: 0,
      },
      others: {
        total_value: 1000,
        percentage_of_portfolio: 10,
        wallet_tokens_value: 800,
        other_sources_value: 200,
      },
    },
    wallet_token_summary: {
      total_value_usd: 9100,
      token_count: 5,
      apr_30d: 0.12,
    },
    category_summary_debt: {
      btc: 0,
      eth: 0,
      stablecoins: 500,
      others: 0,
    },
    pool_details: [
      {
        wallet: "0x123",
        protocol_id: "aave",
        protocol: "aave",
        protocol_name: "Aave",
        chain: "ethereum",
        asset_usd_value: 2500,
        pool_symbols: ["USDC"],
        contribution_to_portfolio: 25,
        snapshot_id: "snap1",
      },
      {
        wallet: "0x123",
        protocol_id: "gmx",
        protocol: "gmx",
        protocol_name: "GMX",
        chain: "arbitrum",
        asset_usd_value: 2000,
        pool_symbols: ["ETH"],
        contribution_to_portfolio: 20,
        snapshot_id: "snap2",
      },
      {
        wallet: "0x123",
        protocol_id: "uniswap",
        protocol: "uniswap",
        protocol_name: "Uniswap",
        chain: "ethereum",
        asset_usd_value: 5000,
        pool_symbols: ["WBTC"],
        contribution_to_portfolio: 50,
        snapshot_id: "snap3",
      },
    ],
    positions: 3,
    protocols: 3,
    chains: 2,
    wallet_count: 1,
    last_updated: "2025-01-03T12:00:00Z",
    apr_coverage: {
      matched_pools: 3,
      total_pools: 3,
      coverage_percentage: 100,
      matched_asset_value_usd: 9500,
    },
  };

  describe("extractBalanceData", () => {
    it("should extract balance data from landing response", () => {
      const result = extractBalanceData(mockLandingResponse);

      expect(result.balance).toBe(9500);
      expect(result.roi).toBe(15);
      expect(result.lastUpdated).toBe("2025-01-03T12:00:00Z");
    });

    it("should handle missing net_portfolio_value", () => {
      const response = { ...mockLandingResponse, net_portfolio_value: 0 };
      const result = extractBalanceData(response);

      expect(result.balance).toBe(0);
    });
  });

  describe("extractCompositionData", () => {
    it("should extract composition data from landing response", () => {
      const result = extractCompositionData(mockLandingResponse);

      expect(result.positions).toBe(3);
      expect(result.protocols).toBeGreaterThan(0);
      expect(result.chains).toBeGreaterThan(0);
      expect(result.currentAllocation).toBeDefined();
      expect(result.targetAllocation).toBeDefined();
    });

    it("should handle empty pool_details", () => {
      const response = {
        ...mockLandingResponse,
        pool_details: [],
        positions: 0,
        protocols: 0,
        chains: 0,
      };
      const result = extractCompositionData(response);

      expect(result.positions).toBe(0);
      expect(result.protocols).toBe(0);
      expect(result.chains).toBe(0);
    });
  });

  describe("isValidLandingData", () => {
    it("should return true for valid landing data", () => {
      expect(isValidLandingData(mockLandingResponse)).toBe(true);
    });

    it("should return false for null", () => {
      expect(isValidLandingData(null)).toBe(false);
    });

    it("should return false for undefined", () => {
      expect(isValidLandingData(undefined)).toBe(false);
    });

    it("should return false for non-object", () => {
      expect(isValidLandingData("string")).toBe(false);
      expect(isValidLandingData(123)).toBe(false);
    });

    it("should return false for object without total_value", () => {
      expect(isValidLandingData({ foo: "bar" })).toBe(false);
    });

    it("should return true for minimal valid object", () => {
      expect(isValidLandingData({ total_value: 0 })).toBe(true);
    });
  });

  describe("combineStrategyData", () => {
    it("should return null for invalid landing data", () => {
      expect(combineStrategyData(undefined, undefined, undefined)).toBeNull();
    });

    it("should return strategy data for valid landing data", () => {
      const result = combineStrategyData(
        mockLandingResponse,
        undefined,
        undefined
      );

      expect(result).not.toBeNull();
      expect(result?.currentRegime).toBeDefined();
      expect(result?.targetAllocation).toBeDefined();
    });

    it("should include sentiment data when provided", () => {
      const sentimentData = {
        value: 25,
        label: "Fear",
        classification: "fear" as const,
        updated_at: "2025-01-03T12:00:00Z",
      };

      const result = combineStrategyData(
        mockLandingResponse,
        sentimentData,
        undefined
      );

      expect(result).not.toBeNull();
      expect(result?.hasSentiment).toBe(true);
      expect(result?.sentimentValue).toBe(25);
    });

    it("should include regime history data when provided", () => {
      const regimeHistoryData = {
        history: [
          { date: "2025-01-01", regime: "neutral" as const },
          { date: "2025-01-02", regime: "greed" as const },
        ],
      };

      const result = combineStrategyData(
        mockLandingResponse,
        undefined,
        regimeHistoryData
      );

      expect(result).not.toBeNull();
      expect(result?.hasRegimeHistory).toBe(true);
    });

    it("should handle both sentiment and regime history", () => {
      const sentimentData = {
        value: 75,
        label: "Greed",
        classification: "greed" as const,
        updated_at: "2025-01-03T12:00:00Z",
      };
      const regimeHistoryData = {
        history: [{ date: "2025-01-01", regime: "fear" as const }],
      };

      const result = combineStrategyData(
        mockLandingResponse,
        sentimentData,
        regimeHistoryData
      );

      expect(result).not.toBeNull();
      expect(result?.hasSentiment).toBe(true);
      expect(result?.hasRegimeHistory).toBe(true);
    });
  });

  describe("extractSentimentData", () => {
    it("should extract sentiment data", () => {
      const input = {
        value: 50,
        status: "neutral",
        quote: { quote: "The market is balanced" },
      };

      const result = extractSentimentData(input);

      expect(result.value).toBe(50);
      expect(result.status).toBe("neutral");
      expect(result.quote).toBe("The market is balanced");
    });

    it("should handle extreme values", () => {
      const fearInput = {
        value: 0,
        status: "extreme_fear",
        quote: { quote: "Maximum fear!" },
      };

      const greedInput = {
        value: 100,
        status: "extreme_greed",
        quote: { quote: "Maximum greed!" },
      };

      expect(extractSentimentData(fearInput).value).toBe(0);
      expect(extractSentimentData(greedInput).value).toBe(100);
    });
  });

  describe("extractBalanceData edge cases", () => {
    it("should handle missing portfolio_roi", () => {
      const response = {
        ...mockLandingResponse,
        portfolio_roi:
          undefined as unknown as LandingPageResponse["portfolio_roi"],
      };
      const result = extractBalanceData(response);
      expect(result.roi).toBe(0);
    });

    it("should handle missing last_updated", () => {
      const response = {
        ...mockLandingResponse,
        last_updated: undefined as unknown as string,
      };
      const result = extractBalanceData(response);
      expect(result.lastUpdated).toBeNull();
    });

    it("should handle null net_portfolio_value", () => {
      const response = {
        ...mockLandingResponse,
        net_portfolio_value: null as unknown as number,
      };
      const result = extractBalanceData(response);
      expect(result.balance).toBe(0);
    });
  });

  describe("extractCompositionData edge cases", () => {
    it("should handle missing positions/protocols/chains", () => {
      const response = {
        ...mockLandingResponse,
        positions: undefined as unknown as number,
        protocols: undefined as unknown as number,
        chains: undefined as unknown as number,
      };
      const result = extractCompositionData(response);
      expect(result.positions).toBe(0);
      expect(result.protocols).toBe(0);
      expect(result.chains).toBe(0);
    });
  });

  describe("combineStrategyData edge cases", () => {
    it("should set hasSentiment false when sentimentData is undefined", () => {
      const result = combineStrategyData(
        mockLandingResponse,
        undefined,
        undefined
      );
      expect(result?.hasSentiment).toBe(false);
    });

    it("should set hasRegimeHistory false when regimeHistoryData is undefined", () => {
      const result = combineStrategyData(
        mockLandingResponse,
        undefined,
        undefined
      );
      expect(result?.hasRegimeHistory).toBe(false);
    });

    it("should set sentimentValue to null when sentimentData is undefined", () => {
      const result = combineStrategyData(
        mockLandingResponse,
        undefined,
        undefined
      );
      expect(result?.sentimentValue).toBeNull();
    });
  });
});
