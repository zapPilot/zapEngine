from datetime import UTC, datetime
from unittest.mock import MagicMock
from uuid import uuid4

import pytest

from src.services.analytics.risk_metrics_service import RiskMetricsService


class TestCoerceDrawdownDatetime:
    """Tests for _coerce_drawdown_datetime static method (line 330)."""

    def test_returns_none_when_value_is_none(self) -> None:
        result = RiskMetricsService._coerce_drawdown_datetime(None)
        assert result is None

    def test_strips_timezone_from_datetime(self) -> None:
        dt = datetime(2025, 1, 15, tzinfo=UTC)
        result = RiskMetricsService._coerce_drawdown_datetime(dt)
        assert result == datetime(2025, 1, 15)
        assert result.tzinfo is None


class TestResolvePeakDateForTrough:
    """Tests for _resolve_peak_date_for_trough (lines 396, 401, 407)."""

    @pytest.fixture
    def service(self) -> RiskMetricsService:
        return RiskMetricsService(MagicMock(), MagicMock())

    def test_returns_none_when_trough_date_is_none(
        self, service: RiskMetricsService
    ) -> None:
        """Line 396: trough_dt is None → return None."""
        result = service._resolve_peak_date_for_trough(
            drawdown_data=[],
            trough_date=None,
            peak_value=100.0,
        )
        assert result is None

    def test_skips_rows_after_trough(self, service: RiskMetricsService) -> None:
        """Line 401: row_date > trough_dt → continue."""
        trough = datetime(2025, 1, 2)
        data = [
            {"date": datetime(2025, 1, 3), "peak_value": 100.0},  # after trough → skip
            {"date": datetime(2025, 1, 1), "peak_value": 100.0},  # match
        ]
        result = service._resolve_peak_date_for_trough(
            drawdown_data=data,
            trough_date=trough,
            peak_value=100.0,
        )
        assert result == datetime(2025, 1, 1)

    def test_returns_none_when_no_matching_peak_found(
        self, service: RiskMetricsService
    ) -> None:
        """Line 407: loop ends without finding matching peak → return None."""
        trough = datetime(2025, 1, 5)
        data = [
            {"date": datetime(2025, 1, 1), "peak_value": 999.0},
            {"date": datetime(2025, 1, 2), "peak_value": 888.0},
        ]
        result = service._resolve_peak_date_for_trough(
            drawdown_data=data,
            trough_date=trough,
            peak_value=100.0,
        )
        assert result is None


class TestComputeDrawdownDurationDays:
    """Tests for _compute_drawdown_duration_days (lines 417, 421)."""

    @pytest.fixture
    def service(self) -> RiskMetricsService:
        return RiskMetricsService(MagicMock(), MagicMock())

    def test_returns_zero_when_peak_date_is_none(
        self, service: RiskMetricsService
    ) -> None:
        """Line 417: peak_date is None → return 0."""
        result = service._compute_drawdown_duration_days(
            peak_date=None,
            trough_date=datetime(2025, 1, 10),
        )
        assert result == 0

    def test_returns_zero_when_trough_date_is_none(
        self, service: RiskMetricsService
    ) -> None:
        """Line 421: trough_dt is None → return 0."""
        result = service._compute_drawdown_duration_days(
            peak_date=datetime(2025, 1, 1),
            trough_date=None,
        )
        assert result == 0


class TestRiskMetricsServiceCoverageGaps:
    @pytest.fixture
    def service(self):
        return RiskMetricsService(MagicMock(), MagicMock())

    def test_calculate_max_drawdown_datetime_inputs_and_none(self, service):
        """Verify _to_datetime usage within calculate_max_drawdown with actual datetime objects."""
        user_id = uuid4()

        # Mock _get_drawdown_base_data to return datetime objects instead of strings
        # Also return one None date to verify defensive check
        dt1 = datetime(2025, 1, 1, tzinfo=UTC)
        dt2 = datetime(2025, 1, 2, tzinfo=UTC)

        data = [
            {"date": dt1, "portfolio_value": 100, "peak_value": 100, "drawdown_pct": 0},
            {
                "date": dt2,
                "portfolio_value": 90,
                "peak_value": 100,
                "drawdown_pct": -0.1,
            },
            # If "date" is None (theoretical), _to_datetime should handle it
            {
                "date": None,
                "portfolio_value": 90,
                "peak_value": 100,
                "drawdown_pct": -0.1,
            },
        ]

        with pytest.MonkeyPatch.context() as m:
            m.setattr(service, "_get_drawdown_base_data", lambda *args: data)
            resp = service.calculate_max_drawdown(user_id)

            # Should have processed correctly
            assert resp.max_drawdown_pct == -10.0
