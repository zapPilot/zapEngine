"""Tests for the /api/v2/portfolio endpoints."""

from __future__ import annotations

from uuid import uuid4

import pytest
from httpx import AsyncClient

from src.main import app
from src.models.portfolio import (
    CategoryAllocation,
    CategorySummaryDebt,
    PortfolioAllocation,
    PortfolioResponse,
    PortfolioROI,
    ROIData,
    WalletTokenSummary,
)
from src.services.dependencies import get_landing_page_service
from tests.helpers.model_factories import create_default_borrowing_summary


def _make_portfolio_response() -> PortfolioResponse:
    allocation = PortfolioAllocation(
        btc=CategoryAllocation(
            total_value=250.0,
            percentage_of_portfolio=25.0,
            wallet_tokens_value=100.0,
            other_sources_value=150.0,
        ),
        eth=CategoryAllocation(
            total_value=250.0,
            percentage_of_portfolio=25.0,
            wallet_tokens_value=100.0,
            other_sources_value=150.0,
        ),
        stablecoins=CategoryAllocation(
            total_value=250.0,
            percentage_of_portfolio=25.0,
            wallet_tokens_value=100.0,
            other_sources_value=150.0,
        ),
        others=CategoryAllocation(
            total_value=250.0,
            percentage_of_portfolio=25.0,
            wallet_tokens_value=100.0,
            other_sources_value=150.0,
        ),
    )

    roi = PortfolioROI(
        windows={"roi_7d": ROIData(value=0.0, data_points=0, start_balance=0.0)},
        recommended_roi=0.0,
        recommended_period="roi_7d",
        recommended_yearly_roi=0.0,
        estimated_yearly_pnl_usd=0.0,
    )

    wallet_token_summary = WalletTokenSummary(
        total_value_usd=400.0,  # Sum of wallet_tokens_value from all categories
        token_count=10,
    )

    category_summary_debt = CategorySummaryDebt(
        btc=0.0,
        eth=0.0,
        stablecoins=0.0,
        others=0.0,
    )

    return PortfolioResponse(
        total_assets_usd=1000.0,
        total_debt_usd=0.0,
        total_net_usd=1000.0,
        wallet_count=2,
        last_updated=None,
        portfolio_allocation=allocation,
        wallet_token_summary=wallet_token_summary,
        portfolio_roi=roi,
        category_summary_debt=category_summary_debt,
        positions=10,
        protocols=5,
        chains=3,
        borrowing_summary=create_default_borrowing_summary(),
    )


class StubLandingService:
    def __init__(self, response: PortfolioResponse) -> None:
        self.response = response
        self.calls: list[str] = []

    def get_landing_page_data(self, user_id):
        self.calls.append(str(user_id))
        return self.response


@pytest.mark.asyncio
async def test_v2_portfolio_landing_returns_response(client: AsyncClient):
    stub = StubLandingService(_make_portfolio_response())
    app.dependency_overrides[get_landing_page_service] = lambda: stub
    user_id = uuid4()

    try:
        response = await client.get(f"/api/v2/portfolio/{user_id}/landing")
    finally:
        app.dependency_overrides.pop(get_landing_page_service, None)

    assert response.status_code == 200
    payload = response.json()
    assert payload["total_assets_usd"] == 1000.0
    assert stub.calls == [str(user_id)]


class TestV2PortfolioParameterValidation:
    """Parameter validation testing for portfolio landing endpoint."""

    @pytest.mark.asyncio
    async def test_invalid_user_id_format(self, client: AsyncClient):
        """Endpoint rejects invalid UUID format."""
        response = await client.get("/api/v2/portfolio/invalid-uuid/landing")
        assert response.status_code == 422
        assert "detail" in response.json()

    @pytest.mark.asyncio
    async def test_valid_uuid_accepted(self, client: AsyncClient):
        """Endpoint accepts valid UUID format."""
        user_id = uuid4()
        stub = StubLandingService(_make_portfolio_response())
        app.dependency_overrides[get_landing_page_service] = lambda: stub

        try:
            response = await client.get(f"/api/v2/portfolio/{user_id}/landing")
        finally:
            app.dependency_overrides.pop(get_landing_page_service, None)

        assert response.status_code == 200


class TestV2PortfolioErrorHandling:
    """Error handling and exception propagation testing."""

    @pytest.mark.asyncio
    async def test_service_exception_propagation(self, client: AsyncClient):
        """Endpoint propagates service exceptions."""
        from unittest.mock import Mock

        from sqlalchemy.exc import OperationalError

        user_id = uuid4()
        stub = StubLandingService(_make_portfolio_response())
        stub.get_landing_page_data = Mock(
            side_effect=OperationalError("DB timeout", None, None)
        )
        app.dependency_overrides[get_landing_page_service] = lambda: stub

        try:
            with pytest.raises(OperationalError, match="DB timeout"):
                await client.get(f"/api/v2/portfolio/{user_id}/landing")
        finally:
            app.dependency_overrides.pop(get_landing_page_service, None)

    @pytest.mark.asyncio
    async def test_database_timeout_scenario(self, client: AsyncClient):
        """Endpoint handles database timeout gracefully."""
        from unittest.mock import Mock

        from sqlalchemy.exc import OperationalError

        user_id = uuid4()
        stub = StubLandingService(_make_portfolio_response())
        stub.get_landing_page_data = Mock(
            side_effect=OperationalError("connection timeout", None, None)
        )
        app.dependency_overrides[get_landing_page_service] = lambda: stub

        try:
            with pytest.raises(OperationalError):
                await client.get(f"/api/v2/portfolio/{user_id}/landing")
        finally:
            app.dependency_overrides.pop(get_landing_page_service, None)

    @pytest.mark.asyncio
    async def test_empty_portfolio_scenario(self, client: AsyncClient):
        """Endpoint handles empty portfolio correctly."""
        user_id = uuid4()
        # Create empty portfolio response
        allocation = PortfolioAllocation(
            btc=CategoryAllocation(
                total_value=0.0,
                percentage_of_portfolio=0.0,
                wallet_tokens_value=0.0,
                other_sources_value=0.0,
            ),
            eth=CategoryAllocation(
                total_value=0.0,
                percentage_of_portfolio=0.0,
                wallet_tokens_value=0.0,
                other_sources_value=0.0,
            ),
            stablecoins=CategoryAllocation(
                total_value=0.0,
                percentage_of_portfolio=0.0,
                wallet_tokens_value=0.0,
                other_sources_value=0.0,
            ),
            others=CategoryAllocation(
                total_value=0.0,
                percentage_of_portfolio=0.0,
                wallet_tokens_value=0.0,
                other_sources_value=0.0,
            ),
        )
        roi = PortfolioROI(
            windows={"roi_7d": ROIData(value=0.0, data_points=0, start_balance=0.0)},
            recommended_roi=0.0,
            recommended_period="roi_7d",
            recommended_yearly_roi=0.0,
            estimated_yearly_pnl_usd=0.0,
        )
        wallet_token_summary = WalletTokenSummary(
            total_value_usd=0.0,
            token_count=0,
        )
        category_summary_debt = CategorySummaryDebt(
            btc=0.0,
            eth=0.0,
            stablecoins=0.0,
            others=0.0,
        )
        empty_response = PortfolioResponse(
            total_assets_usd=0.0,
            total_debt_usd=0.0,
            total_net_usd=0.0,
            wallet_count=0,
            last_updated=None,
            portfolio_allocation=allocation,
            wallet_token_summary=wallet_token_summary,
            portfolio_roi=roi,
            category_summary_debt=category_summary_debt,
            positions=0,
            protocols=0,
            chains=0,
            borrowing_summary=create_default_borrowing_summary(),
        )
        stub = StubLandingService(empty_response)
        app.dependency_overrides[get_landing_page_service] = lambda: stub

        try:
            response = await client.get(f"/api/v2/portfolio/{user_id}/landing")
        finally:
            app.dependency_overrides.pop(get_landing_page_service, None)

        assert response.status_code == 200
        data = response.json()
        assert data["total_assets_usd"] == 0.0
        assert data["wallet_count"] == 0

    @pytest.mark.asyncio
    async def test_partial_data_scenario(self, client: AsyncClient):
        """Endpoint handles partial data correctly."""
        user_id = uuid4()
        # Create response with some categories having values
        allocation = PortfolioAllocation(
            btc=CategoryAllocation(
                total_value=500.0,
                percentage_of_portfolio=50.0,
                wallet_tokens_value=500.0,
                other_sources_value=0.0,
            ),
            eth=CategoryAllocation(
                total_value=500.0,
                percentage_of_portfolio=50.0,
                wallet_tokens_value=500.0,
                other_sources_value=0.0,
            ),
            stablecoins=CategoryAllocation(
                total_value=0.0,
                percentage_of_portfolio=0.0,
                wallet_tokens_value=0.0,
                other_sources_value=0.0,
            ),
            others=CategoryAllocation(
                total_value=0.0,
                percentage_of_portfolio=0.0,
                wallet_tokens_value=0.0,
                other_sources_value=0.0,
            ),
        )
        roi = PortfolioROI(
            windows={"roi_7d": ROIData(value=0.0, data_points=0, start_balance=0.0)},
            recommended_roi=0.0,
            recommended_period="roi_7d",
            recommended_yearly_roi=0.0,
            estimated_yearly_pnl_usd=0.0,
        )
        wallet_token_summary = WalletTokenSummary(
            total_value_usd=1000.0,  # Sum of wallet_tokens_value (500 + 500)
            token_count=5,
        )
        category_summary_debt = CategorySummaryDebt(
            btc=0.0,
            eth=0.0,
            stablecoins=0.0,
            others=0.0,
        )
        partial_response = PortfolioResponse(
            total_assets_usd=1000.0,
            total_debt_usd=0.0,
            total_net_usd=1000.0,
            wallet_count=1,
            last_updated=None,
            portfolio_allocation=allocation,
            wallet_token_summary=wallet_token_summary,
            portfolio_roi=roi,
            category_summary_debt=category_summary_debt,
            positions=10,
            protocols=2,
            chains=1,
            borrowing_summary=create_default_borrowing_summary(),
        )
        stub = StubLandingService(partial_response)
        app.dependency_overrides[get_landing_page_service] = lambda: stub

        try:
            response = await client.get(f"/api/v2/portfolio/{user_id}/landing")
        finally:
            app.dependency_overrides.pop(get_landing_page_service, None)

        assert response.status_code == 200
        data = response.json()
        assert data["total_assets_usd"] == 1000.0
        assert data["portfolio_allocation"]["stablecoins"]["total_value"] == 0.0


class TestV2PortfolioCacheBehavior:
    """Cache header validation testing."""

    @pytest.mark.asyncio
    async def test_cache_control_header_present(self, client: AsyncClient):
        """Endpoint sets Cache-Control header correctly."""
        from src.api.cache_headers import get_cache_control_value

        user_id = uuid4()
        stub = StubLandingService(_make_portfolio_response())
        app.dependency_overrides[get_landing_page_service] = lambda: stub

        try:
            response = await client.get(f"/api/v2/portfolio/{user_id}/landing")
        finally:
            app.dependency_overrides.pop(get_landing_page_service, None)

        assert response.status_code == 200
        assert "Cache-Control" in response.headers
        assert response.headers["Cache-Control"] == get_cache_control_value()

    @pytest.mark.asyncio
    async def test_vary_accept_encoding_header(self, client: AsyncClient):
        """Endpoint sets Vary: Accept-Encoding header."""
        user_id = uuid4()
        stub = StubLandingService(_make_portfolio_response())
        app.dependency_overrides[get_landing_page_service] = lambda: stub

        try:
            response = await client.get(f"/api/v2/portfolio/{user_id}/landing")
        finally:
            app.dependency_overrides.pop(get_landing_page_service, None)

        assert response.status_code == 200
        assert "Vary" in response.headers
        assert response.headers["Vary"] == "Accept-Encoding"


class TestV2PortfolioResponseStructure:
    """Response structure validation testing."""

    @pytest.mark.asyncio
    async def test_all_sections_present(self, client: AsyncClient):
        """Response contains all expected top-level fields."""
        user_id = uuid4()
        stub = StubLandingService(_make_portfolio_response())
        app.dependency_overrides[get_landing_page_service] = lambda: stub

        try:
            response = await client.get(f"/api/v2/portfolio/{user_id}/landing")
        finally:
            app.dependency_overrides.pop(get_landing_page_service, None)

        assert response.status_code == 200
        data = response.json()

        # Validate all top-level fields
        assert "total_assets_usd" in data
        assert "total_debt_usd" in data
        assert "total_net_usd" in data
        assert "wallet_count" in data
        assert "portfolio_allocation" in data
        assert "portfolio_roi" in data
        assert "positions" in data
        assert "protocols" in data
        assert "chains" in data

    @pytest.mark.asyncio
    async def test_nested_objects_structure(self, client: AsyncClient):
        """Response nested objects have correct structure."""
        user_id = uuid4()
        stub = StubLandingService(_make_portfolio_response())
        app.dependency_overrides[get_landing_page_service] = lambda: stub

        try:
            response = await client.get(f"/api/v2/portfolio/{user_id}/landing")
        finally:
            app.dependency_overrides.pop(get_landing_page_service, None)

        assert response.status_code == 200
        data = response.json()

        # Validate portfolio_roi nested object
        assert "windows" in data["portfolio_roi"]
        assert "recommended_roi" in data["portfolio_roi"]
        assert "recommended_period" in data["portfolio_roi"]

    @pytest.mark.asyncio
    async def test_categories_array_structure(self, client: AsyncClient):
        """Portfolio allocation contains all category objects."""
        user_id = uuid4()
        stub = StubLandingService(_make_portfolio_response())
        app.dependency_overrides[get_landing_page_service] = lambda: stub

        try:
            response = await client.get(f"/api/v2/portfolio/{user_id}/landing")
        finally:
            app.dependency_overrides.pop(get_landing_page_service, None)

        assert response.status_code == 200
        data = response.json()

        allocation = data["portfolio_allocation"]
        # Validate all categories present
        assert "btc" in allocation
        assert "eth" in allocation
        assert "stablecoins" in allocation
        assert "others" in allocation

        # Validate category structure
        for category in ["btc", "eth", "stablecoins", "others"]:
            assert "total_value" in allocation[category]
            assert "percentage_of_portfolio" in allocation[category]
            assert "wallet_tokens_value" in allocation[category]
            assert "other_sources_value" in allocation[category]

    @pytest.mark.asyncio
    async def test_counts_present(self, client: AsyncClient):
        """Pool counts are present and correct."""
        user_id = uuid4()
        response_data = _make_portfolio_response()
        # Counts are set in _make_portfolio_response

        stub = StubLandingService(response_data)
        app.dependency_overrides[get_landing_page_service] = lambda: stub

        try:
            response = await client.get(f"/api/v2/portfolio/{user_id}/landing")
        finally:
            app.dependency_overrides.pop(get_landing_page_service, None)

        assert response.status_code == 200
        data = response.json()

        # Validate counts
        assert data["positions"] == 10
        assert data["protocols"] == 5
        assert data["chains"] == 3
