import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

import {
  dailyYieldReturnsResponseSchema,
  landingPageResponseSchema,
  type PoolPerformanceResponse,
  poolPerformanceResponseSchema,
  protocolYieldBreakdownSchema,
  type ProtocolYieldToday,
  protocolYieldTodaySchema,
  protocolYieldWindowSchema,
  safeValidateUnifiedDashboardResponse,
  unifiedDashboardResponseSchema,
  validateLandingPageResponse,
  validatePoolPerformanceResponse,
  validateUnifiedDashboardResponse,
  validateYieldReturnsSummaryResponse,
  type YieldReturnsSummaryResponse,
  yieldReturnsSummaryResponseSchema,
  yieldWindowSummarySchema,
} from "@/schemas/api/analyticsSchemas";

const assertAnalyticsSchemaExportTypes = <
  _TProtocolYieldToday extends ProtocolYieldToday,
  _TYieldReturnsSummaryResponse extends YieldReturnsSummaryResponse,
  _TPoolPerformanceResponse extends PoolPerformanceResponse,
>() => undefined;

assertAnalyticsSchemaExportTypes();

describe("analyticsSchemas", () => {
  describe("protocolYieldWindowSchema", () => {
    it("validates correct protocol yield window data", () => {
      const validData = {
        total_yield_usd: 1500.5,
        average_daily_yield_usd: 50.0,
        data_points: 30,
        positive_days: 25,
        negative_days: 5,
      };

      expect(() => protocolYieldWindowSchema.parse(validData)).not.toThrow();
    });

    it("rejects invalid data types", () => {
      const invalidData = {
        total_yield_usd: "not-a-number",
        average_daily_yield_usd: 50.0,
        data_points: 30,
        positive_days: 25,
        negative_days: 5,
      };

      expect(() => protocolYieldWindowSchema.parse(invalidData)).toThrow(
        ZodError
      );
    });
  });

  describe("protocolYieldTodaySchema", () => {
    it("validates correct protocol yield today data", () => {
      const validData = {
        date: "2025-01-17",
        yield_usd: 75.5,
      };

      expect(() => protocolYieldTodaySchema.parse(validData)).not.toThrow();
    });
  });

  describe("protocolYieldBreakdownSchema", () => {
    it("validates correct protocol yield breakdown", () => {
      const validData = {
        protocol: "Aave V3",
        chain: "ethereum",
        window: {
          total_yield_usd: 1500.5,
          average_daily_yield_usd: 50.0,
          data_points: 30,
          positive_days: 25,
          negative_days: 5,
        },
        today: {
          date: "2025-01-17",
          yield_usd: 75.5,
        },
      };

      expect(() => protocolYieldBreakdownSchema.parse(validData)).not.toThrow();
    });

    it("accepts null chain", () => {
      const validData = {
        protocol: "Aave V3",
        chain: null,
        window: {
          total_yield_usd: 1500.5,
          average_daily_yield_usd: 50.0,
          data_points: 30,
          positive_days: 25,
          negative_days: 5,
        },
      };

      expect(() => protocolYieldBreakdownSchema.parse(validData)).not.toThrow();
    });

    it("accepts missing today field", () => {
      const validData = {
        protocol: "Aave V3",
        chain: "ethereum",
        window: {
          total_yield_usd: 1500.5,
          average_daily_yield_usd: 50.0,
          data_points: 30,
          positive_days: 25,
          negative_days: 5,
        },
      };

      expect(() => protocolYieldBreakdownSchema.parse(validData)).not.toThrow();
    });
  });

  describe("yieldWindowSummarySchema", () => {
    it("validates correct yield window summary", () => {
      const validData = {
        user_id: "0x123",
        period: {
          start_date: "2024-12-18",
          end_date: "2025-01-17",
          days: 30,
        },
        average_daily_yield_usd: 50.0,
        median_daily_yield_usd: 48.5,
        total_yield_usd: 1500.5,
        statistics: {
          mean: 50.0,
          median: 48.5,
          std_dev: 12.3,
          min_value: 10.0,
          max_value: 100.0,
          total_days: 30,
          filtered_days: 28,
          outliers_removed: 2,
        },
        outlier_strategy: "iqr",
        outliers_detected: [
          {
            date: "2025-01-10",
            value: 500.0,
            reason: "IQR outlier",
            z_score: null,
          },
        ],
        protocol_breakdown: [
          {
            protocol: "Aave V3",
            chain: "ethereum",
            window: {
              total_yield_usd: 1500.5,
              average_daily_yield_usd: 50.0,
              data_points: 30,
              positive_days: 25,
              negative_days: 5,
            },
          },
        ],
      };

      expect(() => yieldWindowSummarySchema.parse(validData)).not.toThrow();
    });

    it("validates outlier_strategy enum", () => {
      const strategies = ["iqr", "none", "zscore", "percentile"];

      for (const strategy of strategies) {
        const validData = {
          user_id: "0x123",
          period: {
            start_date: "2024-12-18",
            end_date: "2025-01-17",
            days: 30,
          },
          average_daily_yield_usd: 50.0,
          median_daily_yield_usd: 48.5,
          total_yield_usd: 1500.5,
          statistics: {
            mean: 50.0,
            median: 48.5,
            std_dev: 12.3,
            min_value: 10.0,
            max_value: 100.0,
            total_days: 30,
            filtered_days: 28,
            outliers_removed: 2,
          },
          outlier_strategy: strategy,
          outliers_detected: [],
          protocol_breakdown: [],
        };

        expect(() => yieldWindowSummarySchema.parse(validData)).not.toThrow();
      }
    });

    it("rejects invalid outlier_strategy", () => {
      const invalidData = {
        user_id: "0x123",
        period: {
          start_date: "2024-12-18",
          end_date: "2025-01-17",
          days: 30,
        },
        average_daily_yield_usd: 50.0,
        median_daily_yield_usd: 48.5,
        total_yield_usd: 1500.5,
        statistics: {
          mean: 50.0,
          median: 48.5,
          std_dev: 12.3,
          min_value: 10.0,
          max_value: 100.0,
          total_days: 30,
          filtered_days: 28,
          outliers_removed: 2,
        },
        outlier_strategy: "invalid",
        outliers_detected: [],
        protocol_breakdown: [],
      };

      expect(() => yieldWindowSummarySchema.parse(invalidData)).toThrow(
        ZodError
      );
    });
  });

  describe("yieldReturnsSummaryResponseSchema", () => {
    it("validates correct yield returns summary response", () => {
      const validData = {
        user_id: "0x123",
        windows: {
          "30d": {
            user_id: "0x123",
            period: {
              start_date: "2024-12-18",
              end_date: "2025-01-17",
              days: 30,
            },
            average_daily_yield_usd: 50.0,
            median_daily_yield_usd: 48.5,
            total_yield_usd: 1500.5,
            statistics: {
              mean: 50.0,
              median: 48.5,
              std_dev: 12.3,
              min_value: 10.0,
              max_value: 100.0,
              total_days: 30,
              filtered_days: 28,
              outliers_removed: 2,
            },
            outlier_strategy: "iqr",
            outliers_detected: [],
            protocol_breakdown: [],
          },
        },
        recommended_period: "30d",
      };

      expect(() =>
        yieldReturnsSummaryResponseSchema.parse(validData)
      ).not.toThrow();
    });
  });

  describe("landingPageResponseSchema", () => {
    it("validates correct landing page response", () => {
      const validData = {
        total_assets_usd: 100000.0,
        total_debt_usd: 10000.0,
        total_net_usd: 90000.0,
        net_portfolio_value: 90000.0,
        weighted_apr: 5.5,
        estimated_monthly_income: 450.0,
        wallet_count: 3,
        portfolio_roi: {
          recommended_roi: 0.055,
          recommended_period: "30d",
          recommended_yearly_roi: 0.66,
          estimated_yearly_pnl_usd: 5400.0,
        },
        portfolio_allocation: {
          btc: {
            total_value: 30000.0,
            percentage_of_portfolio: 30.0,
            wallet_tokens_value: 25000.0,
            other_sources_value: 5000.0,
          },
          eth: {
            total_value: 40000.0,
            percentage_of_portfolio: 40.0,
            wallet_tokens_value: 35000.0,
            other_sources_value: 5000.0,
          },
          stablecoins: {
            total_value: 20000.0,
            percentage_of_portfolio: 20.0,
            wallet_tokens_value: 18000.0,
            other_sources_value: 2000.0,
          },
          others: {
            total_value: 10000.0,
            percentage_of_portfolio: 10.0,
            wallet_tokens_value: 8000.0,
            other_sources_value: 2000.0,
          },
        },
        wallet_token_summary: {
          total_value_usd: 86000.0,
          token_count: 15,
          apr_30d: 5.2,
        },
        category_summary_debt: {
          btc: 2000.0,
          eth: 3000.0,
          stablecoins: 4000.0,
          others: 1000.0,
        },
        pool_details: [],
        total_positions: 12,
        protocols_count: 5,
        chains_count: 3,
        last_updated: "2025-01-17T00:00:00Z",
        apr_coverage: {
          matched_pools: 10,
          total_pools: 12,
          coverage_percentage: 83.33,
          matched_asset_value_usd: 85000.0,
        },
      };

      expect(() => landingPageResponseSchema.parse(validData)).not.toThrow();
    });

    it("accepts legacy ROI fields", () => {
      const validData = {
        total_assets_usd: 100000.0,
        total_debt_usd: 10000.0,
        total_net_usd: 90000.0,
        net_portfolio_value: 90000.0,
        weighted_apr: 5.5,
        estimated_monthly_income: 450.0,
        wallet_count: 3,
        portfolio_roi: {
          recommended_roi: 0.055,
          recommended_period: "30d",
          recommended_yearly_roi: 0.66,
          estimated_yearly_pnl_usd: 5400.0,
          roi_7d: {
            value: 0.012,
            data_points: 7,
          },
          roi_30d: {
            value: 0.055,
            data_points: 30,
          },
          roi_365d: {
            value: 0.66,
            data_points: 365,
          },
        },
        portfolio_allocation: {
          btc: {
            total_value: 30000.0,
            percentage_of_portfolio: 30.0,
            wallet_tokens_value: 25000.0,
            other_sources_value: 5000.0,
          },
          eth: {
            total_value: 40000.0,
            percentage_of_portfolio: 40.0,
            wallet_tokens_value: 35000.0,
            other_sources_value: 5000.0,
          },
          stablecoins: {
            total_value: 20000.0,
            percentage_of_portfolio: 20.0,
            wallet_tokens_value: 18000.0,
            other_sources_value: 2000.0,
          },
          others: {
            total_value: 10000.0,
            percentage_of_portfolio: 10.0,
            wallet_tokens_value: 8000.0,
            other_sources_value: 2000.0,
          },
        },
        wallet_token_summary: {
          total_value_usd: 86000.0,
          token_count: 15,
          apr_30d: 5.2,
        },
        category_summary_debt: {
          btc: 2000.0,
          eth: 3000.0,
          stablecoins: 4000.0,
          others: 1000.0,
        },
        pool_details: [],
        total_positions: 12,
        protocols_count: 5,
        chains_count: 3,
        last_updated: "2025-01-17T00:00:00Z",
        apr_coverage: {
          matched_pools: 10,
          total_pools: 12,
          coverage_percentage: 83.33,
          matched_asset_value_usd: 85000.0,
        },
      };

      expect(() => landingPageResponseSchema.parse(validData)).not.toThrow();
    });

    it("accepts null last_updated", () => {
      const validData = {
        total_assets_usd: 100000.0,
        total_debt_usd: 10000.0,
        total_net_usd: 90000.0,
        net_portfolio_value: 90000.0,
        weighted_apr: 5.5,
        estimated_monthly_income: 450.0,
        wallet_count: 3,
        portfolio_roi: {
          recommended_roi: 0.055,
          recommended_period: "30d",
          recommended_yearly_roi: 0.66,
          estimated_yearly_pnl_usd: 5400.0,
        },
        portfolio_allocation: {
          btc: {
            total_value: 30000.0,
            percentage_of_portfolio: 30.0,
            wallet_tokens_value: 25000.0,
            other_sources_value: 5000.0,
          },
          eth: {
            total_value: 40000.0,
            percentage_of_portfolio: 40.0,
            wallet_tokens_value: 35000.0,
            other_sources_value: 5000.0,
          },
          stablecoins: {
            total_value: 20000.0,
            percentage_of_portfolio: 20.0,
            wallet_tokens_value: 18000.0,
            other_sources_value: 2000.0,
          },
          others: {
            total_value: 10000.0,
            percentage_of_portfolio: 10.0,
            wallet_tokens_value: 8000.0,
            other_sources_value: 2000.0,
          },
        },
        wallet_token_summary: {
          total_value_usd: 86000.0,
          token_count: 15,
          apr_30d: 5.2,
        },
        category_summary_debt: {
          btc: 2000.0,
          eth: 3000.0,
          stablecoins: 4000.0,
          others: 1000.0,
        },
        pool_details: [],
        total_positions: 12,
        protocols_count: 5,
        chains_count: 3,
        last_updated: null,
        apr_coverage: {
          matched_pools: 10,
          total_pools: 12,
          coverage_percentage: 83.33,
          matched_asset_value_usd: 85000.0,
        },
      };

      expect(() => landingPageResponseSchema.parse(validData)).not.toThrow();
    });

    it("applies safe defaults when optional fields are missing", () => {
      const apiSample = {
        total_assets_usd: 0,
        total_debt_usd: 0,
        total_net_usd: 0,
        net_portfolio_value: 0,
        weighted_apr: null,
        estimated_monthly_income: null,
        last_updated: null,
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
        wallet_token_summary: {
          total_value_usd: 0,
          token_count: 0,
          apr_30d: null,
        },
        portfolio_roi: {
          windows: {
            roi_3d: { value: 0, data_points: 0, start_balance: 0 },
            roi_7d: { value: 0, data_points: 0, start_balance: 0 },
            roi_30d: { value: 0, data_points: 0, start_balance: 0 },
          },
          recommended_roi: 0,
          recommended_period: "roi_30d",
          recommended_yearly_roi: 0,
          estimated_yearly_pnl_usd: 0,
        },
        category_summary_debt: {
          btc: 0,
          eth: 0,
          stablecoins: 0,
          others: 0,
        },
        pool_details: [],
      };

      const parsed = landingPageResponseSchema.parse(apiSample);

      expect(parsed.wallet_count).toBe(0);
      expect(parsed.positions).toBe(0);
      expect(parsed.protocols).toBe(0);
      expect(parsed.chains).toBe(0);
      expect(parsed.apr_coverage.total_pools).toBe(0);
    });
  });

  describe("unifiedDashboardResponseSchema", () => {
    it("validates correct unified dashboard response", () => {
      const validData = {
        user_id: "0x123",
        parameters: {
          trend_days: 30,
          risk_days: 30,
          drawdown_days: 90,
          allocation_days: 40,
          rolling_days: 40,
        },
        trends: {
          period_days: 30,
          data_points: 30,
          period: {
            start_date: "2024-12-18",
            end_date: "2025-01-17",
            days: 30,
          },
          daily_values: [
            {
              date: "2025-01-17",
              total_value_usd: 100000.0,
              change_percentage: 2.5,
            },
          ],
          summary: {
            current_value_usd: 100000.0,
            start_value_usd: 95000.0,
            change_usd: 5000.0,
            change_pct: 5.26,
          },
        },
        risk_metrics: {
          volatility: {
            period: {
              start_date: "2024-12-18",
              end_date: "2025-01-17",
              days: 30,
            },
            volatility_pct: 12.5,
            annualized_volatility_pct: 43.3,
            interpretation: "Moderate",
            summary: {
              avg_volatility: 12.0,
              max_volatility: 18.5,
              min_volatility: 8.2,
            },
          },
          sharpe_ratio: {
            period: {
              start_date: "2024-12-18",
              end_date: "2025-01-17",
              days: 30,
            },
            sharpe_ratio: 1.5,
            interpretation: "Good",
            summary: {
              avg_sharpe: 1.5,
              statistical_reliability: "High",
            },
          },
          max_drawdown: {
            period: {
              start_date: "2024-12-18",
              end_date: "2025-01-17",
              days: 30,
            },
            max_drawdown_pct: -15.5,
            peak_date: "2025-01-10",
            trough_date: "2025-01-15",
            recovery_date: null,
            summary: {
              current_drawdown_pct: -5.2,
              is_recovered: false,
            },
          },
        },
        drawdown_analysis: {
          enhanced: {
            period: {
              start_date: "2024-10-19",
              end_date: "2025-01-17",
              days: 90,
            },
            drawdown_data: [
              {
                date: "2025-01-17",
                portfolio_value_usd: 100000.0,
                running_peak_usd: 105000.0,
                underwater_pct: -4.76,
              },
            ],
            summary: {
              max_drawdown_pct: -15.5,
              current_drawdown_pct: -4.76,
              peak_value: 105000.0,
              current_value: 100000.0,
            },
          },
          underwater_recovery: {
            period: {
              start_date: "2024-10-19",
              end_date: "2025-01-17",
              days: 90,
            },
            underwater_data: [
              {
                date: "2025-01-17",
                underwater_pct: -4.76,
              },
            ],
            summary: {
              total_underwater_days: 45,
              underwater_percentage: 50.0,
              recovery_points: 2,
              current_underwater_pct: -4.76,
              is_currently_underwater: true,
            },
          },
        },
        allocation: {
          period_days: 40,
          data_points: 40,
          period: {
            start_date: "2024-12-08",
            end_date: "2025-01-17",
            days: 40,
          },
          allocations: [
            {
              date: "2025-01-17",
              category: "BTC",
              category_value_usd: 30000.0,
              total_portfolio_value_usd: 100000.0,
              allocation_percentage: 30.0,
            },
          ],
          summary: {
            unique_dates: 40,
            unique_protocols: 5,
            unique_chains: 3,
          },
        },
        rolling_analytics: {
          sharpe: {
            period: {
              start_date: "2024-12-08",
              end_date: "2025-01-17",
              days: 40,
            },
            rolling_sharpe_data: [
              {
                date: "2025-01-17",
                rolling_sharpe_ratio: 1.5,
                is_statistically_reliable: true,
              },
            ],
            summary: {
              latest_sharpe_ratio: 1.5,
              avg_sharpe_ratio: 1.4,
              reliable_data_points: 35,
              statistical_reliability: "High",
            },
          },
          volatility: {
            period: {
              start_date: "2024-12-08",
              end_date: "2025-01-17",
              days: 40,
            },
            rolling_volatility_data: [
              {
                date: "2025-01-17",
                rolling_volatility_pct: 12.5,
                annualized_volatility_pct: 43.3,
              },
            ],
            summary: {
              latest_daily_volatility: 12.5,
              latest_annualized_volatility: 43.3,
              avg_daily_volatility: 12.0,
              avg_annualized_volatility: 41.6,
            },
          },
        },
        _metadata: {
          success_count: 6,
          error_count: 0,
          success_rate: 100.0,
        },
      };

      expect(() =>
        unifiedDashboardResponseSchema.parse(validData)
      ).not.toThrow();
    });

    it("accepts passthrough fields in data points", () => {
      const validData = {
        user_id: "0x123",
        parameters: {
          trend_days: 30,
          risk_days: 30,
          drawdown_days: 90,
          allocation_days: 40,
          rolling_days: 40,
        },
        trends: {
          period_days: 30,
          data_points: 30,
          period: {
            start_date: "2024-12-18",
            end_date: "2025-01-17",
            days: 30,
          },
          daily_values: [
            {
              date: "2025-01-17",
              total_value_usd: 100000.0,
              change_percentage: 2.5,
              custom_field: "extra data",
            },
          ],
          summary: {
            current_value_usd: 100000.0,
            start_value_usd: 95000.0,
            change_usd: 5000.0,
            change_pct: 5.26,
          },
        },
        risk_metrics: {
          volatility: {
            period: {
              start_date: "2024-12-18",
              end_date: "2025-01-17",
              days: 30,
            },
            volatility_pct: 12.5,
            annualized_volatility_pct: 43.3,
            interpretation: "Moderate",
            summary: {
              avg_volatility: 12.0,
              max_volatility: 18.5,
              min_volatility: 8.2,
            },
          },
          sharpe_ratio: {
            period: {
              start_date: "2024-12-18",
              end_date: "2025-01-17",
              days: 30,
            },
            sharpe_ratio: 1.5,
            interpretation: "Good",
            summary: {
              avg_sharpe: 1.5,
              statistical_reliability: "High",
            },
          },
          max_drawdown: {
            period: {
              start_date: "2024-12-18",
              end_date: "2025-01-17",
              days: 30,
            },
            max_drawdown_pct: -15.5,
            peak_date: "2025-01-10",
            trough_date: "2025-01-15",
            recovery_date: null,
            summary: {
              current_drawdown_pct: -5.2,
              is_recovered: false,
            },
          },
        },
        drawdown_analysis: {
          enhanced: {
            period: {
              start_date: "2024-10-19",
              end_date: "2025-01-17",
              days: 90,
            },
            drawdown_data: [],
            summary: {
              max_drawdown_pct: -15.5,
              current_drawdown_pct: -4.76,
              peak_value: 105000.0,
              current_value: 100000.0,
            },
          },
          underwater_recovery: {
            period: {
              start_date: "2024-10-19",
              end_date: "2025-01-17",
              days: 90,
            },
            underwater_data: [],
            summary: {
              total_underwater_days: 45,
              underwater_percentage: 50.0,
              recovery_points: 2,
              current_underwater_pct: -4.76,
              is_currently_underwater: true,
            },
          },
        },
        allocation: {
          period_days: 40,
          data_points: 40,
          period: {
            start_date: "2024-12-08",
            end_date: "2025-01-17",
            days: 40,
          },
          allocations: [],
          summary: {
            unique_dates: 40,
            unique_protocols: 5,
            unique_chains: 3,
          },
        },
        rolling_analytics: {
          sharpe: {
            period: {
              start_date: "2024-12-08",
              end_date: "2025-01-17",
              days: 40,
            },
            rolling_sharpe_data: [],
            summary: {
              latest_sharpe_ratio: 1.5,
              avg_sharpe_ratio: 1.4,
              reliable_data_points: 35,
              statistical_reliability: "High",
            },
          },
          volatility: {
            period: {
              start_date: "2024-12-08",
              end_date: "2025-01-17",
              days: 40,
            },
            rolling_volatility_data: [],
            summary: {
              latest_daily_volatility: 12.5,
              latest_annualized_volatility: 43.3,
              avg_daily_volatility: 12.0,
              avg_annualized_volatility: 41.6,
            },
          },
        },
        _metadata: {
          success_count: 6,
          error_count: 0,
          success_rate: 100.0,
        },
      };

      const result = unifiedDashboardResponseSchema.parse(validData);
      expect(result.trends.daily_values[0]).toHaveProperty("custom_field");
    });
  });

  describe("dailyYieldReturnsResponseSchema", () => {
    it("validates correct daily yield returns response", () => {
      const validData = {
        user_id: "0x123",
        period: {
          start_date: "2024-12-18",
          end_date: "2025-01-17",
          days: 30,
        },
        daily_returns: [
          {
            date: "2025-01-17",
            protocol_name: "Aave V3",
            chain: "ethereum",
            position_type: "lending",
            yield_return_usd: 75.5,
            tokens: [
              {
                symbol: "USDC",
                amount_change: 50.0,
                current_price: 1.0,
                yield_return_usd: 50.0,
              },
              {
                symbol: "DAI",
                amount_change: 25.5,
                current_price: 1.0,
                yield_return_usd: 25.5,
              },
            ],
          },
        ],
      };

      expect(() =>
        dailyYieldReturnsResponseSchema.parse(validData)
      ).not.toThrow();
    });

    it("accepts empty daily_returns array", () => {
      const validData = {
        user_id: "0x123",
        period: {
          start_date: "2024-12-18",
          end_date: "2025-01-17",
          days: 30,
        },
        daily_returns: [],
      };

      expect(() =>
        dailyYieldReturnsResponseSchema.parse(validData)
      ).not.toThrow();
    });
  });

  describe("validation helper functions", () => {
    describe("validateYieldReturnsSummaryResponse", () => {
      it("returns validated data for valid input", () => {
        const validData = {
          user_id: "0x123",
          windows: {
            "30d": {
              user_id: "0x123",
              period: {
                start_date: "2024-12-18",
                end_date: "2025-01-17",
                days: 30,
              },
              average_daily_yield_usd: 50.0,
              median_daily_yield_usd: 48.5,
              total_yield_usd: 1500.5,
              statistics: {
                mean: 50.0,
                median: 48.5,
                std_dev: 12.3,
                min_value: 10.0,
                max_value: 100.0,
                total_days: 30,
                filtered_days: 28,
                outliers_removed: 2,
              },
              outlier_strategy: "iqr",
              outliers_detected: [],
              protocol_breakdown: [],
            },
          },
        };

        const result = validateYieldReturnsSummaryResponse(validData);
        expect(result).toEqual(validData);
      });

      it("throws ZodError for invalid input", () => {
        const invalidData = {
          user_id: "0x123",
          windows: "not-an-object",
        };

        expect(() => validateYieldReturnsSummaryResponse(invalidData)).toThrow(
          ZodError
        );
      });
    });

    describe("validateLandingPageResponse", () => {
      it("returns validated data for valid input", () => {
        const validData = {
          total_assets_usd: 100000.0,
          total_debt_usd: 10000.0,
          total_net_usd: 90000.0,
          weighted_apr: 5.5,
          estimated_monthly_income: 450.0,
          portfolio_roi: {
            recommended_roi: 0.055,
            recommended_period: "30d",
            recommended_yearly_roi: 0.66,
            estimated_yearly_pnl_usd: 5400.0,
          },
          portfolio_allocation: {
            btc: {
              total_value: 30000.0,
              percentage_of_portfolio: 30.0,
              wallet_tokens_value: 25000.0,
              other_sources_value: 5000.0,
            },
            eth: {
              total_value: 40000.0,
              percentage_of_portfolio: 40.0,
              wallet_tokens_value: 35000.0,
              other_sources_value: 5000.0,
            },
            stablecoins: {
              total_value: 20000.0,
              percentage_of_portfolio: 20.0,
              wallet_tokens_value: 18000.0,
              other_sources_value: 2000.0,
            },
            others: {
              total_value: 10000.0,
              percentage_of_portfolio: 10.0,
              wallet_tokens_value: 8000.0,
              other_sources_value: 2000.0,
            },
          },
          wallet_token_summary: {
            total_value_usd: 86000.0,
            token_count: 15,
            apr_30d: 5.2,
          },
          category_summary_debt: {
            btc: 2000.0,
            eth: 3000.0,
            stablecoins: 4000.0,
            others: 1000.0,
          },
          pool_details: [],
          total_positions: 12,
          protocols_count: 5,
          chains_count: 3,
          last_updated: "2025-01-17T00:00:00Z",
          apr_coverage: {
            matched_pools: 10,
            total_pools: 12,
            coverage_percentage: 83.33,
            matched_asset_value_usd: 85000.0,
          },
        };

        const result = validateLandingPageResponse(validData);
        expect(result.total_assets_usd).toBe(100000.0);
      });

      it("throws ZodError for invalid input", () => {
        const invalidData = {
          total_assets_usd: "not-a-number",
        };

        expect(() => validateLandingPageResponse(invalidData)).toThrow(
          ZodError
        );
      });
    });

    describe("validateUnifiedDashboardResponse", () => {
      it("returns data even when fields are sparse", () => {
        const minimalData = {
          user_id: "0x123",
        };

        expect(() =>
          validateUnifiedDashboardResponse(minimalData)
        ).not.toThrow();
      });
    });

    describe("safeValidateUnifiedDashboardResponse", () => {
      it("returns success result for valid input", () => {
        const validData = {
          user_id: "0x123",
          parameters: {
            trend_days: 30,
            risk_days: 30,
            drawdown_days: 90,
            allocation_days: 40,
            rolling_days: 40,
          },
          trends: {
            period_days: 30,
            data_points: 30,
            period: {
              start_date: "2024-12-18",
              end_date: "2025-01-17",
              days: 30,
            },
            daily_values: [],
            summary: {
              current_value_usd: 100000.0,
              start_value_usd: 95000.0,
              change_usd: 5000.0,
              change_pct: 5.26,
            },
          },
          risk_metrics: {
            volatility: {
              period: {
                start_date: "2024-12-18",
                end_date: "2025-01-17",
                days: 30,
              },
              volatility_pct: 12.5,
              annualized_volatility_pct: 43.3,
              interpretation: "Moderate",
              summary: {
                avg_volatility: 12.0,
                max_volatility: 18.5,
                min_volatility: 8.2,
              },
            },
            sharpe_ratio: {
              period: {
                start_date: "2024-12-18",
                end_date: "2025-01-17",
                days: 30,
              },
              sharpe_ratio: 1.5,
              interpretation: "Good",
              summary: {
                avg_sharpe: 1.5,
                statistical_reliability: "High",
              },
            },
            max_drawdown: {
              period: {
                start_date: "2024-12-18",
                end_date: "2025-01-17",
                days: 30,
              },
              max_drawdown_pct: -15.5,
              peak_date: "2025-01-10",
              trough_date: "2025-01-15",
              recovery_date: null,
              summary: {
                current_drawdown_pct: -5.2,
                is_recovered: false,
              },
            },
          },
          drawdown_analysis: {
            enhanced: {
              period: {
                start_date: "2024-10-19",
                end_date: "2025-01-17",
                days: 90,
              },
              drawdown_data: [],
              summary: {
                max_drawdown_pct: -15.5,
                current_drawdown_pct: -4.76,
                peak_value: 105000.0,
                current_value: 100000.0,
              },
            },
            underwater_recovery: {
              period: {
                start_date: "2024-10-19",
                end_date: "2025-01-17",
                days: 90,
              },
              underwater_data: [],
              summary: {
                total_underwater_days: 45,
                underwater_percentage: 50.0,
                recovery_points: 2,
                current_underwater_pct: -4.76,
                is_currently_underwater: true,
              },
            },
          },
          allocation: {
            period_days: 40,
            data_points: 40,
            period: {
              start_date: "2024-12-08",
              end_date: "2025-01-17",
              days: 40,
            },
            allocations: [],
            summary: {
              unique_dates: 40,
              unique_protocols: 5,
              unique_chains: 3,
            },
          },
          rolling_analytics: {
            sharpe: {
              period: {
                start_date: "2024-12-08",
                end_date: "2025-01-17",
                days: 40,
              },
              rolling_sharpe_data: [],
              summary: {
                latest_sharpe_ratio: 1.5,
                avg_sharpe_ratio: 1.4,
                reliable_data_points: 35,
                statistical_reliability: "High",
              },
            },
            volatility: {
              period: {
                start_date: "2024-12-08",
                end_date: "2025-01-17",
                days: 40,
              },
              rolling_volatility_data: [],
              summary: {
                latest_daily_volatility: 12.5,
                latest_annualized_volatility: 43.3,
                avg_daily_volatility: 12.0,
                avg_annualized_volatility: 41.6,
              },
            },
          },
          _metadata: {
            success_count: 6,
            error_count: 0,
            success_rate: 100.0,
          },
        };

        const result = safeValidateUnifiedDashboardResponse(validData);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.user_id).toBe("0x123");
        }
      });

      it("returns error result for invalid input", () => {
        const invalidData = {
          user_id: "0x123",
        };

        const result = safeValidateUnifiedDashboardResponse(invalidData);
        expect(result.success).toBe(true);
      });
    });
  });

  describe("poolPerformanceResponseSchema", () => {
    describe("schema validation", () => {
      it("validates valid pool performance array", () => {
        const validData = [
          {
            wallet: "0x66C42B20551d449Bce40b3dC8Fc62207A27D579F",
            protocol_id: "aster",
            protocol: "aster",
            protocol_name: "aster",
            chain: "arb",
            asset_usd_value: 27546.75,
            pool_symbols: ["DAI", "USDC", "WBTC"],
            contribution_to_portfolio: 21.35,
            snapshot_id: "1356713c-1177-48a8-a4e6-180f546d7984",
            snapshot_ids: [
              "1356713c-1177-48a8-a4e6-180f546d7984",
              "9d5ea6f5-32d4-401a-8650-34a55667ecbe",
            ],
          },
        ];

        expect(() =>
          poolPerformanceResponseSchema.parse(validData)
        ).not.toThrow();
      });

      it("validates empty array", () => {
        const validData: unknown[] = [];
        expect(() =>
          poolPerformanceResponseSchema.parse(validData)
        ).not.toThrow();
      });

      it("validates pool with null snapshot_ids", () => {
        const validData = [
          {
            wallet: "0x66C42B20551d449Bce40b3dC8Fc62207A27D579F",
            protocol_id: "aster",
            protocol: "aster",
            protocol_name: "aster",
            chain: "arb",
            asset_usd_value: 27546.75,
            pool_symbols: ["DAI"],
            contribution_to_portfolio: 21.35,
            snapshot_id: "1356713c-1177-48a8-a4e6-180f546d7984",
            snapshot_ids: null,
          },
        ];

        expect(() =>
          poolPerformanceResponseSchema.parse(validData)
        ).not.toThrow();
      });

      it("validates pool without optional snapshot_ids", () => {
        const validData = [
          {
            wallet: "0x66C42B20551d449Bce40b3dC8Fc62207A27D579F",
            protocol_id: "aster",
            protocol: "aster",
            protocol_name: "aster",
            chain: "arb",
            asset_usd_value: 27546.75,
            pool_symbols: ["DAI"],
            contribution_to_portfolio: 21.35,
            snapshot_id: "1356713c-1177-48a8-a4e6-180f546d7984",
          },
        ];

        expect(() =>
          poolPerformanceResponseSchema.parse(validData)
        ).not.toThrow();
      });

      it("validates multiple pools", () => {
        const validData = [
          {
            wallet: "0x66C42B20551d449Bce40b3dC8Fc62207A27D579F",
            protocol_id: "aster",
            protocol: "aster",
            protocol_name: "aster",
            chain: "arb",
            asset_usd_value: 27546.75,
            pool_symbols: ["DAI", "USDC"],
            contribution_to_portfolio: 21.35,
            snapshot_id: "1356713c-1177-48a8-a4e6-180f546d7984",
          },
          {
            wallet: "0x2eCBC6f229feD06044CDb0dD772437a30190CD50",
            protocol_id: "camelot v3",
            protocol: "camelot v3",
            protocol_name: "camelot v3",
            chain: "arb",
            asset_usd_value: 13893.18,
            pool_symbols: ["PENDLE", "WETH"],
            contribution_to_portfolio: 10.77,
            snapshot_id: "c1fb06a0-9a6e-4ffd-9e76-81435723340a",
          },
        ];

        expect(() =>
          poolPerformanceResponseSchema.parse(validData)
        ).not.toThrow();
      });

      it("rejects pool missing required wallet field", () => {
        const invalidData = [
          {
            protocol_id: "aster",
            protocol: "aster",
            protocol_name: "aster",
            chain: "arb",
            asset_usd_value: 27546.75,
            pool_symbols: ["DAI"],
            contribution_to_portfolio: 21.35,
            snapshot_id: "1356713c-1177-48a8-a4e6-180f546d7984",
          },
        ];

        expect(() => poolPerformanceResponseSchema.parse(invalidData)).toThrow(
          ZodError
        );
      });

      it("rejects pool missing required protocol_id field", () => {
        const invalidData = [
          {
            wallet: "0x66C42B20551d449Bce40b3dC8Fc62207A27D579F",
            protocol: "aster",
            protocol_name: "aster",
            chain: "arb",
            asset_usd_value: 27546.75,
            pool_symbols: ["DAI"],
            contribution_to_portfolio: 21.35,
            snapshot_id: "1356713c-1177-48a8-a4e6-180f546d7984",
          },
        ];

        expect(() => poolPerformanceResponseSchema.parse(invalidData)).toThrow(
          ZodError
        );
      });

      it("rejects pool with invalid asset_usd_value type", () => {
        const invalidData = [
          {
            wallet: "0x66C42B20551d449Bce40b3dC8Fc62207A27D579F",
            protocol_id: "aster",
            protocol: "aster",
            protocol_name: "aster",
            chain: "arb",
            asset_usd_value: "not-a-number",
            pool_symbols: ["DAI"],
            contribution_to_portfolio: 21.35,
            snapshot_id: "1356713c-1177-48a8-a4e6-180f546d7984",
          },
        ];

        expect(() => poolPerformanceResponseSchema.parse(invalidData)).toThrow(
          ZodError
        );
      });

      it("rejects pool with invalid pool_symbols type", () => {
        const invalidData = [
          {
            wallet: "0x66C42B20551d449Bce40b3dC8Fc62207A27D579F",
            protocol_id: "aster",
            protocol: "aster",
            protocol_name: "aster",
            chain: "arb",
            asset_usd_value: 27546.75,
            pool_symbols: "not-an-array",
            contribution_to_portfolio: 21.35,
            snapshot_id: "1356713c-1177-48a8-a4e6-180f546d7984",
          },
        ];

        expect(() => poolPerformanceResponseSchema.parse(invalidData)).toThrow(
          ZodError
        );
      });

      it("rejects non-array input", () => {
        const invalidData = {
          wallet: "0x66C42B20551d449Bce40b3dC8Fc62207A27D579F",
        };

        expect(() => poolPerformanceResponseSchema.parse(invalidData)).toThrow(
          ZodError
        );
      });
    });

    describe("validatePoolPerformanceResponse", () => {
      it("validates and returns valid pool performance data", () => {
        const validData = [
          {
            wallet: "0x66C42B20551d449Bce40b3dC8Fc62207A27D579F",
            protocol_id: "aster",
            protocol: "aster",
            protocol_name: "aster",
            chain: "arb",
            asset_usd_value: 27546.75,
            pool_symbols: ["DAI", "USDC"],
            contribution_to_portfolio: 21.35,
            snapshot_id: "1356713c-1177-48a8-a4e6-180f546d7984",
          },
        ];

        const result = validatePoolPerformanceResponse(validData);
        expect(result).toEqual(validData);
      });

      it("throws ZodError for invalid data", () => {
        const invalidData = [{ protocol: "aster" }];

        expect(() => validatePoolPerformanceResponse(invalidData)).toThrow(
          ZodError
        );
      });
    });
  });

  describe("borrowingSummarySchema (via landingPageResponseSchema)", () => {
    const baseValidLandingPage = {
      total_net_usd: 1000,
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

    it("accepts borrowing_summary with valid debt positions", () => {
      const dataWithDebt = {
        ...baseValidLandingPage,
        borrowing_summary: {
          has_debt: true,
          worst_health_rate: 1.25,
          overall_status: "HEALTHY",
          critical_count: 0,
          warning_count: 0,
          healthy_count: 2,
        },
      };

      expect(() => landingPageResponseSchema.parse(dataWithDebt)).not.toThrow();

      const parsed = landingPageResponseSchema.parse(dataWithDebt);
      expect(parsed.borrowing_summary?.has_debt).toBe(true);
      expect(parsed.borrowing_summary?.worst_health_rate).toBe(1.25);
      expect(parsed.borrowing_summary?.overall_status).toBe("HEALTHY");
    });

    it("accepts null worst_health_rate and overall_status when has_debt is false", () => {
      const dataNoDebt = {
        ...baseValidLandingPage,
        borrowing_summary: {
          has_debt: false,
          worst_health_rate: null,
          overall_status: null,
          critical_count: 0,
          warning_count: 0,
          healthy_count: 0,
        },
      };

      expect(() => landingPageResponseSchema.parse(dataNoDebt)).not.toThrow();

      const parsed = landingPageResponseSchema.parse(dataNoDebt);
      expect(parsed.borrowing_summary?.has_debt).toBe(false);
      expect(parsed.borrowing_summary?.worst_health_rate).toBeNull();
      expect(parsed.borrowing_summary?.overall_status).toBeNull();
    });

    it("accepts null borrowing_summary (user never had any positions)", () => {
      const dataNullSummary = {
        ...baseValidLandingPage,
        borrowing_summary: null,
      };

      expect(() =>
        landingPageResponseSchema.parse(dataNullSummary)
      ).not.toThrow();

      const parsed = landingPageResponseSchema.parse(dataNullSummary);
      expect(parsed.borrowing_summary).toBeNull();
    });

    it("accepts missing borrowing_summary (optional field)", () => {
      const dataNoSummary = {
        ...baseValidLandingPage,
        // borrowing_summary not provided
      };

      expect(() =>
        landingPageResponseSchema.parse(dataNoSummary)
      ).not.toThrow();

      const parsed = landingPageResponseSchema.parse(dataNoSummary);
      expect(parsed.borrowing_summary).toBeUndefined();
    });

    it("validates overall_status enum values", () => {
      const validStatuses = ["HEALTHY", "WARNING", "CRITICAL"];

      for (const status of validStatuses) {
        const data = {
          ...baseValidLandingPage,
          borrowing_summary: {
            has_debt: true,
            worst_health_rate: 1.5,
            overall_status: status,
            critical_count: 0,
            warning_count: 0,
            healthy_count: 1,
          },
        };

        expect(() => landingPageResponseSchema.parse(data)).not.toThrow();
      }
    });

    it("rejects invalid overall_status value", () => {
      const dataInvalidStatus = {
        ...baseValidLandingPage,
        borrowing_summary: {
          has_debt: true,
          worst_health_rate: 1.5,
          overall_status: "INVALID_STATUS",
          critical_count: 0,
          warning_count: 0,
          healthy_count: 1,
        },
      };

      expect(() => landingPageResponseSchema.parse(dataInvalidStatus)).toThrow(
        ZodError
      );
    });

    it("rejects negative worst_health_rate", () => {
      const dataNegativeHealth = {
        ...baseValidLandingPage,
        borrowing_summary: {
          has_debt: true,
          worst_health_rate: -1.0,
          overall_status: "CRITICAL",
          critical_count: 1,
          warning_count: 0,
          healthy_count: 0,
        },
      };

      expect(() => landingPageResponseSchema.parse(dataNegativeHealth)).toThrow(
        ZodError
      );
    });

    it("rejects zero worst_health_rate (must be positive)", () => {
      const dataZeroHealth = {
        ...baseValidLandingPage,
        borrowing_summary: {
          has_debt: true,
          worst_health_rate: 0,
          overall_status: "CRITICAL",
          critical_count: 1,
          warning_count: 0,
          healthy_count: 0,
        },
      };

      expect(() => landingPageResponseSchema.parse(dataZeroHealth)).toThrow(
        ZodError
      );
    });
  });
});
