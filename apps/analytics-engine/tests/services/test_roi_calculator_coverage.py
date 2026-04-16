"""Supplemental tests for ROICalculator coverage."""

from datetime import UTC, date, datetime, timedelta
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest

from src.core.cache_service import analytics_cache
from src.services.interfaces import QueryServiceProtocol
from src.services.portfolio.roi_calculator import ROICalculator


@pytest.fixture
def mock_query_service():
    return MagicMock(spec=QueryServiceProtocol)


@pytest.fixture
def calculator(mock_query_service):
    return ROICalculator(mock_query_service)


def test_compute_portfolio_roi_with_snapshot_date(calculator, mock_query_service):
    """Test compute_portfolio_roi with explicit current_snapshot_date."""
    user_id = uuid4()
    mock_db = MagicMock()
    snapshot_date = date(2023, 1, 1)

    # Mock return value for fetch_portfolio_snapshots via execute_query
    mock_query_service.execute_query.return_value = [
        {"date": snapshot_date, "category_value_usd": 1000},
    ]

    with patch.object(analytics_cache, "get", return_value=None):
        calculator.compute_portfolio_roi(
            mock_db, user_id, current_snapshot_date=snapshot_date
        )

    # Verify execute_query called with correct end_dt (snapshot_date + 1 day)
    args, kwargs = mock_query_service.execute_query.call_args
    # args: (db, query_name, params)
    params = args[2]
    expected_end = datetime.combine(
        snapshot_date + timedelta(days=1), datetime.min.time(), tzinfo=UTC
    )
    assert params["end_date"] == expected_end


def test_compute_portfolio_roi_cache_hit(calculator):
    """Test compute_portfolio_roi returns cached value."""
    user_id = uuid4()
    mock_db = MagicMock()
    cached_value = {"recommended_roi": 10.0}

    with (
        patch.object(analytics_cache, "get", return_value=cached_value),
        patch.object(analytics_cache, "build_key", return_value="key"),
    ):
        result = calculator.compute_portfolio_roi(mock_db, user_id)

    assert result == cached_value
    # execute_query should NOT be called if cache hit
    # But here we didn't mock query_service.execute_query, but if it was called it would crash since we perform no setup
    # If calculator.query_service is a mock, we can assert not called.
    calculator.query_service.execute_query.assert_not_called()


def test_compute_roi_internal_exception_handling(calculator, mock_query_service):
    """Test exception handling in _compute_roi_internal."""
    # Force exception
    mock_query_service.execute_query.side_effect = Exception("DB Error")
    mock_db = MagicMock()

    result = calculator._compute_roi_internal(mock_db, uuid4())

    # Should return empty result
    # Should return empty result structure (not empty dict)
    assert result["recommended_roi"] == 0.0
    assert result["estimated_yearly_pnl"] == 0.0
    assert len(result["windows"]) > 0


def test_calculate_windows_empty_totals(calculator):
    """Verify _calculate_windows returns empty dict when input empty."""
    assert calculator._calculate_windows({}) == {}


def test_select_recommended_fallback(calculator):
    """Verify _select_recommended fallback when no windows evaluated."""
    # Mock _evaluate_windows to return empty
    with patch.object(calculator, "_evaluate_windows", return_value=[]):
        # Pass a window that exists to trigger fallback default fetch
        windows = {
            "roi_30d": {
                "value": 0,
                "data_points": 0,
                "start_balance": 0,
                "days_spanned": 0,
            }
        }
        inputs = windows

        period, win, eff = calculator._select_recommended(inputs)
        assert period == "roi_30d"


def test_annualize_zero_days(calculator):
    """Verify _annualize returns 0.0 when window_days <= 0."""
    assert calculator._annualize(10.0, 0) == 0.0


def test_normalize_window_none(calculator):
    """Verify _normalize_window returns empty window when data is None."""
    w = calculator._normalize_window(None)
    assert w["value"] == 0.0


def test_resolve_effective_days_fallback(calculator):
    """Verify _resolve_effective_days falls back to static period if spanned days <= 0."""
    # "roi_30d" -> 30
    days = calculator._resolve_effective_days("roi_30d", {"days_spanned": 0})
    assert days == 30
