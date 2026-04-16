"""Tests to fill remaining coverage gaps."""

from datetime import UTC, date, datetime
from unittest.mock import AsyncMock, Mock, patch
from uuid import uuid4

import pytest
from pydantic import ValidationError as PydanticValidationError

from src.core.exceptions import CrossServiceConsistencyError, ValidationError
from src.models.market_sentiment import MarketSentimentResponse
from src.models.portfolio_snapshot import PortfolioSnapshot
from src.services.market.market_sentiment_service import (
    MarketSentimentConfig,
    MarketSentimentService,
)
from src.services.portfolio.landing_page_service import LandingPageService


class TestLandingPageServiceCoverageGap:
    @pytest.fixture
    def mock_deps(self):
        from src.models.portfolio import BorrowingSummary

        return {
            "db": Mock(),
            "wallet_service": Mock(),
            "query_service": Mock(),
            "roi_calculator": Mock(),
            "portfolio_snapshot_service": Mock(),
            "pool_performance_service": Mock(
                get_pool_performance=Mock(return_value=[])
            ),
            "canonical_snapshot_service": Mock(
                get_snapshot_date=Mock(return_value=date(2025, 1, 1))
            ),
            "borrowing_service": Mock(
                get_borrowing_summary=Mock(
                    return_value=BorrowingSummary(
                        has_debt=False,
                        worst_health_rate=None,
                        overall_status=None,
                        critical_count=0,
                        warning_count=0,
                        healthy_count=0,
                    )
                )
            ),
        }

    def test_init_raises_value_errors(self, mock_deps):
        """Test __init__ raises ValueError for missing query_service or others."""
        with pytest.raises(ValueError, match="Query service is required"):
            LandingPageService(
                db=mock_deps["db"],
                wallet_service=mock_deps["wallet_service"],
                query_service=None,
                roi_calculator=mock_deps["roi_calculator"],
                portfolio_snapshot_service=mock_deps["portfolio_snapshot_service"],
                pool_performance_service=mock_deps["pool_performance_service"],
                canonical_snapshot_service=mock_deps["canonical_snapshot_service"],
                borrowing_service=mock_deps["borrowing_service"],
            )

        with pytest.raises(ValueError, match="Pool performance service is required"):
            LandingPageService(
                db=mock_deps["db"],
                wallet_service=mock_deps["wallet_service"],
                query_service=mock_deps["query_service"],
                roi_calculator=mock_deps["roi_calculator"],
                portfolio_snapshot_service=mock_deps["portfolio_snapshot_service"],
                pool_performance_service=None,
                canonical_snapshot_service=mock_deps["canonical_snapshot_service"],
                borrowing_service=mock_deps["borrowing_service"],
            )

    def test_get_landing_page_data_cache_hit(self, mock_deps):
        """Test the cache hit path in get_landing_page_data."""
        service = LandingPageService(**mock_deps)
        user_id = uuid4()

        with (
            patch("src.core.cache_service.analytics_cache.get") as mock_cache_get,
            patch("src.core.config.settings.analytics_cache_enabled", True),
        ):
            mock_cached = Mock()
            mock_cache_get.return_value = mock_cached

            result = service.get_landing_page_data(user_id)

            assert result == mock_cached
            mock_cache_get.assert_called_once()

    def test_validate_cross_service_consistency_edge_case(self, mock_deps):
        """Test _validate_cross_service_consistency when base_value is 0 but mismatch exists."""
        service = LandingPageService(**mock_deps)
        user_id = uuid4()

        # This covers the branch where snapshot_total is 0 and wallet_total is not 0 (or vice versa)
        with pytest.raises(CrossServiceConsistencyError):
            service._validate_cross_service_consistency(
                user_id, snapshot_total=0.0, wallet_total=100.0
            )

    def test_get_landing_page_data_validation_errors(self, mock_deps):
        """Test error handling for Pydantic and Business logic validation."""
        service = LandingPageService(**mock_deps)
        user_id = uuid4()

        # Trigger PydanticValidationError (simulated)
        # We need to mock build_portfolio_response to raise PydanticValidationError
        mock_snapshot = Mock(spec=PortfolioSnapshot)
        mock_snapshot.wallet_addresses = []
        mock_snapshot.last_updated = datetime.now(UTC)
        mock_snapshot.wallet_override = None
        # Mock to_portfolio_summary to return proper structure
        mock_snapshot.to_portfolio_summary.return_value = {
            "total_assets": 0.0,
            "total_debt": 0.0,
            "net_portfolio_value": 0.0,
            "wallet_assets": {
                "btc": 0.0,
                "eth": 0.0,
                "stablecoins": 0.0,
                "others": 0.0,
            },
        }
        mock_deps[
            "portfolio_snapshot_service"
        ].get_portfolio_snapshot.return_value = mock_snapshot
        mock_deps["wallet_service"].get_wallet_token_summaries_batch.return_value = {}

        with patch.object(
            service.response_builder, "build_portfolio_response"
        ) as mock_build:
            # Pydantic ValidationError requires a model and data
            from pydantic import BaseModel

            class SmallModel(BaseModel):
                val: int

            try:
                SmallModel(val="not-an-int")
            except PydanticValidationError as e:
                pydantic_exc = e

            mock_build.side_effect = pydantic_exc

            with pytest.raises(
                ValidationError, match="Portfolio data validation failed"
            ):
                service.get_landing_page_data(user_id)

        # Trigger ValueError (Business logic)
        with patch.object(
            service.response_builder, "build_portfolio_response"
        ) as mock_build:
            mock_build.side_effect = ValueError("Business Logic Error")
            with pytest.raises(
                ValidationError, match="Business logic validation failed"
            ):
                service.get_landing_page_data(user_id)


class TestMarketSentimentServiceCoverageGap:
    @pytest.mark.asyncio
    async def test_get_market_sentiment_db_success_with_cache(self):
        """Test cache update path after successful database query."""
        config = MarketSentimentConfig.from_settings()
        db_service = AsyncMock()
        service = MarketSentimentService(
            config=config, db_service=db_service, use_database=True
        )

        db_response = MarketSentimentResponse(
            value=50,
            status="Neutral",
            timestamp=datetime.now(UTC),
            source="DB",
            cached=False,
        )
        db_service.get_current_sentiment.return_value = db_response

        with (
            patch("src.core.cache_service.analytics_cache.get", return_value=None),
            patch("src.core.cache_service.analytics_cache.set") as mock_cache_set,
        ):
            result = await service.get_market_sentiment()

            # Compare using model_dump to avoid Pydantic model comparison issues
            assert result.model_dump() == db_response.model_dump()
            # Verify cache was set
            mock_cache_set.assert_called_once()

    def test_get_health_status_missing_timestamp(self):
        """Test health status when cached data is missing timestamp."""
        config = MarketSentimentConfig.from_settings()
        service = MarketSentimentService(config=config)

        with patch("src.core.cache_service.analytics_cache.get") as mock_cache_get:
            # Return cached data but without timestamp
            mock_cache_get.return_value = {"value": 50}

            health = service.get_health_status()

            assert health.cached is True
            assert health.last_update is None
            assert health.cache_age_seconds is None
