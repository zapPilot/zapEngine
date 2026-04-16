import { describe, expect, it, vi } from "vitest";

import {
  createEmptyPortfolioState,
  transformToWalletPortfolioData,
  transformToWalletPortfolioDataWithDirection,
} from "@/adapters/walletPortfolioDataAdapter";
import { GHOST_MODE_PREVIEW } from "@/constants/ghostModeData";
import {
  LandingPageResponse,
  MarketSentimentData,
} from "@/services/analyticsService";
import { RegimeHistoryData } from "@/services/regimeHistoryService";

// Mock dependencies
vi.mock("@/adapters/portfolio/allocationAdapter", () => ({
  calculateAllocation: vi.fn().mockReturnValue({
    crypto: 50,
    stable: 50,
    constituents: [],
    simplifiedCrypto: 50,
  }),
  calculateDelta: vi.fn().mockReturnValue(0),
}));

vi.mock("@/adapters/portfolio/regimeAdapter", () => ({
  getRegimeStrategyInfo: vi.fn().mockReturnValue({
    previousRegime: null,
    strategyDirection: "default",
    regimeDuration: { days: 0 },
  }),
  getTargetAllocation: vi.fn().mockReturnValue({
    crypto: 60,
    stable: 40,
  }),
}));

vi.mock("@/adapters/portfolio/sentimentAdapter", () => ({
  processSentimentData: vi.fn().mockReturnValue({
    value: 50,
    status: "Neutral",
    quote: "Test Quote",
    regime: "neutral",
  }),
}));

vi.mock("@/constants/regimes", () => ({
  getDefaultQuoteForRegime: vi.fn().mockReturnValue("Default Quote"),
}));

vi.mock("@/lib/domain/regimeMapper", () => ({
  getRegimeFromStatus: vi.fn().mockReturnValue("neutral"),
}));

vi.mock("@/lib/portfolio/portfolioUtils", () => ({
  extractROIChanges: vi.fn().mockReturnValue({
    change7d: 0,
    change30d: 0,
  }),
}));

describe("walletPortfolioDataAdapter", () => {
  const mockLandingData: LandingPageResponse = {
    net_portfolio_value: 1000,
    portfolio_roi: { recommended_yearly_roi: 10 },
    positions: 5,
    protocols: 2,
    chains: 1,
    risk_metrics: { health_factor: 1.5 } as any,
    borrowing_summary: { total_debt: 100 } as any,
    last_updated: "2024-01-01T00:00:00Z",
  } as any;

  const mockSentimentData: MarketSentimentData = {
    value: 50,
    status: "Neutral",
    quote: { quote: "Test", author: "Author" },
    history: [],
  };

  const mockRegimeHistoryData: RegimeHistoryData = {
    current_regime: "Neutral",
    history: [],
  };

  describe("transformToWalletPortfolioData", () => {
    it("should transform valid data correctly", () => {
      const result = transformToWalletPortfolioData(
        mockLandingData,
        mockSentimentData
      );

      expect(result.balance).toBe(1000);
      expect(result.roi).toBe(10);
      expect(result.sentimentValue).toBe(50);
      expect(result.isLoading).toBe(false);
      expect(result.hasError).toBe(false);
    });

    it("should handle null/undefined fields in landingData", () => {
      const partialData = {
        ...mockLandingData,
        net_portfolio_value: undefined,
        portfolio_roi: undefined,
        positions: undefined,
        protocols: undefined,
        chains: undefined,
        risk_metrics: undefined,
        borrowing_summary: undefined,
        last_updated: undefined,
      } as unknown as LandingPageResponse;

      const result = transformToWalletPortfolioData(
        partialData,
        mockSentimentData
      );

      expect(result.balance).toBe(0);
      expect(result.roi).toBe(0);
      expect(result.positions).toBe(0);
      expect(result.protocols).toBe(0);
      expect(result.chains).toBe(0);
      expect(result.riskMetrics).toBeNull();
      expect(result.borrowingSummary).toBeNull();
      expect(result.lastUpdated).toBeNull();
    });

    it("should handle null sentimentData", () => {
      const result = transformToWalletPortfolioData(mockLandingData, null);

      expect(result.sentimentValue).toBe(50); // From mock
      expect(result.sentimentStatus).toBe("Neutral"); // From mock
    });
  });

  describe("transformToWalletPortfolioDataWithDirection", () => {
    it("should include directional fields", () => {
      const result = transformToWalletPortfolioDataWithDirection(
        mockLandingData,
        mockSentimentData,
        mockRegimeHistoryData
      );

      expect(result).toHaveProperty("previousRegime");
      expect(result).toHaveProperty("strategyDirection");
      expect(result).toHaveProperty("regimeDuration");
    });
  });

  describe("createEmptyPortfolioState", () => {
    it("should return ghost mode preview data with real sentiment", () => {
      const result = createEmptyPortfolioState(
        mockSentimentData,
        mockRegimeHistoryData
      );

      expect(result.balance).toBe(GHOST_MODE_PREVIEW.balance);
      expect(result.sentimentValue).toBe(50); // From input
      expect(result.currentAllocation.crypto).toBe(
        GHOST_MODE_PREVIEW.currentAllocation.crypto
      );
    });

    it("should handle null sentiment data in empty state", () => {
      const result = createEmptyPortfolioState(null, mockRegimeHistoryData);

      expect(result.sentimentValue).toBe(50); // Default
      expect(result.sentimentStatus).toBe("Neutral"); // Default
    });

    it("should use default quote when sentiment has no quote", () => {
      const sentimentNoQuote = {
        ...mockSentimentData,
        quote: undefined,
      } as any;
      const result = createEmptyPortfolioState(
        sentimentNoQuote,
        mockRegimeHistoryData
      );

      expect(result.sentimentQuote).toBeDefined();
    });
  });
});
