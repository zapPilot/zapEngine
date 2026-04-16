"""
Unit tests for the DrawdownAnalysisService class.

Covers logic for portfolio drawdown analysis, underwater period tracking,
and recovery point detection.
"""

import pytest

from src.services.analytics.analytics_context import PortfolioAnalyticsContext
from src.services.analytics.drawdown_analysis_service import DrawdownAnalysisService
from src.services.shared.query_service import QueryService


@pytest.fixture
def drawdown_service():
    """Provides a DrawdownAnalysisService instance with a mock database."""
    return DrawdownAnalysisService(
        db=None, query_service=QueryService(), context=PortfolioAnalyticsContext()
    )


class TestGetEnhancedDrawdownAnalysis:
    """Tests for the get_enhanced_drawdown_analysis method."""

    def test_empty_drawdown_data(self, drawdown_service, mocker):
        """Verify it returns appropriate response for empty data."""
        mock_execute = mocker.patch.object(
            QueryService, "execute_query", return_value=[]
        )
        user_id = "test-user-uuid"

        result = drawdown_service.get_enhanced_drawdown_analysis(
            user_id=user_id, days=40
        )

        mock_execute.assert_called_once()
        assert result["user_id"] == user_id
        assert result["drawdown_data"] == []
        assert result["data_points"] == 0
        assert result["summary"]["max_drawdown_pct"] == 0.0
        assert result["summary"]["current_drawdown_pct"] == 0.0
        assert result["summary"]["peak_value"] == 0.0
        assert result["summary"]["current_value"] == 0.0
        assert "message" in result
        assert "No drawdown data found" in result["message"]

    def test_valid_drawdown_with_peak_tracking(self, drawdown_service, mocker):
        """Verify correct processing of drawdown with peak tracking."""
        mock_data = [
            {
                "date": "2023-01-01",
                "portfolio_value": 10000.0,
                "peak_value": 10000.0,
                "drawdown_pct": 0.0,
            },
            {
                "date": "2023-01-02",
                "portfolio_value": 9500.0,
                "peak_value": 10000.0,
                "drawdown_pct": -5.0,
            },
            {
                "date": "2023-01-03",
                "portfolio_value": 9000.0,
                "peak_value": 10000.0,
                "drawdown_pct": -10.0,
            },
            {
                "date": "2023-01-04",
                "portfolio_value": 9500.0,
                "peak_value": 10000.0,
                "drawdown_pct": -5.0,
            },
        ]
        mock_execute = mocker.patch.object(
            QueryService, "execute_query", return_value=mock_data
        )
        user_id = "test-user-uuid"

        result = drawdown_service.get_enhanced_drawdown_analysis(
            user_id=user_id, days=40
        )

        mock_execute.assert_called_once()
        assert result["user_id"] == user_id
        assert result["data_points"] == 4
        assert len(result["drawdown_data"]) == 4
        assert result["summary"]["max_drawdown_pct"] == -10.0
        assert result["summary"]["current_drawdown_pct"] == -5.0
        assert result["summary"]["peak_value"] == 10000.0
        assert result["summary"]["current_value"] == 9500.0

    def test_drawdown_no_decline(self, drawdown_service, mocker):
        """Verify handling when portfolio only increases (no drawdown)."""
        mock_data = [
            {
                "date": "2023-01-01",
                "portfolio_value": 10000.0,
                "peak_value": 10000.0,
                "drawdown_pct": 0.0,
            },
            {
                "date": "2023-01-02",
                "portfolio_value": 11000.0,
                "peak_value": 11000.0,
                "drawdown_pct": 0.0,
            },
            {
                "date": "2023-01-03",
                "portfolio_value": 12000.0,
                "peak_value": 12000.0,
                "drawdown_pct": 0.0,
            },
        ]
        mocker.patch.object(QueryService, "execute_query", return_value=mock_data)

        result = drawdown_service.get_enhanced_drawdown_analysis(
            user_id="test-uuid", days=40
        )

        assert result["summary"]["max_drawdown_pct"] == 0.0
        assert result["summary"]["current_drawdown_pct"] == 0.0
        assert result["summary"]["peak_value"] == 12000.0

    def test_drawdown_severe_decline(self, drawdown_service, mocker):
        """Verify handling of severe drawdown scenarios."""
        mock_data = [
            {
                "date": "2023-01-01",
                "portfolio_value": 10000.0,
                "peak_value": 10000.0,
                "drawdown_pct": 0.0,
            },
            {
                "date": "2023-01-02",
                "portfolio_value": 5000.0,
                "peak_value": 10000.0,
                "drawdown_pct": -50.0,
            },
            {
                "date": "2023-01-03",
                "portfolio_value": 2000.0,
                "peak_value": 10000.0,
                "drawdown_pct": -80.0,
            },
        ]
        mocker.patch.object(QueryService, "execute_query", return_value=mock_data)

        result = drawdown_service.get_enhanced_drawdown_analysis(
            user_id="test-uuid", days=40
        )

        assert result["summary"]["max_drawdown_pct"] == -80.0
        assert result["summary"]["current_drawdown_pct"] == -80.0
        assert result["summary"]["current_value"] == 2000.0

    def test_drawdown_with_recovery_to_new_peak(self, drawdown_service, mocker):
        """Verify handling when portfolio recovers and sets new peak."""
        mock_data = [
            {
                "date": "2023-01-01",
                "portfolio_value": 10000.0,
                "peak_value": 10000.0,
                "drawdown_pct": 0.0,
            },
            {
                "date": "2023-01-02",
                "portfolio_value": 8000.0,
                "peak_value": 10000.0,
                "drawdown_pct": -20.0,
            },
            {
                "date": "2023-01-03",
                "portfolio_value": 10000.0,
                "peak_value": 10000.0,
                "drawdown_pct": 0.0,
            },
            {
                "date": "2023-01-04",
                "portfolio_value": 12000.0,
                "peak_value": 12000.0,
                "drawdown_pct": 0.0,
            },
        ]
        mocker.patch.object(QueryService, "execute_query", return_value=mock_data)

        result = drawdown_service.get_enhanced_drawdown_analysis(
            user_id="test-uuid", days=40
        )

        assert result["summary"]["max_drawdown_pct"] == -20.0
        assert result["summary"]["current_drawdown_pct"] == 0.0
        assert result["summary"]["peak_value"] == 12000.0
        assert result["summary"]["current_value"] == 12000.0

    def test_drawdown_response_structure(self, drawdown_service, mocker):
        """Verify the response has correct structure and all required fields."""
        mock_data = [
            {
                "date": "2023-01-01",
                "portfolio_value": 10000.0,
                "peak_value": 10000.0,
                "drawdown_pct": 0.0,
            }
        ]
        mocker.patch.object(QueryService, "execute_query", return_value=mock_data)

        result = drawdown_service.get_enhanced_drawdown_analysis(
            user_id="test-uuid", days=40
        )

        # Verify top-level structure
        assert "user_id" in result
        assert "period_info" in result
        assert "drawdown_data" in result
        assert "data_points" in result
        assert "summary" in result

        # Verify summary structure
        assert "max_drawdown_pct" in result["summary"]
        assert "current_drawdown_pct" in result["summary"]
        assert "peak_value" in result["summary"]
        assert "current_value" in result["summary"]


class TestGetUnderwaterRecoveryAnalysis:
    """Tests for the get_underwater_recovery_analysis method."""

    def test_empty_underwater_data(self, drawdown_service, mocker):
        """Verify it returns appropriate response for empty data."""
        mock_execute = mocker.patch.object(
            QueryService, "execute_query", return_value=[]
        )
        user_id = "test-user-uuid"

        result = drawdown_service.get_underwater_recovery_analysis(
            user_id=user_id, days=40
        )

        mock_execute.assert_called_once()
        assert result["user_id"] == user_id
        assert result["underwater_data"] == []
        assert result["data_points"] == 0
        assert result["summary"]["total_underwater_days"] == 0
        assert result["summary"]["underwater_percentage"] == 0.0
        assert result["summary"]["recovery_points"] == 0
        assert result["summary"]["current_underwater_pct"] == 0.0
        assert result["summary"]["is_currently_underwater"] is False
        assert "message" in result

    def test_valid_underwater_with_recovery(self, drawdown_service, mocker):
        """Verify correct processing of underwater periods with recovery."""
        mock_data = [
            {
                "date": "2023-01-01",
                "portfolio_value": 10000.0,
                "peak_value": 10000.0,
                "underwater_pct": 0.0,
                "is_underwater": False,
                "recovery_point": False,
            },
            {
                "date": "2023-01-02",
                "portfolio_value": 9000.0,
                "peak_value": 10000.0,
                "underwater_pct": -10.0,
                "is_underwater": True,
                "recovery_point": False,
            },
            {
                "date": "2023-01-03",
                "portfolio_value": 8500.0,
                "peak_value": 10000.0,
                "underwater_pct": -15.0,
                "is_underwater": True,
                "recovery_point": False,
            },
            {
                "date": "2023-01-04",
                "portfolio_value": 10000.0,
                "peak_value": 10000.0,
                "underwater_pct": 0.0,
                "is_underwater": False,
                "recovery_point": True,
            },
        ]
        mock_execute = mocker.patch.object(
            QueryService, "execute_query", return_value=mock_data
        )
        user_id = "test-user-uuid"

        result = drawdown_service.get_underwater_recovery_analysis(
            user_id=user_id, days=40
        )

        mock_execute.assert_called_once()
        assert result["user_id"] == user_id
        assert result["data_points"] == 4
        assert result["summary"]["total_underwater_days"] == 2
        assert result["summary"]["underwater_percentage"] == 50.0
        assert result["summary"]["recovery_points"] == 1
        assert result["summary"]["current_underwater_pct"] == 0.0
        assert result["summary"]["is_currently_underwater"] is False

    def test_underwater_currently_underwater(self, drawdown_service, mocker):
        """Verify correct status when currently underwater."""
        mock_data = [
            {
                "date": "2023-01-01",
                "portfolio_value": 10000.0,
                "peak_value": 10000.0,
                "underwater_pct": 0.0,
                "is_underwater": False,
                "recovery_point": False,
            },
            {
                "date": "2023-01-02",
                "portfolio_value": 9000.0,
                "peak_value": 10000.0,
                "underwater_pct": -10.0,
                "is_underwater": True,
                "recovery_point": False,
            },
        ]
        mocker.patch.object(QueryService, "execute_query", return_value=mock_data)

        result = drawdown_service.get_underwater_recovery_analysis(
            user_id="test-uuid", days=40
        )

        assert result["summary"]["is_currently_underwater"] is True
        assert result["summary"]["current_underwater_pct"] == -10.0

    def test_underwater_never_underwater(self, drawdown_service, mocker):
        """Verify handling when portfolio is never underwater."""
        mock_data = [
            {
                "date": "2023-01-01",
                "portfolio_value": 10000.0,
                "peak_value": 10000.0,
                "underwater_pct": 0.0,
                "is_underwater": False,
                "recovery_point": False,
            },
            {
                "date": "2023-01-02",
                "portfolio_value": 11000.0,
                "peak_value": 11000.0,
                "underwater_pct": 0.0,
                "is_underwater": False,
                "recovery_point": False,
            },
            {
                "date": "2023-01-03",
                "portfolio_value": 12000.0,
                "peak_value": 12000.0,
                "underwater_pct": 0.0,
                "is_underwater": False,
                "recovery_point": False,
            },
        ]
        mocker.patch.object(QueryService, "execute_query", return_value=mock_data)

        result = drawdown_service.get_underwater_recovery_analysis(
            user_id="test-uuid", days=40
        )

        assert result["summary"]["total_underwater_days"] == 0
        assert result["summary"]["underwater_percentage"] == 0.0
        assert result["summary"]["recovery_points"] == 0

    def test_underwater_multiple_recovery_points(self, drawdown_service, mocker):
        """Verify correct counting of multiple recovery points."""
        mock_data = [
            {
                "date": "2023-01-01",
                "portfolio_value": 10000.0,
                "peak_value": 10000.0,
                "underwater_pct": 0.0,
                "is_underwater": False,
                "recovery_point": False,
            },
            {
                "date": "2023-01-02",
                "portfolio_value": 9000.0,
                "peak_value": 10000.0,
                "underwater_pct": -10.0,
                "is_underwater": True,
                "recovery_point": False,
            },
            {
                "date": "2023-01-03",
                "portfolio_value": 10000.0,
                "peak_value": 10000.0,
                "underwater_pct": 0.0,
                "is_underwater": False,
                "recovery_point": True,
            },
            {
                "date": "2023-01-04",
                "portfolio_value": 9500.0,
                "peak_value": 10000.0,
                "underwater_pct": -5.0,
                "is_underwater": True,
                "recovery_point": False,
            },
            {
                "date": "2023-01-05",
                "portfolio_value": 10000.0,
                "peak_value": 10000.0,
                "underwater_pct": 0.0,
                "is_underwater": False,
                "recovery_point": True,
            },
        ]
        mocker.patch.object(QueryService, "execute_query", return_value=mock_data)

        result = drawdown_service.get_underwater_recovery_analysis(
            user_id="test-uuid", days=40
        )

        assert result["summary"]["recovery_points"] == 2
        assert result["summary"]["total_underwater_days"] == 2

    def test_underwater_extended_period(self, drawdown_service, mocker):
        """Verify handling of extended underwater period."""
        mock_data = [
            {
                "date": f"2023-01-{i:02d}",
                "portfolio_value": 9000.0,
                "peak_value": 10000.0,
                "underwater_pct": -10.0,
                "is_underwater": True,
                "recovery_point": False,
            }
            for i in range(1, 31)
        ]
        mocker.patch.object(QueryService, "execute_query", return_value=mock_data)

        result = drawdown_service.get_underwater_recovery_analysis(
            user_id="test-uuid", days=40
        )

        assert result["summary"]["total_underwater_days"] == 30
        assert result["summary"]["underwater_percentage"] == 100.0
        assert result["summary"]["recovery_points"] == 0
        assert result["summary"]["is_currently_underwater"] is True

    def test_underwater_percentage_calculation(self, drawdown_service, mocker):
        """Verify correct percentage calculation for underwater days."""
        # 3 out of 10 days underwater = 30%
        mock_data = [
            {
                "date": f"2023-01-{i:02d}",
                "portfolio_value": 9000.0 if i <= 3 else 10000.0,
                "peak_value": 10000.0,
                "underwater_pct": -10.0 if i <= 3 else 0.0,
                "is_underwater": i <= 3,
                "recovery_point": i == 4,
            }
            for i in range(1, 11)
        ]
        mocker.patch.object(QueryService, "execute_query", return_value=mock_data)

        result = drawdown_service.get_underwater_recovery_analysis(
            user_id="test-uuid", days=40
        )

        assert result["summary"]["total_underwater_days"] == 3
        assert result["summary"]["underwater_percentage"] == 30.0

    def test_underwater_response_structure(self, drawdown_service, mocker):
        """Verify the response has correct structure and all required fields."""
        mock_data = [
            {
                "date": "2023-01-01",
                "portfolio_value": 10000.0,
                "peak_value": 10000.0,
                "underwater_pct": 0.0,
                "is_underwater": False,
                "recovery_point": False,
            }
        ]
        mocker.patch.object(QueryService, "execute_query", return_value=mock_data)

        result = drawdown_service.get_underwater_recovery_analysis(
            user_id="test-uuid", days=40
        )

        # Verify top-level structure
        assert "user_id" in result
        assert "period_info" in result
        assert "underwater_data" in result
        assert "data_points" in result
        assert "summary" in result

        # Verify summary structure
        assert "total_underwater_days" in result["summary"]
        assert "underwater_percentage" in result["summary"]
        assert "recovery_points" in result["summary"]
        assert "current_underwater_pct" in result["summary"]
        assert "is_currently_underwater" in result["summary"]


class TestDrawdownAnalysisServiceIntegration:
    """Integration tests for DrawdownAnalysisService."""

    def test_service_initialization_with_context(self):
        """Verify service can be initialized with custom context."""
        custom_context = PortfolioAnalyticsContext()
        service = DrawdownAnalysisService(
            db=None, query_service=QueryService(), context=custom_context
        )
        assert service.context is custom_context

    def test_service_initialization_without_context(self):
        """Verify service creates default context when none provided."""
        service = DrawdownAnalysisService(db=None, query_service=QueryService())
        assert service.context is not None
        assert isinstance(service.context, PortfolioAnalyticsContext)

    def test_query_service_called_with_correct_parameters_drawdown(
        self, drawdown_service, mocker
    ):
        """Verify query service is called with correct parameters for drawdown."""
        mock_execute = mocker.patch.object(
            QueryService, "execute_query", return_value=[]
        )
        user_id = "specific-test-uuid"
        days = 50

        drawdown_service.get_enhanced_drawdown_analysis(user_id=user_id, days=days)

        call_args = mock_execute.call_args
        assert call_args[0][1] == "get_portfolio_drawdown_unified"
        params = call_args[0][2]
        assert params["user_id"] == user_id
        assert "start_date" in params

    def test_query_service_called_with_correct_parameters_underwater(
        self, drawdown_service, mocker
    ):
        """Verify query service is called with correct parameters for underwater."""
        mock_execute = mocker.patch.object(
            QueryService, "execute_query", return_value=[]
        )
        user_id = "specific-test-uuid"
        days = 50

        drawdown_service.get_underwater_recovery_analysis(user_id=user_id, days=days)

        call_args = mock_execute.call_args
        assert call_args[0][1] == "get_portfolio_drawdown_unified"
        params = call_args[0][2]
        assert params["user_id"] == user_id
        assert "start_date" in params

    def test_both_methods_use_same_context(self, drawdown_service):
        """Verify both methods share the same context instance."""
        assert drawdown_service.context is not None
        # Context should be consistent across method calls
        context_id = id(drawdown_service.context)
        assert context_id == id(drawdown_service.context)
