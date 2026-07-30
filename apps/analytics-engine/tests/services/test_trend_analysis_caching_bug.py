from datetime import UTC, datetime, timedelta
from unittest.mock import MagicMock

from src.core.config import settings
from src.services.analytics.trend_analysis_service import TrendAnalysisService
from src.services.shared.query_service import QueryService


def _build_mock_rows(num_days: int = 365):
    """Build mock row data with proper date objects.

    Returns mock rows matching production SQLAlchemy output format
    where dates are date objects, not ISO strings.
    """
    today = datetime.now(UTC).date()
    return [
        {
            "date": today - timedelta(days=i),  # date object, not .isoformat()
            "chain": "ethereum",
            "source_type": "defi",
            "category": "btc",
            "category_value_usd": 100.0 + i,
            "pnl_usd": 1.0,
            "total_value_usd": 100.0 + i,
        }
        for i in range(num_days, 0, -1)
    ]


class TestTrendAnalysisCacheReuse:
    """
    Tests for trend analysis cache reuse behavior.

    Verifies that the service correctly caches the maximum window (365 days)
    and filters in-memory for smaller windows, respecting user-specific cache
    isolation and handling cache-disabled mode.
    """

    def test_caching_respects_days_parameter(self, mocker):
        """
        Verify that subsequent calls with different 'days' parameters
        return correct data, not cached data from the first call.
        """
        mock_rows = _build_mock_rows()

        mock_execute = mocker.patch.object(
            QueryService, "execute_query", return_value=mock_rows
        )

        service = TrendAnalysisService(db=MagicMock(), query_service=QueryService())

        mocker.patch.object(settings, "analytics_cache_enabled", True)

        # 30-day then 90-day sequence
        result_30 = service.get_portfolio_trend(user_id="test-user", days=30)
        result_90 = service.get_portfolio_trend(user_id="test-user", days=90)

        assert result_30.period_days == 30
        assert result_30.data_points == 30
        assert result_90.period_days == 90
        assert result_90.data_points == 90
        # Should reuse cached max-window payload; only one query execution
        assert mock_execute.call_count == 1

    def test_caching_respects_days_parameter_reverse_order(self, mocker):
        """
        Ensure the cache does not leak when a larger window is fetched first.
        """
        mock_rows = _build_mock_rows()
        mock_execute = mocker.patch.object(
            QueryService, "execute_query", return_value=mock_rows
        )

        service = TrendAnalysisService(db=MagicMock(), query_service=QueryService())
        mocker.patch.object(settings, "analytics_cache_enabled", True)

        result_90 = service.get_portfolio_trend(user_id="test-user", days=90)
        result_30 = service.get_portfolio_trend(user_id="test-user", days=30)

        assert result_90.period_days == 90
        assert result_90.data_points == 90
        assert result_30.period_days == 30
        assert result_30.data_points == 30
        assert mock_execute.call_count == 1

    def test_caching_multiple_periods_chain(self, mocker):
        """
        Verify that multiple different day windows each get unique cache entries.
        """
        mock_rows = _build_mock_rows()
        mock_execute = mocker.patch.object(
            QueryService, "execute_query", return_value=mock_rows
        )

        service = TrendAnalysisService(db=MagicMock(), query_service=QueryService())
        mocker.patch.object(settings, "analytics_cache_enabled", True)

        windows = [30, 90, 180]
        results = [
            service.get_portfolio_trend(user_id="test-user", days=days)
            for days in windows
        ]

        for expected, result in zip(windows, results, strict=True):
            assert result.period_days == expected
            assert result.data_points == expected

        # Still only one underlying query because cache is keyed to max window
        assert mock_execute.call_count == 1

    def test_caching_is_user_specific(self, mocker):
        """
        Cache keys must include user_id so different users don't share data.
        """
        mock_rows = _build_mock_rows()
        mock_execute = mocker.patch.object(
            QueryService, "execute_query", return_value=mock_rows
        )

        service = TrendAnalysisService(db=MagicMock(), query_service=QueryService())
        mocker.patch.object(settings, "analytics_cache_enabled", True)

        result_user_a = service.get_portfolio_trend(user_id="user-a", days=30)
        result_user_b = service.get_portfolio_trend(user_id="user-b", days=30)

        assert result_user_a.data_points == 30
        assert result_user_b.data_points == 30
        # Different users should not share cached payloads
        assert mock_execute.call_count == 2

    def test_returns_fresh_when_cache_disabled(self, mocker):
        """
        When caching is disabled, each call should hit the query layer.
        """
        mock_rows = _build_mock_rows()
        mock_execute = mocker.patch.object(
            QueryService, "execute_query", return_value=mock_rows
        )

        service = TrendAnalysisService(db=MagicMock(), query_service=QueryService())
        mocker.patch.object(settings, "analytics_cache_enabled", False)

        result_30 = service.get_portfolio_trend(user_id="test-user", days=30)
        result_90 = service.get_portfolio_trend(user_id="test-user", days=90)

        assert result_30.data_points == 30
        assert result_90.data_points == 90
        assert mock_execute.call_count == 2

    def test_cached_payload_filtered_correctly(self, mocker):
        """
        Ensure the cached max-window payload is filtered per requested days.
        """
        mock_rows = _build_mock_rows()
        mocker.patch.object(QueryService, "execute_query", return_value=mock_rows)

        service = TrendAnalysisService(db=MagicMock(), query_service=QueryService())
        mocker.patch.object(settings, "analytics_cache_enabled", True)

        result_7 = service.get_portfolio_trend(user_id="test-user", days=7)
        result_14 = service.get_portfolio_trend(user_id="test-user", days=14)

        # data_points should match requested window sizes
        assert result_7.data_points == 7
        assert result_14.data_points == 14

        # Latest values should correspond to most recent dates in each window
        latest_7 = result_7.daily_values[-1]
        latest_14 = result_14.daily_values[-1]
        assert latest_7.date == latest_14.date


class TestTrendAnalysisConfigValidation:
    """Guard the documented cache-window configuration."""

    def test_max_cache_days_stays_within_documented_bounds(self):
        assert 30 <= TrendAnalysisService.MAX_CACHE_DAYS <= 365
