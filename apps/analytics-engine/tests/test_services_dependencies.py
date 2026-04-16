"""
Test services dependencies module - Dependency injection factories

Comprehensive tests for all dependency injection factories to ensure
proper service instantiation and dependency resolution.
"""

from unittest.mock import Mock

from src.services.dependencies import (
    get_landing_page_service,
    get_query_service,
    get_roi_calculator,
    get_strategy_daily_suggestion_service,
    get_wallet_service,
)
from src.services.portfolio.landing_page_service import LandingPageService
from src.services.portfolio.roi_calculator import ROICalculator
from src.services.portfolio.wallet_service import WalletService
from src.services.shared.query_service import QueryService
from src.services.strategy.strategy_daily_suggestion_service import (
    StrategyDailySuggestionService,
)


class TestServiceDependencies:
    """Test dependency injection factories for services"""

    def test_dependency_factories_create_new_instances(self):
        """Test that each call creates a new service instance"""
        mock_query_service1 = Mock(spec=QueryService)
        mock_query_service2 = Mock(spec=QueryService)

        # Test with ROI calculator as an example
        roi_calc1 = get_roi_calculator(query_service=mock_query_service1)
        roi_calc2 = get_roi_calculator(query_service=mock_query_service2)

        # Different instances with different query service dependencies
        assert roi_calc1 is not roi_calc2
        assert roi_calc1.query_service == mock_query_service1
        assert roi_calc2.query_service == mock_query_service2

    def test_get_query_service_returns_query_service_instance(self):
        """Test that get_query_service returns QueryService instance"""
        query_service = get_query_service()

        assert isinstance(query_service, QueryService)

    def test_get_query_service_returns_singleton(self):
        """Test that get_query_service returns the same singleton instance"""
        query_service1 = get_query_service()
        query_service2 = get_query_service()

        # Should be the same instance (singleton)
        assert query_service1 is query_service2
        assert isinstance(query_service1, QueryService)
        assert isinstance(query_service2, QueryService)

    def test_get_wallet_service_returns_wallet_service_instance(self):
        """Test that get_wallet_service returns WalletService instance"""
        mock_query_service = Mock(spec=QueryService)
        wallet_service = get_wallet_service(query_service=mock_query_service)

        assert isinstance(wallet_service, WalletService)
        assert wallet_service.query_service == mock_query_service

    def test_get_wallet_service_creates_new_instances(self):
        """Test that get_wallet_service creates new instances each time"""
        mock_query_service1 = Mock(spec=QueryService)
        mock_query_service2 = Mock(spec=QueryService)

        wallet_service1 = get_wallet_service(query_service=mock_query_service1)
        wallet_service2 = get_wallet_service(query_service=mock_query_service2)

        # Should be different instances with different dependencies
        assert wallet_service1 is not wallet_service2
        assert wallet_service1.query_service == mock_query_service1
        assert wallet_service2.query_service == mock_query_service2

    def test_get_roi_calculator_returns_roi_calculator_instance(self):
        """Test that get_roi_calculator returns ROICalculator instance"""
        mock_query_service = Mock(spec=QueryService)
        roi_calc = get_roi_calculator(query_service=mock_query_service)

        assert isinstance(roi_calc, ROICalculator)
        assert roi_calc.query_service == mock_query_service

    def test_get_roi_calculator_creates_new_instances(self):
        """Test that get_roi_calculator creates new instances each time"""
        mock_query_service1 = Mock(spec=QueryService)
        mock_query_service2 = Mock(spec=QueryService)

        roi_calc1 = get_roi_calculator(query_service=mock_query_service1)
        roi_calc2 = get_roi_calculator(query_service=mock_query_service2)

        # Should be different instances with different query services
        assert roi_calc1 is not roi_calc2
        assert roi_calc1.query_service == mock_query_service1
        assert roi_calc2.query_service == mock_query_service2

    def test_get_landing_page_service_returns_landing_page_service_instance(self):
        """Test that get_landing_page_service returns LandingPageService instance"""
        mock_db = Mock()
        mock_wallet_service = Mock(spec=WalletService)
        mock_query_service = Mock(spec=QueryService)
        mock_roi_calc = Mock(spec=ROICalculator)
        mock_snapshot_service = Mock()

        landing_page_service = get_landing_page_service(
            db=mock_db,
            wallet_service=mock_wallet_service,
            query_service=mock_query_service,
            roi_calculator=mock_roi_calc,
            portfolio_snapshot_service=mock_snapshot_service,
        )

        assert isinstance(landing_page_service, LandingPageService)
        assert landing_page_service.db == mock_db
        assert landing_page_service.wallet_service == mock_wallet_service
        assert landing_page_service.roi_calculator == mock_roi_calc
        assert landing_page_service.portfolio_snapshot_service == mock_snapshot_service

    def test_get_landing_page_service_creates_new_instances(self):
        """Test that get_landing_page_service creates new instances each time"""
        mock_db1 = Mock()
        mock_db2 = Mock()
        mock_wallet_service1 = Mock(spec=WalletService)
        mock_wallet_service2 = Mock(spec=WalletService)
        mock_query_service1 = Mock(spec=QueryService)
        mock_query_service2 = Mock(spec=QueryService)
        mock_roi_calc1 = Mock(spec=ROICalculator)
        mock_roi_calc2 = Mock(spec=ROICalculator)
        mock_snapshot_service1 = Mock()
        mock_snapshot_service2 = Mock()

        landing_page_service1 = get_landing_page_service(
            db=mock_db1,
            wallet_service=mock_wallet_service1,
            query_service=mock_query_service1,
            roi_calculator=mock_roi_calc1,
            portfolio_snapshot_service=mock_snapshot_service1,
        )

        landing_page_service2 = get_landing_page_service(
            db=mock_db2,
            wallet_service=mock_wallet_service2,
            query_service=mock_query_service2,
            roi_calculator=mock_roi_calc2,
            portfolio_snapshot_service=mock_snapshot_service2,
        )

        # Should be different instances with different dependencies
        assert landing_page_service1 is not landing_page_service2
        assert landing_page_service1.db == mock_db1
        assert landing_page_service1.wallet_service == mock_wallet_service1
        assert (
            landing_page_service1.portfolio_snapshot_service == mock_snapshot_service1
        )

        assert landing_page_service2.db == mock_db2
        assert landing_page_service2.wallet_service == mock_wallet_service2
        assert (
            landing_page_service2.portfolio_snapshot_service == mock_snapshot_service2
        )

    def test_all_dependency_factories_return_correct_types(self):
        """Test that all dependency factories return the correct service types"""
        mock_db = Mock()
        mock_wallet_service = Mock(spec=WalletService)
        mock_query_service = Mock(spec=QueryService)
        mock_roi_calc = Mock(spec=ROICalculator)
        mock_snapshot_service = Mock()

        # Test all factory functions
        roi_calculator = get_roi_calculator(query_service=mock_query_service)
        wallet_service = get_wallet_service(query_service=mock_query_service)
        query_service = get_query_service()
        landing_page_service = get_landing_page_service(
            db=mock_db,
            wallet_service=mock_wallet_service,
            query_service=mock_query_service,
            roi_calculator=mock_roi_calc,
            portfolio_snapshot_service=mock_snapshot_service,
        )

        # Assert correct types
        assert isinstance(roi_calculator, ROICalculator)
        assert isinstance(wallet_service, WalletService)
        assert isinstance(query_service, QueryService)
        assert isinstance(landing_page_service, LandingPageService)

    def test_dependency_factories_handle_parameters_correctly(self):
        """Test that dependency factories handle their required parameters correctly"""
        # QueryService doesn't require parameters
        query_service = get_query_service()
        assert isinstance(query_service, QueryService)

        # Other services require their dependencies, so we verify they work with mocks
        mock_query_service = Mock(spec=QueryService)

        roi_calculator = get_roi_calculator(query_service=mock_query_service)
        wallet_service = get_wallet_service(query_service=mock_query_service)

        assert isinstance(roi_calculator, ROICalculator)
        assert isinstance(wallet_service, WalletService)

    def test_get_strategy_daily_suggestion_service_returns_correct_type(self) -> None:
        """Lines 437-442: get_strategy_daily_suggestion_service instantiates service."""
        mock_db = Mock()
        mock_landing = Mock()
        mock_regime = Mock()
        mock_sentiment = Mock()
        mock_token_price = Mock()
        mock_canonical = Mock()

        service = get_strategy_daily_suggestion_service(
            db=mock_db,
            landing_page_service=mock_landing,
            regime_tracking_service=mock_regime,
            sentiment_service=mock_sentiment,
            token_price_service=mock_token_price,
            canonical_snapshot_service=mock_canonical,
        )

        assert isinstance(service, StrategyDailySuggestionService)
