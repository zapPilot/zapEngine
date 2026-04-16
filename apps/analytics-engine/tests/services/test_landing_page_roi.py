"""
Focused tests for ROI calculation logic via ROICalculator service.
"""

from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

import pytest
from sqlalchemy.orm import Session

from src.services.portfolio.roi_calculator import ROICalculator


class _DummyQueryService:
    def __init__(self, rows: list[dict[str, Any]]):
        self._rows = rows

    def execute_query(self, *_args, **_kwargs):
        return self._rows

    def execute_query_one(self, *_args, **_kwargs):  # pragma: no cover - not used here
        return None


def _mk_roi_calculator(rows: list[dict[str, Any]]):
    query = _DummyQueryService(rows)
    return ROICalculator(query)


def test_compute_portfolio_roi_empty_rows_returns_zeros(db_session: Session):
    roi_calc = _mk_roi_calculator([])
    result = roi_calc.compute_portfolio_roi(db_session, uuid4())
    assert result["recommended_roi"] == 0.0
    assert result["recommended_period"] in result["windows"]
    assert result["windows"]["roi_7d"]["value"] == 0.0
    assert result["windows"]["roi_7d"]["days_spanned"] == 0


def test_compute_portfolio_roi_handles_string_dates(db_session: Session):
    # Two points within 7 days window to compute a small positive ROI (1%)
    last_day = datetime(2025, 1, 8, tzinfo=UTC)
    rows = [
        {"date": "2025-01-01", "net_value_usd": 100.0},
        {"date": last_day.isoformat(), "net_value_usd": 101.0},
    ]
    roi_calc = _mk_roi_calculator(rows)
    result = roi_calc.compute_portfolio_roi(db_session, uuid4())
    window_value = result["windows"]["roi_7d"]["value"]
    assert 0.99 <= window_value <= 1.01
    assert result["recommended_period"] in result["windows"]


def test_compute_portfolio_roi_earliest_zero_value_yields_zero_gain(
    db_session: Session,
):
    # Earliest value zero should force 0 ROI for that window
    last_day = datetime(2025, 1, 8, tzinfo=UTC)
    rows = [
        {"date": "2025-01-01", "net_value_usd": 0.0},
        {"date": last_day.isoformat(), "net_value_usd": 50.0},
    ]
    roi_calc = _mk_roi_calculator(rows)
    result = roi_calc.compute_portfolio_roi(db_session, uuid4())
    assert result["windows"]["roi_7d"]["value"] == 0.0
    assert result["windows"]["roi_7d"]["days_spanned"] == 7


def test_compute_portfolio_roi_uses_days_spanned_in_annualization(
    db_session: Session,
):
    # Window spans two days with a 10% gain; ensure we annualize using actual span
    last_day = datetime(2025, 1, 3, tzinfo=UTC)
    rows = [
        {"date": "2025-01-01", "net_value_usd": 100.0},
        {"date": last_day.isoformat(), "net_value_usd": 110.0},
    ]
    roi_calc = _mk_roi_calculator(rows)
    result = roi_calc.compute_portfolio_roi(db_session, uuid4())

    window = result["windows"]["roi_7d"]
    assert window["value"] == pytest.approx(10.0, rel=1e-6)
    assert window["days_spanned"] == 2

    recommended_period = result["recommended_period"]
    recommended_window = result["windows"][recommended_period]
    assert recommended_window["days_spanned"] == 2

    expected_yearly = 10.0 * (365.0 / 2.0)
    assert result["recommended_yearly_roi"] == pytest.approx(expected_yearly, rel=1e-6)


def test_compute_portfolio_roi_prefers_lowest_positive_annualized_roi(
    db_session: Session,
):
    last_day = datetime(2025, 1, 15, tzinfo=UTC)
    rows = [
        {"date": "2024-12-28", "net_value_usd": 140_000.0},
        {"date": "2025-01-01", "net_value_usd": 155_000.0},
        {"date": "2025-01-12", "net_value_usd": 158_000.0},
        {"date": last_day.isoformat(), "net_value_usd": 160_000.0},
    ]

    roi_calc = _mk_roi_calculator(rows)
    result = roi_calc.compute_portfolio_roi(db_session, uuid4())

    assert result["recommended_period"] == "roi_14d"
    recommended = result["windows"]["roi_14d"]
    expected_roi = ((160_000.0 - 155_000.0) / 155_000.0) * 100.0
    expected_annualized = expected_roi * (365.0 / 14.0)
    assert recommended["value"] == pytest.approx(expected_roi, rel=1e-6)
    assert result["recommended_yearly_roi"] == pytest.approx(
        expected_annualized, rel=1e-6
    )


def test_compute_portfolio_roi_prefers_smallest_abs_negative_when_no_positive(
    db_session: Session,
):
    last_day = datetime(2025, 1, 15, tzinfo=UTC)
    rows = [
        {"date": "2024-12-20", "net_value_usd": 150_000.0},
        {"date": "2025-01-01", "net_value_usd": 102_000.0},
        {"date": "2025-01-12", "net_value_usd": 120_000.0},
        {"date": last_day.isoformat(), "net_value_usd": 100_000.0},
    ]

    roi_calc = _mk_roi_calculator(rows)
    result = roi_calc.compute_portfolio_roi(db_session, uuid4())

    assert result["recommended_period"] == "roi_14d"
    recommended = result["windows"]["roi_14d"]
    expected_roi = ((100_000.0 - 102_000.0) / 102_000.0) * 100.0
    expected_annualized = expected_roi * (365.0 / 14.0)
    assert recommended["value"] == pytest.approx(expected_roi, rel=1e-6)
    assert result["recommended_yearly_roi"] == pytest.approx(
        expected_annualized, rel=1e-6
    )


def test_compute_portfolio_roi_defaults_to_nominal_window_for_zero_returns(
    db_session: Session,
):
    last_day = datetime(2025, 1, 31, tzinfo=UTC)
    rows = [
        {"date": "2025-01-01", "net_value_usd": 200_000.0},
        {"date": last_day.isoformat(), "net_value_usd": 200_000.0},
    ]

    roi_calc = _mk_roi_calculator(rows)
    result = roi_calc.compute_portfolio_roi(db_session, uuid4())

    assert result["recommended_period"] == "roi_30d"
    assert result["recommended_roi"] == pytest.approx(0.0)
    assert result["recommended_yearly_roi"] == pytest.approx(0.0)
