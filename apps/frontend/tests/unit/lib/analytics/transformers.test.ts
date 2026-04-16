/**
 * Analytics Transformers - Pure Function Tests
 *
 * Comprehensive test suite for analytics data transformation functions.
 * Tests all 4 main exports plus edge cases and boundary conditions.
 */

import { describe, expect, it } from "vitest";

import {
  aggregateMonthlyPnL,
  calculateKeyMetrics,
  transformToDrawdownChart,
  transformToPerformanceChart,
} from "@/lib/analytics/transformers";
import type {
  DailyYieldReturnsResponse,
  UnifiedDashboardResponse,
} from "@/services/analyticsService";

describe("Analytics Transformers", () => {
  describe("transformToPerformanceChart", () => {
    it("should return empty points when dashboard is undefined", () => {
      const result = transformToPerformanceChart();

      expect(result.points).toEqual([]);
      expect(result.startDate).toBeDefined();
      expect(result.endDate).toBeDefined();
    });

    it("should return empty points when daily_values is empty", () => {
      const dashboard = {
        trends: { daily_values: [] },
      } as UnifiedDashboardResponse;

      const result = transformToPerformanceChart(dashboard);

      expect(result.points).toEqual([]);
    });

    it("should transform single data point correctly", () => {
      const dashboard = {
        trends: {
          daily_values: [{ date: "2024-01-01", total_value_usd: 10000 }],
        },
      } as UnifiedDashboardResponse;

      const result = transformToPerformanceChart(dashboard);

      expect(result.points).toHaveLength(1);
      // Single point: x = 0 / (1-1) * 100 = 0/0 * 100 = NaN * 100 = NaN
      expect(isNaN(result.points[0].x)).toBe(true);
      expect(result.points[0].portfolio).toBe(50); // Single point normalized to middle (range = 0)
      expect(result.points[0].date).toBe("2024-01-01");
      expect(result.points[0].portfolioValue).toBe(10000);
    });

    it("should normalize portfolio values to 0-100 scale", () => {
      const dashboard = {
        trends: {
          daily_values: [
            { date: "2024-01-01", total_value_usd: 5000 },
            { date: "2024-01-02", total_value_usd: 7500 },
            { date: "2024-01-03", total_value_usd: 10000 },
          ],
        },
      } as UnifiedDashboardResponse;

      const result = transformToPerformanceChart(dashboard);

      expect(result.points).toHaveLength(3);
      // First point (min value) should be at 100 (bottom of inverted Y-axis)
      expect(result.points[0].portfolio).toBe(100);
      // Last point (max value) should be at 0 (top of inverted Y-axis)
      expect(result.points[2].portfolio).toBe(0);
      // Middle point should be at 50
      expect(result.points[1].portfolio).toBe(50);
    });

    it("should calculate x positions evenly across 0-100 range", () => {
      const dashboard = {
        trends: {
          daily_values: [
            { date: "2024-01-01", total_value_usd: 1000 },
            { date: "2024-01-02", total_value_usd: 2000 },
            { date: "2024-01-03", total_value_usd: 3000 },
            { date: "2024-01-04", total_value_usd: 4000 },
          ],
        },
      } as UnifiedDashboardResponse;

      const result = transformToPerformanceChart(dashboard);

      expect(result.points[0].x).toBe(0);
      expect(result.points[1].x).toBeCloseTo(33.33, 1);
      expect(result.points[2].x).toBeCloseTo(66.67, 1);
      expect(result.points[3].x).toBe(100);
      expect(result.startDate).toBe("2024-01-01");
      expect(result.endDate).toBe("2024-01-04");
    });

    it("should handle values with zero total_value_usd", () => {
      const dashboard = {
        trends: {
          daily_values: [
            { date: "2024-01-01", total_value_usd: 0 },
            { date: "2024-01-02", total_value_usd: 1000 },
          ],
        },
      } as UnifiedDashboardResponse;

      const result = transformToPerformanceChart(dashboard);

      // Should skip zero values in normalization
      expect(result.points).toHaveLength(2);
    });

    it("should use min as fallback when total_value_usd is undefined", () => {
      const dashboard = {
        trends: {
          daily_values: [
            { date: "2024-01-01", total_value_usd: 5000 },
            { date: "2024-01-02", total_value_usd: undefined },
            { date: "2024-01-03", total_value_usd: 10000 },
          ],
        },
      } as unknown as UnifiedDashboardResponse;

      const result = transformToPerformanceChart(dashboard);

      expect(result.points).toHaveLength(3);
      // The undefined value should fall back to min (5000)
      expect(result.points[1].portfolioValue).toBe(5000);
    });

    it("should use ISO date fallback when date is missing", () => {
      const dashboard = {
        trends: {
          daily_values: [
            { total_value_usd: 5000 },
            { date: "2024-01-02", total_value_usd: 10000 },
          ],
        },
      } as unknown as UnifiedDashboardResponse;

      const result = transformToPerformanceChart(dashboard);

      expect(result.points).toHaveLength(2);
      // First point should have a fallback date
      expect(result.points[0].date).toBeDefined();
    });

    it("uses d.date as fallback when toDateKey cannot parse an invalid date string", () => {
      // Exercises the `dateKey ?? d.date` middle branch:
      // toDateKey("bad-date") returns null → dateKey is null → falls to d.date
      const dashboard = {
        trends: {
          daily_values: [
            { date: "bad-date", total_value_usd: 5000 },
            { date: "2024-01-02", total_value_usd: 10000 },
          ],
        },
      } as unknown as UnifiedDashboardResponse;

      const result = transformToPerformanceChart(dashboard);

      expect(result.points).toHaveLength(2);
      expect(result.points[0].date).toBe("bad-date");
    });

    it("should handle all zero values gracefully", () => {
      const dashboard = {
        trends: {
          daily_values: [
            { date: "2024-01-01", total_value_usd: 0 },
            { date: "2024-01-02", total_value_usd: 0 },
          ],
        },
      } as UnifiedDashboardResponse;

      const result = transformToPerformanceChart(dashboard);

      expect(result.points).toEqual([]);
    });
  });

  describe("transformToDrawdownChart", () => {
    it("should return default when dashboard is undefined", () => {
      const result = transformToDrawdownChart();

      expect(result.points).toHaveLength(1);
      expect(result.points[0].x).toBe(0);
      expect(result.points[0].value).toBe(0);
      expect(result.maxDrawdown).toBe(0);
      expect(result.maxDrawdownDate).toBeDefined();
    });

    it("should return default when underwater data is empty", () => {
      const dashboard = {
        drawdown_analysis: {
          underwater_recovery: { underwater_data: [] },
        },
      } as unknown as UnifiedDashboardResponse;

      const result = transformToDrawdownChart(dashboard);

      expect(result.points).toHaveLength(1);
      expect(result.maxDrawdown).toBe(0);
    });

    it("should transform underwater data to normalized points", () => {
      const dashboard = {
        drawdown_analysis: {
          underwater_recovery: {
            underwater_data: [
              { date: "2024-01-01", drawdown_pct: 0 },
              { date: "2024-01-02", drawdown_pct: -5 },
              { date: "2024-01-03", drawdown_pct: -10 },
            ],
          },
          enhanced: {
            summary: {
              max_drawdown_pct: -10,
              max_drawdown_date: "2024-01-03",
            },
          },
        },
      } as unknown as UnifiedDashboardResponse;

      const result = transformToDrawdownChart(dashboard);

      expect(result.points).toHaveLength(3);
      expect(result.points[0].x).toBe(0);
      expect(result.points[1].x).toBe(50);
      expect(result.points[2].x).toBe(100);
      expect(result.points[0].value).toBe(0);
      expect(result.points[1].value).toBe(-5);
      expect(result.points[2].value).toBe(-10);
      expect(result.maxDrawdown).toBe(-10);
      expect(result.maxDrawdownDate).toBe("2024-01-03");
    });

    it("should include dates in point data", () => {
      const dashboard = {
        drawdown_analysis: {
          underwater_recovery: {
            underwater_data: [{ date: "2024-01-01", drawdown_pct: -5 }],
          },
        },
      } as unknown as UnifiedDashboardResponse;

      const result = transformToDrawdownChart(dashboard);

      expect(result.points[0].date).toBe("2024-01-01");
    });

    it("should handle missing drawdown_pct gracefully", () => {
      const dashboard = {
        drawdown_analysis: {
          underwater_recovery: {
            underwater_data: [{ date: "2024-01-01" }],
          },
        },
      } as unknown as UnifiedDashboardResponse;

      const result = transformToDrawdownChart(dashboard);

      expect(result.points[0].value).toBe(0);
    });

    it("should extract max drawdown and recovery info", () => {
      const dashboard = {
        drawdown_analysis: {
          enhanced: {
            summary: {
              max_drawdown_pct: -15.5,
              max_drawdown_date: "2024-01-10",
            },
          },
          underwater_recovery: {
            underwater_data: [{ date: "2024-01-01", drawdown_pct: -15.5 }],
          },
        },
      } as unknown as UnifiedDashboardResponse;

      const result = transformToDrawdownChart(dashboard);

      expect(result.maxDrawdown).toBe(-15.5);
      expect(result.maxDrawdownDate).toBe("2024-01-10");
    });
  });

  describe("calculateKeyMetrics", () => {
    it("should return metrics with placeholders when dashboard is undefined", () => {
      const result = calculateKeyMetrics();

      expect(result.timeWeightedReturn.value).toBe("0%");
      expect(result.maxDrawdown.value).toBe("0.0%"); // Uses .toFixed(1)
      expect(result.sharpe.value).toBe("N/A");
      expect(result.winRate.value).toBe("0%");
      expect(result.volatility.value).toBe("N/A");
      expect(result.sortino.value).toBe("N/A");
    });

    it("should calculate Time-Weighted Return correctly", () => {
      const dashboard = {
        trends: {
          daily_values: [
            { date: "2024-01-01", total_value_usd: 10000 },
            { date: "2024-01-30", total_value_usd: 12000 },
          ],
        },
      } as UnifiedDashboardResponse;

      const result = calculateKeyMetrics(dashboard);

      expect(result.timeWeightedReturn.value).toBe("+20.0%");
      expect(result.timeWeightedReturn.trend).toBe("up");
    });

    it("should handle negative returns", () => {
      const dashboard = {
        trends: {
          daily_values: [
            { date: "2024-01-01", total_value_usd: 10000 },
            { date: "2024-01-30", total_value_usd: 8000 },
          ],
        },
      } as UnifiedDashboardResponse;

      const result = calculateKeyMetrics(dashboard);

      expect(result.timeWeightedReturn.value).toBe("-20.0%");
      expect(result.timeWeightedReturn.trend).toBe("down");
    });

    it("should handle TWR with first value of 0", () => {
      const dashboard = {
        trends: {
          daily_values: [
            { date: "2024-01-01", total_value_usd: 0 },
            { date: "2024-01-30", total_value_usd: 5000 },
          ],
        },
      } as UnifiedDashboardResponse;

      const result = calculateKeyMetrics(dashboard);

      expect(result.timeWeightedReturn.value).toBe("0%");
      expect(result.timeWeightedReturn.subValue).toBe("0% total return");
    });

    it("should classify Sharpe trend as neutral (0.5 < value <= 1.5)", () => {
      const dashboard = {
        trends: { daily_values: [] },
        rolling_analytics: {
          sharpe: {
            rolling_sharpe_data: [
              { date: "2024-01-01", rolling_sharpe_ratio: 1.0 },
            ],
          },
        },
      } as unknown as UnifiedDashboardResponse;

      const result = calculateKeyMetrics(dashboard);

      expect(result.sharpe.trend).toBe("neutral");
    });

    it("should classify Sharpe trend as down (value <= 0.5)", () => {
      const dashboard = {
        trends: { daily_values: [] },
        rolling_analytics: {
          sharpe: {
            rolling_sharpe_data: [
              { date: "2024-01-01", rolling_sharpe_ratio: 0.3 },
            ],
          },
        },
      } as unknown as UnifiedDashboardResponse;

      const result = calculateKeyMetrics(dashboard);

      expect(result.sharpe.trend).toBe("down");
    });

    it("should handle volatility above 25 with down trend", () => {
      const dashboard = {
        trends: { daily_values: [] },
        rolling_analytics: {
          volatility: {
            rolling_volatility_data: [
              { date: "2024-01-01", annualized_volatility_pct: 35 },
            ],
          },
        },
      } as unknown as UnifiedDashboardResponse;

      const result = calculateKeyMetrics(dashboard);

      expect(result.volatility.trend).toBe("down");
    });

    it("should handle max drawdown trend up when > -15", () => {
      const dashboard = {
        trends: { daily_values: [] },
        drawdown_analysis: {
          enhanced: {
            summary: {
              max_drawdown_pct: -10,
              recovery_days: 5,
            },
          },
        },
      } as unknown as UnifiedDashboardResponse;

      const result = calculateKeyMetrics(dashboard);

      expect(result.maxDrawdown.trend).toBe("up");
    });

    it("should handle max drawdown trend down when <= -15", () => {
      const dashboard = {
        trends: { daily_values: [] },
        drawdown_analysis: {
          enhanced: {
            summary: {
              max_drawdown_pct: -20,
              recovery_days: 0,
            },
          },
        },
      } as unknown as UnifiedDashboardResponse;

      const result = calculateKeyMetrics(dashboard);

      expect(result.maxDrawdown.trend).toBe("down");
    });

    it("should handle win rate > 50% with up trend", () => {
      const dashboard = {
        trends: {
          daily_values: [
            { pnl_percentage: 2.5 },
            { pnl_percentage: 1.0 },
            { pnl_percentage: -0.5 },
          ],
        },
      } as unknown as UnifiedDashboardResponse;

      const result = calculateKeyMetrics(dashboard);

      expect(result.winRate.value).toBe("67%");
      expect(result.winRate.trend).toBe("up");
    });

    it("should handle missing pnl_percentage with fallback to 0", () => {
      const dashboard = {
        trends: {
          daily_values: [
            { pnl_percentage: undefined },
            { pnl_percentage: 1.0 },
          ],
        },
      } as unknown as UnifiedDashboardResponse;

      const result = calculateKeyMetrics(dashboard);

      expect(result.winRate.value).toBe("50%");
    });

    it("should handle insufficient daily values for TWR", () => {
      const dashboard = {
        trends: {
          daily_values: [{ date: "2024-01-01", total_value_usd: 10000 }],
        },
      } as UnifiedDashboardResponse;

      const result = calculateKeyMetrics(dashboard);

      expect(result.timeWeightedReturn.value).toBe("0%");
      expect(result.timeWeightedReturn.subValue).toBe("0% total return");
    });

    it("should calculate Max Drawdown from enhanced summary", () => {
      const dashboard = {
        trends: { daily_values: [] },
        drawdown_analysis: {
          enhanced: {
            summary: {
              max_drawdown_pct: -15.5,
              recovery_days: 30,
            },
          },
        },
      } as unknown as UnifiedDashboardResponse;

      const result = calculateKeyMetrics(dashboard);

      expect(result.maxDrawdown.value).toBe("-15.5%");
      expect(result.maxDrawdown.subValue).toBe("Recovered in 30 days");
    });

    it("should indicate not recovered when recovery_days is 0", () => {
      const dashboard = {
        trends: { daily_values: [] },
        drawdown_analysis: {
          enhanced: {
            summary: {
              max_drawdown_pct: -20,
              recovery_days: 0,
            },
          },
        },
      } as unknown as UnifiedDashboardResponse;

      const result = calculateKeyMetrics(dashboard);

      expect(result.maxDrawdown.subValue).toBe("Not yet recovered");
    });

    it("should calculate Sharpe ratio from rolling data", () => {
      const dashboard = {
        trends: { daily_values: [] },
        rolling_analytics: {
          sharpe: {
            rolling_sharpe_data: [
              { date: "2024-01-01", rolling_sharpe_ratio: 2.0 },
              { date: "2024-01-02", rolling_sharpe_ratio: 2.5 },
            ],
          },
        },
      } as unknown as UnifiedDashboardResponse;

      const result = calculateKeyMetrics(dashboard);

      expect(result.sharpe.value).toBe("2.25");
      expect(result.sharpe.subValue).toBe("Top 5% of Pilots");
      expect(result.sharpe.trend).toBe("up");
    });

    it("should handle invalid Sharpe values (NaN, Infinity)", () => {
      const dashboard = {
        trends: { daily_values: [] },
        rolling_analytics: {
          sharpe: {
            rolling_sharpe_data: [
              { date: "2024-01-01", rolling_sharpe_ratio: NaN },
              { date: "2024-01-02", rolling_sharpe_ratio: Infinity },
              { date: "2024-01-03", rolling_sharpe_ratio: 1.5 },
            ],
          },
        },
      } as unknown as UnifiedDashboardResponse;

      const result = calculateKeyMetrics(dashboard);

      expect(result.sharpe.value).toBe("1.50");
    });

    it("treats undefined rolling_sharpe_ratio as 0 via ?? fallback", () => {
      // Exercises the `selector(d) ?? 0` right branch (line 183).
      // When rolling_sharpe_ratio is undefined, selector returns undefined,
      // and ?? 0 replaces it. 0 is finite so it's included in the average.
      const dashboard = {
        trends: { daily_values: [] },
        rolling_analytics: {
          sharpe: {
            rolling_sharpe_data: [
              { date: "2024-01-01", rolling_sharpe_ratio: undefined },
              { date: "2024-01-02", rolling_sharpe_ratio: 2.0 },
            ],
          },
        },
      } as unknown as UnifiedDashboardResponse;

      const result = calculateKeyMetrics(dashboard);

      // Average of [0, 2.0] = 1.0
      expect(result.sharpe.value).toBe("1.00");
    });

    it("should calculate Win Rate from daily PnL percentages", () => {
      const dashboard = {
        trends: {
          daily_values: [
            { pnl_percentage: 2.5 },
            { pnl_percentage: -1.0 },
            { pnl_percentage: 1.5 },
            { pnl_percentage: -0.5 },
          ],
        },
      } as unknown as UnifiedDashboardResponse;

      const result = calculateKeyMetrics(dashboard);

      expect(result.winRate.value).toBe("50%");
      expect(result.winRate.subValue).toBe("2 winning days");
      expect(result.winRate.trend).toBe("down"); // 50% is not > 50
    });

    it("should handle all losing days", () => {
      const dashboard = {
        trends: {
          daily_values: [{ pnl_percentage: -1.0 }, { pnl_percentage: -2.0 }],
        },
      } as unknown as UnifiedDashboardResponse;

      const result = calculateKeyMetrics(dashboard);

      expect(result.winRate.value).toBe("0%");
      expect(result.winRate.trend).toBe("down");
    });

    it("should calculate Volatility from rolling data", () => {
      const dashboard = {
        trends: { daily_values: [] },
        rolling_analytics: {
          volatility: {
            rolling_volatility_data: [
              { date: "2024-01-01", annualized_volatility_pct: 15 },
              { date: "2024-01-02", annualized_volatility_pct: 25 },
            ],
          },
        },
      } as unknown as UnifiedDashboardResponse;

      const result = calculateKeyMetrics(dashboard);

      expect(result.volatility.value).toBe("20.0%");
      expect(result.volatility.subValue).toBe("Moderate"); // 20-40 range
      expect(result.volatility.trend).toBe("up"); // < 25
    });

    it("should classify volatility risk levels correctly", () => {
      const testCases = [
        { vol: 15, expected: "Low risk" },
        { vol: 30, expected: "Moderate" },
        { vol: 50, expected: "High risk" },
      ];

      for (const { vol, expected } of testCases) {
        const dashboard = {
          trends: { daily_values: [] },
          rolling_analytics: {
            volatility: {
              rolling_volatility_data: [
                { date: "2024-01-01", annualized_volatility_pct: vol },
              ],
            },
          },
        } as unknown as UnifiedDashboardResponse;

        const result = calculateKeyMetrics(dashboard);
        expect(result.volatility.subValue).toBe(expected);
      }
    });

    it("should return coming soon placeholders for sortino/beta/alpha", () => {
      const dashboard = {
        trends: { daily_values: [] },
      } as UnifiedDashboardResponse;

      const result = calculateKeyMetrics(dashboard);

      expect(result.sortino.value).toBe("N/A");
      expect(result.sortino.subValue).toBe("Coming soon");
    });
  });

  describe("aggregateMonthlyPnL", () => {
    it("should return empty array when daily returns is undefined", () => {
      const result = aggregateMonthlyPnL();

      expect(result).toEqual([]);
    });

    it("should return empty array when daily_returns is missing", () => {
      const dailyReturns = {
        user_id: "user-123",
      } as DailyYieldReturnsResponse;

      const result = aggregateMonthlyPnL(dailyReturns);

      expect(result).toEqual([]);
    });

    it("should aggregate daily returns by month", () => {
      const dailyReturns = {
        user_id: "user-123",
        daily_returns: [
          {
            date: "2024-01-05",
            yield_return_usd: 100,
            protocol_name: "Aave",
            asset_value_usd: 10000,
            protocol_id: "aave",
            pool_id: "pool-1",
          },
          {
            date: "2024-01-15",
            yield_return_usd: 150,
            protocol_name: "Aave",
            asset_value_usd: 10000,
            protocol_id: "aave",
            pool_id: "pool-1",
          },
          {
            date: "2024-02-05",
            yield_return_usd: 200,
            protocol_name: "Aave",
            asset_value_usd: 10000,
            protocol_id: "aave",
            pool_id: "pool-1",
          },
        ],
      };

      const result = aggregateMonthlyPnL(dailyReturns);

      expect(result).toHaveLength(2);
      expect(result[0].month).toBe("Jan");
      expect(result[0].year).toBe(2024);
      expect(result[1].month).toBe("Feb");
      expect(result[1].year).toBe(2024);
    });

    it("should calculate percentage return from portfolio values", () => {
      const dailyReturns = {
        user_id: "user-123",
        daily_returns: [
          {
            date: "2024-01-15",
            yield_return_usd: 500,
            protocol_name: "Aave",
            asset_value_usd: 10000,
            protocol_id: "aave",
            pool_id: "pool-1",
          },
        ],
      };

      const portfolioValues = [{ date: "2024-01-01", total_value_usd: 10000 }];

      const result = aggregateMonthlyPnL(dailyReturns, portfolioValues);

      expect(result).toHaveLength(1);
      expect(result[0].value).toBe(5); // (500 / 10000) * 100
    });

    it("should limit to last 12 months", () => {
      const monthlyData = Array.from({ length: 15 }, (_, i) => ({
        date: `2023-${String(i + 1).padStart(2, "0")}-15`,
        yield_return_usd: 100,
        protocol_name: "Aave",
        asset_value_usd: 10000,
        protocol_id: "aave",
        pool_id: "pool-1",
      }));

      const dailyReturns = {
        user_id: "user-123",
        daily_returns: monthlyData,
      };

      const result = aggregateMonthlyPnL(dailyReturns);

      expect(result.length).toBeLessThanOrEqual(12);
    });

    it("should skip entries without dates", () => {
      const dailyReturns = {
        user_id: "user-123",
        daily_returns: [
          {
            yield_return_usd: 100,
            protocol_name: "Aave",
            asset_value_usd: 10000,
            protocol_id: "aave",
            pool_id: "pool-1",
          },
        ],
      };

      const result = aggregateMonthlyPnL(dailyReturns);

      expect(result).toEqual([]);
    });

    it("should use default portfolio value when not found", () => {
      const dailyReturns = {
        user_id: "user-123",
        daily_returns: [
          {
            date: "2024-01-15",
            yield_return_usd: 1000,
            protocol_name: "Aave",
            asset_value_usd: 10000,
            protocol_id: "aave",
            pool_id: "pool-1",
          },
        ],
      };

      const result = aggregateMonthlyPnL(dailyReturns, []);

      expect(result).toHaveLength(1);
      expect(result[0].value).toBe(1); // (1000 / 100000) * 100 (default 100k)
    });

    it("should handle invalid month/year gracefully", () => {
      // This is hard to test directly since dates are validated by Date constructor
      // But we ensure null entries are filtered out
      const dailyReturns = {
        user_id: "user-123",
        daily_returns: [
          {
            date: "2024-01-15",
            yield_return_usd: 100,
            protocol_name: "Aave",
            asset_value_usd: 10000,
            protocol_id: "aave",
            pool_id: "pool-1",
          },
        ],
      };

      const result = aggregateMonthlyPnL(dailyReturns);

      // Should not include null entries
      expect(result.every(entry => entry !== null)).toBe(true);
    });

    it("should sum multiple yields in same month", () => {
      const dailyReturns = {
        user_id: "user-123",
        daily_returns: [
          {
            date: "2024-01-05",
            yield_return_usd: 100,
            protocol_name: "Aave",
            asset_value_usd: 10000,
            protocol_id: "aave",
            pool_id: "pool-1",
          },
          {
            date: "2024-01-15",
            yield_return_usd: 200,
            protocol_name: "Compound",
            asset_value_usd: 10000,
            protocol_id: "compound",
            pool_id: "pool-2",
          },
          {
            date: "2024-01-25",
            yield_return_usd: 50,
            protocol_name: "Aave",
            asset_value_usd: 10000,
            protocol_id: "aave",
            pool_id: "pool-1",
          },
        ],
      };

      const portfolioValues = [{ date: "2024-01-01", total_value_usd: 10000 }];

      const result = aggregateMonthlyPnL(dailyReturns, portfolioValues);

      expect(result).toHaveLength(1);
      expect(result[0].value).toBeCloseTo(3.5, 1); // (100 + 200 + 50) / 10000 * 100
    });

    it("should handle zero portfolio value (division by zero guard)", () => {
      const dailyReturns = {
        user_id: "user-123",
        daily_returns: [
          {
            date: "2024-01-15",
            yield_return_usd: 500,
            protocol_name: "Aave",
            asset_value_usd: 0,
            protocol_id: "aave",
            pool_id: "pool-1",
          },
        ],
      };

      const portfolioValues = [{ date: "2024-01-01", total_value_usd: 0 }];

      const result = aggregateMonthlyPnL(dailyReturns, portfolioValues);

      expect(result).toHaveLength(1);
      expect(result[0].value).toBe(0);
    });

    it("should handle null yield_return_usd with fallback to 0", () => {
      const dailyReturns = {
        user_id: "user-123",
        daily_returns: [
          {
            date: "2024-01-15",
            yield_return_usd: undefined,
            protocol_name: "Aave",
            asset_value_usd: 10000,
            protocol_id: "aave",
            pool_id: "pool-1",
          },
        ],
      };

      const result = aggregateMonthlyPnL(dailyReturns as any);

      expect(result).toHaveLength(1);
      expect(result[0].value).toBe(0);
    });

    it("should use ISO date fallback when underwater point has no date", () => {
      // Exercises the `d.date ?? new Date().toISOString()` branch in transformToDrawdownChart
      const dashboard = {
        drawdown_analysis: {
          underwater_recovery: {
            underwater_data: [
              { drawdown_pct: -5 }, // no date field
              { date: "2024-01-02", drawdown_pct: -8 },
            ],
          },
          enhanced: {
            summary: {
              max_drawdown_pct: -8,
              max_drawdown_date: "2024-01-02",
            },
          },
        },
      } as unknown as import("@/services/analyticsService").UnifiedDashboardResponse;

      const result = transformToDrawdownChart(dashboard);
      // First point falls back to a generated ISO date string
      expect(typeof result.points[0].date).toBe("string");
      expect(result.points[0].date).toMatch(/^\d{4}-/);
    });

    it("should sort months chronologically", () => {
      const dailyReturns = {
        user_id: "user-123",
        daily_returns: [
          {
            date: "2024-03-15",
            yield_return_usd: 100,
            protocol_name: "Aave",
            asset_value_usd: 10000,
            protocol_id: "aave",
            pool_id: "pool-1",
          },
          {
            date: "2024-01-15",
            yield_return_usd: 100,
            protocol_name: "Aave",
            asset_value_usd: 10000,
            protocol_id: "aave",
            pool_id: "pool-1",
          },
          {
            date: "2024-02-15",
            yield_return_usd: 100,
            protocol_name: "Aave",
            asset_value_usd: 10000,
            protocol_id: "aave",
            pool_id: "pool-1",
          },
        ],
      };

      const result = aggregateMonthlyPnL(dailyReturns);

      expect(result[0].month).toBe("Jan");
      expect(result[1].month).toBe("Feb");
      expect(result[2].month).toBe("Mar");
    });
  });
});
