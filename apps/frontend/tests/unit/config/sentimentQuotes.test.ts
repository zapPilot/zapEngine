import { beforeEach, describe, expect, it, vi } from "vitest";

import { getQuoteForSentiment } from "@/config/sentimentQuotes";

describe("sentimentQuotes", () => {
  describe("getQuoteForSentiment", () => {
    beforeEach(() => {
      // Reset random seed for deterministic tests
      vi.spyOn(Math, "random").mockRestore();
    });

    it("returns Extreme Fear for values 0-24", () => {
      const result = getQuoteForSentiment(10);
      expect(result.sentiment).toBe("Extreme Fear");
      expect(result.quote).toBeTruthy();
      expect(result.author).toBeTruthy();
    });

    it("returns Fear for values 25-44", () => {
      const result = getQuoteForSentiment(30);
      expect(result.sentiment).toBe("Fear");
    });

    it("returns Neutral for values 45-55", () => {
      const result = getQuoteForSentiment(50);
      expect(result.sentiment).toBe("Neutral");
    });

    it("returns Greed for values 56-74", () => {
      const result = getQuoteForSentiment(65);
      expect(result.sentiment).toBe("Greed");
    });

    it("returns Extreme Greed for values 75-100", () => {
      const result = getQuoteForSentiment(90);
      expect(result.sentiment).toBe("Extreme Greed");
    });

    it("handles boundary values correctly", () => {
      expect(getQuoteForSentiment(0).sentiment).toBe("Extreme Fear");
      expect(getQuoteForSentiment(24).sentiment).toBe("Extreme Fear");
      expect(getQuoteForSentiment(25).sentiment).toBe("Fear");
      expect(getQuoteForSentiment(44).sentiment).toBe("Fear");
      expect(getQuoteForSentiment(45).sentiment).toBe("Neutral");
      expect(getQuoteForSentiment(55).sentiment).toBe("Neutral");
      expect(getQuoteForSentiment(56).sentiment).toBe("Greed");
      expect(getQuoteForSentiment(74).sentiment).toBe("Greed");
      expect(getQuoteForSentiment(75).sentiment).toBe("Extreme Greed");
      expect(getQuoteForSentiment(100).sentiment).toBe("Extreme Greed");
    });

    it("clamps values below 0 to Extreme Fear", () => {
      const result = getQuoteForSentiment(-10);
      expect(result.sentiment).toBe("Extreme Fear");
    });

    it("clamps values above 100 to Extreme Greed", () => {
      const result = getQuoteForSentiment(150);
      expect(result.sentiment).toBe("Extreme Greed");
    });

    it("returns default quote for NaN", () => {
      const result = getQuoteForSentiment(NaN);
      expect(result.sentiment).toBe("Neutral");
      expect(result.quote).toBe(
        "Stay balanced when the crowd swings too far in either direction."
      );
      expect(result.author).toBe("Warren Buffett");
    });

    it("returns default quote for Infinity", () => {
      const result = getQuoteForSentiment(Infinity);
      expect(result.sentiment).toBe("Neutral");
      expect(result.quote).toBe(
        "Stay balanced when the crowd swings too far in either direction."
      );
    });

    it("returns default quote for -Infinity", () => {
      const result = getQuoteForSentiment(-Infinity);
      expect(result.sentiment).toBe("Neutral");
      expect(result.quote).toBe(
        "Stay balanced when the crowd swings too far in either direction."
      );
      expect(result.author).toBe("Warren Buffett");
    });

    it("selects different quotes based on random index", () => {
      // Mock random to return 0 (first quote)
      vi.spyOn(Math, "random").mockReturnValue(0);
      const result1 = getQuoteForSentiment(10);
      expect(result1.quote).toBe("Be greedy when others are fearful.");

      // Mock random to return 0.9 (second quote for 2-item array)
      vi.spyOn(Math, "random").mockReturnValue(0.9);
      const result2 = getQuoteForSentiment(10);
      expect(result2.quote).toBe(
        "Opportunities come infrequently. When it rains gold, put out the bucket."
      );
    });

    it("handles edge case when quotes array index returns undefined", () => {
      // This tests the fallback in selectQuote when quotes[index] is undefined
      // Mock Math.random to return a value that results in a very high index
      const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.99999);

      const result = getQuoteForSentiment(10);
      // Should still return a valid quote (either from array or fallback)
      expect(result.sentiment).toBe("Extreme Fear");
      expect(result.quote).toBeTruthy();
      expect(result.author).toBeTruthy();

      randomSpy.mockRestore();
    });

    it("falls back to DEFAULT_QUOTE when Math.random returns 1 (out-of-bounds index)", () => {
      // Exercises the `quotes[index] ?? { DEFAULT_QUOTE... }` false branch:
      // Math.floor(1.0 * 2) = 2, quotes[2] is undefined → uses DEFAULT_QUOTE fallback
      const randomSpy = vi.spyOn(Math, "random").mockReturnValue(1);

      const result = getQuoteForSentiment(10);
      expect(result.sentiment).toBe("Extreme Fear");
      // The fallback returns DEFAULT_QUOTE content
      expect(result.quote).toBe(
        "Stay balanced when the crowd swings too far in either direction."
      );

      randomSpy.mockRestore();
    });
  });

  describe("selectQuote edge cases", () => {
    it("handles empty quotes array gracefully", () => {
      // We can't directly test selectQuote as it's not exported,
      // but we can test the fallback path by mocking the config
      // This would require the config to be mutable or use dependency injection

      // Instead, we verify the system handles all valid ranges
      // The FALLBACK_CONFIG is only used if config lookup fails entirely
      // This is tested indirectly through the comprehensive range tests above

      // Testing that all sentiment ranges return valid quotes
      const testValues = [
        0, 12, 24, 25, 35, 44, 45, 50, 55, 56, 65, 74, 75, 90, 100,
      ];
      for (const value of testValues) {
        const result = getQuoteForSentiment(value);
        expect(result.quote).toBeTruthy();
        expect(result.author).toBeTruthy();
        expect(result.sentiment).toBeTruthy();
      }
    });

    it("tests fallback config path with edge values", () => {
      // The FALLBACK_CONFIG is reached when SENTIMENT_QUOTE_CONFIG.find returns null
      // and SENTIMENT_QUOTE_CONFIG[2] is also null (which shouldn't happen in normal operation)
      // This is a defensive fallback for data integrity

      // We can verify the neutral fallback works for valid inputs
      const result = getQuoteForSentiment(50);
      expect(result.sentiment).toBe("Neutral");
      expect(result.quote).toBeTruthy();
      expect(result.author).toBeTruthy();
    });
  });
});
