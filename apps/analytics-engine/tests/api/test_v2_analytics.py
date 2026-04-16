"""Tests for the /api/v2/analytics endpoints."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any
from uuid import uuid4

import pytest
from httpx import AsyncClient

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
from src.services.dependencies import (
    get_canonical_snapshot_service,
    get_dashboard_service,
    get_trend_analysis_service,
    get_wallet_service,
    get_yield_return_service,
)


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
