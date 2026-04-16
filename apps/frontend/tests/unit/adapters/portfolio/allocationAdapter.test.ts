/**
 * Allocation Adapter Tests
 *
 * Tests for the allocationAdapter to verify it correctly uses
 * absolute portfolio percentages from the API response.
 */

import { describe, expect, it } from "vitest";

import {
  calculateAllocation,
  calculateDelta,
} from "@/adapters/portfolio/allocationAdapter";
import type { LandingPageResponse } from "@/services/analyticsService";

// Mock API response matching the actual API format
const mockLandingData: LandingPageResponse = {
  total_portfolio_value: 172132.69,
  btc_price: 95000,
  eth_price: 3400,
  sol_price: 200,
  sentiment: {
    index: 65,
    label: "Greed",
  },
  portfolio_allocation: {
    btc: {
      total_value: 64115.29,
      percentage_of_portfolio: 37.25,
      wallet_tokens_value: 8.59,
      other_sources_value: 64106.7,
    },
    eth: {
      total_value: 29391.16,
      percentage_of_portfolio: 17.07,
      wallet_tokens_value: 359.98,
      other_sources_value: 29031.18,
    },
    stablecoins: {
      total_value: 61304.97,
      percentage_of_portfolio: 35.61,
      wallet_tokens_value: 121.69,
      other_sources_value: 61183.28,
    },
    others: {
      total_value: 17321.27,
      percentage_of_portfolio: 10.06,
      wallet_tokens_value: 146.46,
      other_sources_value: 17174.81,
    },
  },
  // Required fields with minimal values
  other_assets: [],
  total_stable_value: 61304.97,
  source_breakdown: [],
  metrics: {
    sharpe: 1.5,
    sortino: 2.0,
    maxDrawdown: -0.15,
    currentRegime: "g",
  },
};

describe("calculateAllocation", () => {
  describe("Absolute Portfolio Percentages", () => {
    it("uses percentage_of_portfolio directly from API for simplifiedCrypto", () => {
      const result = calculateAllocation(mockLandingData);

      // BTC should have API's percentage_of_portfolio value
      const btcAsset = result.simplifiedCrypto.find(a => a.symbol === "BTC");
      expect(btcAsset?.value).toBe(37.25);

      // ETH should have API's percentage_of_portfolio value
      const ethAsset = result.simplifiedCrypto.find(a => a.symbol === "ETH");
      expect(ethAsset?.value).toBe(17.07);

      // ALT (Others) should have API's percentage_of_portfolio value
      const altAsset = result.simplifiedCrypto.find(a => a.symbol === "ALT");
      expect(altAsset?.value).toBe(10.06);
    });

    it("returns correct crypto and stable percentages", () => {
      const result = calculateAllocation(mockLandingData);

      // Crypto percentage = BTC + ETH + Others
      expect(result.crypto).toBeCloseTo(64.38, 1);

      // Stable percentage = Stablecoins
      expect(result.stable).toBeCloseTo(35.62, 1);
    });

    it("includes all non-zero crypto assets in simplifiedCrypto", () => {
      const result = calculateAllocation(mockLandingData);

      expect(result.simplifiedCrypto).toHaveLength(3); // BTC, ETH, ALT
      expect(result.simplifiedCrypto.map(a => a.symbol)).toEqual([
        "BTC",
        "ETH",
        "ALT",
      ]);
    });

    it("assigns correct colors to assets", () => {
      const result = calculateAllocation(mockLandingData);

      const btcAsset = result.simplifiedCrypto.find(a => a.symbol === "BTC");
      const ethAsset = result.simplifiedCrypto.find(a => a.symbol === "ETH");
      const altAsset = result.simplifiedCrypto.find(a => a.symbol === "ALT");

      expect(btcAsset?.color).toBe("#F7931A"); // BTC orange
      expect(ethAsset?.color).toBe("#627EEA"); // ETH purple
      expect(altAsset?.color).toBe("#6B7280"); // ALT gray
    });
  });

  describe("Edge Cases", () => {
    it("handles zero total value", () => {
      const zeroData: LandingPageResponse = {
        ...mockLandingData,
        portfolio_allocation: {
          btc: {
            total_value: 0,
            percentage_of_portfolio: 0,
            wallet_tokens_value: 0,
            other_sources_value: 0,
          },
          eth: {
            total_value: 0,
            percentage_of_portfolio: 0,
            wallet_tokens_value: 0,
            other_sources_value: 0,
          },
          stablecoins: {
            total_value: 0,
            percentage_of_portfolio: 0,
            wallet_tokens_value: 0,
            other_sources_value: 0,
          },
          others: {
            total_value: 0,
            percentage_of_portfolio: 0,
            wallet_tokens_value: 0,
            other_sources_value: 0,
          },
        },
      };

      const result = calculateAllocation(zeroData);

      expect(result.crypto).toBe(0);
      expect(result.stable).toBe(0);
      expect(result.simplifiedCrypto).toHaveLength(0);
    });

    it("includes stablecoin constituents when stablecoins have value", () => {
      const result = calculateAllocation(mockLandingData);

      // Stablecoins present → 60/40 USDC/USDT split
      expect(result.constituents.stable).toHaveLength(2);
      expect(result.constituents.stable[0].symbol).toBe("USDC");
      expect(result.constituents.stable[1].symbol).toBe("USDT");
    });

    it("filters out assets with zero percentage", () => {
      const partialData: LandingPageResponse = {
        ...mockLandingData,
        portfolio_allocation: {
          btc: {
            total_value: 50000,
            percentage_of_portfolio: 50,
            wallet_tokens_value: 50000,
            other_sources_value: 0,
          },
          eth: {
            total_value: 0,
            percentage_of_portfolio: 0,
            wallet_tokens_value: 0,
            other_sources_value: 0,
          },
          stablecoins: {
            total_value: 50000,
            percentage_of_portfolio: 50,
            wallet_tokens_value: 50000,
            other_sources_value: 0,
          },
          others: {
            total_value: 0,
            percentage_of_portfolio: 0,
            wallet_tokens_value: 0,
            other_sources_value: 0,
          },
        },
      };

      const result = calculateAllocation(partialData);

      // Should only include BTC (ETH and Others are zero)
      expect(result.simplifiedCrypto).toHaveLength(1);
      expect(result.simplifiedCrypto[0].symbol).toBe("BTC");
    });
  });
});

describe("calculateDelta", () => {
  it("returns absolute difference between current and target", () => {
    expect(calculateDelta(60, 70)).toBe(10);
  });

  it("returns positive value when current exceeds target", () => {
    expect(calculateDelta(80, 50)).toBe(30);
  });

  it("returns zero when values are equal", () => {
    expect(calculateDelta(50, 50)).toBe(0);
  });

  it("handles decimal values", () => {
    expect(calculateDelta(64.38, 70)).toBeCloseTo(5.62, 2);
  });
});
