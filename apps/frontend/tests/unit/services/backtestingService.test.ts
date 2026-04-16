import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { httpUtils } from "@/lib/http";
import {
  _sampleTimelineData as sampleTimelineData,
  getBacktestingStrategiesV3,
  MAX_CHART_POINTS,
  MIN_CHART_POINTS,
  runBacktest,
} from "@/services/backtestingService";
import type {
  BacktestRequest,
  BacktestTimelinePoint,
} from "@/types/backtesting";

function createTimelinePoint(
  index: number,
  opts?: { withTransfers?: boolean }
): BacktestTimelinePoint {
  const date = new Date("2024-01-01");
  date.setDate(date.getDate() + index);

  return {
    market: {
      date: date.toISOString().split("T")[0] ?? "2024-01-01",
      token_price: { btc: 50000 + index * 10 },
      sentiment: 50,
      sentiment_label: "neutral",
    },
    strategies: {
      dca_classic: {
        portfolio: {
          spot_usd: 5000,
          stable_usd: 5000,
          total_value: 10000 + index * 5,
          allocation: {
            spot: 0.5,
            stable: 0.5,
          },
        },
        signal: null,
        decision: {
          action: "hold",
          reason: "baseline_dca",
          rule_group: "none",
          target_allocation: {
            spot: 0.5,
            stable: 0.5,
          },
          immediate: false,
        },
        execution: {
          event: null,
          transfers: [],
          blocked_reason: null,
          step_count: 0,
          steps_remaining: 0,
          interval_days: 0,
        },
      },
      dma_gated_fgi_default: {
        portfolio: {
          spot_usd: 6000,
          stable_usd: 4000,
          total_value: 10000 + index * 8,
          allocation: {
            spot: 0.6,
            stable: 0.4,
          },
        },
        signal: null,
        decision: {
          action: opts?.withTransfers ? "buy" : "hold",
          reason: "dma_fgi",
          rule_group: opts?.withTransfers ? "dma_fgi" : "none",
          target_allocation: {
            spot: 0.6,
            stable: 0.4,
          },
          immediate: false,
        },
        execution: {
          event: opts?.withTransfers ? "rebalance" : null,
          transfers: opts?.withTransfers
            ? [
                {
                  from_bucket: "stable",
                  to_bucket: "spot",
                  amount_usd: 123,
                },
              ]
            : [],
          blocked_reason: null,
          step_count: opts?.withTransfers ? 1 : 0,
          steps_remaining: 0,
          interval_days: 3,
        },
      },
    },
  };
}

const analyticsEnginePostSpy = vi.spyOn(httpUtils.analyticsEngine, "post");
const analyticsEngineGetSpy = vi.spyOn(httpUtils.analyticsEngine, "get");

describe("backtestingService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    analyticsEnginePostSpy.mockReset();
    analyticsEngineGetSpy.mockReset();
  });

  afterAll(() => {
    analyticsEnginePostSpy.mockRestore();
    analyticsEngineGetSpy.mockRestore();
  });

  describe("runBacktest", () => {
    it("calls the v3 compare endpoint with a 10-minute timeout", async () => {
      const mockRequest: BacktestRequest = {
        total_capital: 10000,
        days: 30,
        configs: [
          { config_id: "dca_classic", strategy_id: "dca_classic", params: {} },
          {
            config_id: "dma_gated_fgi_default",
            strategy_id: "dma_gated_fgi",
            params: { pacing: { k: 5, r_max: 1 } },
          },
        ],
      };

      analyticsEnginePostSpy.mockResolvedValue({
        strategies: {},
        timeline: [],
      });

      await runBacktest(mockRequest);

      expect(analyticsEnginePostSpy).toHaveBeenCalledWith(
        "/api/v3/backtesting/compare",
        mockRequest,
        { timeout: 600000 }
      );
    });

    it("maps API errors through the backtesting error mapper", async () => {
      analyticsEnginePostSpy.mockRejectedValue(new Error("API Error"));

      await expect(
        runBacktest({
          total_capital: 10000,
          configs: [{ config_id: "dca_classic", strategy_id: "dca_classic" }],
        })
      ).rejects.toThrow(
        "An unexpected error occurred while running the backtest."
      );
    });

    it("samples the timeline before returning the response", async () => {
      const timeline = Array.from({ length: 220 }, (_, i) =>
        createTimelinePoint(i)
      );

      analyticsEnginePostSpy.mockResolvedValue({
        strategies: {},
        timeline,
      });

      const result = await runBacktest({
        total_capital: 10000,
        configs: [{ config_id: "dca_classic", strategy_id: "dca_classic" }],
      });

      expect(result.timeline.length).toBeLessThanOrEqual(MAX_CHART_POINTS);
    });
  });

  describe("sampleTimelineData", () => {
    it("returns empty array for undefined or empty timeline", () => {
      expect(sampleTimelineData(undefined)).toEqual([]);
      expect(sampleTimelineData([])).toEqual([]);
    });

    it("returns the timeline unchanged when it is already small enough", () => {
      const timeline = Array.from({ length: MIN_CHART_POINTS }, (_, i) =>
        createTimelinePoint(i)
      );

      expect(sampleTimelineData(timeline)).toEqual(timeline);
    });

    it("preserves first, last, and transfer points", () => {
      const transferIndices = [10, 50, 150];
      const timeline = Array.from({ length: 220 }, (_, i) =>
        createTimelinePoint(i, { withTransfers: transferIndices.includes(i) })
      );

      const result = sampleTimelineData(timeline);
      const dates = new Set(result.map(point => point.market.date));

      expect(dates.has(timeline[0]?.market.date ?? "")).toBe(true);
      expect(dates.has(timeline[timeline.length - 1]?.market.date ?? "")).toBe(
        true
      );
      for (const index of transferIndices) {
        expect(dates.has(timeline[index]?.market.date ?? "")).toBe(true);
      }
    });

    it("does not treat DCA-only activity as a critical event", () => {
      const timeline = Array.from({ length: 220 }, (_, i) =>
        createTimelinePoint(i, { withTransfers: i === 100 })
      ).map(point => ({
        ...point,
        strategies: {
          dca_classic: {
            ...point.strategies.dca_classic,
            execution: {
              ...point.strategies.dca_classic.execution,
              transfers:
                point.market.date ===
                (timelineDate => timelineDate)(point.market.date)
                  ? point.strategies.dma_gated_fgi_default.execution.transfers
                  : [],
            },
          },
        },
      }));

      const result = sampleTimelineData(timeline as BacktestTimelinePoint[]);

      expect(result.length).toBeLessThanOrEqual(MAX_CHART_POINTS);
      expect(result.length).toBeLessThan(timeline.length);
    });
  });

  describe("getBacktestingStrategiesV3", () => {
    it("calls the v3 strategies endpoint via GET", async () => {
      const mockStrategies = {
        catalog_version: "2.0.0",
        strategies: [
          {
            strategy_id: "dca_classic",
            display_name: "DCA Classic",
            description: "Baseline",
            param_schema: { type: "object", additionalProperties: false },
            default_params: {},
            supports_daily_suggestion: false,
          },
        ],
      };
      analyticsEngineGetSpy.mockResolvedValue(mockStrategies);

      const result = await getBacktestingStrategiesV3();

      expect(analyticsEngineGetSpy).toHaveBeenCalledWith(
        "/api/v3/backtesting/strategies"
      );
      expect(result).toEqual(mockStrategies);
    });

    it("maps GET errors with the backtesting error mapper", async () => {
      analyticsEngineGetSpy.mockRejectedValue(new Error("API Error"));

      await expect(getBacktestingStrategiesV3()).rejects.toThrow(
        "An unexpected error occurred while running the backtest."
      );
    });
  });
});
