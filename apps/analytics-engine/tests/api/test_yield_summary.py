"""API tests for the multi-window yield summary endpoint."""

from __future__ import annotations

from uuid import uuid4

import pytest

from src.main import app
from src.models.yield_returns import (
    MultiWindowYieldSummaryResponse,
    PeriodInfo,
    StatisticalSummary,
    YieldSummaryResponse,
)
from src.services.dependencies import get_yield_return_service


class RecordingService:
    def __init__(self, response: MultiWindowYieldSummaryResponse):
        self.response = response
        self.calls: list[dict[str, object]] = []

    async def get_yield_summary(self, **kwargs):
        self.calls.append(kwargs)
        return self.response


def _response(user_id: str) -> MultiWindowYieldSummaryResponse:
    return MultiWindowYieldSummaryResponse(
        user_id=user_id,
        windows={
            "30d": YieldSummaryResponse(
                user_id=user_id,
                period=PeriodInfo(
                    start_date="2026-07-22", end_date="2026-08-20", days=30
                ),
                average_daily_yield_usd=2,
                median_daily_yield_usd=2,
                total_yield_usd=60,
                statistics=StatisticalSummary(
                    mean=2,
                    median=2,
                    std_dev=0,
                    min_value=2,
                    max_value=2,
                    total_days=30,
                    filtered_days=30,
                    outliers_removed=0,
                ),
                outlier_strategy="iqr",
            )
        },
    )


@pytest.mark.asyncio
async def test_summary_endpoint_passes_parameters_and_cache_headers(client) -> None:
    user_id = str(uuid4())
    service = RecordingService(_response(user_id))
    app.dependency_overrides[get_yield_return_service] = lambda: service
    try:
        response = await client.get(
            f"/api/v2/analytics/{user_id}/yield/summary",
            params={"windows": "30d,7d", "outlier_strategy": "zscore"},
        )
    finally:
        app.dependency_overrides.pop(get_yield_return_service, None)

    assert response.status_code == 200
    assert response.json()["windows"]["30d"]["average_daily_yield_usd"] == 2
    assert response.headers["cache-control"]
    assert service.calls[0]["windows"] == ("30d", "7d")
    assert service.calls[0]["outlier_strategy"] == "zscore"


@pytest.mark.asyncio
@pytest.mark.parametrize("windows", ["", "14d", "7d,invalid"])
async def test_summary_endpoint_rejects_invalid_windows(client, windows: str) -> None:
    response = await client.get(
        f"/api/v2/analytics/{uuid4()}/yield/summary", params={"windows": windows}
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_summary_endpoint_rejects_unknown_or_uppercase_strategy(client) -> None:
    for strategy in ("bogus", "IQR"):
        response = await client.get(
            f"/api/v2/analytics/{uuid4()}/yield/summary",
            params={"outlier_strategy": strategy},
        )
        assert response.status_code == 422
