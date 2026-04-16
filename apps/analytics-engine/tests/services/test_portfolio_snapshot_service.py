"""Unit tests for PortfolioSnapshotService."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from typing import Any
from unittest.mock import MagicMock
from uuid import uuid4

import pytest
from sqlalchemy.orm import Session

from src.models.analytics_responses import (
    DailyTrendDataPoint,
    PeriodInfo,
    PortfolioTrendResponse,
)
from src.services.portfolio.portfolio_snapshot_service import PortfolioSnapshotService


def _make_trend_response(
    *, total_value: float = 0.0, categories: list[dict[str, Any]] | None = None
) -> PortfolioTrendResponse:
    categories = categories or []
    now = datetime.now(UTC)
    period = PeriodInfo(start_date=now, end_date=now, days=1)
    daily_values = []
    if categories:
        daily_values.append(
            DailyTrendDataPoint(
                date=now,
                total_value_usd=total_value,
                change_percentage=0.0,
                categories=categories,
                protocols=[],
                by_protocol={},
                by_chain={},
            )
        )

    return PortfolioTrendResponse(
        user_id="test-user",
        period_days=1,
        data_points=len(daily_values),
        daily_values=daily_values,
        summary={},
        period_info=period,
    )


class _StubQueryService:
    def __init__(self, wallets: list[str]):
        self._wallets = wallets

    def execute_query(self, _db: Session, query_name: str, params: dict[str, Any]):
        if query_name != "get_user_wallets":  # pragma: no cover - defensive
            raise AssertionError(f"unexpected query {query_name}")
        return [{"wallet_address": addr} for addr in self._wallets]

    def execute_query_one(self, *_args, **_kwargs):  # pragma: no cover - unused
        return None


class _StubTrendService:
    def __init__(self, response: PortfolioTrendResponse):
        self._response = response
        self.requested_days: list[int] = []
        self.requested_snapshot_dates: list[date | None] = []

    def get_portfolio_trend(
        self,
        user_id,
        days: int = 30,
        wallet_address: str | None = None,
        limit: int = 100,
        snapshot_date: date | None = None,
    ):
        self.requested_days.append(days)
        self.requested_snapshot_dates.append(snapshot_date)
        return self._response


class TestPortfolioSnapshotService:
    def test_returns_snapshot_with_expected_fields(self, db_session: Session):
        categories = [
            {
                "category": "btc",
                "source_type": "defi",
                "assets_usd": 1000.0,
                "debt_usd": 100.0,
            },
            {
                "category": "btc",
                "source_type": "wallet",
                "assets_usd": 200.0,
                "debt_usd": 0.0,
            },
            {
                "category": "stablecoins",
                "source_type": "defi",
                "assets_usd": 500.0,
                "debt_usd": 50.0,
            },
            {
                "category": "stablecoins",
                "source_type": "wallet",
                "assets_usd": 62.0,
                "debt_usd": 0.0,
            },
        ]

        trend_response = _make_trend_response(
            total_value=1512.0,
            categories=categories,
        )
        query_service = _StubQueryService(["0xabc", "0xdef"])
        trend_service = _StubTrendService(trend_response)
        service = PortfolioSnapshotService(db_session, query_service, trend_service)

        user_id = uuid4()
        snapshot_date = trend_response.daily_values[0].date.date()
        snapshot = service.get_portfolio_snapshot(user_id, snapshot_date=snapshot_date)

        assert snapshot is not None
        assert snapshot.wallet_count == 2
        assert snapshot.category_summary_assets.btc == pytest.approx(1000.0)
        assert snapshot.category_summary_debt.btc == pytest.approx(100.0)
        assert snapshot.total_debt == pytest.approx(150.0)
        assert snapshot.wallet_assets.total() == pytest.approx(262.0)
        assert snapshot.wallet_token_count == 6
        assert snapshot.wallet_override is not None
        assert snapshot.wallet_override.total_value == pytest.approx(262.0)
        assert snapshot.wallet_addresses == ["0xabc", "0xdef"]

    def test_returns_none_when_no_trend_rows(self, db_session: Session):
        trend_response = _make_trend_response(categories=[])
        query_service = _StubQueryService(["0xabc"])
        trend_service = _StubTrendService(trend_response)
        service = PortfolioSnapshotService(db_session, query_service, trend_service)

        snapshot = service.get_portfolio_snapshot(
            uuid4(), snapshot_date=datetime.now(UTC).date()
        )

        assert snapshot is None

    def test_respects_custom_trend_days(self, db_session: Session):
        categories = [
            {
                "category": "eth",
                "source_type": "defi",
                "assets_usd": 250.0,
                "debt_usd": 0.0,
            }
        ]
        trend_response = _make_trend_response(total_value=250.0, categories=categories)
        query_service = _StubQueryService(["0xabc"])
        trend_service = _StubTrendService(trend_response)
        service = PortfolioSnapshotService(db_session, query_service, trend_service)

        snapshot_date = trend_response.daily_values[0].date.date()
        snapshot = service.get_portfolio_snapshot(uuid4(), snapshot_date=snapshot_date)

        assert snapshot is not None
        assert trend_service.requested_days == [1]
        assert trend_service.requested_snapshot_dates == [snapshot_date]

    def test_returns_none_when_snapshot_date_missing(self, db_session: Session):
        """Test that snapshot_date must match an existing daily value."""
        now = datetime.now(UTC)
        period = PeriodInfo(start_date=now, end_date=now, days=1)
        daily_values = [
            DailyTrendDataPoint(
                date=now,
                total_value_usd=132369.0,
                change_percentage=0.0,
                categories=[],
                protocols=[],
                by_protocol={},
                by_chain={},
            )
        ]

        trend_response = PortfolioTrendResponse(
            user_id="test-user",
            period_days=1,
            data_points=1,
            daily_values=daily_values,
            summary={},
            period_info=period,
        )

        query_service = _StubQueryService(["0xabc"])
        trend_service = _StubTrendService(trend_response)
        service = PortfolioSnapshotService(db_session, query_service, trend_service)

        missing_date = now.date() + timedelta(days=1)
        snapshot = service.get_portfolio_snapshot(uuid4(), snapshot_date=missing_date)

        assert snapshot is None

    def test_get_day_by_date_handles_none_dates(self, db_session: Session):
        """Verify _get_day_by_date skips entries with None date."""
        query_service = _StubQueryService([])
        trend_response = _make_trend_response()
        trend_service = _StubTrendService(trend_response)
        service = PortfolioSnapshotService(db_session, query_service, trend_service)

        # Manually invoke private method with bad data
        # Use SimpleNamespace or dict to simulate objects without Pydantic validation
        class MockPoint:
            date = None

        daily_values = [
            {"date": None, "value_usd": 100},
            MockPoint(),
        ]

        result = service._get_day_by_date(daily_values, date.today())
        assert result is None

    def test_build_portfolio_snapshot_returns_none_if_no_trend_data(
        self, db_session: Session
    ):
        """Verify returns None if daily_values is empty."""
        query_service = _StubQueryService([])
        trend_response = _make_trend_response()
        trend_response.daily_values = []  # Empty list

        trend_service = _StubTrendService(trend_response)
        PortfolioSnapshotService(db_session, query_service, trend_service)

    def test_build_portfolio_snapshot_with_dict_values(self, db_session: Session):
        """Verify _build_portfolio_snapshot handles dictionary items in daily_values."""
        query_service = _StubQueryService([])

        # Construct trend response with DICT values instead of Pydantic models
        today = date.today()
        daily_values = [
            {
                "date": today,
                "total_value_usd": 1000.0,
                "change_percentage": 5.0,
                "categories": [
                    {
                        "category": "wallet",
                        "source_type": "wallet",
                        "value_usd": 500,
                        "assets_usd": 500,
                    },
                    {
                        "category": "defi",
                        "source_type": "protocol",
                        "value_usd": 500,
                        "assets_usd": 500,
                    },
                ],
                "protocols": ["p1"],
            }
        ]

        # We need to mock the trend response object to hold this list
        # since Pydantic validation might reject it if we tried to use PortfolioTrendResponse directly
        # So we use a mock capable of attribute access
        trend_response = MagicMock()
        trend_response.daily_values = daily_values

        trend_service = _StubTrendService(trend_response)
        service = PortfolioSnapshotService(db_session, query_service, trend_service)

        snapshot = service._build_portfolio_snapshot(
            user_id=uuid4(),
            trend_response=trend_response,
            wallet_addresses=["0x1"],
            snapshot_date=today,
        )

        assert snapshot is not None
        assert snapshot.total_assets == 1000.0
