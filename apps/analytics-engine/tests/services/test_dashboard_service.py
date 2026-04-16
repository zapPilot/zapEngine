"""
Unit tests for DashboardService.

Tests the unified dashboard aggregation endpoint that consolidates
all analytics services with graceful error handling and caching.
"""

from datetime import date
from unittest.mock import AsyncMock, Mock
from uuid import UUID, uuid4

import pytest

from src.models.dashboard import DashboardTimeRanges
from src.services.analytics.dashboard_service import DashboardService
from src.services.interfaces import (
    CanonicalSnapshotServiceProtocol,
    DrawdownAnalysisServiceProtocol,
    RiskMetricsServiceProtocol,
    RollingAnalyticsServiceProtocol,
    TrendAnalysisServiceProtocol,
)


@pytest.fixture
def sample_user_id() -> UUID:
    """Provides a sample user UUID for testing."""
    return uuid4()


@pytest.fixture
def mock_trend_service():
    """Mock TrendAnalysisService."""
    mock = Mock(spec=TrendAnalysisServiceProtocol)
    mock.get_portfolio_trend = AsyncMock()
    mock.get_portfolio_trend.return_value = {
        "user_id": "test-user",
        "period_days": 30,
        "data_points": 30,
        "trends": [{"date": "2023-01-01", "value": 1000.0}],
    }
    return mock


@pytest.fixture
def mock_drawdown_service():
    """Mock DrawdownAnalysisService."""
    mock = Mock(spec=DrawdownAnalysisServiceProtocol)
    mock.get_enhanced_drawdown_analysis.return_value = {
        "drawdown_series": [{"date": "2023-01-01", "drawdown_pct": -5.0}],
        "peak_values": [{"date": "2023-01-01", "peak": 1000.0}],
    }
    mock.get_underwater_recovery_analysis.return_value = {
        "underwater_periods": [{"start": "2023-01-01", "end": "2023-01-05"}],
        "recovery_points": [{"date": "2023-01-05", "recovered": True}],
    }
    return mock


@pytest.fixture
def mock_risk_service():
    """Mock RiskMetricsService."""
    mock = Mock(spec=RiskMetricsServiceProtocol)
    mock.calculate_portfolio_volatility.return_value = {
        "volatility_daily": 0.01,
        "volatility_annualized": 0.15,
    }
    mock.calculate_sharpe_ratio.return_value = {
        "sharpe_ratio": 1.2,
    }
    mock.calculate_max_drawdown.return_value = {
        "max_drawdown_pct": -10.0,
    }
    return mock


@pytest.fixture
def mock_rolling_service():
    """Mock RollingAnalyticsService."""
    mock = Mock(spec=RollingAnalyticsServiceProtocol)
    mock.get_rolling_sharpe_analysis.return_value = {
        "rolling_sharpe": [{"date": "2023-01-01", "sharpe": 1.2}],
        "reliability": "moderate",
    }
    mock.get_rolling_volatility_analysis.return_value = {
        "rolling_volatility": [{"date": "2023-01-01", "volatility": 0.20}],
        "avg_volatility": 0.22,
    }
    return mock


@pytest.fixture
def mock_canonical_snapshot_service():
    """Mock CanonicalSnapshotService."""
    mock = Mock(spec=CanonicalSnapshotServiceProtocol)
    mock.get_snapshot_date.return_value = date(2025, 1, 1)
    return mock


@pytest.fixture
def dashboard_service(
    mock_trend_service,
    mock_risk_service,
    mock_drawdown_service,
    mock_rolling_service,
    mock_canonical_snapshot_service,
):
    """Provides a DashboardService instance with mocked dependencies."""
    return DashboardService(
        trend_service=mock_trend_service,
        risk_service=mock_risk_service,
        drawdown_service=mock_drawdown_service,
        rolling_service=mock_rolling_service,
        canonical_snapshot_service=mock_canonical_snapshot_service,
    )


class TestDashboardServiceInitialization:
    """Tests for DashboardService initialization."""

    def test_initialization_with_all_services(
        self,
        mock_trend_service,
        mock_risk_service,
        mock_drawdown_service,
        mock_rolling_service,
        mock_canonical_snapshot_service,
    ):
        """Test that DashboardService initializes correctly with all services."""
        service = DashboardService(
            trend_service=mock_trend_service,
            risk_service=mock_risk_service,
            drawdown_service=mock_drawdown_service,
            rolling_service=mock_rolling_service,
            canonical_snapshot_service=mock_canonical_snapshot_service,
        )

        assert service.trend_service is mock_trend_service
        assert service.risk_service is mock_risk_service
        assert service.drawdown_service is mock_drawdown_service
        assert service.rolling_service is mock_rolling_service
        assert service.canonical_snapshot_service is mock_canonical_snapshot_service


@pytest.mark.asyncio
class TestGetPortfolioDashboard:
    """Tests for get_portfolio_dashboard main method."""

    async def test_happy_path_with_valid_user(self, dashboard_service, sample_user_id):
        """Test successful dashboard aggregation with valid user ID."""
        result = await dashboard_service.get_portfolio_dashboard(sample_user_id)

        # Verify top-level structure
        assert result["user_id"] == str(sample_user_id)
        assert "parameters" in result
        assert "trends" in result
        assert "risk_metrics" in result
        assert "drawdown_analysis" in result
        assert "rolling_analytics" in result
        assert "_metadata" in result

        # Ensure deprecated metrics are NOT in result
        assert "allocation" not in result

        # Verify parameters
        params = result["parameters"]
        assert params["trend_days"] == 30
        assert params["drawdown_days"] == 90
        # Risk and allocation days should not be in parameters
        assert "risk_days" not in params
        assert "allocation_days" not in params
        assert params["rolling_days"] == 40

        # Verify no errors in successful response
        assert not result["trends"].get("error")

        # Verify metadata
        metadata = result["_metadata"]
        assert (
            metadata["success_count"] == 8
        )  # trend + risk(3) + drawdown(2) + rolling(2)
        assert metadata["error_count"] == 0
        assert metadata["total_services"] == 8
        assert metadata["success_rate"] == 1.0

    async def test_custom_time_periods(self, dashboard_service, sample_user_id):
        """Test dashboard with custom time periods for different analytics."""
        time_ranges = DashboardTimeRanges(
            trend_days=7,
            drawdown_days=60,
            rolling_days=30,
        )
        result = await dashboard_service.get_portfolio_dashboard(
            sample_user_id, time_ranges=time_ranges
        )

        params = result["parameters"]
        assert params["trend_days"] == 7
        assert params["drawdown_days"] == 60
        assert params["rolling_days"] == 30

    async def test_trend_service_failure(
        self,
        dashboard_service,
        sample_user_id,
        mock_trend_service,
    ):
        """Test dashboard when trend service fails."""
        # Configure trend service to raise ValueError
        mock_trend_service.get_portfolio_trend.side_effect = ValueError(
            "Database connection failed"
        )

        result = await dashboard_service.get_portfolio_dashboard(sample_user_id)

        # Verify error is captured in trends section
        assert result["trends"]["error"] is True
        assert result["trends"]["error_type"] == "ValueError"
        assert "Database connection failed" in result["trends"]["error_message"]
        assert result["trends"]["service"] == "trends"

        # Verify other services still succeed
        assert not result["drawdown_analysis"]["enhanced"].get("error")
        assert not result["rolling_analytics"]["sharpe"].get("error")

        # Verify metadata reflects partial failure
        metadata = result["_metadata"]
        assert (
            metadata["success_count"] == 7
        )  # 8 total - 1 error (trend, risk x3, drawdown x2, rolling x2)
        assert metadata["error_count"] == 1
        assert metadata["success_rate"] == pytest.approx(7 / 8, rel=0.01)

    async def test_multiple_services_failing_simultaneously(
        self,
        dashboard_service,
        sample_user_id,
        mock_trend_service,
        mock_drawdown_service,
    ):
        """Test dashboard when multiple services fail simultaneously."""
        mock_trend_service.get_portfolio_trend.side_effect = ValueError("Trend failed")
        mock_drawdown_service.get_enhanced_drawdown_analysis.side_effect = RuntimeError(
            "Drawdown failed"
        )

        result = await dashboard_service.get_portfolio_dashboard(sample_user_id)

        # Verify failures are captured
        assert result["trends"]["error"] is True
        assert result["drawdown_analysis"]["enhanced"]["error"] is True

        # Verify remaining services still succeed
        assert not result["drawdown_analysis"]["underwater_recovery"].get("error")
        assert not result["rolling_analytics"]["sharpe"].get("error")

        metadata = result["_metadata"]
        assert metadata["error_count"] == 2
        assert metadata["success_count"] == 6
        assert metadata["success_rate"] == pytest.approx(6 / 8, rel=0.01)

    async def test_all_services_failing(
        self,
        dashboard_service,
        sample_user_id,
        mock_trend_service,
        mock_risk_service,
        mock_drawdown_service,
        mock_rolling_service,
    ):
        """Test dashboard when all services fail."""
        # Configure all services to fail
        mock_trend_service.get_portfolio_trend.side_effect = Exception("Failed")
        mock_risk_service.calculate_portfolio_volatility.side_effect = Exception(
            "Failed"
        )
        mock_risk_service.calculate_sharpe_ratio.side_effect = Exception("Failed")
        mock_risk_service.calculate_max_drawdown.side_effect = Exception("Failed")
        mock_drawdown_service.get_enhanced_drawdown_analysis.side_effect = Exception(
            "Failed"
        )
        mock_drawdown_service.get_underwater_recovery_analysis.side_effect = Exception(
            "Failed"
        )
        mock_rolling_service.get_rolling_sharpe_analysis.side_effect = Exception(
            "Failed"
        )
        mock_rolling_service.get_rolling_volatility_analysis.side_effect = Exception(
            "Failed"
        )

        result = await dashboard_service.get_portfolio_dashboard(sample_user_id)

        # Verify all sections have errors
        assert result["trends"]["error"] is True
        assert result["risk_metrics"]["volatility"]["error"] is True
        assert result["risk_metrics"]["sharpe_ratio"]["error"] is True
        assert result["risk_metrics"]["max_drawdown"]["error"] is True
        assert result["drawdown_analysis"]["enhanced"]["error"] is True
        assert result["drawdown_analysis"]["underwater_recovery"]["error"] is True
        assert result["rolling_analytics"]["sharpe"]["error"] is True
        assert result["rolling_analytics"]["volatility"]["error"] is True

        # Verify metadata
        metadata = result["_metadata"]
        assert metadata["error_count"] == 8
        assert metadata["success_count"] == 0
        assert metadata["success_rate"] == 0.0

    async def test_cache_hit_scenario(self, dashboard_service, sample_user_id):
        """Test that second call returns cached result."""
        # First call - cache miss
        result1 = await dashboard_service.get_portfolio_dashboard(sample_user_id)

        # Second call - should hit cache
        result2 = await dashboard_service.get_portfolio_dashboard(sample_user_id)

        # Results should be identical
        assert result1 == result2
        assert result2["user_id"] == str(sample_user_id)

        # Verify services were only called once (for first request)
        dashboard_service.trend_service.get_portfolio_trend.assert_called_once()

    async def test_cache_miss_with_different_parameters(
        self, dashboard_service, sample_user_id
    ):
        """Test that different parameters create different cache keys."""
        # First call with default parameters
        result1 = await dashboard_service.get_portfolio_dashboard(sample_user_id)

        # Second call with different parameters
        result2 = await dashboard_service.get_portfolio_dashboard(
            sample_user_id,
            time_ranges=DashboardTimeRanges(trend_days=7),
        )

        # Parameters should differ
        assert result1["parameters"]["trend_days"] == 30
        assert result2["parameters"]["trend_days"] == 7

        # Verify services were called twice (different cache keys)
        assert dashboard_service.trend_service.get_portfolio_trend.call_count == 2

    async def test_different_users_have_separate_cache_entries(self, dashboard_service):
        """Test that different users don't share cache entries."""
        user1 = uuid4()
        user2 = uuid4()

        result1 = await dashboard_service.get_portfolio_dashboard(user1)
        result2 = await dashboard_service.get_portfolio_dashboard(user2)

        # Verify different user IDs
        assert result1["user_id"] == str(user1)
        assert result2["user_id"] == str(user2)

        # Verify services were called twice
        assert dashboard_service.trend_service.get_portfolio_trend.call_count == 2


@pytest.mark.asyncio
class TestSafeCallErrorHandling:
    """Tests for _safe_call error handling wrapper."""

    async def test_successful_service_call(self, dashboard_service):
        """Test _safe_call with successful service call."""

        def fetcher():
            return {"success": True, "data": [1, 2, 3]}

        result = await dashboard_service._safe_call("test_service", fetcher)

        assert result["success"] is True
        assert result["data"] == [1, 2, 3]
        assert "error" not in result

    async def test_value_error_handling(self, dashboard_service):
        """Test _safe_call handles ValueError gracefully."""

        def fetcher():
            return (_ for _ in ()).throw(ValueError("Invalid input"))

        result = await dashboard_service._safe_call("test_service", fetcher)

        assert result["error"] is True
        assert result["error_type"] == "ValueError"
        assert result["error_message"] == "Invalid input"
        assert result["service"] == "test_service"

    async def test_runtime_error_handling(self, dashboard_service):
        """Test _safe_call handles RuntimeError gracefully."""

        def failing_fetcher():
            raise RuntimeError("Computation failed")

        result = await dashboard_service._safe_call("test_service", failing_fetcher)

        assert result["error"] is True
        assert result["error_type"] == "RuntimeError"
        assert result["error_message"] == "Computation failed"

    async def test_generic_exception_handling(self, dashboard_service):
        """Test _safe_call handles generic Exception."""

        def failing_fetcher():
            raise Exception("Unknown error")

        result = await dashboard_service._safe_call("test_service", failing_fetcher)

        assert result["error"] is True
        assert result["error_type"] == "Exception"
        assert result["error_message"] == "Unknown error"

    async def test_service_returns_none(self, dashboard_service):
        """Test _safe_call when service returns None (edge case).

        NOTE: cast() in Python is a type hint only - it doesn't validate.
        So None is returned as-is, which is a potential production bug.
        This test documents actual behavior.
        """

        def fetcher():
            return None

        result = await dashboard_service._safe_call("test_service", fetcher)

        # cast() doesn't validate - None passes through
        # This is actual behavior, not ideal behavior
        assert result is None


class TestCalculateAggregationStats:
    """Tests for _calculate_aggregation_stats metadata calculation."""

    def test_all_successful_sections(self, dashboard_service, sample_user_id):
        """Test metadata calculation with all successful sections."""
        dashboard = {
            "trends": {"data": []},
            "risk_metrics": {
                "volatility": {"values": []},
                "sharpe_ratio": {"values": []},
                "max_drawdown": {"values": []},
            },
            "drawdown_analysis": {
                "enhanced": {"series": []},
                "underwater_recovery": {"periods": []},
            },
            "rolling_analytics": {
                "sharpe": {"values": []},
                "volatility": {"values": []},
            },
        }

        metadata = dashboard_service._calculate_aggregation_stats(
            dashboard,
            dashboard_service.DEFAULT_METRICS,
            snapshot_date=date(2025, 1, 1),
        )

        assert metadata["success_count"] == 8
        assert metadata["error_count"] == 0
        assert metadata["total_services"] == 8
        assert metadata["success_rate"] == 1.0

    def test_partial_failures(self, dashboard_service):
        """Test metadata with some sections having errors."""
        dashboard = {
            "trends": {"error": True, "error_type": "ValueError"},
            "risk_metrics": {
                "volatility": {"values": []},
                "sharpe_ratio": {"values": []},
                "max_drawdown": {"values": []},
            },
            "drawdown_analysis": {
                "enhanced": {"series": []},
                "underwater_recovery": {"error": True, "error_type": "RuntimeError"},
            },
            "rolling_analytics": {
                "sharpe": {"values": []},
                "volatility": {"values": []},
            },
        }

        metadata = dashboard_service._calculate_aggregation_stats(
            dashboard,
            dashboard_service.DEFAULT_METRICS,
            snapshot_date=date(2025, 1, 1),
        )

        assert metadata["success_count"] == 6
        assert metadata["error_count"] == 2
        assert metadata["total_services"] == 8
        assert metadata["success_rate"] == pytest.approx(6 / 8, rel=0.01)

    def test_all_sections_failed(self, dashboard_service):
        """Test metadata when all sections contain errors."""
        dashboard = {
            "trends": {"error": True},
            "risk_metrics": {
                "volatility": {"error": True},
                "sharpe_ratio": {"error": True},
                "max_drawdown": {"error": True},
            },
            "drawdown_analysis": {
                "enhanced": {"error": True},
                "underwater_recovery": {"error": True},
            },
            "rolling_analytics": {
                "sharpe": {"error": True},
                "volatility": {"error": True},
            },
        }

        metadata = dashboard_service._calculate_aggregation_stats(
            dashboard,
            dashboard_service.DEFAULT_METRICS,
            snapshot_date=date(2025, 1, 1),
        )

        assert metadata["success_count"] == 0
        assert metadata["error_count"] == 8
        assert metadata["total_services"] == 8
        assert metadata["success_rate"] == 0.0

    def test_empty_dashboard_sections(self, dashboard_service):
        """Test metadata with missing sections (edge case)."""
        dashboard = {}

        metadata = dashboard_service._calculate_aggregation_stats(
            dashboard,
            dashboard_service.DEFAULT_METRICS,
            snapshot_date=date(2025, 1, 1),
        )

        # All sections are None/missing, counted as successful
        assert metadata["success_count"] == 8
        assert metadata["error_count"] == 0

    def test_none_values_in_sections(self, dashboard_service):
        """Test metadata when sections return None."""
        dashboard = {
            "trends": None,
            "risk_metrics": {
                "volatility": None,
                "sharpe_ratio": None,
                "max_drawdown": None,
            },
            "drawdown_analysis": {"enhanced": None, "underwater_recovery": None},
            "rolling_analytics": {"sharpe": None, "volatility": None},
        }

        metadata = dashboard_service._calculate_aggregation_stats(
            dashboard,
            dashboard_service.DEFAULT_METRICS,
            snapshot_date=date(2025, 1, 1),
        )

        # None values are not errors (they don't have error=True)
        assert metadata["success_count"] == 8
        assert metadata["error_count"] == 0
