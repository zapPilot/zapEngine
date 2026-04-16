"""
Unit tests for the RollingAnalyticsService class.

Covers logic for rolling Sharpe ratio and volatility calculations with
statistical reliability indicators and educational context.
"""

import pytest

from src.services.analytics.analytics_context import PortfolioAnalyticsContext
from src.services.analytics.rolling_analytics_service import RollingAnalyticsService
from src.services.shared.query_service import QueryService


@pytest.fixture
def rolling_service():
    """Provides a RollingAnalyticsService instance with a mock database."""
    return RollingAnalyticsService(
        db=None, query_service=QueryService(), context=PortfolioAnalyticsContext()
    )


class TestGetRollingSharpeAnalysis:
    """Tests for the get_rolling_sharpe_analysis method."""

    def test_empty_rolling_sharpe_data(self, rolling_service, mocker):
        """Verify it returns appropriate response for empty data."""
        mock_execute = mocker.patch.object(
            QueryService, "execute_query", return_value=[]
        )
        user_id = "test-user-uuid"

        result = rolling_service.get_rolling_sharpe_analysis(user_id=user_id, days=40)

        mock_execute.assert_called_once()
        assert result["user_id"] == user_id
        assert result["rolling_sharpe_data"] == []
        assert result["data_points"] == 0
        assert result["summary"]["latest_sharpe_ratio"] == 0.0
        assert result["summary"]["avg_sharpe_ratio"] == 0.0
        assert result["summary"]["reliable_data_points"] == 0
        assert "Insufficient Data" in result["summary"]["statistical_reliability"]
        assert "message" in result
        assert "educational_context" in result

    def test_valid_rolling_sharpe_positive_ratio(self, rolling_service, mocker):
        """Verify correct processing for positive Sharpe ratios."""
        mock_data = [
            {
                "date": "2023-01-01",
                "rolling_sharpe_ratio": 1.5,
                "rolling_avg_return": 0.02,
                "rolling_volatility": 0.015,
                "is_statistically_reliable": True,
            },
            {
                "date": "2023-01-02",
                "rolling_sharpe_ratio": 1.8,
                "rolling_avg_return": 0.025,
                "rolling_volatility": 0.014,
                "is_statistically_reliable": True,
            },
            {
                "date": "2023-01-03",
                "rolling_sharpe_ratio": 2.0,
                "rolling_avg_return": 0.03,
                "rolling_volatility": 0.015,
                "is_statistically_reliable": True,
            },
        ]
        mock_execute = mocker.patch.object(
            QueryService, "execute_query", return_value=mock_data
        )
        user_id = "test-user-uuid"

        result = rolling_service.get_rolling_sharpe_analysis(user_id=user_id, days=40)

        mock_execute.assert_called_once()
        assert result["user_id"] == user_id
        assert result["data_points"] == 3
        assert len(result["rolling_sharpe_data"]) == 3
        assert result["summary"]["latest_sharpe_ratio"] == 2.0
        assert result["summary"]["avg_sharpe_ratio"] == pytest.approx(1.7667, rel=0.01)
        assert result["summary"]["reliable_data_points"] == 3

    def test_valid_rolling_sharpe_negative_ratio(self, rolling_service, mocker):
        """Verify correct processing for negative Sharpe ratios."""
        mock_data = [
            {
                "date": "2023-01-01",
                "rolling_sharpe_ratio": -0.5,
                "rolling_avg_return": -0.01,
                "rolling_volatility": 0.02,
                "is_statistically_reliable": True,
            },
            {
                "date": "2023-01-02",
                "rolling_sharpe_ratio": -1.0,
                "rolling_avg_return": -0.02,
                "rolling_volatility": 0.02,
                "is_statistically_reliable": True,
            },
        ]
        mocker.patch.object(QueryService, "execute_query", return_value=mock_data)

        result = rolling_service.get_rolling_sharpe_analysis(
            user_id="test-uuid", days=40
        )

        assert result["summary"]["latest_sharpe_ratio"] == -1.0
        assert result["summary"]["avg_sharpe_ratio"] == pytest.approx(-0.75, rel=0.01)

    def test_rolling_sharpe_with_none_values(self, rolling_service, mocker):
        """Verify correct handling of None Sharpe ratios."""
        mock_data = [
            {
                "date": "2023-01-01",
                "rolling_sharpe_ratio": None,
                "rolling_avg_return": None,
                "rolling_volatility": None,
                "is_statistically_reliable": False,
            },
            {
                "date": "2023-01-02",
                "rolling_sharpe_ratio": 1.5,
                "rolling_avg_return": 0.02,
                "rolling_volatility": 0.015,
                "is_statistically_reliable": True,
            },
        ]
        mocker.patch.object(QueryService, "execute_query", return_value=mock_data)

        result = rolling_service.get_rolling_sharpe_analysis(
            user_id="test-uuid", days=40
        )

        assert result["data_points"] == 2
        assert result["summary"]["avg_sharpe_ratio"] == 1.5
        assert result["summary"]["reliable_data_points"] == 1

    def test_rolling_sharpe_statistical_reliability_assessment(
        self, rolling_service, mocker
    ):
        """Verify statistical reliability is correctly assessed."""
        mock_data = [
            {
                "date": f"2023-01-{i:02d}",
                "rolling_sharpe_ratio": 1.5,
                "rolling_avg_return": 0.02,
                "rolling_volatility": 0.015,
                "is_statistically_reliable": i >= 30,
            }
            for i in range(1, 31)
        ]
        mocker.patch.object(QueryService, "execute_query", return_value=mock_data)

        result = rolling_service.get_rolling_sharpe_analysis(
            user_id="test-uuid", days=40
        )

        # Only the last day is reliable (i >= 30 means i=30 is the only one)
        assert result["summary"]["reliable_data_points"] == 1
        assert "statistical_reliability" in result["summary"]

    def test_rolling_sharpe_educational_context_present(self, rolling_service, mocker):
        """Verify educational context is included in response."""
        mock_data = [
            {
                "date": "2023-01-01",
                "rolling_sharpe_ratio": 1.5,
                "rolling_avg_return": 0.02,
                "rolling_volatility": 0.015,
                "is_statistically_reliable": True,
            }
        ]
        mocker.patch.object(QueryService, "execute_query", return_value=mock_data)

        result = rolling_service.get_rolling_sharpe_analysis(
            user_id="test-uuid", days=40
        )

        assert "educational_context" in result
        assert "reliability_warning" in result["educational_context"]
        assert "recommended_minimum" in result["educational_context"]
        assert "window_size" in result["educational_context"]
        assert result["educational_context"]["window_size"] == 30
        assert "interpretation" in result["educational_context"]

    def test_rolling_sharpe_response_structure(self, rolling_service, mocker):
        """Verify the response has correct structure and all required fields."""
        mock_data = [
            {
                "date": "2023-01-01",
                "rolling_sharpe_ratio": 1.5,
                "rolling_avg_return": 0.02,
                "rolling_volatility": 0.015,
                "is_statistically_reliable": True,
            }
        ]
        mocker.patch.object(QueryService, "execute_query", return_value=mock_data)

        result = rolling_service.get_rolling_sharpe_analysis(
            user_id="test-uuid", days=40
        )

        # Verify top-level structure
        assert "user_id" in result
        assert "period" in result
        assert "rolling_sharpe_data" in result
        assert "data_points" in result
        assert "summary" in result
        assert "educational_context" in result

        # Verify summary structure
        assert "latest_sharpe_ratio" in result["summary"]
        assert "avg_sharpe_ratio" in result["summary"]
        assert "reliable_data_points" in result["summary"]
        assert "statistical_reliability" in result["summary"]


class TestGetRollingVolatilityAnalysis:
    """Tests for the get_rolling_volatility_analysis method."""

    def test_empty_rolling_volatility_data(self, rolling_service, mocker):
        """Verify it returns appropriate response for empty data."""
        mock_execute = mocker.patch.object(
            QueryService, "execute_query", return_value=[]
        )
        user_id = "test-user-uuid"

        result = rolling_service.get_rolling_volatility_analysis(
            user_id=user_id, days=40
        )

        mock_execute.assert_called_once()
        assert result["user_id"] == user_id
        assert result["rolling_volatility_data"] == []
        assert result["data_points"] == 0
        assert result["summary"]["latest_daily_volatility"] == 0.0
        assert result["summary"]["latest_annualized_volatility"] == 0.0
        assert result["summary"]["avg_daily_volatility"] == 0.0
        assert result["summary"]["avg_annualized_volatility"] == 0.0
        assert result["summary"]["reliable_data_points"] == 0
        assert "message" in result
        assert "educational_context" in result

    def test_valid_rolling_volatility_data(self, rolling_service, mocker):
        """Verify correct processing for valid volatility data."""
        mock_data = [
            {
                "date": "2023-01-01",
                "rolling_volatility_daily_pct": 2.5,
                "annualized_volatility_pct": 39.69,
                "is_statistically_reliable": True,
            },
            {
                "date": "2023-01-02",
                "rolling_volatility_daily_pct": 3.0,
                "annualized_volatility_pct": 47.62,
                "is_statistically_reliable": True,
            },
            {
                "date": "2023-01-03",
                "rolling_volatility_daily_pct": 2.8,
                "annualized_volatility_pct": 44.45,
                "is_statistically_reliable": True,
            },
        ]
        mock_execute = mocker.patch.object(
            QueryService, "execute_query", return_value=mock_data
        )
        user_id = "test-user-uuid"

        result = rolling_service.get_rolling_volatility_analysis(
            user_id=user_id, days=40
        )

        mock_execute.assert_called_once()
        assert result["user_id"] == user_id
        assert result["data_points"] == 3
        assert len(result["rolling_volatility_data"]) == 3
        assert result["summary"]["latest_daily_volatility"] == 2.8
        assert result["summary"]["latest_annualized_volatility"] == 44.45
        assert result["summary"]["avg_daily_volatility"] == pytest.approx(
            2.7667, rel=0.01
        )
        assert result["summary"]["reliable_data_points"] == 3

    def test_rolling_volatility_with_none_values(self, rolling_service, mocker):
        """Verify correct handling of None volatility values."""
        mock_data = [
            {
                "date": "2023-01-01",
                "rolling_volatility_daily_pct": None,
                "annualized_volatility_pct": None,
                "is_statistically_reliable": False,
            },
            {
                "date": "2023-01-02",
                "rolling_volatility_daily_pct": 2.5,
                "annualized_volatility_pct": 39.69,
                "is_statistically_reliable": True,
            },
            {
                "date": "2023-01-03",
                "rolling_volatility_daily_pct": 3.0,
                "annualized_volatility_pct": 47.62,
                "is_statistically_reliable": True,
            },
        ]
        mocker.patch.object(QueryService, "execute_query", return_value=mock_data)

        result = rolling_service.get_rolling_volatility_analysis(
            user_id="test-uuid", days=40
        )

        assert result["data_points"] == 3
        assert result["summary"]["avg_daily_volatility"] == pytest.approx(
            2.75, rel=0.01
        )
        assert result["summary"]["avg_annualized_volatility"] == pytest.approx(
            43.655, rel=0.01
        )
        assert result["summary"]["reliable_data_points"] == 2

    def test_rolling_volatility_zero_values(self, rolling_service, mocker):
        """Verify correct handling of zero volatility."""
        mock_data = [
            {
                "date": "2023-01-01",
                "rolling_volatility_daily_pct": 0.0,
                "annualized_volatility_pct": 0.0,
                "is_statistically_reliable": True,
            }
        ]
        mocker.patch.object(QueryService, "execute_query", return_value=mock_data)

        result = rolling_service.get_rolling_volatility_analysis(
            user_id="test-uuid", days=40
        )

        assert result["summary"]["latest_daily_volatility"] == 0.0
        assert result["summary"]["latest_annualized_volatility"] == 0.0

    def test_rolling_volatility_high_values(self, rolling_service, mocker):
        """Verify correct handling of high volatility scenarios."""
        mock_data = [
            {
                "date": "2023-01-01",
                "rolling_volatility_daily_pct": 10.0,
                "annualized_volatility_pct": 158.74,
                "is_statistically_reliable": True,
            },
            {
                "date": "2023-01-02",
                "rolling_volatility_daily_pct": 12.0,
                "annualized_volatility_pct": 190.53,
                "is_statistically_reliable": True,
            },
        ]
        mocker.patch.object(QueryService, "execute_query", return_value=mock_data)

        result = rolling_service.get_rolling_volatility_analysis(
            user_id="test-uuid", days=40
        )

        assert result["summary"]["latest_daily_volatility"] == 12.0
        assert result["summary"]["latest_annualized_volatility"] == 190.53
        assert result["summary"]["avg_daily_volatility"] == pytest.approx(
            11.0, rel=0.01
        )

    def test_rolling_volatility_educational_context_present(
        self, rolling_service, mocker
    ):
        """Verify educational context is included in response."""
        mock_data = [
            {
                "date": "2023-01-01",
                "rolling_volatility_daily_pct": 2.5,
                "annualized_volatility_pct": 39.69,
                "is_statistically_reliable": True,
            }
        ]
        mocker.patch.object(QueryService, "execute_query", return_value=mock_data)

        result = rolling_service.get_rolling_volatility_analysis(
            user_id="test-uuid", days=40
        )

        assert "educational_context" in result
        assert "volatility_note" in result["educational_context"]
        assert "calculation_method" in result["educational_context"]
        assert "annualization_factor" in result["educational_context"]
        assert "window_size" in result["educational_context"]
        assert result["educational_context"]["window_size"] == 30
        assert "interpretation" in result["educational_context"]

    def test_rolling_volatility_response_structure(self, rolling_service, mocker):
        """Verify the response has correct structure and all required fields."""
        mock_data = [
            {
                "date": "2023-01-01",
                "rolling_volatility_daily_pct": 2.5,
                "annualized_volatility_pct": 39.69,
                "is_statistically_reliable": True,
            }
        ]
        mocker.patch.object(QueryService, "execute_query", return_value=mock_data)

        result = rolling_service.get_rolling_volatility_analysis(
            user_id="test-uuid", days=40
        )

        # Verify top-level structure
        assert "user_id" in result
        assert "period" in result
        assert "rolling_volatility_data" in result
        assert "data_points" in result
        assert "summary" in result
        assert "educational_context" in result

        # Verify summary structure
        assert "latest_daily_volatility" in result["summary"]
        assert "latest_annualized_volatility" in result["summary"]
        assert "avg_daily_volatility" in result["summary"]
        assert "avg_annualized_volatility" in result["summary"]
        assert "reliable_data_points" in result["summary"]

    def test_rolling_volatility_precision_rounding(self, rolling_service, mocker):
        """Verify correct rounding of volatility values."""
        mock_data = [
            {
                "date": "2023-01-01",
                "rolling_volatility_daily_pct": 2.5678,
                "annualized_volatility_pct": 40.7894,
                "is_statistically_reliable": True,
            }
        ]
        mocker.patch.object(QueryService, "execute_query", return_value=mock_data)

        result = rolling_service.get_rolling_volatility_analysis(
            user_id="test-uuid", days=40
        )

        # Daily volatility should be rounded to 4 decimal places
        assert result["summary"]["latest_daily_volatility"] == 2.5678
        # Annualized volatility should be rounded to 2 decimal places
        assert result["summary"]["latest_annualized_volatility"] == 40.79

    def test_rolling_volatility_with_varying_days_parameter(
        self, rolling_service, mocker
    ):
        """Verify service handles different days parameters correctly."""
        mock_data = [
            {
                "date": "2023-01-01",
                "rolling_volatility_daily_pct": 2.5,
                "annualized_volatility_pct": 39.69,
                "is_statistically_reliable": True,
            }
        ]
        mocker.patch.object(QueryService, "execute_query", return_value=mock_data)

        # Test with 30 days
        result_30 = rolling_service.get_rolling_volatility_analysis(
            user_id="test-uuid", days=30
        )
        assert result_30["period"]["days"] == 30

        # Test with 60 days
        result_60 = rolling_service.get_rolling_volatility_analysis(
            user_id="test-uuid", days=60
        )
        assert result_60["period"]["days"] == 60

        # Test with 90 days
        result_90 = rolling_service.get_rolling_volatility_analysis(
            user_id="test-uuid", days=90
        )
        assert result_90["period"]["days"] == 90


class TestRollingAnalyticsServiceIntegration:
    """Integration tests for RollingAnalyticsService."""

    def test_service_initialization_with_context(self):
        """Verify service can be initialized with custom context."""
        custom_context = PortfolioAnalyticsContext()
        service = RollingAnalyticsService(
            db=None, query_service=QueryService(), context=custom_context
        )
        assert service.context is custom_context

    def test_service_initialization_without_context(self):
        """Verify service creates default context when none provided."""
        service = RollingAnalyticsService(db=None, query_service=QueryService())
        assert service.context is not None
        assert isinstance(service.context, PortfolioAnalyticsContext)

    def test_query_service_called_with_correct_parameters_sharpe(
        self, rolling_service, mocker
    ):
        """Verify query service is called with correct parameters for Sharpe."""
        mock_execute = mocker.patch.object(
            QueryService, "execute_query", return_value=[]
        )
        user_id = "specific-test-uuid"
        days = 50

        rolling_service.get_rolling_sharpe_analysis(user_id=user_id, days=days)

        call_args = mock_execute.call_args
        assert call_args[0][1] == "get_portfolio_rolling_metrics"
        params = call_args[0][2]
        assert params["user_id"] == user_id
        assert "start_date" in params

    def test_query_service_called_with_correct_parameters_volatility(
        self, rolling_service, mocker
    ):
        """Verify query service is called with correct parameters for volatility."""
        mock_execute = mocker.patch.object(
            QueryService, "execute_query", return_value=[]
        )
        user_id = "specific-test-uuid"
        days = 50

        rolling_service.get_rolling_volatility_analysis(user_id=user_id, days=days)

        call_args = mock_execute.call_args
        assert call_args[0][1] == "get_portfolio_rolling_metrics"
        params = call_args[0][2]
        assert params["user_id"] == user_id
        assert "start_date" in params
