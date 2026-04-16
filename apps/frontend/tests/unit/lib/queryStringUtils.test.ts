/**
 * Unit tests for queryStringUtils
 *
 * Tests the buildAnalyticsQueryString utility function
 * for URL query string construction.
 */

import { describe, expect, it } from "vitest";

import { buildAnalyticsQueryString } from "@/lib/analytics/queryStringUtils";

import type { DashboardWindowParams } from "../../../src/services/analyticsService";

describe("queryStringUtils", () => {
  describe("buildAnalyticsQueryString", () => {
    describe("Empty and undefined params", () => {
      it("should return empty string for empty params object", () => {
        const result = buildAnalyticsQueryString({});
        expect(result).toBe("");
      });

      it("should return empty string when all params are undefined", () => {
        const params: DashboardWindowParams = {
          trend_days: undefined,
          risk_days: undefined,
          drawdown_days: undefined,
          allocation_days: undefined,
          rolling_days: undefined,
          metrics: undefined,
          wallet_address: undefined,
        };
        const result = buildAnalyticsQueryString(params);
        expect(result).toBe("");
      });

      it("should return empty string for empty metrics array", () => {
        const result = buildAnalyticsQueryString({ metrics: [] });
        expect(result).toBe("");
      });
    });

    describe("Single numeric parameters", () => {
      it("should handle single trend_days param", () => {
        const result = buildAnalyticsQueryString({ trend_days: 30 });
        expect(result).toBe("?trend_days=30");
      });

      it("should handle single risk_days param", () => {
        const result = buildAnalyticsQueryString({ risk_days: 45 });
        expect(result).toBe("?risk_days=45");
      });

      it("should handle single drawdown_days param", () => {
        const result = buildAnalyticsQueryString({ drawdown_days: 90 });
        expect(result).toBe("?drawdown_days=90");
      });

      it("should handle single allocation_days param", () => {
        const result = buildAnalyticsQueryString({ allocation_days: 40 });
        expect(result).toBe("?allocation_days=40");
      });

      it("should handle single rolling_days param", () => {
        const result = buildAnalyticsQueryString({ rolling_days: 60 });
        expect(result).toBe("?rolling_days=60");
      });

      it("should handle zero value for numeric param", () => {
        const result = buildAnalyticsQueryString({ trend_days: 0 });
        expect(result).toBe("?trend_days=0");
      });
    });

    describe("Multiple numeric parameters", () => {
      it("should handle multiple numeric params", () => {
        const result = buildAnalyticsQueryString({
          trend_days: 30,
          risk_days: 45,
        });
        expect(result).toContain("trend_days=30");
        expect(result).toContain("risk_days=45");
        expect(result).toMatch(/^\?/); // Starts with ?
        expect(result).toContain("&"); // Has separator
      });

      it("should handle all numeric params", () => {
        const result = buildAnalyticsQueryString({
          trend_days: 30,
          risk_days: 45,
          drawdown_days: 90,
          allocation_days: 40,
          rolling_days: 60,
        });
        expect(result).toContain("trend_days=30");
        expect(result).toContain("risk_days=45");
        expect(result).toContain("drawdown_days=90");
        expect(result).toContain("allocation_days=40");
        expect(result).toContain("rolling_days=60");
      });

      it("should skip undefined values while including defined ones", () => {
        const result = buildAnalyticsQueryString({
          trend_days: 30,
          risk_days: undefined,
          drawdown_days: 90,
        });
        expect(result).toContain("trend_days=30");
        expect(result).toContain("drawdown_days=90");
        expect(result).not.toContain("risk_days");
      });
    });

    describe("Metrics array", () => {
      it("should handle single metric in array", () => {
        const result = buildAnalyticsQueryString({
          metrics: ["sharpe"],
        });
        expect(result).toBe("?metrics=sharpe");
      });

      it("should join multiple metrics with comma", () => {
        const result = buildAnalyticsQueryString({
          metrics: ["sharpe", "volatility"],
        });
        // URLSearchParams encodes comma as %2C
        expect(result).toBe("?metrics=sharpe%2Cvolatility");
      });

      it("should handle three metrics", () => {
        const result = buildAnalyticsQueryString({
          metrics: ["sharpe", "volatility", "drawdown"],
        });
        expect(result).toBe("?metrics=sharpe%2Cvolatility%2Cdrawdown");
      });

      it("should not include metrics param for empty array", () => {
        const result = buildAnalyticsQueryString({
          metrics: [],
        });
        expect(result).toBe("");
        expect(result).not.toContain("metrics");
      });
    });

    describe("Wallet address filter", () => {
      it("should include wallet_address when provided", () => {
        const result = buildAnalyticsQueryString({
          wallet_address: "0x1234567890abcdef1234567890abcdef12345678",
        });
        expect(result).toBe(
          "?wallet_address=0x1234567890abcdef1234567890abcdef12345678"
        );
      });

      it("should include wallet_address alongside other params", () => {
        const result = buildAnalyticsQueryString({
          trend_days: 30,
          metrics: ["sharpe"],
          wallet_address: "0x1234567890abcdef1234567890abcdef12345678",
        });
        expect(result).toContain("trend_days=30");
        expect(result).toContain("metrics=sharpe");
        expect(result).toContain(
          "wallet_address=0x1234567890abcdef1234567890abcdef12345678"
        );
      });

      it("should skip wallet_address when empty string is provided", () => {
        const result = buildAnalyticsQueryString({
          wallet_address: "",
        });
        expect(result).toBe("");
        expect(result).not.toContain("wallet_address");
      });
    });

    describe("Combined parameters", () => {
      it("should handle numeric params with metrics array", () => {
        const result = buildAnalyticsQueryString({
          trend_days: 30,
          metrics: ["sharpe", "volatility"],
        });
        expect(result).toContain("trend_days=30");
        expect(result).toContain("metrics=sharpe%2Cvolatility");
      });

      it("should handle all params together", () => {
        const result = buildAnalyticsQueryString({
          trend_days: 30,
          risk_days: 45,
          drawdown_days: 90,
          allocation_days: 40,
          rolling_days: 60,
          metrics: ["sharpe", "volatility", "drawdown"],
        });
        expect(result).toContain("trend_days=30");
        expect(result).toContain("risk_days=45");
        expect(result).toContain("drawdown_days=90");
        expect(result).toContain("allocation_days=40");
        expect(result).toContain("rolling_days=60");
        expect(result).toContain("metrics=sharpe%2Cvolatility%2Cdrawdown");
      });

      it("should handle partial params with metrics", () => {
        const result = buildAnalyticsQueryString({
          trend_days: 30,
          risk_days: undefined,
          metrics: ["sharpe"],
        });
        expect(result).toContain("trend_days=30");
        expect(result).toContain("metrics=sharpe");
        expect(result).not.toContain("risk_days");
      });
    });

    describe("Edge cases", () => {
      it("should handle very large numeric values", () => {
        const result = buildAnalyticsQueryString({
          trend_days: 999999,
        });
        expect(result).toBe("?trend_days=999999");
      });

      it("should handle metrics with special characters", () => {
        const result = buildAnalyticsQueryString({
          metrics: ["metric-with-dash", "metric_with_underscore"],
        });
        expect(result).toContain("metric-with-dash");
        expect(result).toContain("metric_with_underscore");
      });

      it("should preserve order of numeric params", () => {
        const result = buildAnalyticsQueryString({
          trend_days: 1,
          risk_days: 2,
          drawdown_days: 3,
          allocation_days: 4,
          rolling_days: 5,
        });

        // Check that params appear in consistent order
        const trendIndex = result.indexOf("trend_days");
        const riskIndex = result.indexOf("risk_days");
        const drawdownIndex = result.indexOf("drawdown_days");
        const allocationIndex = result.indexOf("allocation_days");
        const rollingIndex = result.indexOf("rolling_days");

        expect(trendIndex).toBeLessThan(riskIndex);
        expect(riskIndex).toBeLessThan(drawdownIndex);
        expect(drawdownIndex).toBeLessThan(allocationIndex);
        expect(allocationIndex).toBeLessThan(rollingIndex);
      });
    });

    describe("Return value format", () => {
      it("should start with ? when params exist", () => {
        const result = buildAnalyticsQueryString({ trend_days: 30 });
        expect(result).toMatch(/^\?/);
      });

      it("should not have trailing &", () => {
        const result = buildAnalyticsQueryString({
          trend_days: 30,
          risk_days: 45,
        });
        expect(result).not.toMatch(/&$/);
      });

      it("should use & as separator between params", () => {
        const result = buildAnalyticsQueryString({
          trend_days: 30,
          risk_days: 45,
        });
        expect(result).toContain("&");
      });
    });
  });
});
