from datetime import date
from unittest.mock import MagicMock
from uuid import uuid4

import pytest

from src.core.exceptions import CrossServiceConsistencyError
from src.services.analytics.dashboard_service import DashboardService
from src.services.portfolio.landing_page_service import LandingPageService


class TestServiceCoverageGaps:
    def test_landing_page_service_init_validations(self):
        """Test validation in LandingPageService constructor."""
        db = MagicMock()
        wallet_service = MagicMock()
        query_service = MagicMock()

        # Test missing canonical_snapshot_service (line 80)
        with pytest.raises(ValueError, match="Canonical snapshot service is required"):
            LandingPageService(
                db=db,
                wallet_service=wallet_service,
                query_service=query_service,
                portfolio_snapshot_service=MagicMock(),
                pool_performance_service=MagicMock(),
                canonical_snapshot_service=None,
            )

        # The borrowing service is injected like every other collaborator; a
        # self-built one would resolve its own snapshot and defeat the shared
        # per-snapshot cache the landing bundle relies on.
        with pytest.raises(ValueError, match="Borrowing service is required"):
            LandingPageService(
                db=db,
                wallet_service=wallet_service,
                query_service=query_service,
                portfolio_snapshot_service=MagicMock(),
                pool_performance_service=MagicMock(),
                canonical_snapshot_service=MagicMock(),
                borrowing_service=None,
            )

    def test_landing_page_cross_service_consistency(self):
        """Test _validate_cross_service_consistency error (lines 402+)."""
        svc = LandingPageService(
            db=MagicMock(),
            wallet_service=MagicMock(),
            query_service=MagicMock(),
            portfolio_snapshot_service=MagicMock(),
            pool_performance_service=MagicMock(),
            canonical_snapshot_service=MagicMock(),
            borrowing_service=MagicMock(),
        )

        # 100 vs 200 is > 5% diff
        with pytest.raises(CrossServiceConsistencyError):
            svc._validate_cross_service_consistency(
                user_id=uuid4(),
                snapshot_total=100.0,
                wallet_total=200.0,
                threshold_pct=5.0,
            )

    @pytest.mark.asyncio
    async def test_dashboard_service_no_snapshot(self):
        """Test dashboard service when no snapshot exists (lines 137-142)."""
        canonical_service = MagicMock()
        canonical_service.get_snapshot_date.return_value = None

        svc = DashboardService(
            trend_service=MagicMock(),
            risk_service=MagicMock(),
            drawdown_service=MagicMock(),
            rolling_service=MagicMock(),
            canonical_snapshot_service=canonical_service,
        )

        result = await svc.get_portfolio_dashboard(user_id=uuid4())
        assert result["_metadata"]["no_data"] is True

    @pytest.mark.asyncio
    async def test_dashboard_service_safe_call_type_error(self):
        """Test _safe_call raises TypeError for invalid return (line 313)."""
        svc = DashboardService(
            trend_service=MagicMock(),
            risk_service=MagicMock(),
            drawdown_service=MagicMock(),
            rolling_service=MagicMock(),
            canonical_snapshot_service=MagicMock(),
        )

        # We can't easily force _safe_call to receive invalid type from a real fetcher unless we mock one to return e.g. int
        # But _safe_call is private. We can test it directly or mock a service method.

        svc.trend_service.get_portfolio_trend = MagicMock(
            return_value=123
        )  # Invalid type

        # Trigger get_portfolio_dashboard
        svc.canonical_snapshot_service.get_snapshot_date.return_value = date(2025, 1, 1)

        result = await svc.get_portfolio_dashboard(user_id=uuid4(), metrics=("trend",))

        # The error is caught and returned as error dict
        assert result["trends"]["error"] is True
        assert "TypeError" in result["trends"]["error_type"]
