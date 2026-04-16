"""Tests for dependency injection constructors."""

from unittest.mock import Mock, patch

from sqlalchemy.orm import Session

from src.services.dependencies import (
    get_analytics_context,
    get_borrowing_service,
    get_dashboard_service,
    get_landing_page_service,
    get_market_sentiment_service,
    get_pool_performance_aggregator,
    get_pool_performance_service,
    get_portfolio_snapshot_service,
    get_query_service,
    get_regime_tracking_service,
    get_roi_calculator,
    get_sentiment_database_service,
    get_token_price_service,
    get_wallet_service,
)


class TestDependencyFactories:
    """Tests for dependency constructor functions."""

    def test_get_query_service(self):
        """Should return a query service instance."""
        service = get_query_service()
        assert service is not None

    def test_get_analytics_context(self):
        """Should return an analytics context instance."""
        context = get_analytics_context()
        assert context is not None

    def test_get_wallet_service(self):
        """Should create WalletService with dependencies."""
        mock_query = Mock()
        service = get_wallet_service(query_service=mock_query)
        assert service is not None
        assert service.query_service == mock_query

    def test_get_roi_calculator(self):
        """Should create ROICalculator with dependencies."""
        mock_query = Mock()
        service = get_roi_calculator(query_service=mock_query)
        assert service is not None

    def test_get_pool_performance_aggregator(self):
        """Should create PoolPerformanceAggregator."""
        service = get_pool_performance_aggregator()
        assert service is not None

    def test_get_pool_performance_service(self):
        """Should create PoolPerformanceService."""
        mock_db = Mock(spec=Session)
        mock_query = Mock()
        mock_agg = Mock()
        service = get_pool_performance_service(
            db=mock_db, query_service=mock_query, aggregator=mock_agg
        )
        assert service is not None

    def test_get_portfolio_snapshot_service(self):
        """Should create PortfolioSnapshotService."""
        mock_db = Mock(spec=Session)
        mock_query = Mock()
        mock_trend = Mock()
        service = get_portfolio_snapshot_service(
            db=mock_db, query_service=mock_query, trend_service=mock_trend
        )
        assert service is not None

    def test_get_borrowing_service(self):
        """Should create BorrowingService."""
        mock_db = Mock(spec=Session)
        mock_query = Mock()
        mock_canonical = Mock()
        service = get_borrowing_service(
            db=mock_db,
            query_service=mock_query,
            canonical_snapshot_service=mock_canonical,
        )
        assert service is not None

    def test_get_sentiment_database_service(self):
        """Should create SentimentDatabaseService."""
        mock_db = Mock(spec=Session)
        mock_query = Mock()
        service = get_sentiment_database_service(db=mock_db, query_service=mock_query)
        assert service is not None

    def test_get_token_price_service(self):
        """Should create TokenPriceService."""
        mock_db = Mock(spec=Session)
        mock_query = Mock()
        service = get_token_price_service(db=mock_db, query_service=mock_query)
        assert service is not None

    def test_get_market_sentiment_service(self):
        """Should create MarketSentimentService."""
        mock_db_service = Mock()

        with patch("src.core.config.settings") as mock_settings:
            mock_settings.use_sentiment_database = True
            mock_settings.market_sentiment_api_url = "http://mock-api.com"
            mock_settings.market_sentiment_timeout_seconds = 10
            mock_settings.market_sentiment_cache_ttl_seconds = 300
            mock_settings.market_sentiment_user_agent = "mock-agent"
            service = get_market_sentiment_service(db_service=mock_db_service)
            assert service is not None

    def test_get_regime_tracking_service(self):
        """Should create RegimeTrackingService."""
        mock_db = Mock(spec=Session)
        mock_query = Mock()
        service = get_regime_tracking_service(db=mock_db, query_service=mock_query)
        assert service is not None

    def test_get_landing_page_service(self):
        """Should create LandingPageService with all dependencies."""
        service = get_landing_page_service(
            db=Mock(spec=Session),
            wallet_service=Mock(),
            query_service=Mock(),
            roi_calculator=Mock(),
            portfolio_snapshot_service=Mock(),
            pool_performance_service=Mock(),
            canonical_snapshot_service=Mock(),
            borrowing_service=Mock(),
        )
        assert service is not None

    def test_get_dashboard_service(self):
        """Should create DashboardService with all dependencies."""
        service = get_dashboard_service(
            trend_service=Mock(),
            risk_service=Mock(),
            drawdown_service=Mock(),
            rolling_service=Mock(),
            canonical_snapshot_service=Mock(),
        )
        assert service is not None
