/**
 * Unit tests for sentimentAdapter.ts
 *
 * Tests the transformation of raw market sentiment data into consumption-ready format.
 * Focuses on ensuring that the regime is derived from the 'status' field,
 * decoupling it from the raw sentiment 'value'.
 */

import { describe, expect, it, vi } from "vitest";

import { processSentimentData } from "@/adapters/portfolio/sentimentAdapter";
import type { MarketSentimentData } from "@/services/sentimentService";

// Mock dependencies
vi.mock("@/constants/regimes", () => ({
  getDefaultQuoteForRegime: vi.fn(regime => `Default quote for ${regime}`),
}));

// We don't verify the internal implementation of getRegimeFromStatus here (that's in regimeMapper.test.ts)
// but we verify that processSentimentData USES the status to determine the regime.
// To do this effectively without implementing the logic again, we rely on the real regimeMapper
// or we could mock it if we wanted to enforce the call.
// Since we want to test the *behavior* of the adapter, using the real mapper is fine as long as we use inputs
// where value and status would produce different results if the wrong one was used.

describe("sentimentAdapter", () => {
  describe("processSentimentData", () => {
    it("should prioritize status over value for regime determination", () => {
      // Scenario: Value is 60 (Greed normally), but Status is "Fear"
      // This can happen if the backend logic overrides the standard ranges
      const mismatchedData: MarketSentimentData = {
        value: 60,
        status: "Fear",
        timestamp: "2025-01-01T00:00:00Z",
        quote: {
          quote: "Test Quote",
          author: "Test Author",
          sentiment: "Fear",
        },
      };

      const result = processSentimentData(mismatchedData);

      expect(result.value).toBe(60);
      expect(result.status).toBe("Fear");
      // If it used value (60), it would be "g" (Greed).
      // Since it uses status "Fear", it should be "f".
      expect(result.regime).toBe("f");
    });

    it("should use 'n' (Neutral) when data is null", () => {
      const result = processSentimentData(null);

      expect(result.value).toBe(50);
      expect(result.status).toBe("Neutral");
      expect(result.regime).toBe("n");
      expect(result.quote).toBe("Default quote for n");
    });

    it("should use provided quote if available", () => {
      const data: MarketSentimentData = {
        value: 10,
        status: "Extreme Fear",
        timestamp: "2025-01-01T00:00:00Z",
        quote: {
          quote: "Custom Quote",
          author: "Author",
          sentiment: "Extreme Fear",
        },
      };

      const result = processSentimentData(data);
      expect(result.quote).toBe("Custom Quote");
    });

    it("should fallback to default quote if provided quote is missing", () => {
      const data: MarketSentimentData = {
        value: 10,
        status: "Extreme Fear",
        timestamp: "2025-01-01T00:00:00Z",
        quote: undefined as any, // Simulate missing quote structure
      };

      const result = processSentimentData(data);
      // specific regime default quote
      expect(result.quote).toBe("Default quote for ef");
    });

    it("should handle case-insensitive status", () => {
      const data: MarketSentimentData = {
        value: 90,
        status: "extreme GREED",
        timestamp: "2025-01-01T00:00:00Z",
        quote: {
          quote: "Q",
          author: "A",
          sentiment: "Extreme Greed",
        },
      };

      const result = processSentimentData(data);
      expect(result.regime).toBe("eg");
    });
  });
});
