"""Tests for the /api/v2/analytics endpoints."""

from __future__ import annotations

import asyncio
import logging
import threading
import time
from datetime import date, datetime
from typing import Any
from uuid import uuid4

import pytest
from httpx import AsyncClient

from src.core.logging_config import REQUEST_LOGGER_NAME
from src.main import app
from src.models.analytics_responses import (
    PeriodInfo as AnalyticsPeriodInfo,
)
from src.models.analytics_responses import (
    PortfolioTrendResponse,
)
from src.models.yield_returns import (
    PeriodInfo as YieldPeriodInfo,
)
from src.models.yield_returns import (
    YieldReturnsResponse,
    YieldReturnSummary,
)
from src.services.analytics.analytics_context import PortfolioAnalyticsContext
from src.services.dependencies import (
    get_canonical_snapshot_service,
    get_dashboard_service,
    get_trend_analysis_service,
    get_wallet_service,
    get_yield_return_service,
)
from src.services.shared.query_service import QueryService
from src.services.yield_return_service import YieldReturnService


class MockCanonicalSnapshotService:
    def get_snapshot_date(self, user_id, wallet_address=None):
        return date(2023, 1, 1)


class MockTrendAnalysisService:
    def get_portfolio_trend(
        self, user_id, days, snapshot_date=None
    ) -> PortfolioTrendResponse:
        now = datetime.now()
        period = AnalyticsPeriodInfo(start_date=now, end_date=now, days=days)
        return PortfolioTrendResponse(
            user_id=str(user_id),
            daily_values=[],
            summary={"current_value": 1000.0},
            period_info=period,
            period_days=days,
            data_points=0,
        )


class MockYieldReturnService:
    async def get_daily_yield_returns(
        self, user_id, days, min_threshold, protocols, chains, wallet_address
    ) -> YieldReturnsResponse:
        return YieldReturnsResponse(
            user_id=str(user_id),
            period=YieldPeriodInfo(
                start_date="2023-01-01", end_date="2023-01-31", days=30
            ),
            daily_returns=[],
            summary=YieldReturnSummary(
                total_yield_return_usd=50.0,
                average_daily_return=1.66,
                positive_days=10,
                negative_days=5,
            ),
        )


class MockDashboardService:
    DEFAULT_METRICS = ["trend", "drawdown", "rolling"]

    async def get_portfolio_dashboard(
        self, user_id, wallet_address, time_ranges, metrics
    ) -> dict[str, Any]:
        return {"summary": {"test": "data"}, "metrics_available": list(metrics)}


class MockWalletService:
    def __init__(self, is_owner: bool = True):
        self.is_owner = is_owner

    def verify_wallet_ownership(self, db, user_id, wallet_address) -> bool:
        return self.is_owner


@pytest.fixture
def mock_canonical_service():
    return MockCanonicalSnapshotService()


@pytest.fixture
def mock_trend_service():
    return MockTrendAnalysisService()


@pytest.fixture
def mock_yield_service():
    return MockYieldReturnService()


@pytest.fixture
def mock_dashboard_service():
    return MockDashboardService()


@pytest.fixture
def mock_wallet_service():
    return MockWalletService()


@pytest.mark.asyncio
async def test_get_trend_v2(
    client: AsyncClient, mock_trend_service, mock_canonical_service
):
    app.dependency_overrides[get_trend_analysis_service] = lambda: mock_trend_service
    app.dependency_overrides[get_canonical_snapshot_service] = (
        lambda: mock_canonical_service
    )

    user_id = uuid4()
    try:
        response = await client.get(f"/api/v2/analytics/{user_id}/trend")
    finally:
        app.dependency_overrides.pop(get_trend_analysis_service, None)
        app.dependency_overrides.pop(get_canonical_snapshot_service, None)

    assert response.status_code == 200
    data = response.json()
    # Check fields present in the response
    assert data["user_id"] == str(user_id)
    assert "summary" in data
    assert "Cache-Control" in response.headers


@pytest.mark.asyncio
async def test_get_daily_yield_returns_v2(client: AsyncClient, mock_yield_service):
    app.dependency_overrides[get_yield_return_service] = lambda: mock_yield_service

    user_id = uuid4()
    try:
        response = await client.get(f"/api/v2/analytics/{user_id}/yield/daily")
    finally:
        app.dependency_overrides.pop(get_yield_return_service, None)

    assert response.status_code == 200
    data = response.json()
    assert data["summary"]["total_yield_return_usd"] == 50.0


@pytest.mark.asyncio
async def test_get_daily_yield_returns_v2_with_wallet(
    client: AsyncClient, mock_yield_service
):
    app.dependency_overrides[get_yield_return_service] = lambda: mock_yield_service

    user_id = uuid4()
    valid_wallet = "0x" + "a" * 40
    try:
        response = await client.get(
            f"/api/v2/analytics/{user_id}/yield/daily",
            params={"walletAddress": valid_wallet},
        )
    finally:
        app.dependency_overrides.pop(get_yield_return_service, None)

    assert response.status_code == 200


@pytest.mark.asyncio
async def test_get_dashboard_v2_success(
    client: AsyncClient, mock_dashboard_service, mock_wallet_service
):
    app.dependency_overrides[get_dashboard_service] = lambda: mock_dashboard_service
    app.dependency_overrides[get_wallet_service] = lambda: MockWalletService(True)

    user_id = uuid4()
    try:
        response = await client.get(f"/api/v2/analytics/{user_id}/dashboard")
    finally:
        app.dependency_overrides.pop(get_dashboard_service, None)
        app.dependency_overrides.pop(get_wallet_service, None)

    assert response.status_code == 200
    data = response.json()
    assert "summary" in data


@pytest.mark.asyncio
async def test_get_dashboard_v2_invalid_metrics(
    client: AsyncClient, mock_dashboard_service
):
    app.dependency_overrides[get_dashboard_service] = lambda: mock_dashboard_service

    user_id = uuid4()
    try:
        response = await client.get(
            f"/api/v2/analytics/{user_id}/dashboard",
            params={"metrics": "invalid_metric"},
        )
    finally:
        app.dependency_overrides.pop(get_dashboard_service, None)

    assert response.status_code == 422
    assert "invalid_metrics" in response.json()["detail"]


@pytest.mark.asyncio
async def test_get_dashboard_v2_wallet_ownership_success(
    client: AsyncClient, mock_dashboard_service
):
    app.dependency_overrides[get_dashboard_service] = lambda: mock_dashboard_service
    app.dependency_overrides[get_wallet_service] = lambda: MockWalletService(True)

    user_id = uuid4()
    valid_wallet = "0x" + "a" * 40
    try:
        response = await client.get(
            f"/api/v2/analytics/{user_id}/dashboard",
            params={"walletAddress": valid_wallet},
        )
    finally:
        app.dependency_overrides.pop(get_dashboard_service, None)
        app.dependency_overrides.pop(get_wallet_service, None)

    assert response.status_code == 200


@pytest.mark.asyncio
async def test_get_dashboard_v2_wallet_ownership_fail(
    client: AsyncClient, mock_dashboard_service
):
    app.dependency_overrides[get_dashboard_service] = lambda: mock_dashboard_service
    app.dependency_overrides[get_wallet_service] = lambda: MockWalletService(False)

    user_id = uuid4()
    valid_wallet = "0x" + "a" * 40
    try:
        response = await client.get(
            f"/api/v2/analytics/{user_id}/dashboard",
            params={"walletAddress": valid_wallet},
        )
    finally:
        app.dependency_overrides.pop(get_dashboard_service, None)
        app.dependency_overrides.pop(get_wallet_service, None)

    assert response.status_code == 403


BLOCKING_QUERY_SECONDS = 0.3


class BlockingQueryService(QueryService):
    """Real query service whose only blocking primitive is stubbed out.

    Overriding ``execute_query`` — the method that owns the synchronous
    ``Session.execute`` — leaves ``fetch_time_range_query`` and the service's
    dispatch of it exactly as production runs them, so this measures the real
    boundary rather than a hand-written stub of it.
    """

    def __init__(self, block_seconds: float) -> None:
        super().__init__()
        self.block_seconds = block_seconds
        self.calls = 0
        self.blocking_started = threading.Event()
        self.blocked_at = 0.0

    def execute_query(self, db, query_name, params=None) -> list[dict[str, Any]]:
        self.calls += 1
        if not self.blocking_started.is_set():
            self.blocked_at = time.perf_counter()
            # Ordered before set() so the loop side never reads a stale stamp.
            self.blocking_started.set()
        time.sleep(self.block_seconds)
        return []


class NullStakingAprProvider:
    async def get_benchmark_apr(self) -> float | None:
        return None


@pytest.mark.asyncio
async def test_slow_yield_request_does_not_stall_healthz(
    client: AsyncClient, db_session
):
    """A multi-second yield query must not hold the event loop hostage.

    Regression guard for the incident where a 3-77s yield query executed
    inline on the loop thread and froze every concurrent response.
    """
    query_service = BlockingQueryService(BLOCKING_QUERY_SECONDS)
    app.dependency_overrides[get_yield_return_service] = lambda: YieldReturnService(
        db=db_session,
        query_service=query_service,
        context=PortfolioAnalyticsContext(),
        staking_apr_provider=NullStakingAprProvider(),
    )
    user_id = uuid4()

    async def timed_healthz() -> float:
        # Latency is measured from the instant the slow query started, not from
        # when this coroutine resumes: a stalled loop cannot even hand control
        # back to start a timer, so any wall clock read on the loop side after
        # the stall would report a fast /healthz no matter what.
        deadline = time.perf_counter() + 10.0
        while not query_service.blocking_started.is_set():
            if time.perf_counter() > deadline:
                raise AssertionError("yield request never reached the slow query")
            await asyncio.sleep(0.001)
        response = await client.get("/healthz")
        assert response.status_code == 200
        return time.perf_counter() - query_service.blocked_at

    try:
        yield_response, healthz_seconds = await asyncio.gather(
            client.get(f"/api/v2/analytics/{user_id}/yield/daily"),
            timed_healthz(),
        )
    finally:
        app.dependency_overrides.pop(get_yield_return_service, None)

    assert yield_response.status_code == 200
    assert query_service.calls >= 1
    assert healthz_seconds < BLOCKING_QUERY_SECONDS / 2, (
        f"/healthz answered {healthz_seconds:.3f}s after a "
        f"{BLOCKING_QUERY_SECONDS:.1f}s yield query began; the blocking query "
        "is back on the event loop"
    )


@pytest.mark.asyncio
async def test_request_timing_uses_route_template_and_user_id(
    client: AsyncClient, mock_trend_service, mock_canonical_service, caplog
):
    """Timing records must carry the route pattern, never the per-user path.

    The route and its path params only land in the ASGI scope while the request
    is being handled, i.e. after the middleware has already called downstream.
    """
    app.dependency_overrides[get_trend_analysis_service] = lambda: mock_trend_service
    app.dependency_overrides[get_canonical_snapshot_service] = (
        lambda: mock_canonical_service
    )
    user_id = uuid4()
    try:
        with caplog.at_level(logging.INFO, logger=REQUEST_LOGGER_NAME):
            response = await client.get(f"/api/v2/analytics/{user_id}/trend")
    finally:
        app.dependency_overrides.pop(get_trend_analysis_service, None)
        app.dependency_overrides.pop(get_canonical_snapshot_service, None)

    assert response.status_code == 200
    records = [
        record for record in caplog.records if record.name == REQUEST_LOGGER_NAME
    ]
    assert len(records) == 1
    assert records[0].http_route == "/api/v2/analytics/{user_id}/trend"
    assert records[0].user_id == str(user_id)
    assert records[0].http_status == 200
