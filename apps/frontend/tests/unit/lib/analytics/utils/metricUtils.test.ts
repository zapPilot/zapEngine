import { describe, expect, it } from "vitest";

import {
  createPlaceholderMetric,
  extractDrawdownSummary,
  getSharpePercentile,
} from "@/lib/analytics/utils/metricUtils";
import type { UnifiedDashboardResponse } from "@/services/analyticsService";

describe("metricUtils", () => {
  describe("createPlaceholderMetric", () => {
    it("returns neutral trend with given value and subValue", () => {
      const metric = createPlaceholderMetric("N/A", "Coming soon");
      expect(metric).toEqual({
        value: "N/A",
        subValue: "Coming soon",
        trend: "neutral",
      });
    });
  });

  describe("getSharpePercentile", () => {
    it("returns 1 for sharpe > 3", () => {
      expect(getSharpePercentile(3.5)).toBe(1);
    });

    it("returns 5 for sharpe > 2 and <= 3", () => {
      expect(getSharpePercentile(2.5)).toBe(5);
    });

    it("returns 10 for sharpe > 1.5 and <= 2", () => {
      expect(getSharpePercentile(1.8)).toBe(10);
    });

    it("returns 25 for sharpe > 1 and <= 1.5", () => {
      expect(getSharpePercentile(1.2)).toBe(25);
    });

    it("returns 50 for sharpe <= 1", () => {
      expect(getSharpePercentile(0.5)).toBe(50);
      expect(getSharpePercentile(1.0)).toBe(50);
    });

    it("handles boundary values exactly", () => {
      expect(getSharpePercentile(3)).toBe(5); // not > 3
      expect(getSharpePercentile(2)).toBe(10); // not > 2
      expect(getSharpePercentile(1.5)).toBe(25); // not > 1.5
      expect(getSharpePercentile(1)).toBe(50); // not > 1
    });
  });

  describe("extractDrawdownSummary", () => {
    it("returns defaults when dashboard is undefined", () => {
      const result = extractDrawdownSummary(undefined);
      expect(result.maxDrawdownPct).toBe(0);
      expect(result.recoveryDays).toBe(0);
      expect(result.underwaterData).toEqual([]);
      expect(result.maxDrawdownDate).toBeDefined();
    });

    it("returns defaults when drawdown_analysis is missing", () => {
      const dashboard = {} as UnifiedDashboardResponse;
      const result = extractDrawdownSummary(dashboard);
      expect(result.maxDrawdownPct).toBe(0);
      expect(result.underwaterData).toEqual([]);
    });

    it("returns defaults when enhanced summary is missing", () => {
      const dashboard = {
        drawdown_analysis: { enhanced: {} },
      } as unknown as UnifiedDashboardResponse;
      const result = extractDrawdownSummary(dashboard);
      expect(result.maxDrawdownPct).toBe(0);
      expect(result.recoveryDays).toBe(0);
    });

    it("extracts values from complete drawdown data", () => {
      const dashboard = {
        drawdown_analysis: {
          enhanced: {
            summary: {
              max_drawdown_pct: -15.5,
              max_drawdown_date: "2024-03-15",
              recovery_days: 30,
            },
          },
          underwater_recovery: {
            underwater_data: [
              { drawdown_pct: -5, date: "2024-03-01" },
              { drawdown_pct: -15.5, date: "2024-03-15" },
            ],
          },
        },
      } as unknown as UnifiedDashboardResponse;

      const result = extractDrawdownSummary(dashboard);
      expect(result.maxDrawdownPct).toBe(-15.5);
      expect(result.maxDrawdownDate).toBe("2024-03-15");
      expect(result.recoveryDays).toBe(30);
      expect(result.underwaterData).toHaveLength(2);
    });

    it("returns empty underwater data when underwater_recovery is missing", () => {
      const dashboard = {
        drawdown_analysis: {
          enhanced: {
            summary: { max_drawdown_pct: -10 },
          },
        },
      } as unknown as UnifiedDashboardResponse;

      const result = extractDrawdownSummary(dashboard);
      expect(result.underwaterData).toEqual([]);
    });
  });
});
