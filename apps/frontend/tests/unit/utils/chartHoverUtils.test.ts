import { describe, expect, it } from "vitest";

import {
  calculateDailyVolatility,
  getDrawdownSeverity,
  getDrawdownSeverityColor,
  getSharpeColor,
  getSharpeInterpretation,
  getVolatilityRiskColor,
  getVolatilityRiskLevel,
} from "@/utils/chartHoverUtils";

describe("chartHoverUtils", () => {
  describe("getDrawdownSeverity", () => {
    it.each([
      { input: 0, expected: "Minor" },
      { input: -4.99, expected: "Minor" },
      { input: -5, expected: "Moderate" },
      { input: -9.99, expected: "Moderate" },
      { input: -10, expected: "Significant" },
      { input: -19.99, expected: "Significant" },
      { input: -20, expected: "Severe" },
    ])("maps drawdown %p to severity %p", ({ input, expected }) => {
      expect(getDrawdownSeverity(input)).toBe(expected);
    });
  });

  describe("getSharpeInterpretation", () => {
    it.each([
      { value: 2.1, interpretation: "Excellent" },
      { value: 1.5, interpretation: "Good" },
      { value: 0.75, interpretation: "Fair" },
      { value: 0.2, interpretation: "Poor" },
      { value: -0.1, interpretation: "Very Poor" },
    ])("interprets Sharpe ratio %p as %p", ({ value, interpretation }) => {
      expect(getSharpeInterpretation(value)).toBe(interpretation);
    });
  });

  describe("getVolatilityRiskLevel", () => {
    it.each([
      { vol: 10, level: "Low" },
      { vol: 20, level: "Moderate" },
      { vol: 30, level: "High" },
      { vol: 40, level: "Very High" },
    ])("categorises volatility %p as %p", ({ vol, level }) => {
      expect(getVolatilityRiskLevel(vol)).toBe(level);
    });
  });

  describe("calculateDailyVolatility", () => {
    it("should calculate daily volatility from annualized", () => {
      // sqrt(252) ≈ 15.87
      const annualized = 15.87;
      const daily = calculateDailyVolatility(annualized);
      expect(daily).toBeCloseTo(1, 1);
    });

    it("should return 0 for 0 volatility", () => {
      expect(calculateDailyVolatility(0)).toBe(0);
    });

    it("should handle typical DeFi volatility", () => {
      // 60% annualized / sqrt(252) ≈ 3.78% daily
      const daily = calculateDailyVolatility(60);
      expect(daily).toBeCloseTo(3.78, 1);
    });
  });

  describe("getSharpeColor", () => {
    it("should return green for excellent Sharpe", () => {
      expect(getSharpeColor(2.5)).toBe("#10b981");
    });

    it("should return lime for good Sharpe", () => {
      expect(getSharpeColor(1.5)).toBe("#84cc16");
    });

    it("should return amber for fair Sharpe", () => {
      expect(getSharpeColor(0.75)).toBe("#fbbf24");
    });

    it("should return orange for poor Sharpe", () => {
      expect(getSharpeColor(0.3)).toBe("#fb923c");
    });

    it("should return red for critical Sharpe", () => {
      expect(getSharpeColor(-0.5)).toBe("#ef4444");
    });
  });

  describe("getDrawdownSeverityColor", () => {
    it("should return lime colors for Minor severity", () => {
      const result = getDrawdownSeverityColor("Minor");
      expect(result.color).toBe("text-lime-400");
      expect(result.bgColor).toBe("bg-lime-500/20");
    });

    it("should return yellow colors for Moderate severity", () => {
      const result = getDrawdownSeverityColor("Moderate");
      expect(result.color).toBe("text-yellow-400");
    });

    it("should return orange colors for Significant severity", () => {
      const result = getDrawdownSeverityColor("Significant");
      expect(result.color).toBe("text-orange-400");
    });

    it("should return red colors for Severe severity", () => {
      const result = getDrawdownSeverityColor("Severe");
      expect(result.color).toBe("text-red-400");
    });
  });

  describe("getVolatilityRiskColor", () => {
    it("should return green colors for Low risk", () => {
      const result = getVolatilityRiskColor("Low");
      expect(result.color).toBe("text-green-400");
    });

    it("should return lime colors for Moderate risk", () => {
      const result = getVolatilityRiskColor("Moderate");
      expect(result.color).toBe("text-lime-400");
    });

    it("should return orange colors for High risk", () => {
      const result = getVolatilityRiskColor("High");
      expect(result.color).toBe("text-orange-400");
    });

    it("should return red colors for Very High risk", () => {
      const result = getVolatilityRiskColor("Very High");
      expect(result.color).toBe("text-red-400");
    });
  });
});
