"""API tests for the Yield Return endpoint."""

from __future__ import annotations

from uuid import uuid4

import pytest

from src.main import app
from src.models.yield_returns import (
    DailyYieldReturn,
    PeriodInfo,
    TokenYieldBreakdown,
    YieldReturnsResponse,
    YieldReturnSummary,
)
from src.services.dependencies import get_yield_return_service


class RecordingYieldReturnService:
    """Stub service returning a fixed response while recording call arguments."""

    def __init__(self, response: YieldReturnsResponse):
        self.response = response
        self.calls: list[dict[str, object]] = []

    async def get_daily_yield_returns(self, **kwargs):
        self.calls.append(kwargs)
        return self.response


def _sample_response(user_id: str) -> YieldReturnsResponse:
    """Construct a deterministic sample response."""
    return YieldReturnsResponse(
        user_id=user_id,
        period=PeriodInfo(
            start_date="2024-01-01T00:00:00+00:00",
            end_date="2024-01-02T00:00:00+00:00",
            days=2,
        ),
        daily_returns=[
            DailyYieldReturn(
                date="2024-01-02",
                protocol_name="Aave",
                chain="ethereum",
                position_type="Lending",
                yield_return_usd=12.5,
                tokens=[
                    TokenYieldBreakdown(
                        symbol="USDC",
                        amount_change=10.0,
                        current_price=1.0,
                        yield_return_usd=10.0,
                    )
                ],
            )
        ],
        summary=YieldReturnSummary(
            total_yield_return_usd=12.5,
            average_daily_return=12.5,
            positive_days=1,
            negative_days=0,
            top_protocol="Aave",
            top_chain="ethereum",
        ),
    )


@pytest.mark.asyncio
async def test_daily_yield_returns_endpoint_returns_payload(client):
    """Endpoint should surface the service response."""
    user_id = str(uuid4())
    service = RecordingYieldReturnService(_sample_response(user_id))
    app.dependency_overrides[get_yield_return_service] = lambda: service
    try:
        response = await client.get(f"/api/v2/analytics/{user_id}/yield/daily?days=10")
    finally:
        app.dependency_overrides.pop(get_yield_return_service, None)

    assert response.status_code == 200
    data = response.json()
    assert data["user_id"] == user_id
    assert data["summary"]["total_yield_return_usd"] == 12.5
    assert service.calls[0]["days"] == 10


@pytest.mark.asyncio
async def test_daily_yield_returns_endpoint_passes_filters(client):
    """Endpoint forwards optional query filters to the service layer."""
    user_id = str(uuid4())
    service = RecordingYieldReturnService(_sample_response(user_id))
    app.dependency_overrides[get_yield_return_service] = lambda: service
    try:
        response = await client.get(
            f"/api/v2/analytics/{user_id}/yield/daily"
            "?days=15&min_threshold=5&protocols=Aave&protocols=Maker&chains=ethereum"
        )
    finally:
        app.dependency_overrides.pop(get_yield_return_service, None)

    assert response.status_code == 200
    call = service.calls[0]
    assert call["min_threshold"] == 5.0
    assert call["protocols"] == ["Aave", "Maker"]
    assert call["chains"] == ["ethereum"]


class TestDailyYieldReturnsParameterValidation:
    """Parameter validation tests for daily yield returns endpoint."""

    @pytest.mark.asyncio
    async def test_days_below_minimum(self, client):
        """Endpoint rejects days below minimum (2)."""
        user_id = uuid4()
        response = await client.get(
            f"/api/v2/analytics/{user_id}/yield/daily",
            params={"days": 1},
        )
        assert response.status_code == 422
        assert "detail" in response.json()

    @pytest.mark.asyncio
    async def test_days_above_maximum(self, client):
        """Endpoint rejects days above maximum (1460)."""
        user_id = uuid4()
        response = await client.get(
            f"/api/v2/analytics/{user_id}/yield/daily",
            params={"days": 1461},
        )
        assert response.status_code == 422
        assert "detail" in response.json()

    @pytest.mark.asyncio
    async def test_min_threshold_negative(self, client):
        """Endpoint rejects negative min_threshold."""
        user_id = uuid4()
        response = await client.get(
            f"/api/v2/analytics/{user_id}/yield/daily",
            params={"min_threshold": -1.0},
        )
        assert response.status_code == 422
        assert "detail" in response.json()


class TestDailyYieldReturnsEdgeCases:
    """Edge case tests for daily yield returns endpoint."""

    @pytest.mark.asyncio
    async def test_unknown_protocol_filter(self, client):
        """Unknown protocol filter passes through to service."""
        user_id = str(uuid4())
        service = RecordingYieldReturnService(_sample_response(user_id))
        app.dependency_overrides[get_yield_return_service] = lambda: service

        try:
            response = await client.get(
                f"/api/v2/analytics/{user_id}/yield/daily",
                params={"protocols": "NonExistentProtocol"},
            )
        finally:
            app.dependency_overrides.pop(get_yield_return_service, None)

        assert response.status_code == 200
        # Verify filter was passed to service
        assert len(service.calls) == 1
        assert service.calls[0]["protocols"] == ["NonExistentProtocol"]

    @pytest.mark.asyncio
    async def test_unknown_chain_filter(self, client):
        """Unknown chain filter passes through to service."""
        user_id = str(uuid4())
        service = RecordingYieldReturnService(_sample_response(user_id))
        app.dependency_overrides[get_yield_return_service] = lambda: service

        try:
            response = await client.get(
                f"/api/v2/analytics/{user_id}/yield/daily",
                params={"chains": "NonExistentChain"},
            )
        finally:
            app.dependency_overrides.pop(get_yield_return_service, None)

        assert response.status_code == 200
        # Verify filter was passed to service
        assert len(service.calls) == 1
        assert service.calls[0]["chains"] == ["NonExistentChain"]

    @pytest.mark.asyncio
    async def test_empty_results_with_filters(self, client):
        """Endpoint handles empty results correctly when filters match nothing."""
        user_id = str(uuid4())
        # Return empty results
        empty_response = YieldReturnsResponse(
            user_id=user_id,
            period=PeriodInfo(
                start_date="2024-01-01T00:00:00+00:00",
                end_date="2024-01-02T00:00:00+00:00",
                days=2,
            ),
            daily_returns=[],  # Empty array
            summary=YieldReturnSummary(
                total_yield_return_usd=0.0,
                average_daily_return=0.0,
                positive_days=0,
                negative_days=0,
                top_protocol=None,
                top_chain=None,
            ),
        )
        service = RecordingYieldReturnService(empty_response)
        app.dependency_overrides[get_yield_return_service] = lambda: service

        try:
            response = await client.get(
                f"/api/v2/analytics/{user_id}/yield/daily",
                params={"protocols": "NonExistent"},
            )
        finally:
            app.dependency_overrides.pop(get_yield_return_service, None)

        assert response.status_code == 200
        data = response.json()
        assert data["daily_returns"] == []
        assert data["summary"]["total_yield_return_usd"] == 0.0
