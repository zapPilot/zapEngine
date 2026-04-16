/**
 * Comprehensive test suite for analyticsService
 *
 * Tests all exported functions:
 * - getLandingPagePortfolioData (HTTP)
 * - getRiskSummary (HTTP)
 * - getPortfolioDashboard (HTTP)
 * - getDailyYieldReturns (HTTP)
 * - getBorrowingPositions (HTTP)
 * - getMarketDashboardData (HTTP)
 */

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { httpUtils } from "@/lib/http";
import {
  getBorrowingPositions,
  getLandingPagePortfolioData,
  getMarketDashboardData,
  getPortfolioDashboard,
  type LandingPageResponse,
  type UnifiedDashboardResponse,
} from "@/services/analyticsService";

const analyticsEngineGetSpy = vi.spyOn(httpUtils.analyticsEngine, "get");

function createMockDashboardResponse(): UnifiedDashboardResponse {
  return {
    user_id: "0xDashboardUser",
    parameters: {
      trend_days: 30,
      risk_days: 30,
      drawdown_days: 90,
      allocation_days: 40,
      rolling_days: 40,
    },
    trends: {
      period_days: 30,
      data_points: 0,
      period: {
        start_date: "2025-01-01",
        end_date: "2025-01-30",
        days: 30,
      },
      daily_values: [],
      summary: {
        current_value_usd: 0,
        start_value_usd: 0,
        change_usd: 0,
        change_pct: 0,
      },
    },
    drawdown_analysis: {
      enhanced: {
        period: {
          start_date: "2025-01-01",
          end_date: "2025-01-30",
          days: 30,
        },
        period_info: {
          start_date: "2025-01-01",
          end_date: "2025-01-30",
          timezone: "UTC",
          label: "Last 30 Days",
        },
        drawdown_data: [],
        summary: {
          max_drawdown_pct: 0,
          current_drawdown_pct: 0,
          peak_value: 0,
          current_value: 0,
        },
      },
      underwater_recovery: {
        period: {
          start_date: "2025-01-01",
          end_date: "2025-01-30",
          days: 30,
        },
        period_info: {
          start_date: "2025-01-01",
          end_date: "2025-01-30",
          timezone: "UTC",
          label: "Last 30 Days",
        },
        underwater_data: [],
        summary: {
          total_underwater_days: 0,
          underwater_percentage: 0,
          recovery_points: 0,
          current_underwater_pct: 0,
          is_currently_underwater: false,
        },
      },
    },
    allocation: {
      period_days: 40,
      data_points: 0,
      period: {
        start_date: "2024-12-12",
        end_date: "2025-01-21",
        days: 40,
      },
      allocations: [],
      summary: {
        unique_dates: 0,
        unique_protocols: 0,
        unique_chains: 0,
      },
    },
    rolling_analytics: {
      sharpe: {
        period: {
          start_date: "2025-01-01",
          end_date: "2025-01-30",
          days: 30,
        },
        rolling_sharpe_data: [],
        summary: {
          latest_sharpe_ratio: 0,
          avg_sharpe_ratio: 0,
          reliable_data_points: 0,
          statistical_reliability: "",
        },
        educational_context: {
          title: "Sharpe Ratio",
          summary: "Measures excess return per unit of risk",
          highlights: ["Sharpe ratio above 1.0 indicates strong performance"],
          links: [
            {
              label: "What is Sharpe Ratio?",
              url: "https://example.com/sharpe-ratio",
            },
          ],
        },
      },
      volatility: {
        period: {
          start_date: "2025-01-01",
          end_date: "2025-01-30",
          days: 30,
        },
        rolling_volatility_data: [],
        summary: {
          latest_daily_volatility: 0,
          latest_annualized_volatility: 0,
          avg_daily_volatility: 0,
          avg_annualized_volatility: 0,
        },
        educational_context: {
          title: "Volatility",
          summary: "Tracks dispersion of portfolio returns",
          highlights: ["Lower volatility typically indicates more stability"],
          links: [
            {
              label: "Volatility basics",
              url: "https://example.com/volatility",
            },
          ],
        },
      },
    },
    _metadata: {
      success_count: 1,
      error_count: 0,
      success_rate: 1,
      errors: {},
    },
  };
}
describe("analyticsService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    analyticsEngineGetSpy.mockReset();
  });

  afterAll(() => {
    analyticsEngineGetSpy.mockRestore();
  });

  describe("getLandingPagePortfolioData", () => {
    const testUserId = "0xTestUser123";

    describe("Successful API Calls", () => {
      it("should fetch landing page data with correct endpoint", async () => {
        const mockResponse: LandingPageResponse = {
          total_assets_usd: 10000,
          total_debt_usd: 2000,
          total_net_usd: 8000,
          net_portfolio_value: 8000,
          weighted_apr: 5.5,
          estimated_monthly_income: 36.67,
          wallet_count: 2,
          portfolio_roi: {
            recommended_roi: 0.055,
            recommended_period: "30d",
            recommended_yearly_roi: 0.66,
            estimated_yearly_pnl_usd: 440,
          },
          portfolio_allocation: {
            btc: {
              total_value: 3000,
              percentage_of_portfolio: 37.5,
              wallet_tokens_value: 2000,
              other_sources_value: 1000,
            },
            eth: {
              total_value: 2500,
              percentage_of_portfolio: 31.25,
              wallet_tokens_value: 1500,
              other_sources_value: 1000,
            },
            stablecoins: {
              total_value: 2000,
              percentage_of_portfolio: 25,
              wallet_tokens_value: 2000,
              other_sources_value: 0,
            },
            others: {
              total_value: 500,
              percentage_of_portfolio: 6.25,
              wallet_tokens_value: 500,
              other_sources_value: 0,
            },
          },
          wallet_token_summary: {
            total_value_usd: 6000,
            token_count: 12,
            apr_30d: 3.2,
          },
          category_summary_debt: {
            btc: 500,
            eth: 1000,
            stablecoins: 500,
            others: 0,
          },
          pool_details: [],
          total_positions: 5,
          protocols_count: 3,
          chains_count: 2,
          last_updated: "2025-02-07T12:00:00Z",
          apr_coverage: {
            matched_pools: 4,
            total_pools: 5,
            coverage_percentage: 80,
            matched_asset_value_usd: 7500,
          },
        };

        analyticsEngineGetSpy.mockResolvedValue(mockResponse);

        const result = await getLandingPagePortfolioData(testUserId);

        expect(analyticsEngineGetSpy).toHaveBeenCalledWith(
          `/api/v2/portfolio/${testUserId}/landing`
        );
        expect(result).toMatchObject(mockResponse);
      });

      it("should handle response with optional message field", async () => {
        const mockResponse: LandingPageResponse = {
          total_assets_usd: 0,
          total_debt_usd: 0,
          total_net_usd: 0,
          net_portfolio_value: 0,
          weighted_apr: 0,
          estimated_monthly_income: 0,
          wallet_count: 0,
          portfolio_roi: {
            recommended_roi: 0,
            recommended_period: "7d",
            recommended_yearly_roi: 0,
            estimated_yearly_pnl_usd: 0,
          },
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
            apr_30d: 0,
          },
          category_summary_debt: {
            btc: 0,
            eth: 0,
            stablecoins: 0,
            others: 0,
          },
          pool_details: [],
          total_positions: 0,
          protocols_count: 0,
          chains_count: 0,
          last_updated: null,
          apr_coverage: {
            matched_pools: 0,
            total_pools: 0,
            coverage_percentage: 0,
            matched_asset_value_usd: 0,
          },
          message: "No portfolio data available",
        };

        analyticsEngineGetSpy.mockResolvedValue(mockResponse);

        const result = await getLandingPagePortfolioData(testUserId);

        expect(result.message).toBe("No portfolio data available");
      });

      it("should handle response with legacy ROI fields", async () => {
        const mockResponse: LandingPageResponse = {
          total_assets_usd: 5000,
          total_debt_usd: 1000,
          total_net_usd: 4000,
          net_portfolio_value: 4000,
          weighted_apr: 4.2,
          estimated_monthly_income: 14,
          wallet_count: 1,
          portfolio_roi: {
            recommended_roi: 0.042,
            recommended_period: "7d",
            recommended_yearly_roi: 0.5,
            estimated_yearly_pnl_usd: 168,
            roi_7d: {
              value: 0.01,
              data_points: 7,
            },
            roi_30d: {
              value: 0.042,
              data_points: 30,
            },
            roi_365d: {
              value: 0.5,
              data_points: 365,
            },
            roi_windows: {
              "7d": 0.01,
              "30d": 0.042,
              "90d": 0.12,
              "365d": 0.5,
            },
          },
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
            apr_30d: 0,
          },
          category_summary_debt: {
            btc: 0,
            eth: 0,
            stablecoins: 0,
            others: 0,
          },
          pool_details: [],
          total_positions: 0,
          protocols_count: 0,
          chains_count: 0,
          last_updated: null,
          apr_coverage: {
            matched_pools: 0,
            total_pools: 0,
            coverage_percentage: 0,
            matched_asset_value_usd: 0,
          },
        };

        analyticsEngineGetSpy.mockResolvedValue(mockResponse);

        const result = await getLandingPagePortfolioData(testUserId);

        expect(result.portfolio_roi.roi_7d).toBeDefined();
        expect(result.portfolio_roi.roi_30d).toBeDefined();
        expect(result.portfolio_roi.roi_365d).toBeDefined();
        expect(result.portfolio_roi.roi_windows).toBeDefined();
      });

      it("should handle response with windows field", async () => {
        const mockResponse: LandingPageResponse = {
          total_assets_usd: 5000,
          total_debt_usd: 1000,
          total_net_usd: 4000,
          weighted_apr: 4.2,
          estimated_monthly_income: 14,
          portfolio_roi: {
            recommended_roi: 0.042,
            recommended_period: "30d",
            recommended_yearly_roi: 0.5,
            estimated_yearly_pnl_usd: 168,
            windows: {
              "7d": {
                value: 0.01,
                data_points: 7,
                start_balance: 3900,
              },
              "30d": {
                value: 0.042,
                data_points: 30,
                start_balance: 3800,
              },
            },
          },
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
            apr_30d: 0,
          },
          category_summary_debt: {
            btc: 0,
            eth: 0,
            stablecoins: 0,
            others: 0,
          },
          pool_details: [],
          total_positions: 0,
          protocols_count: 0,
          chains_count: 0,
          last_updated: null,
          apr_coverage: {
            matched_pools: 0,
            total_pools: 0,
            coverage_percentage: 0,
            matched_asset_value_usd: 0,
          },
        };

        analyticsEngineGetSpy.mockResolvedValue(mockResponse);

        const result = await getLandingPagePortfolioData(testUserId);

        expect(result.portfolio_roi.windows).toBeDefined();
        expect(result.portfolio_roi.windows?.["7d"].start_balance).toBe(3900);
      });
    });
  });

  describe("getPortfolioDashboard", () => {
    const testUserId = "0xDashboardUser";

    it("should fetch unified dashboard with default parameters", async () => {
      const mockResponse = createMockDashboardResponse();
      mockResponse.user_id = testUserId;

      analyticsEngineGetSpy.mockResolvedValue(mockResponse);

      const result = await getPortfolioDashboard(testUserId);

      expect(analyticsEngineGetSpy).toHaveBeenCalledWith(
        `/api/v2/analytics/${testUserId}/dashboard`
      );
      expect(result).toEqual(mockResponse);
    });

    it("should fetch unified dashboard with custom parameters", async () => {
      const mockResponse = createMockDashboardResponse();
      mockResponse.user_id = testUserId;
      mockResponse.parameters = {
        trend_days: 45,
        risk_days: 45,
        drawdown_days: 120,
        allocation_days: 60,
        rolling_days: 60,
      };

      analyticsEngineGetSpy.mockResolvedValue(mockResponse);

      const result = await getPortfolioDashboard(testUserId);

      expect(analyticsEngineGetSpy).toHaveBeenCalledWith(
        `/api/v2/analytics/${testUserId}/dashboard`
      );
      expect(result).toEqual(mockResponse);
    });
  });

  describe("getDailyYieldReturns", () => {
    const testUserId = "0xYieldUser";

    // Helper to create schema-compliant mock response
    const createMockYieldResponse = (
      overrides: Partial<{
        user_id: string;
        period_days: number;
        daily_returns: {
          date: string;
          protocol_name: string;
          chain: string;
          position_type?: string | null;
          yield_return_usd: number;
          tokens: {
            symbol: string;
            amount_change: number;
            current_price: number;
            yield_return_usd: number;
          }[];
        }[];
      }> = {}
    ) => ({
      user_id: overrides.user_id ?? testUserId,
      period: {
        start_date: "2025-11-29",
        end_date: "2025-12-29",
        days: overrides.period_days ?? 30,
      },
      daily_returns: overrides.daily_returns ?? [
        {
          date: "2025-12-29",
          protocol_name: "Aave",
          chain: "ethereum",
          position_type: "lending",
          yield_return_usd: 5.25,
          tokens: [
            {
              symbol: "USDC",
              amount_change: 5.25,
              current_price: 1.0,
              yield_return_usd: 5.25,
            },
          ],
        },
      ],
    });

    it("should fetch daily yield returns with default parameters", async () => {
      const mockResponse = createMockYieldResponse();

      analyticsEngineGetSpy.mockResolvedValue(mockResponse);

      // Import dynamically to test
      const { getDailyYieldReturns } =
        await import("../../../src/services/analyticsService");
      const result = await getDailyYieldReturns(testUserId);

      expect(analyticsEngineGetSpy).toHaveBeenCalledWith(
        `/api/v2/analytics/${testUserId}/yield/daily?days=30`
      );
      expect(result).toEqual(mockResponse);
    });

    it("should fetch daily yield returns with custom days parameter", async () => {
      const mockResponse = createMockYieldResponse({
        period_days: 7,
        daily_returns: [],
      });

      analyticsEngineGetSpy.mockResolvedValue(mockResponse);

      const { getDailyYieldReturns } =
        await import("../../../src/services/analyticsService");
      const result = await getDailyYieldReturns(testUserId, 7);

      expect(analyticsEngineGetSpy).toHaveBeenCalledWith(
        `/api/v2/analytics/${testUserId}/yield/daily?days=7`
      );
      expect(result.period.days).toBe(7);
    });

    it("should fetch daily yield returns with wallet address filter", async () => {
      const walletAddress = "0x1234567890abcdef1234567890abcdef12345678";
      const mockResponse = createMockYieldResponse({
        daily_returns: [
          {
            date: "2025-12-29",
            protocol_name: "Compound",
            chain: "ethereum",
            position_type: "lending",
            yield_return_usd: 3.5,
            tokens: [
              {
                symbol: "DAI",
                amount_change: 3.5,
                current_price: 1.0,
                yield_return_usd: 3.5,
              },
            ],
          },
        ],
      });

      analyticsEngineGetSpy.mockResolvedValue(mockResponse);

      const { getDailyYieldReturns } =
        await import("../../../src/services/analyticsService");
      const result = await getDailyYieldReturns(testUserId, 30, walletAddress);

      expect(analyticsEngineGetSpy).toHaveBeenCalledWith(
        `/api/v2/analytics/${testUserId}/yield/daily?days=30&walletAddress=${walletAddress}`
      );
      expect(result.daily_returns).toHaveLength(1);
    });

    it("should propagate errors from HTTP layer", async () => {
      const error = new Error("Failed to fetch yield data");
      analyticsEngineGetSpy.mockRejectedValue(error);

      const { getDailyYieldReturns } =
        await import("../../../src/services/analyticsService");

      await expect(getDailyYieldReturns(testUserId)).rejects.toThrow(
        "Failed to fetch yield data"
      );
    });
  });

  describe("getMarketDashboardData", () => {
    const mockResponse = {
      snapshots: [
        {
          snapshot_date: "2025-01-01",
          price_usd: 42000,
          dma_200: 38000,
          sentiment_value: 65,
          regime: "g",
        },
        {
          snapshot_date: "2025-01-02",
          price_usd: 43000,
          dma_200: 38500,
          sentiment_value: 70,
          regime: "eg",
        },
      ],
      count: 2,
      token_symbol: "btc",
      days_requested: 365,
      timestamp: "2025-01-02T12:00:00Z",
    };

    it("should fetch market dashboard data with default parameters", async () => {
      analyticsEngineGetSpy.mockResolvedValue(mockResponse);

      const result = await getMarketDashboardData();

      expect(analyticsEngineGetSpy).toHaveBeenCalledWith(
        "/api/v2/market/dashboard?days=365&token=btc"
      );
      expect(result.snapshots).toHaveLength(2);
      expect(result.token_symbol).toBe("btc");
    });

    it("should fetch market dashboard data with custom parameters", async () => {
      analyticsEngineGetSpy.mockResolvedValue({
        ...mockResponse,
        days_requested: 90,
      });

      const result = await getMarketDashboardData(90, "eth");

      expect(analyticsEngineGetSpy).toHaveBeenCalledWith(
        "/api/v2/market/dashboard?days=90&token=eth"
      );
      expect(result.days_requested).toBe(90);
    });

    it("should propagate errors from HTTP layer", async () => {
      analyticsEngineGetSpy.mockRejectedValue(new Error("Network error"));

      await expect(getMarketDashboardData()).rejects.toThrow("Network error");
    });
  });

  describe("getBorrowingPositions", () => {
    const testUserId = "0xBorrowingUser";

    const mockBorrowingResponse = {
      positions: [
        {
          protocol_id: "aave-v3",
          protocol_name: "Aave V3",
          chain: "ethereum",
          health_rate: 1.8,
          health_status: "HEALTHY",
          collateral_usd: 5000,
          debt_usd: 2000,
          net_value_usd: 3000,
          collateral_tokens: [{ symbol: "ETH", amount: 2.5, value_usd: 5000 }],
          debt_tokens: [{ symbol: "USDC", amount: 2000, value_usd: 2000 }],
          updated_at: "2025-02-07T12:00:00Z",
        },
      ],
      total_collateral_usd: 5000,
      total_debt_usd: 2000,
      worst_health_rate: 1.8,
      last_updated: "2025-02-07T12:00:00Z",
    };

    it("should call correct endpoint and return validated response", async () => {
      analyticsEngineGetSpy.mockResolvedValue(mockBorrowingResponse);

      const result = await getBorrowingPositions(testUserId);

      expect(analyticsEngineGetSpy).toHaveBeenCalledWith(
        `/api/v2/analytics/${testUserId}/borrowing/positions`
      );
      expect(result).toEqual(mockBorrowingResponse);
    });

    it("should propagate HTTP errors", async () => {
      const error = new Error("Failed to fetch borrowing positions");
      analyticsEngineGetSpy.mockRejectedValue(error);

      await expect(getBorrowingPositions(testUserId)).rejects.toThrow(
        "Failed to fetch borrowing positions"
      );
    });
  });
});
