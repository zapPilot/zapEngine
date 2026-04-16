/**
 * Unit tests for regimeMapper.ts
 *
 * Tests sentiment-to-regime conversion logic with:
 * - Boundary value testing
 * - Edge case validation
 * - Input validation
 * - Fallback behavior
 */

import { describe, expect, it } from "vitest";

import {
  getRegimeFromSentiment,
  getRegimeFromStatus,
} from "@/lib/domain/regimeMapper";

describe("regimeMapper", () => {
  describe("getRegimeFromSentiment", () => {
    describe("Extreme Fear (ef) - Range: 0-25", () => {
      it("should return ef for sentiment value 0", () => {
        expect(getRegimeFromSentiment(0)).toBe("ef");
      });

      it("should return ef for sentiment value 12", () => {
        expect(getRegimeFromSentiment(12)).toBe("ef");
      });

      it("should return ef for sentiment value 25 (upper boundary)", () => {
        expect(getRegimeFromSentiment(25)).toBe("ef");
      });
    });

    describe("Fear (f) - Range: 26-45", () => {
      it("should return f for sentiment value 26 (lower boundary)", () => {
        expect(getRegimeFromSentiment(26)).toBe("f");
      });

      it("should return f for sentiment value 35", () => {
        expect(getRegimeFromSentiment(35)).toBe("f");
      });

      it("should return f for sentiment value 45 (upper boundary)", () => {
        expect(getRegimeFromSentiment(45)).toBe("f");
      });
    });

    describe("Neutral (n) - Range: 46-54", () => {
      it("should return n for sentiment value 46 (lower boundary)", () => {
        expect(getRegimeFromSentiment(46)).toBe("n");
      });

      it("should return n for sentiment value 50", () => {
        expect(getRegimeFromSentiment(50)).toBe("n");
      });

      it("should return n for sentiment value 54 (upper boundary)", () => {
        expect(getRegimeFromSentiment(54)).toBe("n");
      });
    });

    describe("Greed (g) - Range: 55-75", () => {
      it("should return g for sentiment value 55 (lower boundary)", () => {
        expect(getRegimeFromSentiment(55)).toBe("g");
      });

      it("should return g for sentiment value 65", () => {
        expect(getRegimeFromSentiment(65)).toBe("g");
      });

      it("should return g for sentiment value 75 (upper boundary)", () => {
        expect(getRegimeFromSentiment(75)).toBe("g");
      });
    });

    describe("Extreme Greed (eg) - Range: 76-100", () => {
      it("should return eg for sentiment value 76 (lower boundary)", () => {
        expect(getRegimeFromSentiment(76)).toBe("eg");
      });

      it("should return eg for sentiment value 88", () => {
        expect(getRegimeFromSentiment(88)).toBe("eg");
      });

      it("should return eg for sentiment value 100 (upper boundary)", () => {
        expect(getRegimeFromSentiment(100)).toBe("eg");
      });
    });

    describe("Edge cases and validation", () => {
      it("should default to neutral (n) for negative values", () => {
        expect(getRegimeFromSentiment(-1)).toBe("n");
        expect(getRegimeFromSentiment(-50)).toBe("n");
      });

      it("should default to neutral (n) for values > 100", () => {
        expect(getRegimeFromSentiment(101)).toBe("n");
        expect(getRegimeFromSentiment(150)).toBe("n");
      });

      it("should handle decimal values correctly", () => {
        expect(getRegimeFromSentiment(25.5)).toBe("f");
        expect(getRegimeFromSentiment(45.9)).toBe("n");
        expect(getRegimeFromSentiment(54.1)).toBe("g");
        expect(getRegimeFromSentiment(75.1)).toBe("eg");
      });

      it("should handle NaN by returning neutral", () => {
        expect(getRegimeFromSentiment(NaN)).toBe("n");
      });

      it("should handle Infinity by returning neutral", () => {
        expect(getRegimeFromSentiment(Infinity)).toBe("n");
        expect(getRegimeFromSentiment(-Infinity)).toBe("n");
      });
    });
  });

  describe("Boundary transitions", () => {
    it("should handle transitions between regimes correctly", () => {
      // ef → f transition at 25/26
      expect(getRegimeFromSentiment(25)).toBe("ef");
      expect(getRegimeFromSentiment(25.1)).toBe("f");
      expect(getRegimeFromSentiment(26)).toBe("f");

      // f → n transition at 45/46
      expect(getRegimeFromSentiment(45)).toBe("f");
      expect(getRegimeFromSentiment(45.1)).toBe("n");
      expect(getRegimeFromSentiment(46)).toBe("n");

      // n → g transition at 54/55
      expect(getRegimeFromSentiment(54)).toBe("n");
      expect(getRegimeFromSentiment(54.1)).toBe("g");
      expect(getRegimeFromSentiment(55)).toBe("g");

      // g → eg transition at 75/76
      expect(getRegimeFromSentiment(75)).toBe("g");
      expect(getRegimeFromSentiment(75.1)).toBe("eg");
      expect(getRegimeFromSentiment(76)).toBe("eg");
    });
  });
  describe("getRegimeFromStatus", () => {
    it("should return correct regime for standard status strings", () => {
      expect(getRegimeFromStatus("Extreme Fear")).toBe("ef");
      expect(getRegimeFromStatus("Fear")).toBe("f");
      expect(getRegimeFromStatus("Neutral")).toBe("n");
      expect(getRegimeFromStatus("Greed")).toBe("g");
      expect(getRegimeFromStatus("Extreme Greed")).toBe("eg");
    });

    it("should be case insensitive", () => {
      expect(getRegimeFromStatus("extreme fear")).toBe("ef");
      expect(getRegimeFromStatus("NEUTRAL")).toBe("n");
      expect(getRegimeFromStatus("Greed")).toBe("g");
    });

    it("should handle whitespace", () => {
      expect(getRegimeFromStatus("  Fear  ")).toBe("f");
    });

    it("should return neutral (n) for unknown status", () => {
      expect(getRegimeFromStatus("Unknown Status")).toBe("n");
      expect(getRegimeFromStatus("")).toBe("n");
    });
  });
});
