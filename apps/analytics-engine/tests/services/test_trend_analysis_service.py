"""
Unit tests for the TrendAnalysisService class.

Covers logic for trend calculation, category breakdowns, and other business logic
migrated from the original PortfolioService.
"""

from datetime import date

import pytest

from src.services.analytics.trend_analysis_service import TrendAnalysisService
from src.services.shared.query_service import QueryService


@pytest.fixture
def trend_service():
    """Provides a TrendAnalysisService instance with a mock database."""
    # The database is not used for these initial tests, so None is fine.
    return TrendAnalysisService(db=None, query_service=QueryService())


class TestCalculateTrendSummary:
    """Tests for the private method _calculate_trend_summary."""

    def test_empty_trend_data(self, trend_service):
        """Verify it returns a zeroed-out summary for empty data."""
        summary = trend_service._calculate_trend_summary([])
        assert summary["data_points"] == 0
        assert summary["latest_value"] == 0.0
        assert summary["change_usd"] == 0.0
        assert summary["change_percentage"] == 0.0

    def test_no_valid_value_key(self, trend_service):
        """Verify it returns a zeroed-out summary if no known value key is found."""
        trend_data = [
            {"date": "2023-01-01", "invalid_key": 100, "total_value_usd": 0.0}
        ]
        summary = trend_service._calculate_trend_summary(trend_data)
        assert summary["data_points"] == 1
        assert summary["latest_value"] == 0.0
        assert summary["earliest_value"] == 0.0
        assert summary["change_usd"] == 0.0

    def test_positive_trend(self, trend_service):
        """Verify correct calculation for a positive trend."""
        trend_data = [
            {"date": "2023-01-01", "total_value_usd": 100.0},
            {"date": "2023-01-02", "total_value_usd": 150.0},
        ]
        summary = trend_service._calculate_trend_summary(trend_data)
        assert summary["data_points"] == 2
        assert summary["latest_value"] == 150.0
        assert summary["earliest_value"] == 100.0
        assert summary["change_usd"] == 50.0
        assert summary["change_percentage"] == 50.0

    def test_negative_trend(self, trend_service):
        """Verify correct calculation for a negative trend."""
        trend_data = [
            {"date": "2023-01-01", "total_value_usd": 200.0},
            {"date": "2023-01-02", "total_value_usd": 50.0},
        ]
        summary = trend_service._calculate_trend_summary(trend_data)
        assert summary["latest_value"] == 50.0
        assert summary["earliest_value"] == 200.0
        assert summary["change_usd"] == -150.0
        assert summary["change_percentage"] == -75.0

    def test_zero_earliest_value(self, trend_service):
        """Verify percentage change is 0 if the earliest value was 0."""
        trend_data = [
            {"date": "2023-01-01", "total_value_usd": 0.0},
            {"date": "2023-01-02", "total_value_usd": 100.0},
        ]
        summary = trend_service._calculate_trend_summary(trend_data)
        assert summary["change_percentage"] == 0.0


class TestTrendAnalysisServicePublicMethods:
    """Tests for public methods of the TrendAnalysisService."""

    def test_get_portfolio_trend_empty(self, mocker):
        """Verify trend method handles empty database result correctly."""
        mock_execute = mocker.patch.object(
            QueryService, "execute_query", return_value=[]
        )
        service = TrendAnalysisService(
            db="mock_db_session", query_service=QueryService()
        )
        user_id = "a-real-uuid"

        result = service.get_portfolio_trend(user_id=user_id)

        mock_execute.assert_called_once()
        assert result.daily_values == []
        assert result.summary["data_points"] == 0

    def test_get_portfolio_trend_with_data(self, mocker):
        """Verify trend method processes and returns trend data correctly."""
        # Use recent dates to pass the 30-day cache normalization filter
        from datetime import UTC, datetime, timedelta

        today = datetime.now(UTC).date()
        yesterday = today - timedelta(days=1)
        two_days_ago = today - timedelta(days=2)

        # Use dicts matching the category-based query structure (with date objects, not ISO strings)
        mock_rows = [
            {
                "date": two_days_ago,
                "chain": "ethereum",
                "source_type": "defi",
                "category": "btc",
                "category_value_usd": 100.0,
                "pnl_usd": 5.0,
                "total_value_usd": 100.0,
            },
            {
                "date": yesterday,
                "chain": "ethereum",
                "source_type": "defi",
                "category": "btc",
                "category_value_usd": 150.0,
                "pnl_usd": 10.0,
                "total_value_usd": 150.0,
            },
        ]

        mock_execute = mocker.patch.object(
            QueryService, "execute_query", return_value=mock_rows
        )
        service = TrendAnalysisService(
            db="mock_db_session", query_service=QueryService()
        )
        user_id = "a-real-uuid"

        result = service.get_portfolio_trend(user_id=user_id)

        mock_execute.assert_called_once()
        assert result.daily_values is not None
        assert result.summary is not None
        assert result.summary["data_points"] == 2
        assert result.summary["latest_value"] == 150.0
        assert result.summary["earliest_value"] == 100.0


class TestBuildDailyTotals:
    """Tests for aggregation of daily totals from trend data."""

    def test_daily_totals_with_window_sums(self, trend_service):
        """Ensure aggregated totals use SQL-provided totals when available."""
        trend_data = [
            {
                "date": "2023-01-01",
                "chain": "ethereum",
                "source_type": "defi",
                "category": "btc",
                "category_value_usd": 100,
                "pnl_usd": 5,
                "total_value_usd": 150,
            },
            {
                "date": "2023-01-01",
                "chain": "optimism",
                "source_type": "wallet",
                "category": "eth",
                "category_value_usd": 50,
                "pnl_usd": -3,
                "total_value_usd": 150,
            },
            {
                "date": "2023-01-02",
                "chain": "ethereum",
                "source_type": "defi",
                "category": "btc",
                "category_value_usd": 200,
                "pnl_usd": 20,
                "total_value_usd": 300,
            },
            {
                "date": "2023-01-02",
                "chain": "arbitrum",
                "source_type": "defi",
                "category": "stablecoins",
                "category_value_usd": 100,
                "pnl_usd": 10,
                "total_value_usd": 300,
            },
        ]

        daily_totals = trend_service._build_daily_totals(trend_data)

        assert len(daily_totals) == 2
        first_day, second_day = daily_totals

        assert first_day["date"] == date(2023, 1, 1)
        assert first_day["total_value_usd"] == 150
        assert first_day["change_percentage"] == 0.0
        assert len(first_day["categories"]) == 2

        assert second_day["date"] == date(2023, 1, 2)
        assert second_day["total_value_usd"] == 300
        assert pytest.approx(second_day["change_percentage"], rel=1e-5) == 100.0

    def test_daily_totals_empty_data(self, trend_service):
        """Verify empty list is returned for empty data."""
        result = trend_service._build_daily_totals([])
        assert result == []

    def test_daily_totals_with_none_dates_skipped(self, trend_service):
        """Verify rows with None dates are skipped."""
        trend_data = [
            {
                "date": None,  # Should be skipped
                "chain": "ethereum",
                "source_type": "defi",
                "category": "btc",
                "category_value_usd": 100,
                "pnl_usd": 5,
                "total_value_usd": 150,
            },
            {
                "date": "2023-01-01",  # Valid row
                "chain": "ethereum",
                "source_type": "wallet",
                "category": "eth",
                "category_value_usd": 200,
                "pnl_usd": 10,
                "total_value_usd": 200,
            },
        ]

        daily_totals = trend_service._build_daily_totals(trend_data)

        # Only one valid date should be in the result
        assert len(daily_totals) == 1
        assert daily_totals[0]["date"] == date(2023, 1, 1)
        assert daily_totals[0]["total_value_usd"] == 200

    def test_daily_totals_with_none_total_raises_error(self, trend_service):
        """Verify daily totals raises DataIntegrityError when total_value_usd is None."""
        from src.core.exceptions import DataIntegrityError

        trend_data = [
            {
                "date": "2023-01-01",
                "chain": "ethereum",
                "source_type": "defi",
                "category": "btc",
                "category_value_usd": 100,
                "pnl_usd": 5,
                "total_value_usd": None,  # No SQL total
            }
        ]

        with pytest.raises(DataIntegrityError):
            trend_service._build_daily_totals(trend_data)


class TestTrendAnalysisServiceEdgeCases:
    """Edge case tests for TrendAnalysisService with extreme scenarios."""

    def test_single_day_date_range(self, trend_service):
        """Verify handling of single-day date range (days=1)."""
        trend_data = [
            {
                "date": "2024-01-15",
                "chain": "ethereum",
                "source_type": "defi",
                "category": "btc",
                "category_value_usd": 1000.0,
                "pnl_usd": 5.0,
                "total_value_usd": 1000.0,
            }
        ]

        daily_totals = trend_service._build_daily_totals(trend_data)
        summary = trend_service._calculate_trend_summary(trend_data)

        assert len(daily_totals) == 1
        assert daily_totals[0]["total_value_usd"] == 1000.0
        assert daily_totals[0]["change_percentage"] == 0.0  # No previous day
        assert summary["data_points"] == 1
        assert summary["latest_value"] == 1000.0
        assert summary["earliest_value"] == 1000.0
        assert summary["change_usd"] == 0.0
        assert summary["change_percentage"] == 0.0

    def test_empty_portfolio_no_data(self, trend_service):
        """Verify handling of completely empty portfolio."""
        daily_totals = trend_service._build_daily_totals([])
        summary = trend_service._calculate_trend_summary([])

        assert daily_totals == []
        assert summary["data_points"] == 0
        assert summary["latest_value"] == 0.0
        assert summary["earliest_value"] == 0.0
        assert summary["change_usd"] == 0.0
        assert summary["change_percentage"] == 0.0

    def test_all_null_daily_totals_raises_error(self, trend_service):
        """Verify DataIntegrityError when all total_value_usd values are None."""
        from src.core.exceptions import DataIntegrityError

        trend_data = [
            {
                "date": "2024-01-15",
                "chain": "ethereum",
                "source_type": "defi",
                "category": "btc",
                "category_value_usd": 100.0,
                "pnl_usd": 0.0,
                "total_value_usd": None,
            }
        ]

        with pytest.raises(DataIntegrityError):
            trend_service._build_daily_totals(trend_data)

    def test_single_valid_data_point(self, trend_service):
        """Verify trend calculation with exactly one valid data point."""
        trend_data = [
            {
                "date": "2024-01-15",
                "chain": "ethereum",
                "source_type": "defi",
                "category": "btc",
                "category_value_usd": 500.0,
                "pnl_usd": 10.0,
                "total_value_usd": 500.0,
            }
        ]

        summary = trend_service._calculate_trend_summary(trend_data)

        assert summary["data_points"] == 1
        assert summary["latest_value"] == 500.0
        assert summary["earliest_value"] == 500.0
        assert summary["change_usd"] == 0.0
        assert summary["change_percentage"] == 0.0

    def test_decimal_precision_in_daily_totals(self, trend_service):
        """Verify decimal precision is maintained in daily totals."""
        trend_data = [
            {
                "date": "2024-01-15",
                "chain": "ethereum",
                "source_type": "defi",
                "category": "stablecoins",
                "category_value_usd": 1234.56789,
                "pnl_usd": 12.345,
                "total_value_usd": 1234.56789,
            }
        ]

        daily_totals = trend_service._build_daily_totals(trend_data)

        assert len(daily_totals) == 1
        assert pytest.approx(daily_totals[0]["total_value_usd"], abs=1e-5) == 1234.56789

    def test_trend_summary_with_zero_change(self, trend_service):
        """Verify trend summary correctly shows zero change for flat portfolio."""
        trend_data = [
            {
                "date": "2024-01-15",
                "chain": "ethereum",
                "source_type": "defi",
                "category": "btc",
                "category_value_usd": 1000.0,
                "pnl_usd": 0.0,
                "total_value_usd": 1000.0,
            },
            {
                "date": "2024-01-16",
                "chain": "ethereum",
                "source_type": "defi",
                "category": "btc",
                "category_value_usd": 1000.0,
                "pnl_usd": 0.0,
                "total_value_usd": 1000.0,
            },
        ]

        summary = trend_service._calculate_trend_summary(trend_data)

        assert summary["change_usd"] == 0.0
        assert summary["change_percentage"] == 0.0
        assert summary["latest_value"] == 1000.0
        assert summary["earliest_value"] == 1000.0

    def test_trend_summary_with_negative_returns(self, trend_service):
        """Verify trend summary correctly calculates negative returns."""
        trend_data = [
            {
                "date": "2024-01-15",
                "chain": "ethereum",
                "source_type": "defi",
                "category": "btc",
                "category_value_usd": 2000.0,
                "pnl_usd": 0.0,
                "total_value_usd": 2000.0,
            },
            {
                "date": "2024-01-16",
                "chain": "ethereum",
                "source_type": "defi",
                "category": "btc",
                "category_value_usd": 1500.0,
                "pnl_usd": -500.0,
                "total_value_usd": 1500.0,
            },
        ]

        summary = trend_service._calculate_trend_summary(trend_data)

        assert summary["change_usd"] == -500.0
        assert summary["change_percentage"] == -25.0  # -500 / 2000 * 100

    def test_ensure_aggregates_with_missing_data(self, trend_service):
        """Verify _ensure_aggregates handles missing or invalid data gracefully."""
        # Test with empty list
        result = trend_service._ensure_aggregates([])
        assert result == []

        # Test with data that has no valid dates (all None)
        invalid_trend_data = [
            {
                "date": None,
                "chain": "ethereum",
                "source_type": "defi",
                "category": "btc",
                "category_value_usd": 100.0,
                "pnl_usd": 0.0,
                "total_value_usd": 100.0,
            }
        ]
        result = trend_service._ensure_aggregates(invalid_trend_data)
        assert result == []

    def test_time_series_with_gaps_missing_days(self, trend_service):
        """Verify handling of time series with missing days."""
        trend_data = [
            {
                "date": "2024-01-15",
                "chain": "ethereum",
                "source_type": "defi",
                "category": "btc",
                "category_value_usd": 1000.0,
                "pnl_usd": 0.0,
                "total_value_usd": 1000.0,
            },
            # Missing 2024-01-16 and 2024-01-17
            {
                "date": "2024-01-18",
                "chain": "ethereum",
                "source_type": "defi",
                "category": "btc",
                "category_value_usd": 1200.0,
                "pnl_usd": 200.0,
                "total_value_usd": 1200.0,
            },
        ]

        daily_totals = trend_service._build_daily_totals(trend_data)

        # Should only have data for days with actual data
        assert len(daily_totals) == 2
        assert daily_totals[0]["date"] == date(2024, 1, 15)
        assert daily_totals[1]["date"] == date(2024, 1, 18)
        # Change percentage should be based on the last known value
        expected_change = ((1200.0 - 1000.0) / 1000.0) * 100
        assert pytest.approx(daily_totals[1]["change_percentage"]) == expected_change

    def test_protocol_specific_trends_with_zero_values(self, trend_service):
        """Verify protocol aggregation with zero values."""
        trend_data = [
            {
                "date": "2024-01-15",
                "chain": "ethereum",
                "source_type": "defi",
                "category": "btc",
                "category_value_usd": 0.0,  # Zero value
                "pnl_usd": 0.0,
                "total_value_usd": 0.0,
                "protocol": "Aave",
            }
        ]

        daily_totals = trend_service._build_daily_totals(trend_data)

        assert len(daily_totals) == 1
        assert daily_totals[0]["total_value_usd"] == 0.0
        assert "Aave" in daily_totals[0]["protocols"]
        assert len(daily_totals[0]["categories"]) == 1
        assert daily_totals[0]["categories"][0]["value_usd"] == 0.0

    def test_chain_specific_trends_with_single_chain(self, trend_service):
        """Verify chain-specific trend aggregation with single chain."""
        trend_data = [
            {
                "date": "2024-01-15",
                "chain": "ethereum",
                "source_type": "defi",
                "category": "btc",
                "category_value_usd": 500.0,
                "pnl_usd": 10.0,
                "total_value_usd": 500.0,
            },
            {
                "date": "2024-01-15",
                "chain": "ethereum",  # Same chain
                "source_type": "wallet",
                "category": "eth",
                "category_value_usd": 300.0,
                "pnl_usd": 5.0,
                "total_value_usd": 800.0,  # Cumulative for the day
            },
        ]

        daily_totals = trend_service._build_daily_totals(trend_data)

        assert len(daily_totals) == 1
        # Should use SQL total when available
        assert daily_totals[0]["total_value_usd"] == 800.0
        # Should have two categories
        assert len(daily_totals[0]["categories"]) == 2

    def test_large_percentage_changes(self, trend_service):
        """Verify handling of very large percentage changes."""
        trend_data = [
            {
                "date": "2024-01-15",
                "chain": "ethereum",
                "source_type": "defi",
                "category": "btc",
                "category_value_usd": 100.0,
                "pnl_usd": 0.0,
                "total_value_usd": 100.0,
            },
            {
                "date": "2024-01-16",
                "chain": "ethereum",
                "source_type": "defi",
                "category": "btc",
                "category_value_usd": 10000.0,  # 100x increase
                "pnl_usd": 9900.0,
                "total_value_usd": 10000.0,
            },
        ]

        daily_totals = trend_service._build_daily_totals(trend_data)
        summary = trend_service._calculate_trend_summary(trend_data)

        assert pytest.approx(daily_totals[1]["change_percentage"]) == 9900.0  # 9900%
        assert pytest.approx(summary["change_percentage"]) == 9900.0


class TestDebtHandling:
    """Tests for debt position handling in trend analysis."""

    def test_daily_totals_with_debt_fields(self, trend_service):
        """Verify daily totals include assets and debt breakdown fields."""
        trend_data = [
            {
                "date": "2024-01-15",
                "source_type": "defi",
                "category": "stablecoins",
                "category_value_usd": 7000.0,  # Net value (10000 assets - 3000 debt)
                "category_assets_usd": 10000.0,  # Deposits/holdings
                "category_debt_usd": 3000.0,  # Borrowings
                "pnl_usd": 0.0,
                "total_value_usd": 7000.0,
            }
        ]

        daily_totals = trend_service._build_daily_totals(trend_data)

        assert len(daily_totals) == 1
        day = daily_totals[0]

        # Verify daily total uses net value (assets - debt)
        assert day["total_value_usd"] == 7000.0

        # Verify category breakdown includes debt fields
        assert len(day["categories"]) == 1
        category = day["categories"][0]

        assert category["value_usd"] == 7000.0  # Net value
        assert category["assets_usd"] == 10000.0  # Assets
        assert category["debt_usd"] == 3000.0  # Debt

    def test_debt_subtraction_in_net_values(self, trend_service):
        """Verify that debt is properly subtracted from portfolio value."""
        # Scenario: Portfolio with $10,000 in USDC deposits and $3,000 borrowed
        # Expected net value: $7,000
        trend_data = [
            {
                "date": "2024-01-15",
                "source_type": "defi",
                "category": "stablecoins",
                "category_value_usd": 7000.0,  # Net: 10000 - 3000
                "category_assets_usd": 10000.0,
                "category_debt_usd": 3000.0,
                "pnl_usd": 0.0,
                "total_value_usd": 7000.0,
            },
            {
                "date": "2024-01-16",
                "source_type": "defi",
                "category": "stablecoins",
                "category_value_usd": 6500.0,  # Net: 10000 - 3500 (debt increased)
                "category_assets_usd": 10000.0,
                "category_debt_usd": 3500.0,
                "pnl_usd": -500.0,
                "total_value_usd": 6500.0,
            },
        ]

        daily_totals = trend_service._build_daily_totals(trend_data)
        summary = trend_service._calculate_trend_summary(trend_data)

        # Day 1: Net value = 7000
        assert daily_totals[0]["total_value_usd"] == 7000.0
        assert daily_totals[0]["categories"][0]["value_usd"] == 7000.0
        assert daily_totals[0]["categories"][0]["debt_usd"] == 3000.0

        # Day 2: Net value = 6500 (decreased due to increased debt)
        assert daily_totals[1]["total_value_usd"] == 6500.0
        assert daily_totals[1]["categories"][0]["value_usd"] == 6500.0
        assert daily_totals[1]["categories"][0]["debt_usd"] == 3500.0

        # Summary should reflect net values
        assert summary["earliest_value"] == 7000.0
        assert summary["latest_value"] == 6500.0
        assert summary["change_usd"] == -500.0
        assert (
            pytest.approx(summary["change_percentage"], abs=1e-2) == -7.14
        )  # -500/7000 * 100

    def test_multiple_categories_with_mixed_debt(self, trend_service):
        """Verify handling of multiple categories with varying debt levels."""
        trend_data = [
            {
                "date": "2024-01-15",
                "source_type": "defi",
                "category": "stablecoins",
                "category_value_usd": 7000.0,  # 10000 assets - 3000 debt
                "category_assets_usd": 10000.0,
                "category_debt_usd": 3000.0,
                "pnl_usd": 0.0,
                "total_value_usd": 9000.0,  # Total across all categories
            },
            {
                "date": "2024-01-15",
                "source_type": "defi",
                "category": "eth",
                "category_value_usd": 2000.0,  # 2000 assets - 0 debt
                "category_assets_usd": 2000.0,
                "category_debt_usd": 0.0,
                "pnl_usd": 0.0,
                "total_value_usd": 9000.0,  # Same total (repeated for all rows)
            },
        ]

        daily_totals = trend_service._build_daily_totals(trend_data)

        assert len(daily_totals) == 1
        day = daily_totals[0]

        # Total should be net of all debt
        assert day["total_value_usd"] == 9000.0  # 7000 + 2000

        # Should have two categories
        assert len(day["categories"]) == 2

        # Find categories by name
        stablecoin_cat = next(
            c for c in day["categories"] if c["category"] == "stablecoins"
        )
        eth_cat = next(c for c in day["categories"] if c["category"] == "eth")

        # Stablecoins: has debt
        assert stablecoin_cat["value_usd"] == 7000.0
        assert stablecoin_cat["assets_usd"] == 10000.0
        assert stablecoin_cat["debt_usd"] == 3000.0

        # ETH: no debt
        assert eth_cat["value_usd"] == 2000.0
        assert eth_cat["assets_usd"] == 2000.0
        assert eth_cat["debt_usd"] == 0.0

    def test_trend_with_increasing_leverage(self, trend_service):
        """Verify trend calculation as leverage (debt) increases over time."""
        trend_data = [
            {
                "date": "2024-01-15",
                "source_type": "defi",
                "category": "stablecoins",
                "category_value_usd": 10000.0,  # No debt initially
                "category_assets_usd": 10000.0,
                "category_debt_usd": 0.0,
                "pnl_usd": 0.0,
                "total_value_usd": 10000.0,
            },
            {
                "date": "2024-01-16",
                "source_type": "defi",
                "category": "stablecoins",
                "category_value_usd": 7000.0,  # 10000 assets - 3000 borrowed
                "category_assets_usd": 10000.0,
                "category_debt_usd": 3000.0,
                "pnl_usd": -3000.0,
                "total_value_usd": 7000.0,
            },
            {
                "date": "2024-01-17",
                "source_type": "defi",
                "category": "stablecoins",
                "category_value_usd": 5000.0,  # 10000 assets - 5000 borrowed
                "category_assets_usd": 10000.0,
                "category_debt_usd": 5000.0,
                "pnl_usd": -2000.0,
                "total_value_usd": 5000.0,
            },
        ]

        daily_totals = trend_service._build_daily_totals(trend_data)
        summary = trend_service._calculate_trend_summary(trend_data)

        # Verify declining net value as debt increases
        assert daily_totals[0]["total_value_usd"] == 10000.0
        assert daily_totals[1]["total_value_usd"] == 7000.0
        assert daily_totals[2]["total_value_usd"] == 5000.0

        # Verify debt progression
        assert daily_totals[0]["categories"][0]["debt_usd"] == 0.0
        assert daily_totals[1]["categories"][0]["debt_usd"] == 3000.0
        assert daily_totals[2]["categories"][0]["debt_usd"] == 5000.0

        # Summary should show overall decline
        assert summary["earliest_value"] == 10000.0
        assert summary["latest_value"] == 5000.0
        assert summary["change_usd"] == -5000.0
        assert summary["change_percentage"] == -50.0

    def test_zero_debt_in_categories(self, trend_service):
        """Verify handling of categories with zero debt."""
        trend_data = [
            {
                "date": "2024-01-15",
                "source_type": "wallet",
                "category": "btc",
                "category_value_usd": 50000.0,  # Pure holding, no debt
                "category_assets_usd": 50000.0,
                "category_debt_usd": 0.0,
                "pnl_usd": 0.0,
                "total_value_usd": 50000.0,
            }
        ]

        daily_totals = trend_service._build_daily_totals(trend_data)

        assert len(daily_totals) == 1
        category = daily_totals[0]["categories"][0]

        # Value should equal assets when debt is zero
        assert category["value_usd"] == 50000.0
        assert category["assets_usd"] == 50000.0
        assert category["debt_usd"] == 0.0


class TestPeriodInfoCorrectness:
    """Regression tests to verify period_info matches requested days parameter.

    These tests prevent the bug where period_info was taken from the 365-day
    cache query instead of being rebuilt for the requested days parameter.
    """

    def test_period_info_matches_requested_days_180(self, mocker):
        """Verify period_info.days matches requested days parameter (180 days)."""
        from datetime import UTC, datetime, timedelta

        today = datetime.now(UTC).date()

        # Create mock data spanning 180+ days
        mock_rows = [
            {
                "date": (today - timedelta(days=i)).isoformat(),
                "chain": "ethereum",
                "source_type": "defi",
                "category": "btc",
                "category_value_usd": 100.0 + i,
                "pnl_usd": 1.0,
                "total_value_usd": 100.0 + i,
            }
            for i in range(200, 0, -1)  # 200 days of data
        ]

        mock_execute = mocker.patch.object(
            QueryService, "execute_query", return_value=mock_rows
        )
        service = TrendAnalysisService(
            db="mock_db_session", query_service=QueryService()
        )
        user_id = "a-real-uuid"

        result = service.get_portfolio_trend(user_id=user_id, days=180)

        mock_execute.assert_called_once()

        # Critical assertions: period_info should match requested days, not MAX_CACHE_DAYS
        assert result.period_days == 180, "period_days should match requested days"
        assert result.period_info.days == 180, (
            "period_info.days should be 180, not 365!"
        )
        assert result.data_points <= 180, "Should have at most 180 data points"

        # Verify period_info dates span approximately 180 days

        if isinstance(result.period_info.start_date, str):
            start = datetime.fromisoformat(result.period_info.start_date).date()
        else:
            start = result.period_info.start_date

        if isinstance(result.period_info.end_date, str):
            end = datetime.fromisoformat(result.period_info.end_date).date()
        else:
            end = result.period_info.end_date

        date_range_days = (end - start).days
        assert 175 <= date_range_days <= 185, (
            f"Date range should be ~180 days, got {date_range_days}"
        )

    def test_period_info_matches_requested_days_30(self, mocker):
        """Verify period_info.days matches requested days parameter (30 days)."""
        from datetime import UTC, datetime, timedelta

        today = datetime.now(UTC).date()

        # Create mock data spanning 30+ days
        mock_rows = [
            {
                "date": (today - timedelta(days=i)).isoformat(),
                "chain": "ethereum",
                "source_type": "defi",
                "category": "eth",
                "category_value_usd": 200.0 + i,
                "pnl_usd": 2.0,
                "total_value_usd": 200.0 + i,
            }
            for i in range(40, 0, -1)  # 40 days of data
        ]

        mock_execute = mocker.patch.object(
            QueryService, "execute_query", return_value=mock_rows
        )
        service = TrendAnalysisService(
            db="mock_db_session", query_service=QueryService()
        )
        user_id = "a-real-uuid"

        result = service.get_portfolio_trend(user_id=user_id, days=30)

        mock_execute.assert_called_once()

        # Critical assertions
        assert result.period_days == 30, "period_days should match requested days"
        assert result.period_info.days == 30, "period_info.days should be 30, not 365!"
        assert result.data_points <= 30, "Should have at most 30 data points"

    def test_period_info_matches_requested_days_7(self, mocker):
        """Verify period_info.days matches requested days parameter (7 days)."""
        from datetime import UTC, datetime, timedelta

        today = datetime.now(UTC).date()

        # Create mock data spanning 7+ days
        mock_rows = [
            {
                "date": (today - timedelta(days=i)).isoformat(),
                "chain": "ethereum",
                "source_type": "defi",
                "category": "stablecoins",
                "category_value_usd": 500.0 + i,
                "pnl_usd": 0.5,
                "total_value_usd": 500.0 + i,
            }
            for i in range(10, 0, -1)  # 10 days of data
        ]

        mock_execute = mocker.patch.object(
            QueryService, "execute_query", return_value=mock_rows
        )
        service = TrendAnalysisService(
            db="mock_db_session", query_service=QueryService()
        )
        user_id = "a-real-uuid"

        result = service.get_portfolio_trend(user_id=user_id, days=7)

        mock_execute.assert_called_once()

        # Critical assertions
        assert result.period_days == 7, "period_days should match requested days"
        assert result.period_info.days == 7, "period_info.days should be 7, not 365!"
        assert result.data_points <= 7, "Should have at most 7 data points"

    def test_period_info_empty_result(self, mocker):
        """Verify period_info is correct even for empty results."""
        mock_execute = mocker.patch.object(
            QueryService, "execute_query", return_value=[]
        )
        service = TrendAnalysisService(
            db="mock_db_session", query_service=QueryService()
        )
        user_id = "a-real-uuid"

        result = service.get_portfolio_trend(user_id=user_id, days=90)

        mock_execute.assert_called_once()

        # Even with no data, period_info should match requested days
        assert result.period_days == 90
        assert result.period_info.days == 90, "period_info.days should be 90, not 365!"
        assert result.data_points == 0
        assert result.daily_values == []

    def test_period_info_matches_requested_days_365_no_filtering(self, mocker):
        """Verify period_info for exactly MAX_CACHE_DAYS (no filtering occurs)."""
        from datetime import UTC, datetime, timedelta

        today = datetime.now(UTC).date()

        # Create mock data spanning 365 days (full window)
        mock_rows = [
            {
                "date": (today - timedelta(days=i)).isoformat(),
                "chain": "ethereum",
                "source_type": "defi",
                "category": "btc",
                "category_value_usd": 100.0 + i,
                "pnl_usd": 1.0,
                "total_value_usd": 100.0 + i,
            }
            for i in range(365, 0, -1)
        ]

        mock_execute = mocker.patch.object(
            QueryService, "execute_query", return_value=mock_rows
        )
        service = TrendAnalysisService(
            db="mock_db_session", query_service=QueryService()
        )
        user_id = "a-real-uuid"

        result = service.get_portfolio_trend(user_id=user_id, days=365)

        mock_execute.assert_called_once()

        # Critical: When days = MAX_CACHE_DAYS, no filtering occurs (if condition is FALSE)
        assert result.period_days == 365, "period_days should match requested days"
        assert result.period_info.days == 365, "period_info.days should be 365!"
        assert result.data_points == 365, (
            "Should have all 365 data points (no filtering)"
        )

    def test_period_info_matches_requested_days_364_edge_case(self, mocker):
        """Verify period_info for 364 days (one less than MAX_CACHE_DAYS, filtering occurs)."""
        from datetime import UTC, datetime, timedelta

        today = datetime.now(UTC).date()

        # Create mock data spanning 365 days (full window)
        mock_rows = [
            {
                "date": (today - timedelta(days=i)).isoformat(),
                "chain": "ethereum",
                "source_type": "defi",
                "category": "eth",
                "category_value_usd": 200.0 + i,
                "pnl_usd": 2.0,
                "total_value_usd": 200.0 + i,
            }
            for i in range(365, 0, -1)
        ]

        mock_execute = mocker.patch.object(
            QueryService, "execute_query", return_value=mock_rows
        )
        service = TrendAnalysisService(
            db="mock_db_session", query_service=QueryService()
        )
        user_id = "a-real-uuid"

        result = service.get_portfolio_trend(user_id=user_id, days=364)

        mock_execute.assert_called_once()

        # Critical: When days < MAX_CACHE_DAYS, filtering DOES occur
        assert result.period_days == 364, "period_days should match requested days"
        assert result.period_info.days == 364, (
            "period_info.days should be 364, not 365!"
        )
        assert result.data_points <= 364, (
            "Should have at most 364 data points (filtering occurs)"
        )

    def test_period_info_matches_requested_days_1_minimum(self, mocker):
        """Verify period_info for minimum boundary (1 day, extreme filtering)."""
        from datetime import UTC, datetime, timedelta

        today = datetime.now(UTC).date()

        # Create mock data spanning 30 days
        mock_rows = [
            {
                "date": (today - timedelta(days=i)).isoformat(),
                "chain": "ethereum",
                "source_type": "defi",
                "category": "stablecoins",
                "category_value_usd": 1000.0 + i,
                "pnl_usd": 5.0,
                "total_value_usd": 1000.0 + i,
            }
            for i in range(30, 0, -1)
        ]

        mock_execute = mocker.patch.object(
            QueryService, "execute_query", return_value=mock_rows
        )
        service = TrendAnalysisService(
            db="mock_db_session", query_service=QueryService()
        )
        user_id = "a-real-uuid"

        result = service.get_portfolio_trend(user_id=user_id, days=1)

        mock_execute.assert_called_once()

        # Critical: Minimum boundary - extreme filtering to just today
        assert result.period_days == 1, "period_days should be 1"
        assert result.period_info.days == 1, "period_info.days should be 1, not 365!"
        assert result.data_points <= 1, "Should have at most 1 data point"


class TestPeriodInfoDataAlignment:
    """Test that period_info dates align with actual daily_values data."""

    def test_period_info_dates_align_with_daily_values(self, mocker):
        """Verify period_info start/end dates align with actual daily_values dates."""
        from datetime import UTC, datetime, timedelta

        today = datetime.now(UTC).date()

        # Create mock data spanning 30 days
        mock_rows = [
            {
                "date": (today - timedelta(days=i)).isoformat(),
                "chain": "ethereum",
                "source_type": "defi",
                "category": "btc",
                "category_value_usd": 100.0 + i,
                "pnl_usd": 1.0,
                "total_value_usd": 100.0 + i,
            }
            for i in range(30, 0, -1)
        ]

        mock_execute = mocker.patch.object(
            QueryService, "execute_query", return_value=mock_rows
        )
        service = TrendAnalysisService(
            db="mock_db_session", query_service=QueryService()
        )
        user_id = "a-real-uuid"

        result = service.get_portfolio_trend(user_id=user_id, days=30)

        mock_execute.assert_called_once()

        # Verify we have data
        assert len(result.daily_values) > 0, "Should have daily values"

        # Extract dates from period_info
        if isinstance(result.period_info.start_date, str):
            period_start = datetime.fromisoformat(result.period_info.start_date).date()
        else:
            period_start = (
                result.period_info.start_date.date()
                if hasattr(result.period_info.start_date, "date")
                else result.period_info.start_date
            )

        if isinstance(result.period_info.end_date, str):
            period_end = datetime.fromisoformat(result.period_info.end_date).date()
        else:
            period_end = (
                result.period_info.end_date.date()
                if hasattr(result.period_info.end_date, "date")
                else result.period_info.end_date
            )

        # Extract dates from daily_values
        first_data_date = (
            result.daily_values[0].date.date()
            if hasattr(result.daily_values[0].date, "date")
            else result.daily_values[0].date
        )
        last_data_date = (
            result.daily_values[-1].date.date()
            if hasattr(result.daily_values[-1].date, "date")
            else result.daily_values[-1].date
        )

        # Verify alignment (within 1 day tolerance for timezone differences)
        start_diff = abs((first_data_date - period_start).days)
        end_diff = abs((last_data_date - period_end).days)

        assert start_diff <= 1, (
            f"First daily_value date should align with period start (diff: {start_diff} days)"
        )
        assert end_diff <= 1, (
            f"Last daily_value date should align with period end (diff: {end_diff} days)"
        )

    def test_period_info_days_matches_date_range(self, mocker):
        """Verify period_info.days matches calculated date range."""
        from datetime import UTC, datetime, timedelta

        today = datetime.now(UTC).date()

        # Create mock data spanning 90 days
        mock_rows = [
            {
                "date": (today - timedelta(days=i)).isoformat(),
                "chain": "ethereum",
                "source_type": "defi",
                "category": "eth",
                "category_value_usd": 200.0 + i,
                "pnl_usd": 2.0,
                "total_value_usd": 200.0 + i,
            }
            for i in range(100, 0, -1)
        ]

        mock_execute = mocker.patch.object(
            QueryService, "execute_query", return_value=mock_rows
        )
        service = TrendAnalysisService(
            db="mock_db_session", query_service=QueryService()
        )
        user_id = "a-real-uuid"

        result = service.get_portfolio_trend(user_id=user_id, days=90)

        mock_execute.assert_called_once()

        # Extract dates from period_info
        if isinstance(result.period_info.start_date, str):
            period_start = datetime.fromisoformat(result.period_info.start_date).date()
        else:
            period_start = (
                result.period_info.start_date.date()
                if hasattr(result.period_info.start_date, "date")
                else result.period_info.start_date
            )

        if isinstance(result.period_info.end_date, str):
            period_end = datetime.fromisoformat(result.period_info.end_date).date()
        else:
            period_end = (
                result.period_info.end_date.date()
                if hasattr(result.period_info.end_date, "date")
                else result.period_info.end_date
            )

        # Calculate date range
        calculated_days = (period_end - period_start).days

        # Verify days match (within 1 day tolerance)
        days_diff = abs(calculated_days - result.period_info.days)
        assert days_diff <= 1, (
            f"period_info.days ({result.period_info.days}) should match date range ({calculated_days} days)"
        )


class TestPeriodInfoDataSparsity:
    """Test period_info handling with sparse or gapped data."""

    def test_period_info_with_sparse_data(self, mocker):
        """Verify period_info shows requested days even with sparse data."""
        from datetime import UTC, datetime, timedelta

        today = datetime.now(UTC).date()

        # Create sparse mock data: only 10 days of data in a 90-day window
        mock_rows = [
            {
                "date": (today - timedelta(days=i * 9)).isoformat(),  # Every 9th day
                "chain": "ethereum",
                "source_type": "defi",
                "category": "stablecoins",
                "category_value_usd": 500.0 + i,
                "pnl_usd": 0.5,
                "total_value_usd": 500.0 + i,
            }
            for i in range(10)  # Only 10 data points
        ]

        mock_execute = mocker.patch.object(
            QueryService, "execute_query", return_value=mock_rows
        )
        service = TrendAnalysisService(
            db="mock_db_session", query_service=QueryService()
        )
        user_id = "a-real-uuid"

        result = service.get_portfolio_trend(user_id=user_id, days=90)

        mock_execute.assert_called_once()

        # Critical: period_info should reflect requested window (90 days), not available data (10 points)
        assert result.period_days == 90, "period_days should be 90 (requested)"
        assert result.period_info.days == 90, (
            "period_info.days should be 90 (requested), not 10 (available)"
        )
        assert result.data_points == 10, "data_points should be 10 (actual sparse data)"

    def test_period_info_with_gaps_in_data(self, mocker):
        """Verify period_info with gaps in data (missing middle days)."""
        from datetime import UTC, datetime, timedelta

        today = datetime.now(UTC).date()

        # Create data with gaps: days 1-10, missing 11-20, days 21-30
        early_days = [
            {
                "date": (today - timedelta(days=i)).isoformat(),
                "chain": "ethereum",
                "source_type": "defi",
                "category": "btc",
                "category_value_usd": 100.0 + i,
                "pnl_usd": 1.0,
                "total_value_usd": 100.0 + i,
            }
            for i in range(1, 11)  # Days 1-10
        ]

        late_days = [
            {
                "date": (today - timedelta(days=i)).isoformat(),
                "chain": "ethereum",
                "source_type": "defi",
                "category": "btc",
                "category_value_usd": 100.0 + i,
                "pnl_usd": 1.0,
                "total_value_usd": 100.0 + i,
            }
            for i in range(21, 31)  # Days 21-30 (gap: 11-20)
        ]

        mock_rows = early_days + late_days

        mock_execute = mocker.patch.object(
            QueryService, "execute_query", return_value=mock_rows
        )
        service = TrendAnalysisService(
            db="mock_db_session", query_service=QueryService()
        )
        user_id = "a-real-uuid"

        result = service.get_portfolio_trend(user_id=user_id, days=30)

        mock_execute.assert_called_once()

        # Critical: period_info should still show full 30-day window despite gaps
        assert result.period_days == 30, "period_days should be 30 (requested)"
        assert result.period_info.days == 30, (
            "period_info.days should be 30 despite data gaps"
        )
        assert result.data_points == 20, (
            "data_points should be 20 (10 + 10, excluding gap)"
        )
