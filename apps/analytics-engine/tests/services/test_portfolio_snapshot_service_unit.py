"""
Unit tests for PortfolioSnapshotService without database dependency.

Provides comprehensive coverage using mocked services to avoid
PostgreSQL fixture requirements.
"""

from datetime import date
from typing import Any
from unittest.mock import Mock
from uuid import UUID, uuid4

import pytest

from src.models.analytics_responses import (
    DailyTrendDataPoint,
    PeriodInfo,
    PortfolioTrendResponse,
)
from src.services.portfolio.portfolio_snapshot_service import PortfolioSnapshotService

SNAPSHOT_DATE = date(2024, 1, 15)


class MockQueryService:
    """Mock QueryService for unit testing."""

    def __init__(self, rows: list[dict[str, Any]] | None = None):
        self._rows = rows if rows is not None else []
        self.call_count = 0
        self.last_query_name: str | None = None
        self.last_params: dict[str, Any] | None = None

    def execute_query(
        self, db: Any, query_name: str, params: dict[str, Any] | None = None
    ) -> list[dict[str, Any]]:
        """Record query details and return configured rows."""
        self.call_count += 1
        self.last_query_name = query_name
        self.last_params = params
        return self._rows

    def execute_query_one(self, *_args: Any, **_kwargs: Any) -> dict[str, Any] | None:
        return None


class MockTrendService:
    """Mock TrendAnalysisService for unit testing."""

    def __init__(self, trend_response: PortfolioTrendResponse | None = None):
        self._trend_response = trend_response
        self.call_count = 0
        self.last_user_id: UUID | None = None
        self.last_days: int | None = None
        self.last_snapshot_date: date | None = None

    def get_portfolio_trend(
        self,
        user_id: UUID,
        days: int = 30,
        limit: int | None = None,
        snapshot_date: date | None = None,
    ) -> PortfolioTrendResponse:
        """Return configured trend response."""
        self.call_count += 1
        self.last_user_id = user_id
        self.last_days = days
        self.last_snapshot_date = snapshot_date
        if self._trend_response is None:
            period_info = _create_period_info(days)
            return PortfolioTrendResponse(
                user_id=str(user_id),
                period_days=days,
                data_points=0,
                daily_values=[],
                period_info=period_info,
            )
        return self._trend_response


def _create_daily_value(
    date: str = "2024-01-15",
    total_value: float = 10000.0,
    categories: list[dict[str, Any]] | None = None,
) -> DailyTrendDataPoint:
    """Helper to create a DailyTrendDataPoint object."""
    if categories is None:
        categories = [
            {
                "category": "btc",
                "value_usd": 5000.0,
                "assets_usd": 5000.0,
                "debt_usd": 0.0,
                "source_type": "defi",
            },
            {
                "category": "eth",
                "value_usd": 3000.0,
                "assets_usd": 3000.0,
                "debt_usd": 0.0,
                "source_type": "wallet",
            },
            {
                "category": "stablecoins",
                "value_usd": 2000.0,
                "assets_usd": 2000.0,
                "debt_usd": 0.0,
                "source_type": "defi",
            },
        ]
    return DailyTrendDataPoint(
        date=date,
        total_value_usd=total_value,
        categories=categories,
    )


def _create_period_info(days: int = 30) -> PeriodInfo:
    """Helper to create a PeriodInfo object."""
    from datetime import datetime

    return PeriodInfo(
        days=days,
        start_date=datetime(2024, 1, 1),
        end_date=datetime(2024, 1, 30),
    )


def _create_trend_response(
    user_id: UUID,
    daily_values: list[DailyTrendDataPoint] | None = None,
) -> PortfolioTrendResponse:
    """Helper to create a PortfolioTrendResponse object."""
    if daily_values is None:
        daily_values = [_create_daily_value()]
    period_info = _create_period_info()
    return PortfolioTrendResponse(
        user_id=str(user_id),
        period_days=30,
        data_points=len(daily_values),
        daily_values=daily_values,
        period_info=period_info,
    )


class TestPortfolioSnapshotServiceInit:
    """Test PortfolioSnapshotService initialization."""

    def test_init_with_valid_dependencies(self) -> None:
        """Test successful initialization with valid dependencies."""
        db = Mock()
        query_service = MockQueryService()
        trend_service = MockTrendService()

        service = PortfolioSnapshotService(db, query_service, trend_service)

        assert service.db is db
        assert service.query_service is query_service
        assert service._trend_service is trend_service

    def test_init_raises_when_trend_service_is_none(self) -> None:
        """Test that ValueError is raised when trend_service is None."""
        db = Mock()
        query_service = MockQueryService()

        with pytest.raises(ValueError, match="Trend analysis service is required"):
            PortfolioSnapshotService(db, query_service, None)  # type: ignore


class TestGetPortfolioSnapshot:
    """Tests for get_portfolio_snapshot method."""

    def test_returns_snapshot_with_correct_user_id(self) -> None:
        """Test that snapshot contains correct user_id."""
        db = Mock()
        user_id = uuid4()
        wallet_rows = [{"wallet_address": "0xABC"}]
        query_service = MockQueryService(wallet_rows)
        trend_response = _create_trend_response(user_id)
        trend_service = MockTrendService(trend_response)

        service = PortfolioSnapshotService(db, query_service, trend_service)
        result = service.get_portfolio_snapshot(user_id, snapshot_date=SNAPSHOT_DATE)

        assert result is not None
        assert result.user_id == str(user_id)

    def test_returns_none_when_no_trend_data(self) -> None:
        """Test that None is returned when no trend data is available."""
        db = Mock()
        user_id = uuid4()
        wallet_rows = [{"wallet_address": "0xABC"}]
        query_service = MockQueryService(wallet_rows)
        period_info = _create_period_info()
        empty_trend = PortfolioTrendResponse(
            user_id=str(user_id),
            period_days=30,
            data_points=0,
            daily_values=[],  # Empty daily values
            period_info=period_info,
        )
        trend_service = MockTrendService(empty_trend)

        service = PortfolioSnapshotService(db, query_service, trend_service)
        result = service.get_portfolio_snapshot(user_id, snapshot_date=SNAPSHOT_DATE)

        assert result is None

    def test_fetches_user_wallets_correctly(self) -> None:
        """Test that user wallets are fetched with correct query."""
        db = Mock()
        user_id = uuid4()
        wallet_rows = [{"wallet_address": "0xWallet1"}, {"wallet_address": "0xWallet2"}]
        query_service = MockQueryService(wallet_rows)
        trend_response = _create_trend_response(user_id)
        trend_service = MockTrendService(trend_response)

        service = PortfolioSnapshotService(db, query_service, trend_service)
        result = service.get_portfolio_snapshot(user_id, snapshot_date=SNAPSHOT_DATE)

        assert result is not None
        assert result.wallet_addresses == ["0xWallet1", "0xWallet2"]
        assert result.wallet_count == 2
        assert query_service.last_query_name == "get_user_wallets"
        assert query_service.last_params == {"user_id": str(user_id)}

    def test_passes_snapshot_date_to_trend_service(self) -> None:
        """Test that snapshot_date is passed to trend service."""
        db = Mock()
        user_id = uuid4()
        wallet_rows = [{"wallet_address": "0xABC"}]
        query_service = MockQueryService(wallet_rows)
        trend_response = _create_trend_response(user_id)
        trend_service = MockTrendService(trend_response)

        service = PortfolioSnapshotService(db, query_service, trend_service)
        service.get_portfolio_snapshot(user_id, snapshot_date=SNAPSHOT_DATE)

        assert trend_service.last_days == 1
        assert trend_service.last_snapshot_date == SNAPSHOT_DATE

    def test_requires_snapshot_date(self) -> None:
        """Test that snapshot_date is required."""
        db = Mock()
        user_id = uuid4()
        wallet_rows = [{"wallet_address": "0xABC"}]
        query_service = MockQueryService(wallet_rows)
        trend_response = _create_trend_response(user_id)
        trend_service = MockTrendService(trend_response)

        service = PortfolioSnapshotService(db, query_service, trend_service)
        with pytest.raises(ValueError, match="snapshot_date is required"):
            service.get_portfolio_snapshot(user_id, snapshot_date=None)  # type: ignore[arg-type]

    def test_calculates_total_assets_correctly(self) -> None:
        """Test that total_assets is calculated from all categories."""
        db = Mock()
        user_id = uuid4()
        wallet_rows = [{"wallet_address": "0xABC"}]
        query_service = MockQueryService(wallet_rows)

        daily_value = _create_daily_value(
            categories=[
                {
                    "category": "btc",
                    "assets_usd": 5000.0,
                    "debt_usd": 0.0,
                    "source_type": "defi",
                },
                {
                    "category": "eth",
                    "assets_usd": 3000.0,
                    "debt_usd": 0.0,
                    "source_type": "wallet",
                },
                {
                    "category": "stablecoins",
                    "assets_usd": 2000.0,
                    "debt_usd": 0.0,
                    "source_type": "defi",
                },
            ],
            total_value=10000.0,
        )
        trend_response = _create_trend_response(user_id, [daily_value])
        trend_service = MockTrendService(trend_response)

        service = PortfolioSnapshotService(db, query_service, trend_service)
        result = service.get_portfolio_snapshot(user_id, snapshot_date=SNAPSHOT_DATE)

        assert result is not None
        # Total assets = defi assets (5000 + 2000) + wallet assets (3000)
        assert result.total_assets == 10000.0

    def test_calculates_total_debt_correctly(self) -> None:
        """Test that total_debt is calculated from all categories."""
        db = Mock()
        user_id = uuid4()
        wallet_rows = [{"wallet_address": "0xABC"}]
        query_service = MockQueryService(wallet_rows)

        daily_value = _create_daily_value(
            categories=[
                {
                    "category": "btc",
                    "assets_usd": 5000.0,
                    "debt_usd": 500.0,
                    "source_type": "defi",
                },
                {
                    "category": "eth",
                    "assets_usd": 3000.0,
                    "debt_usd": 300.0,
                    "source_type": "defi",
                },
            ],
            total_value=7200.0,
        )
        trend_response = _create_trend_response(user_id, [daily_value])
        trend_service = MockTrendService(trend_response)

        service = PortfolioSnapshotService(db, query_service, trend_service)
        result = service.get_portfolio_snapshot(user_id, snapshot_date=SNAPSHOT_DATE)

        assert result is not None
        assert result.total_debt == 800.0  # 500 + 300

    def test_calculates_net_portfolio_value_correctly(self) -> None:
        """Test that net_portfolio_value = total_assets - total_debt."""
        db = Mock()
        user_id = uuid4()
        wallet_rows = [{"wallet_address": "0xABC"}]
        query_service = MockQueryService(wallet_rows)

        daily_value = _create_daily_value(
            categories=[
                {
                    "category": "btc",
                    "assets_usd": 10000.0,
                    "debt_usd": 2000.0,
                    "source_type": "defi",
                },
            ],
            total_value=8000.0,
        )
        trend_response = _create_trend_response(user_id, [daily_value])
        trend_service = MockTrendService(trend_response)

        service = PortfolioSnapshotService(db, query_service, trend_service)
        result = service.get_portfolio_snapshot(user_id, snapshot_date=SNAPSHOT_DATE)

        assert result is not None
        assert result.total_assets == 10000.0
        assert result.total_debt == 2000.0
        assert result.net_portfolio_value == 8000.0

    def test_separates_defi_and_wallet_assets(self) -> None:
        """Test that assets are correctly separated by source_type."""
        db = Mock()
        user_id = uuid4()
        wallet_rows = [{"wallet_address": "0xABC"}]
        query_service = MockQueryService(wallet_rows)

        daily_value = _create_daily_value(
            categories=[
                {
                    "category": "btc",
                    "assets_usd": 5000.0,
                    "debt_usd": 0.0,
                    "source_type": "defi",
                },
                {
                    "category": "btc",
                    "assets_usd": 3000.0,
                    "debt_usd": 0.0,
                    "source_type": "wallet",
                },
            ],
            total_value=8000.0,
        )
        trend_response = _create_trend_response(user_id, [daily_value])
        trend_service = MockTrendService(trend_response)

        service = PortfolioSnapshotService(db, query_service, trend_service)
        result = service.get_portfolio_snapshot(user_id, snapshot_date=SNAPSHOT_DATE)

        assert result is not None
        # DeFi assets should be in category_summary_assets
        assert result.category_summary_assets.btc == 5000.0
        # Wallet assets should be in wallet_assets
        assert result.wallet_assets.btc == 3000.0
        assert result.wallet_assets.total() == 3000.0

    def test_handles_unknown_category(self) -> None:
        """Test that unknown categories are mapped to 'others'."""
        db = Mock()
        user_id = uuid4()
        wallet_rows = [{"wallet_address": "0xABC"}]
        query_service = MockQueryService(wallet_rows)

        daily_value = _create_daily_value(
            categories=[
                {
                    "category": "unknown_category",
                    "assets_usd": 1000.0,
                    "debt_usd": 0.0,
                    "source_type": "defi",
                },
            ],
            total_value=1000.0,
        )
        trend_response = _create_trend_response(user_id, [daily_value])
        trend_service = MockTrendService(trend_response)

        service = PortfolioSnapshotService(db, query_service, trend_service)
        result = service.get_portfolio_snapshot(user_id, snapshot_date=SNAPSHOT_DATE)

        assert result is not None
        # Unknown category should be mapped to 'others'
        assert result.category_summary_assets.others == 1000.0

    def test_handles_missing_category(self) -> None:
        """Test that missing category field defaults to 'others'."""
        db = Mock()
        user_id = uuid4()
        wallet_rows = [{"wallet_address": "0xABC"}]
        query_service = MockQueryService(wallet_rows)

        daily_value = _create_daily_value(
            categories=[
                {
                    "assets_usd": 500.0,
                    "debt_usd": 0.0,
                    "source_type": "defi",
                },  # No category key
            ],
            total_value=500.0,
        )
        trend_response = _create_trend_response(user_id, [daily_value])
        trend_service = MockTrendService(trend_response)

        service = PortfolioSnapshotService(db, query_service, trend_service)
        result = service.get_portfolio_snapshot(user_id, snapshot_date=SNAPSHOT_DATE)

        assert result is not None
        # Missing category defaults to 'others'
        assert result.category_summary_assets.others == 500.0

    def test_handles_null_category(self) -> None:
        """Test that null category field defaults to 'others'."""
        db = Mock()
        user_id = uuid4()
        wallet_rows = [{"wallet_address": "0xABC"}]
        query_service = MockQueryService(wallet_rows)

        daily_value = _create_daily_value(
            categories=[
                {
                    "category": None,
                    "assets_usd": 500.0,
                    "debt_usd": 0.0,
                    "source_type": "defi",
                },
            ],
            total_value=500.0,
        )
        trend_response = _create_trend_response(user_id, [daily_value])
        trend_service = MockTrendService(trend_response)

        service = PortfolioSnapshotService(db, query_service, trend_service)
        result = service.get_portfolio_snapshot(user_id, snapshot_date=SNAPSHOT_DATE)

        assert result is not None
        assert result.category_summary_assets.others == 500.0

    def test_uses_value_usd_fallback(self) -> None:
        """Test that value_usd is used when assets_usd is missing."""
        db = Mock()
        user_id = uuid4()
        wallet_rows = [{"wallet_address": "0xABC"}]
        query_service = MockQueryService(wallet_rows)

        daily_value = _create_daily_value(
            categories=[
                {
                    "category": "btc",
                    "value_usd": 1000.0,
                    "debt_usd": 0.0,
                    "source_type": "defi",
                },
            ],
            total_value=1000.0,
        )
        trend_response = _create_trend_response(user_id, [daily_value])
        trend_service = MockTrendService(trend_response)

        service = PortfolioSnapshotService(db, query_service, trend_service)
        result = service.get_portfolio_snapshot(user_id, snapshot_date=SNAPSHOT_DATE)

        assert result is not None
        assert result.category_summary_assets.btc == 1000.0

    def test_uses_latest_day_for_snapshot(self) -> None:
        """Test that the latest daily value is used for snapshot."""
        db = Mock()
        user_id = uuid4()
        wallet_rows = [{"wallet_address": "0xABC"}]
        query_service = MockQueryService(wallet_rows)

        daily_values = [
            _create_daily_value(
                date="2024-01-14",
                categories=[
                    {
                        "category": "btc",
                        "assets_usd": 1000.0,
                        "debt_usd": 0.0,
                        "source_type": "defi",
                    }
                ],
                total_value=1000.0,
            ),
            _create_daily_value(
                date="2024-01-15",
                categories=[
                    {
                        "category": "btc",
                        "assets_usd": 2000.0,
                        "debt_usd": 0.0,
                        "source_type": "defi",
                    }
                ],
                total_value=2000.0,
            ),
        ]
        trend_response = _create_trend_response(user_id, daily_values)
        trend_service = MockTrendService(trend_response)

        service = PortfolioSnapshotService(db, query_service, trend_service)
        result = service.get_portfolio_snapshot(user_id, snapshot_date=SNAPSHOT_DATE)

        assert result is not None
        # last_updated can be either string or datetime depending on model
        last_updated = result.last_updated
        if isinstance(last_updated, str):
            assert last_updated == "2024-01-15"
        else:
            from datetime import datetime

            assert last_updated == datetime(2024, 1, 15)
        assert result.category_summary_assets.btc == 2000.0  # Latest value

    def test_handles_empty_wallets(self) -> None:
        """Test that snapshot works with no wallets."""
        db = Mock()
        user_id = uuid4()
        wallet_rows: list[dict[str, Any]] = []  # No wallets
        query_service = MockQueryService(wallet_rows)
        trend_response = _create_trend_response(user_id)
        trend_service = MockTrendService(trend_response)

        service = PortfolioSnapshotService(db, query_service, trend_service)
        result = service.get_portfolio_snapshot(user_id, snapshot_date=SNAPSHOT_DATE)

        assert result is not None
        assert result.wallet_addresses == []
        assert result.wallet_count == 0

    def test_handles_missing_source_type(self) -> None:
        """Test that missing source_type defaults to defi (non-wallet)."""
        db = Mock()
        user_id = uuid4()
        wallet_rows = [{"wallet_address": "0xABC"}]
        query_service = MockQueryService(wallet_rows)

        daily_value = _create_daily_value(
            categories=[
                {
                    "category": "btc",
                    "assets_usd": 1000.0,
                    "debt_usd": 0.0,
                },  # No source_type
            ],
            total_value=1000.0,
        )
        trend_response = _create_trend_response(user_id, [daily_value])
        trend_service = MockTrendService(trend_response)

        service = PortfolioSnapshotService(db, query_service, trend_service)
        result = service.get_portfolio_snapshot(user_id, snapshot_date=SNAPSHOT_DATE)

        assert result is not None
        # Missing source_type should be treated as defi
        assert result.category_summary_assets.btc == 1000.0
        assert result.wallet_assets.btc == 0.0

    def test_wallet_override_is_populated(self) -> None:
        """Test that wallet_override field is correctly populated."""
        db = Mock()
        user_id = uuid4()
        wallet_rows = [{"wallet_address": "0xABC"}]
        query_service = MockQueryService(wallet_rows)

        daily_value = _create_daily_value(
            categories=[
                {
                    "category": "eth",
                    "assets_usd": 5000.0,
                    "debt_usd": 0.0,
                    "source_type": "wallet",
                },
            ],
            total_value=5000.0,
        )
        trend_response = _create_trend_response(user_id, [daily_value])
        trend_service = MockTrendService(trend_response)

        service = PortfolioSnapshotService(db, query_service, trend_service)
        result = service.get_portfolio_snapshot(user_id, snapshot_date=SNAPSHOT_DATE)

        assert result is not None
        assert result.wallet_override is not None
        assert result.wallet_override.total_value == 5000.0
        assert result.wallet_override.categories["eth"] == 5000.0


class TestInitialiseCategoryTotals:
    """Tests for _initialise_category_totals static method."""

    def test_returns_dict_with_all_categories(self) -> None:
        """Test that helper returns dict with all categories zeroed."""
        result = PortfolioSnapshotService._initialise_category_totals()

        assert result == {"btc": 0.0, "eth": 0.0, "stablecoins": 0.0, "others": 0.0}

    def test_returns_new_dict_each_call(self) -> None:
        """Test that helper returns a new dict each time (not shared reference)."""
        result1 = PortfolioSnapshotService._initialise_category_totals()
        result2 = PortfolioSnapshotService._initialise_category_totals()

        result1["btc"] = 100.0

        assert result2["btc"] == 0.0  # Should not be affected


class TestEdgeCases:
    """Edge case tests for PortfolioSnapshotService."""

    def test_all_categories_with_debt(self) -> None:
        """Test snapshot with all categories having debt."""
        db = Mock()
        user_id = uuid4()
        wallet_rows = [{"wallet_address": "0xABC"}]
        query_service = MockQueryService(wallet_rows)

        daily_value = _create_daily_value(
            categories=[
                {
                    "category": "btc",
                    "assets_usd": 5000.0,
                    "debt_usd": 500.0,
                    "source_type": "defi",
                },
                {
                    "category": "eth",
                    "assets_usd": 3000.0,
                    "debt_usd": 300.0,
                    "source_type": "defi",
                },
                {
                    "category": "stablecoins",
                    "assets_usd": 2000.0,
                    "debt_usd": 200.0,
                    "source_type": "defi",
                },
                {
                    "category": "others",
                    "assets_usd": 1000.0,
                    "debt_usd": 100.0,
                    "source_type": "defi",
                },
            ],
            total_value=9900.0,
        )
        trend_response = _create_trend_response(user_id, [daily_value])
        trend_service = MockTrendService(trend_response)

        service = PortfolioSnapshotService(db, query_service, trend_service)
        result = service.get_portfolio_snapshot(user_id, snapshot_date=SNAPSHOT_DATE)

        assert result is not None
        assert result.total_debt == 1100.0  # Sum of all debts
        assert result.category_summary_debt.btc == 500.0
        assert result.category_summary_debt.eth == 300.0
        assert result.category_summary_debt.stablecoins == 200.0
        assert result.category_summary_debt.others == 100.0

    def test_very_large_values(self) -> None:
        """Test handling of very large portfolio values."""
        db = Mock()
        user_id = uuid4()
        wallet_rows = [{"wallet_address": "0xWhale"}]
        query_service = MockQueryService(wallet_rows)

        daily_value = _create_daily_value(
            categories=[
                {
                    "category": "btc",
                    "assets_usd": 999_999_999.99,
                    "debt_usd": 0.0,
                    "source_type": "defi",
                },
            ],
            total_value=999_999_999.99,
        )
        trend_response = _create_trend_response(user_id, [daily_value])
        trend_service = MockTrendService(trend_response)

        service = PortfolioSnapshotService(db, query_service, trend_service)
        result = service.get_portfolio_snapshot(user_id, snapshot_date=SNAPSHOT_DATE)

        assert result is not None
        assert result.total_assets == 999_999_999.99

    def test_many_wallets(self) -> None:
        """Test snapshot with many wallets."""
        db = Mock()
        user_id = uuid4()
        wallet_rows = [{"wallet_address": f"0x{i:040x}"} for i in range(50)]
        query_service = MockQueryService(wallet_rows)
        trend_response = _create_trend_response(user_id)
        trend_service = MockTrendService(trend_response)

        service = PortfolioSnapshotService(db, query_service, trend_service)
        result = service.get_portfolio_snapshot(user_id, snapshot_date=SNAPSHOT_DATE)

        assert result is not None
        assert result.wallet_count == 50
        assert len(result.wallet_addresses) == 50

    def test_null_categories_list(self) -> None:
        """Test handling of null categories list in daily value."""
        db = Mock()
        user_id = uuid4()
        wallet_rows = [{"wallet_address": "0xABC"}]
        query_service = MockQueryService(wallet_rows)

        daily_value = DailyTrendDataPoint(
            date="2024-01-15",
            total_value_usd=0.0,
            categories=[],  # Empty categories (null not allowed by Pydantic)
        )
        trend_response = _create_trend_response(user_id, [daily_value])
        trend_service = MockTrendService(trend_response)

        service = PortfolioSnapshotService(db, query_service, trend_service)
        result = service.get_portfolio_snapshot(user_id, snapshot_date=SNAPSHOT_DATE)

        assert result is not None
        assert result.total_assets == 0.0
