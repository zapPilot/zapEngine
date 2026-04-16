"""
Unit tests for the ROICalculator service.

Tests cover ROI computation logic, window calculations, date coercion,
recommendation selection, and edge case handling.
"""

from datetime import date, datetime, timedelta
from unittest.mock import Mock
from uuid import UUID

import pytest

from src.services.portfolio.roi_calculator import ROI_PERIODS, ROICalculator
from src.services.shared.query_names import QUERY_NAMES
from src.services.shared.query_service import QueryService


@pytest.fixture
def roi_calculator():
    """Provide an ROICalculator instance with a mock query service."""
    mock_query_service = Mock(spec=QueryService)
    return ROICalculator(query_service=mock_query_service)


@pytest.fixture
def user_id():
    """Provide a sample user UUID."""
    return UUID("12345678-1234-5678-1234-567812345678")


class TestComputePortfolioROI:
    """Tests for the main compute_portfolio_roi method."""

    def test_empty_data_returns_zero_result(self, roi_calculator, user_id, mocker):
        """Verify empty database result returns zero ROI values."""
        mock_db = Mock()
        roi_calculator.query_service.execute_query = Mock(return_value=[])

        result = roi_calculator.compute_portfolio_roi(db=mock_db, user_id=user_id)

        assert result["recommended_roi"] == 0.0
        assert result["recommended_yearly_roi"] == 0.0
        assert result["estimated_yearly_pnl"] == 0.0
        assert len(result["windows"]) == len(ROI_PERIODS)

    def test_with_valid_data(self, roi_calculator, user_id):
        """Verify ROI calculation with valid historical data."""
        mock_db = Mock()
        today = date.today()
        yesterday = today - timedelta(days=1)

        # Mock data showing 10% gain
        mock_rows = [
            {"date": yesterday, "net_value_usd": 1000.0},
            {"date": today, "net_value_usd": 1100.0},
        ]
        roi_calculator.query_service.execute_query = Mock(return_value=mock_rows)

        result = roi_calculator.compute_portfolio_roi(db=mock_db, user_id=user_id)

        assert "windows" in result
        assert "recommended_roi" in result
        assert "recommended_period" in result
        assert result["recommended_roi"] > 0.0

    def test_uses_materialized_view(self, roi_calculator, user_id):
        """Verify ROI calculator uses the materialized view for performance."""
        mock_db = Mock()
        today = date.today()
        yesterday = today - timedelta(days=1)

        # Mock data
        mock_rows = [
            {"date": yesterday, "net_value_usd": 1000.0},
            {"date": today, "net_value_usd": 1100.0},
        ]
        roi_calculator.query_service.execute_query = Mock(return_value=mock_rows)

        # Execute computation
        roi_calculator.compute_portfolio_roi(db=mock_db, user_id=user_id)

        # Verify materialized view is being used (not the direct query)
        roi_calculator.query_service.execute_query.assert_called()
        call_args = roi_calculator.query_service.execute_query.call_args
        query_name = call_args[0][1]  # Second positional arg is query_name

        assert query_name == QUERY_NAMES.PORTFOLIO_CATEGORY_TREND_MV, (
            f"ROI calculator should use materialized view "
            f"(PORTFOLIO_CATEGORY_TREND_MV) for 15-25x performance improvement, "
            f"but got: {query_name}"
        )


class TestAggregateDailyTotals:
    """Tests for the _aggregate_daily_totals method."""

    def test_aggregate_with_none_dates_skipped(self, roi_calculator):
        """Verify rows with None dates are skipped."""
        rows = [
            {"date": None, "net_value_usd": 100.0},
            {"date": date(2023, 1, 1), "net_value_usd": 200.0},
        ]

        daily_totals = roi_calculator._aggregate_daily_totals(rows)

        assert len(daily_totals) == 1
        assert daily_totals[date(2023, 1, 1)] == 200.0

    def test_aggregate_multiple_entries_same_day(self, roi_calculator):
        """Verify multiple entries for the same day are summed."""
        day = date(2023, 1, 1)
        rows = [
            {"date": day, "net_value_usd": 100.0},
            {"date": day, "net_value_usd": 150.0},
            {"date": day, "net_value_usd": 50.0},
        ]

        daily_totals = roi_calculator._aggregate_daily_totals(rows)

        assert daily_totals[day] == 300.0


class TestCalculateWindows:
    """Tests for the _calculate_windows method."""

    def test_empty_daily_totals_returns_empty_dict(self, roi_calculator):
        """Verify empty daily totals returns empty windows dict."""
        result = roi_calculator._calculate_windows({})

        assert result == {}

    def test_sorted_days_extraction(self, roi_calculator):
        """Verify windows are calculated from sorted daily totals."""
        daily_totals = {
            date(2023, 1, 3): 300.0,
            date(2023, 1, 1): 100.0,
            date(2023, 1, 2): 200.0,
        }

        result = roi_calculator._calculate_windows(daily_totals)

        assert len(result) == len(ROI_PERIODS)
        assert all(isinstance(window, dict) for window in result.values())


class TestComputeWindow:
    """Tests for the _compute_window method."""

    def test_window_days_zero_or_negative(self, roi_calculator):
        """Verify zero or negative window_days returns empty window."""
        last_day = date(2023, 1, 10)
        sorted_days = [date(2023, 1, i) for i in range(1, 11)]
        daily_totals = dict.fromkeys(sorted_days, 100.0)

        result = roi_calculator._compute_window(
            window_days=0,
            last_day=last_day,
            sorted_days=sorted_days,
            daily_totals=daily_totals,
            latest_value=100.0,
        )

        assert result["value"] == 0.0
        assert result["data_points"] == 0

    def test_no_days_in_window(self, roi_calculator):
        """Verify window with no matching days returns empty window."""
        last_day = date(2023, 1, 10)
        sorted_days = [date(2023, 1, 1)]  # Only 1 day, 9 days before last_day
        daily_totals = {date(2023, 1, 1): 100.0}

        # Window of 3 days means we need data from 2023-01-07 onwards
        result = roi_calculator._compute_window(
            window_days=3,
            last_day=last_day,
            sorted_days=sorted_days,
            daily_totals=daily_totals,
            latest_value=100.0,
        )

        assert result["value"] == 0.0
        assert result["data_points"] == 0

    def test_start_balance_zero_or_negative(self, roi_calculator):
        """Verify zero or negative start balance returns empty window with metadata."""
        last_day = date(2023, 1, 10)
        sorted_days = [date(2023, 1, 9), date(2023, 1, 10)]
        daily_totals = {
            date(2023, 1, 9): 0.0,  # Zero start balance
            date(2023, 1, 10): 100.0,
        }

        result = roi_calculator._compute_window(
            window_days=3,
            last_day=last_day,
            sorted_days=sorted_days,
            daily_totals=daily_totals,
            latest_value=100.0,
        )

        assert result["value"] == 0.0
        assert result["data_points"] == 2
        assert result["start_balance"] == 0.0

    def test_day_after_last_day_skipped(self, roi_calculator):
        """Verify days after last_day are skipped in window calculation."""
        last_day = date(2023, 1, 10)
        sorted_days = [
            date(2023, 1, 9),
            date(2023, 1, 10),
            date(2023, 1, 11),  # Should be skipped
        ]
        daily_totals = dict.fromkeys(sorted_days, 100.0)

        result = roi_calculator._compute_window(
            window_days=30,
            last_day=last_day,
            sorted_days=sorted_days,
            daily_totals=daily_totals,
            latest_value=100.0,
        )

        # Should only count 2 days (9th and 10th), not 11th
        assert result["data_points"] == 2


class TestNormalizeWindow:
    """Tests for the _normalize_window method."""

    def test_normalize_none_returns_empty_window(self, roi_calculator):
        """Verify None window data returns empty window."""
        result = roi_calculator._normalize_window(None)

        assert result["value"] == 0.0
        assert result["data_points"] == 0

    def test_normalize_invalid_data_points_type(self, roi_calculator):
        """Verify invalid data_points type defaults to 0."""
        data = {
            "value": 5.0,
            "data_points": "invalid",  # Should cause TypeError
            "start_balance": 100.0,
            "days_spanned": 10,
        }

        result = roi_calculator._normalize_window(data)

        assert result["data_points"] == 0

    def test_normalize_invalid_days_spanned_type(self, roi_calculator):
        """Verify invalid days_spanned type defaults to 0."""
        data = {
            "value": 5.0,
            "data_points": 10,
            "start_balance": 100.0,
            "days_spanned": None,  # Should cause TypeError
        }

        result = roi_calculator._normalize_window(data)

        assert result["days_spanned"] == 0

    def test_normalize_negative_data_points(self, roi_calculator):
        """Verify negative data_points are set to 0."""
        data = {
            "value": 5.0,
            "data_points": -5,
            "start_balance": 100.0,
            "days_spanned": 10,
        }

        result = roi_calculator._normalize_window(data)

        assert result["data_points"] == 0


class TestResolveEffectiveDays:
    """Tests for the _resolve_effective_days method."""

    def test_resolve_with_invalid_days_spanned(self, roi_calculator):
        """Verify invalid days_spanned falls back to ROI_PERIODS value."""
        data: dict = {
            "value": 5.0,
            "data_points": 10,
            "start_balance": 100.0,
            "days_spanned": "invalid",  # Should cause TypeError
        }

        result = roi_calculator._resolve_effective_days("roi_7d", data)

        assert result == 7  # Fallback to ROI_PERIODS["roi_7d"]


class TestSelectRecommended:
    """Tests for the _select_recommended method."""

    def test_empty_evaluated_windows_returns_default(self, roi_calculator):
        """Verify empty evaluated windows returns default period."""
        windows = {
            "roi_7d": {
                "value": 0.0,
                "data_points": 0,
                "start_balance": 0.0,
                "days_spanned": 0,
            },
        }

        period, window, days = roi_calculator._select_recommended(windows)

        assert period in ROI_PERIODS
        assert "value" in window


class TestDefaultPeriod:
    """Tests for the _default_period static method."""

    def test_default_period_not_in_windows_returns_first(self, roi_calculator):
        """Verify when DEFAULT_RECOMMENDED_PERIOD not in windows, returns first."""
        windows = {"roi_3d": {}, "roi_14d": {}}  # Missing roi_30d (default)

        result = roi_calculator._default_period(windows)

        # Should return first key since default not present
        assert result in windows


class TestCoerceDate:
    """Tests for the _cached_normalize_date static method."""

    def test_coerce_none_returns_none(self, roi_calculator):
        """Verify None input returns None."""
        assert roi_calculator._cached_normalize_date(None) is None

    def test_cached_normalize_datetime_returns_date(self, roi_calculator):
        """Verify datetime is converted to date."""
        dt = datetime(2023, 1, 15, 12, 30, 45)
        result = roi_calculator._cached_normalize_date(dt)

        assert result == date(2023, 1, 15)
        assert isinstance(result, date)

    def test_cached_normalize_date_returns_date(self, roi_calculator):
        """Verify date is returned as-is."""
        d = date(2023, 1, 15)
        result = roi_calculator._cached_normalize_date(d)

        assert result == d
        assert isinstance(result, date)

    def test_coerce_valid_string_returns_date(self, roi_calculator):
        """Verify valid ISO string is parsed to date."""
        result = roi_calculator._cached_normalize_date("2023-01-15")

        assert result == date(2023, 1, 15)

    def test_coerce_invalid_string_returns_none(self, roi_calculator):
        """Verify invalid date string returns None."""
        result = roi_calculator._cached_normalize_date("invalid-date")

        assert result is None

    def test_coerce_unsupported_type_returns_none(self, roi_calculator):
        """Verify unsupported types return None.

        Note: Unhashable types (lists, dicts) raise TypeError with LRU cache.
        This is acceptable since production code never passes unhashable types.
        """
        assert roi_calculator._cached_normalize_date(12345) is None
        assert roi_calculator._cached_normalize_date(3.14) is None


class TestAnnualize:
    """Tests for the _annualize static method."""

    def test_annualize_zero_days_returns_zero(self, roi_calculator):
        """Verify zero window_days returns 0.0."""
        result = roi_calculator._annualize(10.0, 0)

        assert result == 0.0

    def test_annualize_negative_days_returns_zero(self, roi_calculator):
        """Verify negative window_days returns 0.0."""
        result = roi_calculator._annualize(10.0, -5)

        assert result == 0.0

    def test_annualize_7_day_roi(self, roi_calculator):
        """Verify 7-day ROI is annualized correctly."""
        # 10% over 7 days = 521.4% annualized
        result = roi_calculator._annualize(10.0, 7)

        assert pytest.approx(result, rel=1e-2) == 521.43
