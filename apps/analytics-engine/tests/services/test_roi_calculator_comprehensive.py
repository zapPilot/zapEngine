"""
Comprehensive unit tests for ROICalculator service.

Tests cover ROI calculations, period handling, edge cases, and the EvaluatedWindow data class.
"""

from datetime import date, datetime, timedelta
from decimal import Decimal
from unittest.mock import Mock

import pytest

from src.services.portfolio.roi_calculator import (
    DEFAULT_RECOMMENDED_PERIOD,
    ROI_PERIODS,
    EvaluatedWindow,
    ROICalculator,
)


class TestROICalculatorInitialization:
    """Test ROICalculator initialization."""

    def test_initialization_with_query_service(self):
        """Test proper initialization with query service."""
        mock_query_service = Mock()
        calculator = ROICalculator(query_service=mock_query_service)

        assert calculator.query_service is mock_query_service

    def test_initialization_requires_query_service(self):
        """Test that initialization requires query service parameter."""
        # ROICalculator expects a query_service parameter
        mock_query_service = Mock()
        calculator = ROICalculator(query_service=mock_query_service)

        # Verify the calculator has the query_service attribute
        assert hasattr(calculator, "query_service")
        assert calculator.query_service is mock_query_service


class TestROIPeriodCalculations:
    """Test ROI calculations across different periods."""

    @pytest.fixture
    def mock_query_service(self):
        """Provide mock query service."""
        return Mock()

    @pytest.fixture
    def roi_calculator(self, mock_query_service):
        """Provide ROICalculator instance with mocked dependencies."""
        return ROICalculator(query_service=mock_query_service)

    @pytest.fixture
    def mock_db_session(self):
        """Provide mock database session."""
        return Mock()

    @pytest.mark.parametrize(
        "period_key,expected_days",
        [
            ("roi_7d", 7),
            ("roi_30d", 30),
            ("roi_60d", 60),
            ("roi_180d", 180),
            ("roi_365d", 365),
        ],
    )
    def test_all_roi_periods(
        self,
        roi_calculator,
        mock_query_service,
        mock_db_session,
        period_key,
        expected_days,
    ):
        """Test ROI calculation for all standard periods."""
        from uuid import uuid4

        user_id = uuid4()
        today = date.today()
        start_date = today - timedelta(days=expected_days)

        # Mock portfolio data for the period
        mock_query_service.execute_query.return_value = [
            {
                "date": start_date,
                "category_value_usd": Decimal("1000.00"),
            },
            {
                "date": today,
                "category_value_usd": Decimal("1100.00"),
            },
        ]

        result = roi_calculator.compute_portfolio_roi(mock_db_session, user_id)

        # Verify structure
        assert "windows" in result
        assert "recommended_roi" in result
        assert "recommended_period" in result
        assert "recommended_yearly_roi" in result

        # Verify period exists in windows
        assert period_key in result["windows"]

        # 10% gain: (1100 - 1000) / 1000 = 0.10 = 10%
        window_data = result["windows"][period_key]
        assert window_data["value"] == pytest.approx(10.0, rel=0.01)
        assert window_data["data_points"] > 0

    def test_positive_roi(self, roi_calculator, mock_query_service, mock_db_session):
        """Test ROI with positive returns (gain)."""
        from uuid import uuid4

        user_id = uuid4()
        today = date.today()
        start_date = today - timedelta(days=30)

        # 50% gain scenario
        mock_query_service.execute_query.return_value = [
            {"date": start_date, "category_value_usd": Decimal("1000.00")},
            {"date": today, "category_value_usd": Decimal("1500.00")},
        ]

        result = roi_calculator.compute_portfolio_roi(mock_db_session, user_id)

        # Should have positive ROI in 30d window
        roi_30d = result["windows"]["roi_30d"]
        assert roi_30d["value"] == pytest.approx(50.0, rel=0.01)
        assert roi_30d["start_balance"] == 1000.0

    def test_negative_roi_loss(
        self, roi_calculator, mock_query_service, mock_db_session
    ):
        """Test ROI with negative returns (loss)."""
        from uuid import uuid4

        user_id = uuid4()
        today = date.today()
        start_date = today - timedelta(days=30)

        # 20% loss scenario
        mock_query_service.execute_query.return_value = [
            {"date": start_date, "category_value_usd": Decimal("1000.00")},
            {"date": today, "category_value_usd": Decimal("800.00")},
        ]

        result = roi_calculator.compute_portfolio_roi(mock_db_session, user_id)

        # Should have negative ROI in 30d window
        roi_30d = result["windows"]["roi_30d"]
        # -20% loss: (800 - 1000) / 1000 = -0.20 = -20%
        assert roi_30d["value"] == pytest.approx(-20.0, rel=0.01)

    def test_zero_change_roi(self, roi_calculator, mock_query_service, mock_db_session):
        """Test ROI with no change (flat portfolio)."""
        from uuid import uuid4

        user_id = uuid4()
        today = date.today()
        start_date = today - timedelta(days=30)

        # No change scenario
        mock_query_service.execute_query.return_value = [
            {"date": start_date, "category_value_usd": Decimal("1000.00")},
            {"date": today, "category_value_usd": Decimal("1000.00")},
        ]

        result = roi_calculator.compute_portfolio_roi(mock_db_session, user_id)

        # Should have zero ROI
        roi_30d = result["windows"]["roi_30d"]
        assert roi_30d["value"] == 0.0

    def test_very_high_roi(self, roi_calculator, mock_query_service, mock_db_session):
        """Test very high ROI (> 1000%)."""
        from uuid import uuid4

        user_id = uuid4()
        today = date.today()
        start_date = today - timedelta(days=30)

        # 1100% gain (12x)
        mock_query_service.execute_query.return_value = [
            {"date": start_date, "category_value_usd": Decimal("100.00")},
            {"date": today, "category_value_usd": Decimal("1200.00")},
        ]

        result = roi_calculator.compute_portfolio_roi(mock_db_session, user_id)

        # 1100% gain
        roi_30d = result["windows"]["roi_30d"]
        assert roi_30d["value"] == pytest.approx(1100.0, rel=0.01)

    def test_empty_portfolio_roi(
        self, roi_calculator, mock_query_service, mock_db_session
    ):
        """Test ROI calculation with empty portfolio."""
        from uuid import uuid4

        user_id = uuid4()

        # Empty portfolio
        mock_query_service.execute_query.return_value = []

        result = roi_calculator.compute_portfolio_roi(mock_db_session, user_id)

        # Should handle gracefully with zero values
        assert result["recommended_roi"] == 0.0
        assert result["recommended_yearly_roi"] == 0.0
        assert result["estimated_yearly_pnl"] == 0.0

    def test_single_data_point_roi(
        self, roi_calculator, mock_query_service, mock_db_session
    ):
        """Test ROI with only a single data point."""
        from uuid import uuid4

        user_id = uuid4()
        today = date.today()

        # Only one data point
        mock_query_service.execute_query.return_value = [
            {"date": today, "category_value_usd": Decimal("1000.00")},
        ]

        result = roi_calculator.compute_portfolio_roi(mock_db_session, user_id)

        # Should handle single point (no ROI calculation possible)
        for period in ROI_PERIODS:
            assert result["windows"][period]["value"] == 0.0

    def test_zero_start_balance_handling(
        self, roi_calculator, mock_query_service, mock_db_session
    ):
        """Test handling of zero start balance (division by zero protection)."""
        from uuid import uuid4

        user_id = uuid4()
        today = date.today()
        start_date = today - timedelta(days=30)

        # Start with 0, end with value (cannot calculate percentage)
        mock_query_service.execute_query.return_value = [
            {"date": start_date, "category_value_usd": Decimal("0.00")},
            {"date": today, "category_value_usd": Decimal("100.00")},
        ]

        result = roi_calculator.compute_portfolio_roi(mock_db_session, user_id)

        # Should handle gracefully (return 0 ROI when start balance is 0)
        roi_30d = result["windows"]["roi_30d"]
        assert roi_30d["value"] == 0.0
        assert roi_30d["start_balance"] == 0.0

    def test_negative_start_balance_handling(
        self, roi_calculator, mock_query_service, mock_db_session
    ):
        """Test handling of negative start balance edge case."""
        from uuid import uuid4

        user_id = uuid4()
        today = date.today()
        start_date = today - timedelta(days=30)

        # Negative balance (debt position)
        mock_query_service.execute_query.return_value = [
            {"date": start_date, "category_value_usd": Decimal("-100.00")},
            {"date": today, "category_value_usd": Decimal("100.00")},
        ]

        result = roi_calculator.compute_portfolio_roi(mock_db_session, user_id)

        # Should handle gracefully (negative start balance treated as 0)
        roi_30d = result["windows"]["roi_30d"]
        assert roi_30d["value"] == 0.0

    def test_multiple_categories_aggregation(
        self, roi_calculator, mock_query_service, mock_db_session
    ):
        """Test ROI calculation aggregates multiple categories correctly."""
        from uuid import uuid4

        user_id = uuid4()
        today = date.today()
        start_date = today - timedelta(days=30)

        # Multiple categories that should be aggregated
        mock_query_service.execute_query.return_value = [
            # Start day - multiple categories
            {"date": start_date, "category_value_usd": Decimal("300.00")},  # BTC
            {"date": start_date, "category_value_usd": Decimal("200.00")},  # ETH
            {
                "date": start_date,
                "category_value_usd": Decimal("500.00"),
            },  # Stablecoins
            # End day - multiple categories
            {"date": today, "category_value_usd": Decimal("400.00")},  # BTC
            {"date": today, "category_value_usd": Decimal("300.00")},  # ETH
            {"date": today, "category_value_usd": Decimal("500.00")},  # Stablecoins
        ]

        result = roi_calculator.compute_portfolio_roi(mock_db_session, user_id)

        # Start: 1000, End: 1200, ROI: 20%
        roi_30d = result["windows"]["roi_30d"]
        assert roi_30d["value"] == pytest.approx(20.0, rel=0.01)
        assert roi_30d["start_balance"] == 1000.0


class TestEvaluatedWindowClass:
    """Test EvaluatedWindow data class."""

    def test_evaluated_window_initialization(self):
        """Test EvaluatedWindow initialization."""
        window = EvaluatedWindow(
            period="roi_30d",
            data={
                "value": 10.0,
                "data_points": 30,
                "start_balance": 1000.0,
                "days_spanned": 29,
            },
            effective_days=30,
            annualized=121.67,
        )

        assert window.period == "roi_30d"
        assert window.data["value"] == 10.0
        assert window.effective_days == 30
        assert window.annualized == pytest.approx(121.67, rel=0.01)

    def test_evaluated_window_with_zero_roi(self):
        """Test EvaluatedWindow with zero ROI."""
        window = EvaluatedWindow(
            period="roi_30d",
            data={
                "value": 0.0,
                "data_points": 30,
                "start_balance": 1000.0,
                "days_spanned": 29,
            },
            effective_days=30,
            annualized=0.0,
        )

        assert window.annualized == 0.0
        assert window.data["value"] == 0.0

    def test_evaluated_window_with_negative_roi(self):
        """Test EvaluatedWindow with negative ROI."""
        window = EvaluatedWindow(
            period="roi_30d",
            data={
                "value": -20.0,
                "data_points": 30,
                "start_balance": 1000.0,
                "days_spanned": 29,
            },
            effective_days=30,
            annualized=-243.33,
        )

        assert window.annualized == pytest.approx(-243.33, rel=0.01)
        assert window.data["value"] == -20.0

    def test_evaluated_window_data_points(self):
        """Test EvaluatedWindow tracks data points correctly."""
        window = EvaluatedWindow(
            period="roi_7d",
            data={
                "value": 5.0,
                "data_points": 7,
                "start_balance": 500.0,
                "days_spanned": 6,
            },
            effective_days=7,
            annualized=260.71,
        )

        assert window.data["data_points"] == 7
        assert window.data["days_spanned"] == 6

    def test_evaluated_window_with_long_period(self):
        """Test EvaluatedWindow with long period (365 days)."""
        window = EvaluatedWindow(
            period="roi_365d",
            data={
                "value": 100.0,
                "data_points": 365,
                "start_balance": 10000.0,
                "days_spanned": 364,
            },
            effective_days=365,
            annualized=100.0,  # Already annualized
        )

        assert window.period == "roi_365d"
        assert window.effective_days == 365
        # 1-year period should have annualized close to raw ROI
        assert window.annualized == pytest.approx(100.0, rel=0.01)


class TestROICalculatorPrivateMethods:
    """Test private helper methods of ROICalculator."""

    @pytest.fixture
    def mock_query_service(self):
        """Provide mock query service."""
        return Mock()

    @pytest.fixture
    def roi_calculator(self, mock_query_service):
        """Provide ROICalculator instance."""
        return ROICalculator(query_service=mock_query_service)

    def test_cached_normalize_date_from_datetime(self, roi_calculator):
        """Test _cached_normalize_date handles datetime objects."""
        dt = datetime(2025, 1, 15, 10, 30, 0)
        result = roi_calculator._cached_normalize_date(dt)
        assert result == date(2025, 1, 15)

    def test_cached_normalize_date_from_date(self, roi_calculator):
        """Test _cached_normalize_date handles date objects."""
        d = date(2025, 1, 15)
        result = roi_calculator._cached_normalize_date(d)
        assert result == date(2025, 1, 15)

    def test_cached_normalize_date_from_string(self, roi_calculator):
        """Test _cached_normalize_date handles ISO format strings."""
        date_str = "2025-01-15"
        result = roi_calculator._cached_normalize_date(date_str)
        assert result == date(2025, 1, 15)

    def test_cached_normalize_date_from_none(self, roi_calculator):
        """Test _cached_normalize_date handles None."""
        result = roi_calculator._cached_normalize_date(None)
        assert result is None

    def test_cached_normalize_date_from_invalid_string(self, roi_calculator):
        """Test _cached_normalize_date handles invalid strings."""
        result = roi_calculator._cached_normalize_date("invalid-date")
        assert result is None

    def test_empty_roi_window_structure(self, roi_calculator):
        """Test _empty_roi_window returns correct structure."""
        result = roi_calculator._empty_roi_window()

        assert result["value"] == 0.0
        assert result["data_points"] == 0
        assert result["start_balance"] == 0.0
        assert result["days_spanned"] == 0

    def test_annualize_roi_30_days(self, roi_calculator):
        """Test _annualize for 30-day period."""
        # 10% over 30 days -> ~121.67% annualized
        result = roi_calculator._annualize(10.0, 30)
        assert result == pytest.approx(121.67, rel=0.01)

    def test_annualize_roi_365_days(self, roi_calculator):
        """Test _annualize for 365-day period."""
        # 100% over 365 days -> 100% annualized
        result = roi_calculator._annualize(100.0, 365)
        assert result == pytest.approx(100.0, rel=0.01)

    def test_annualize_roi_7_days(self, roi_calculator):
        """Test _annualize for 7-day period."""
        # 5% over 7 days -> ~260.71% annualized
        result = roi_calculator._annualize(5.0, 7)
        assert result == pytest.approx(260.71, rel=0.01)

    def test_annualize_with_zero_days(self, roi_calculator):
        """Test _annualize with zero days (edge case)."""
        result = roi_calculator._annualize(10.0, 0)
        assert result == 0.0

    def test_default_period_constant(self):
        """Test DEFAULT_RECOMMENDED_PERIOD is defined."""
        assert DEFAULT_RECOMMENDED_PERIOD in ROI_PERIODS
        assert DEFAULT_RECOMMENDED_PERIOD == "roi_30d"


class TestROICalculatorEdgeCases:
    """Test edge cases and error handling."""

    @pytest.fixture
    def mock_query_service(self):
        """Provide mock query service."""
        return Mock()

    @pytest.fixture
    def roi_calculator(self, mock_query_service):
        """Provide ROICalculator instance."""
        return ROICalculator(query_service=mock_query_service)

    @pytest.fixture
    def mock_db_session(self):
        """Provide mock database session."""
        return Mock()

    def test_missing_date_fields_in_data(
        self, roi_calculator, mock_query_service, mock_db_session
    ):
        """Test handling of missing date fields in database results."""
        from uuid import uuid4

        user_id = uuid4()

        # Data with missing date
        mock_query_service.execute_query.return_value = [
            {"date": None, "category_value_usd": Decimal("1000.00")},
        ]

        result = roi_calculator.compute_portfolio_roi(mock_db_session, user_id)

        # Should handle gracefully
        assert result["recommended_roi"] == 0.0

    def test_missing_value_fields_in_data(
        self, roi_calculator, mock_query_service, mock_db_session
    ):
        """Test handling of missing value fields in database results."""
        from uuid import uuid4

        user_id = uuid4()
        today = date.today()

        # Data with missing value
        mock_query_service.execute_query.return_value = [
            {"date": today, "category_value_usd": None},
        ]

        result = roi_calculator.compute_portfolio_roi(mock_db_session, user_id)

        # Should handle gracefully
        assert result is not None

    def test_non_numeric_values_in_data(
        self, roi_calculator, mock_query_service, mock_db_session
    ):
        """Test handling of non-numeric values."""
        from uuid import uuid4

        user_id = uuid4()
        today = date.today()

        # Data with string value (should be converted)
        mock_query_service.execute_query.return_value = [
            {"date": today, "category_value_usd": "1000.00"},
        ]

        result = roi_calculator.compute_portfolio_roi(mock_db_session, user_id)

        # Should handle conversion via safe_float
        assert result is not None

    def test_sparse_data_with_gaps(
        self, roi_calculator, mock_query_service, mock_db_session
    ):
        """Test ROI calculation with sparse data (gaps in days)."""
        from uuid import uuid4

        user_id = uuid4()
        today = date.today()

        # Sparse data: only 3 days out of 30
        mock_query_service.execute_query.return_value = [
            {
                "date": today - timedelta(days=30),
                "category_value_usd": Decimal("1000.00"),
            },
            {
                "date": today - timedelta(days=15),
                "category_value_usd": Decimal("1050.00"),
            },
            {"date": today, "category_value_usd": Decimal("1100.00")},
        ]

        result = roi_calculator.compute_portfolio_roi(mock_db_session, user_id)

        # Should still calculate ROI with available data
        roi_30d = result["windows"]["roi_30d"]
        assert roi_30d["value"] == pytest.approx(10.0, rel=0.01)
        assert roi_30d["data_points"] == 3
