"""
Integration tests for borrowing positions endpoint.

Tests the new /api/v2/analytics/{user_id}/borrowing/positions endpoint
for per-position risk tracking and liquidation risk analysis.
"""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
from httpx import AsyncClient

from src.main import app
from src.models.borrowing import (
    BorrowingPosition,
    BorrowingPositionsResponse,
    TokenDetail,
)
from src.services.dependencies import get_borrowing_service


def _make_position_with_health_rate(
    health_rate: float,
    protocol: str = "test-protocol",
    chain: str = "test-chain",
    now: datetime | None = None,
) -> BorrowingPosition:
    """
    Create BorrowingPosition with specific health_rate.

    Calculates collateral/debt to achieve desired health_rate:
    health_rate = (collateral * 0.75) / debt

    Args:
        health_rate: Desired health rate value
        protocol: Protocol identifier
        chain: Blockchain name
        now: Timestamp for position (defaults to current UTC time)

    Returns:
        BorrowingPosition with calculated collateral/debt values
    """
    if now is None:
        now = datetime.now(UTC)

    # Use fixed debt, calculate collateral to achieve desired health_rate
    debt_usd = 10000.0
    collateral_usd = (health_rate * debt_usd) / 0.75

    # Classify health status based on thresholds
    if health_rate >= 2.0:
        status = "HEALTHY"
    elif health_rate >= 1.5:
        status = "WARNING"
    else:
        status = "CRITICAL"

    return BorrowingPosition(
        protocol_id=protocol,
        protocol_name=protocol,
        chain=chain,
        health_rate=health_rate,
        health_status=status,
        collateral_usd=collateral_usd,
        debt_usd=debt_usd,
        net_value_usd=collateral_usd - debt_usd,
        collateral_tokens=[],
        debt_tokens=[],
        updated_at=now,
    )


def _make_canonical_snapshot_service_mock(snapshot_date):  # type: ignore[no-untyped-def]
    """
    Create mock CanonicalSnapshotService.

    Args:
        snapshot_date: Date to return from get_snapshot_date() (can be None)

    Returns:
        Mock object with get_snapshot_date method
    """
    from unittest.mock import Mock

    mock_service = Mock()
    mock_service.get_snapshot_date = Mock(return_value=snapshot_date)
    return mock_service


class StubBorrowingPositionsService:
    """Stub service for testing borrowing positions endpoint."""

    def __init__(self, response: BorrowingPositionsResponse | Exception):
        """Initialize with either a response or exception to raise."""
        self.response = response
        self.calls: list[str] = []

    def get_borrowing_positions(
        self, user_id: UUID, snapshot_date: datetime | None = None
    ) -> BorrowingPositionsResponse:
        """Mock get_borrowing_positions method."""
        self.calls.append(str(user_id))
        if isinstance(self.response, Exception):
            raise self.response
        return self.response


def _make_borrowing_response(
    positions: list[BorrowingPosition] | None = None,
) -> BorrowingPositionsResponse:
    """Helper to create a BorrowingPositionsResponse for testing.

    Mirrors real BorrowingService behavior: sorts positions by health_rate ascending.
    """
    if positions is None:
        positions = []

    # Sort by health rate ascending (riskiest first) — matches BorrowingService._transform_positions
    positions = sorted(positions, key=lambda p: p.health_rate)

    total_collateral = sum(p.collateral_usd for p in positions) if positions else 0.0
    total_debt = sum(p.debt_usd for p in positions) if positions else 0.0
    worst_health_rate = min((p.health_rate for p in positions), default=0.0)
    last_updated = max((p.updated_at for p in positions), default=datetime.now(UTC))

    return BorrowingPositionsResponse(
        positions=positions,
        total_collateral_usd=total_collateral,
        total_debt_usd=total_debt,
        worst_health_rate=worst_health_rate,
        last_updated=last_updated,
    )


class TestBorrowingPositionsEndpoint:
    """Tests for GET /api/v2/analytics/{user_id}/borrowing/positions endpoint."""

    @pytest.mark.asyncio
    async def test_returns_positions_sorted_by_risk(self, client: AsyncClient):
        """Test endpoint returns positions sorted by health_rate ascending (riskiest first)."""
        # Arrange
        user_id = uuid4()
        now = datetime.now(UTC)

        positions = [
            BorrowingPosition(
                protocol_id="compound",
                protocol_name="Compound V3",
                chain="ethereum",
                health_rate=1.2,
                health_status="CRITICAL",
                collateral_usd=20000.0,
                debt_usd=12500.0,
                net_value_usd=7500.0,
                collateral_tokens=[
                    {"symbol": "WETH", "amount": 10.0, "value_usd": 20000.0}
                ],
                debt_tokens=[
                    {"symbol": "USDC", "amount": 12500.0, "value_usd": 12500.0}
                ],
                updated_at=now,
            ),
            BorrowingPosition(
                protocol_id="morpho",
                protocol_name="Morpho Blue",
                chain="ethereum",
                health_rate=1.8,
                health_status="WARNING",
                collateral_usd=40000.0,
                debt_usd=16667.0,
                net_value_usd=23333.0,
                collateral_tokens=[],
                debt_tokens=[],
                updated_at=now,
            ),
            BorrowingPosition(
                protocol_id="aave-v3",
                protocol_name="Aave V3",
                chain="ethereum",
                health_rate=3.0,
                health_status="HEALTHY",
                collateral_usd=100000.0,
                debt_usd=25000.0,
                net_value_usd=75000.0,
                collateral_tokens=[],
                debt_tokens=[],
                updated_at=now,
            ),
        ]

        stub = StubBorrowingPositionsService(_make_borrowing_response(positions))
        app.dependency_overrides[get_borrowing_service] = lambda: stub

        try:
            # Act
            response = await client.get(
                f"/api/v2/analytics/{user_id}/borrowing/positions"
            )

            # Assert
            assert response.status_code == 200
            data = response.json()

            # Verify positions are sorted by health_rate (ascending)
            health_rates = [pos["health_rate"] for pos in data["positions"]]
            assert health_rates == [1.2, 1.8, 3.0]

            # Verify aggregates
            assert data["total_collateral_usd"] == 160000.0
            assert data["worst_health_rate"] == 1.2
            assert stub.calls == [str(user_id)]
        finally:
            app.dependency_overrides.pop(get_borrowing_service, None)

    @pytest.mark.asyncio
    async def test_returns_404_when_no_positions(self, client: AsyncClient):
        """Test endpoint returns 404 when user has no borrowing positions."""
        # Arrange
        user_id = uuid4()
        stub = StubBorrowingPositionsService(
            ValueError(f"User {user_id} has no borrowing positions")
        )
        app.dependency_overrides[get_borrowing_service] = lambda: stub

        try:
            # Act
            response = await client.get(
                f"/api/v2/analytics/{user_id}/borrowing/positions"
            )

            # Assert
            assert response.status_code == 404
            assert "No borrowing positions found" in response.json()["detail"]
        finally:
            app.dependency_overrides.pop(get_borrowing_service, None)

    @pytest.mark.asyncio
    async def test_returns_500_on_service_error(self, client: AsyncClient):
        """Test endpoint returns 500 on unexpected service error."""
        # Arrange
        user_id = uuid4()
        stub = StubBorrowingPositionsService(RuntimeError("Database connection failed"))
        app.dependency_overrides[get_borrowing_service] = lambda: stub

        try:
            # Act
            response = await client.get(
                f"/api/v2/analytics/{user_id}/borrowing/positions"
            )

            # Assert
            assert response.status_code == 500
            assert "Error fetching borrowing positions" in response.json()["detail"]
        finally:
            app.dependency_overrides.pop(get_borrowing_service, None)

    @pytest.mark.asyncio
    async def test_validates_user_id_format(self, client: AsyncClient):
        """Test endpoint rejects invalid UUID format."""
        # Act
        response = await client.get(
            "/api/v2/analytics/invalid-uuid/borrowing/positions"
        )

        # Assert
        assert response.status_code == 422  # Validation error

    @pytest.mark.asyncio
    async def test_cache_headers_applied(self, client: AsyncClient):
        """Test endpoint sets appropriate cache headers."""
        # Arrange
        user_id = uuid4()
        now = datetime.now(UTC)

        position = BorrowingPosition(
            protocol_id="aave-v3",
            protocol_name="Aave V3",
            chain="ethereum",
            health_rate=2.5,
            health_status="HEALTHY",
            collateral_usd=100000.0,
            debt_usd=30000.0,
            net_value_usd=70000.0,
            collateral_tokens=[],
            debt_tokens=[],
            updated_at=now,
        )

        stub = StubBorrowingPositionsService(_make_borrowing_response([position]))
        app.dependency_overrides[get_borrowing_service] = lambda: stub

        try:
            # Act
            response = await client.get(
                f"/api/v2/analytics/{user_id}/borrowing/positions"
            )

            # Assert
            assert response.status_code == 200
            assert "Cache-Control" in response.headers
            assert "Vary" in response.headers
            assert response.headers["Vary"] == "Accept-Encoding"
        finally:
            app.dependency_overrides.pop(get_borrowing_service, None)


class TestBorrowingPositionsResponseStructure:
    """Tests for response data structure and validation."""

    @pytest.mark.asyncio
    async def test_response_includes_all_required_fields(self, client: AsyncClient):
        """Test response includes all required BorrowingPositionsResponse fields."""
        # Arrange
        user_id = uuid4()
        now = datetime.now(UTC)

        position = BorrowingPosition(
            protocol_id="aave-v3",
            protocol_name="Aave V3",
            chain="ethereum",
            health_rate=2.5,
            health_status="HEALTHY",
            collateral_usd=100000.0,
            debt_usd=30000.0,
            net_value_usd=70000.0,
            collateral_tokens=[
                {"symbol": "WETH", "amount": 50.0, "value_usd": 100000.0}
            ],
            debt_tokens=[{"symbol": "USDC", "amount": 30000.0, "value_usd": 30000.0}],
            updated_at=now,
        )

        stub = StubBorrowingPositionsService(_make_borrowing_response([position]))
        app.dependency_overrides[get_borrowing_service] = lambda: stub

        try:
            # Act
            response = await client.get(
                f"/api/v2/analytics/{user_id}/borrowing/positions"
            )

            # Assert
            assert response.status_code == 200
            data = response.json()

            # Top-level fields
            assert "positions" in data
            assert "total_collateral_usd" in data
            assert "total_debt_usd" in data
            assert "worst_health_rate" in data
            assert "last_updated" in data

            # Position fields
            position_data = data["positions"][0]
            assert "protocol_id" in position_data
            assert "protocol_name" in position_data
            assert "chain" in position_data
            assert "health_rate" in position_data
            assert "health_status" in position_data
            assert "collateral_usd" in position_data
            assert "debt_usd" in position_data
            assert "net_value_usd" in position_data
            assert "collateral_tokens" in position_data
            assert "debt_tokens" in position_data
            assert "updated_at" in position_data
        finally:
            app.dependency_overrides.pop(get_borrowing_service, None)

    @pytest.mark.asyncio
    async def test_health_status_values_are_valid(self, client: AsyncClient):
        """Test health_status contains only valid literal values."""
        # Arrange
        user_id = uuid4()
        now = datetime.now(UTC)

        positions = [
            BorrowingPosition(
                protocol_id="aave-v3",
                protocol_name="Aave V3",
                chain="ethereum",
                health_rate=1.2,
                health_status="CRITICAL",
                collateral_usd=20000.0,
                debt_usd=12500.0,
                net_value_usd=7500.0,
                collateral_tokens=[],
                debt_tokens=[],
                updated_at=now,
            ),
            BorrowingPosition(
                protocol_id="compound",
                protocol_name="Compound",
                chain="ethereum",
                health_rate=1.7,
                health_status="WARNING",
                collateral_usd=40000.0,
                debt_usd=17647.0,
                net_value_usd=22353.0,
                collateral_tokens=[],
                debt_tokens=[],
                updated_at=now,
            ),
            BorrowingPosition(
                protocol_id="morpho",
                protocol_name="Morpho",
                chain="ethereum",
                health_rate=3.0,
                health_status="HEALTHY",
                collateral_usd=100000.0,
                debt_usd=25000.0,
                net_value_usd=75000.0,
                collateral_tokens=[],
                debt_tokens=[],
                updated_at=now,
            ),
        ]

        stub = StubBorrowingPositionsService(_make_borrowing_response(positions))
        app.dependency_overrides[get_borrowing_service] = lambda: stub

        try:
            # Act
            response = await client.get(
                f"/api/v2/analytics/{user_id}/borrowing/positions"
            )

            # Assert
            assert response.status_code == 200
            data = response.json()

            valid_statuses = {"HEALTHY", "WARNING", "CRITICAL"}
            for position in data["positions"]:
                assert position["health_status"] in valid_statuses
        finally:
            app.dependency_overrides.pop(get_borrowing_service, None)


class TestBorrowingPositionsEdgeCases:
    """Tests for edge cases and error scenarios."""

    @pytest.mark.asyncio
    async def test_handles_single_position(self, client: AsyncClient):
        """Test endpoint handles user with single borrowing position."""
        # Arrange
        user_id = uuid4()
        now = datetime.now(UTC)

        position = BorrowingPosition(
            protocol_id="aave-v3",
            protocol_name="Aave V3",
            chain="ethereum",
            health_rate=2.5,
            health_status="HEALTHY",
            collateral_usd=100000.0,
            debt_usd=30000.0,
            net_value_usd=70000.0,
            collateral_tokens=[],
            debt_tokens=[],
            updated_at=now,
        )

        stub = StubBorrowingPositionsService(_make_borrowing_response([position]))
        app.dependency_overrides[get_borrowing_service] = lambda: stub

        try:
            # Act
            response = await client.get(
                f"/api/v2/analytics/{user_id}/borrowing/positions"
            )

            # Assert
            assert response.status_code == 200
            data = response.json()
            assert len(data["positions"]) == 1
            assert data["worst_health_rate"] == 2.5
        finally:
            app.dependency_overrides.pop(get_borrowing_service, None)


class TestCanonicalSnapshotIntegration:
    """Tests for canonical snapshot date handling with CanonicalSnapshotService."""

    @pytest.mark.asyncio
    async def test_uses_canonical_snapshot_date_from_service(self, client: AsyncClient):
        """Test that canonical snapshot date is retrieved and passed to query."""
        from datetime import date

        from src.services.dependencies import get_canonical_snapshot_service

        # Arrange
        user_id = uuid4()
        canonical_date = date(2026, 1, 10)
        now = datetime.now(UTC)

        # Mock canonical snapshot service to return specific date
        mock_canonical_service = _make_canonical_snapshot_service_mock(canonical_date)

        # Create stub with test data
        positions = [
            _make_position_with_health_rate(2.0, "morpho", "ethereum", now),
            _make_position_with_health_rate(1.5, "aave-v3", "arbitrum", now),
        ]
        stub_service = StubBorrowingPositionsService(
            _make_borrowing_response(positions)
        )

        # Override dependencies
        app.dependency_overrides[get_canonical_snapshot_service] = (
            lambda: mock_canonical_service
        )
        app.dependency_overrides[get_borrowing_service] = lambda: stub_service

        try:
            # Act
            response = await client.get(
                f"/api/v2/analytics/{user_id}/borrowing/positions"
            )

            # Assert
            assert response.status_code == 200
            data = response.json()

            # Verify canonical service was called
            mock_canonical_service.get_snapshot_date.assert_called_once()
            call_args = mock_canonical_service.get_snapshot_date.call_args
            assert str(call_args[0][0]) == str(user_id)

            # Verify positions returned successfully
            assert len(data["positions"]) == 2
            assert data["worst_health_rate"] == 1.5
        finally:
            app.dependency_overrides.pop(get_canonical_snapshot_service, None)
            app.dependency_overrides.pop(get_borrowing_service, None)

    @pytest.mark.asyncio
    async def test_fallback_when_canonical_snapshot_service_none(
        self, client: AsyncClient
    ):
        """Test backwards compatibility when canonical_snapshot_service is None."""
        # Arrange
        user_id = uuid4()
        now = datetime.now(UTC)

        # Create service WITHOUT canonical_snapshot_service (simulating old behavior)
        positions = [_make_position_with_health_rate(2.0, "morpho", "ethereum", now)]
        stub_service = StubBorrowingPositionsService(
            _make_borrowing_response(positions)
        )

        app.dependency_overrides[get_borrowing_service] = lambda: stub_service

        try:
            # Act
            response = await client.get(
                f"/api/v2/analytics/{user_id}/borrowing/positions"
            )

            # Assert - should work without errors
            assert response.status_code == 200
            data = response.json()
            assert len(data["positions"]) == 1
            assert data["total_debt_usd"] == 10000.0
        finally:
            app.dependency_overrides.pop(get_borrowing_service, None)

    @pytest.mark.asyncio
    async def test_consistent_snapshot_across_requests(self, client: AsyncClient):
        """Test same snapshot date used for same user across multiple calls."""
        from datetime import date

        from src.services.dependencies import get_canonical_snapshot_service

        # Arrange
        user_id = uuid4()
        canonical_date = date(2026, 1, 11)
        now = datetime.now(UTC)

        # Mock canonical service
        mock_canonical_service = _make_canonical_snapshot_service_mock(canonical_date)

        positions = [_make_position_with_health_rate(2.0, "morpho", "ethereum", now)]
        stub_service = StubBorrowingPositionsService(
            _make_borrowing_response(positions)
        )

        app.dependency_overrides[get_canonical_snapshot_service] = (
            lambda: mock_canonical_service
        )
        app.dependency_overrides[get_borrowing_service] = lambda: stub_service

        try:
            # Act - make 3 sequential requests
            response1 = await client.get(
                f"/api/v2/analytics/{user_id}/borrowing/positions"
            )
            response2 = await client.get(
                f"/api/v2/analytics/{user_id}/borrowing/positions"
            )
            response3 = await client.get(
                f"/api/v2/analytics/{user_id}/borrowing/positions"
            )

            # Assert
            assert response1.status_code == 200
            assert response2.status_code == 200
            assert response3.status_code == 200

            # Verify canonical service called 3 times (once per request)
            assert mock_canonical_service.get_snapshot_date.call_count == 3

            # Verify all calls used same user_id
            for call in mock_canonical_service.get_snapshot_date.call_args_list:
                assert str(call[0][0]) == str(user_id)

            # Verify results are consistent
            data1 = response1.json()
            data2 = response2.json()
            data3 = response3.json()

            assert data1["worst_health_rate"] == data2["worst_health_rate"]
            assert data2["worst_health_rate"] == data3["worst_health_rate"]
        finally:
            app.dependency_overrides.pop(get_canonical_snapshot_service, None)
            app.dependency_overrides.pop(get_borrowing_service, None)


class TestMultiWalletAggregation:
    """Tests for position aggregation across multiple user wallets."""

    @pytest.mark.asyncio
    async def test_aggregates_positions_across_multiple_wallets(
        self, client: AsyncClient
    ):
        """Test positions from different wallets are combined correctly."""
        # Arrange
        user_id = uuid4()
        now = datetime.now(UTC)

        # Simulate aggregated positions from 3 wallets:
        # - Wallet A: Morpho/ETH with $20K debt
        # - Wallet B: Morpho/ETH with $10K debt
        # - Wallet C: Aave/Arb with $5K debt
        # After aggregation by (protocol, chain): 2 positions
        positions = [
            BorrowingPosition(
                protocol_id="morpho",
                protocol_name="Morpho Blue",
                chain="ethereum",
                health_rate=1.5,
                health_status="WARNING",
                collateral_usd=30000.0,  # Aggregated from wallet A + B
                debt_usd=30000.0,  # $20K + $10K
                net_value_usd=0.0,
                collateral_tokens=[],
                debt_tokens=[],
                updated_at=now,
            ),
            BorrowingPosition(
                protocol_id="aave-v3",
                protocol_name="Aave V3",
                chain="arbitrum",
                health_rate=2.0,
                health_status="HEALTHY",
                collateral_usd=6667.0,
                debt_usd=5000.0,  # Wallet C only
                net_value_usd=1667.0,
                collateral_tokens=[],
                debt_tokens=[],
                updated_at=now,
            ),
        ]

        stub = StubBorrowingPositionsService(_make_borrowing_response(positions))
        app.dependency_overrides[get_borrowing_service] = lambda: stub

        try:
            # Act
            response = await client.get(
                f"/api/v2/analytics/{user_id}/borrowing/positions"
            )

            # Assert
            assert response.status_code == 200
            data = response.json()

            # Verify 2 positions returned (Morpho/ETH aggregated, Aave/Arb separate)
            assert len(data["positions"]) == 2

            # Find Morpho position (aggregated from 2 wallets)
            morpho_pos = next(
                p for p in data["positions"] if p["protocol_id"] == "morpho"
            )
            assert morpho_pos["debt_usd"] == 30000.0  # 20K + 10K
            assert morpho_pos["chain"] == "ethereum"

            # Find Aave position (single wallet)
            aave_pos = next(
                p for p in data["positions"] if p["protocol_id"] == "aave-v3"
            )
            assert aave_pos["debt_usd"] == 5000.0
            assert aave_pos["chain"] == "arbitrum"

            # Verify total aggregates
            assert data["total_debt_usd"] == 35000.0  # 30K + 5K
            assert data["worst_health_rate"] == 1.5  # Morpho's health rate
        finally:
            app.dependency_overrides.pop(get_borrowing_service, None)

    @pytest.mark.asyncio
    async def test_single_wallet_user(self, client: AsyncClient):
        """Test single-wallet users work correctly without aggregation artifacts."""
        # Arrange
        user_id = uuid4()
        now = datetime.now(UTC)

        # User with 1 wallet, 2 positions
        positions = [
            _make_position_with_health_rate(2.5, "morpho", "ethereum", now),
            _make_position_with_health_rate(1.8, "aave-v3", "arbitrum", now),
        ]

        stub = StubBorrowingPositionsService(_make_borrowing_response(positions))
        app.dependency_overrides[get_borrowing_service] = lambda: stub

        try:
            # Act
            response = await client.get(
                f"/api/v2/analytics/{user_id}/borrowing/positions"
            )

            # Assert
            assert response.status_code == 200
            data = response.json()

            # Both positions returned
            assert len(data["positions"]) == 2

            # No aggregation artifacts - positions remain separate
            protocols = [p["protocol_id"] for p in data["positions"]]
            assert "morpho" in protocols
            assert "aave-v3" in protocols

            # Total debt should be sum of individual debts
            assert data["total_debt_usd"] == 20000.0  # 10K + 10K (from helper)
        finally:
            app.dependency_overrides.pop(get_borrowing_service, None)

    @pytest.mark.asyncio
    async def test_wallet_without_debt_excluded(self, client: AsyncClient):
        """Test wallets with no debt don't contribute to results."""
        # Arrange
        user_id = uuid4()
        now = datetime.now(UTC)

        # User has 2 wallets:
        # - Wallet A: Morpho/ETH with $10K debt
        # - Wallet B: No debt positions (all filtered out by debt > 0 condition)
        # Result: Only 1 position from Wallet A
        positions = [
            BorrowingPosition(
                protocol_id="morpho",
                protocol_name="Morpho Blue",
                chain="ethereum",
                health_rate=2.0,
                health_status="HEALTHY",
                collateral_usd=26667.0,
                debt_usd=10000.0,  # Only from Wallet A
                net_value_usd=16667.0,
                collateral_tokens=[],
                debt_tokens=[],
                updated_at=now,
            ),
        ]

        stub = StubBorrowingPositionsService(_make_borrowing_response(positions))
        app.dependency_overrides[get_borrowing_service] = lambda: stub

        try:
            # Act
            response = await client.get(
                f"/api/v2/analytics/{user_id}/borrowing/positions"
            )

            # Assert
            assert response.status_code == 200
            data = response.json()

            # Only 1 position returned (from Wallet A)
            assert len(data["positions"]) == 1
            assert data["positions"][0]["protocol_id"] == "morpho"

            # Total debt = $10K (Wallet B contributed nothing)
            assert data["total_debt_usd"] == 10000.0
        finally:
            app.dependency_overrides.pop(get_borrowing_service, None)


class TestHealthRateCalculations:
    """Tests for health rate calculation and boundary value classifications."""

    @pytest.mark.asyncio
    async def test_health_rate_exactly_at_healthy_threshold(self, client: AsyncClient):
        """Test boundary classification at 2.0 threshold (HEALTHY)."""
        # Arrange
        user_id = uuid4()
        now = datetime.now(UTC)

        # Position with health_rate = 2.0 exactly (at HEALTHY threshold)
        position = _make_position_with_health_rate(2.0, "morpho", "ethereum", now)
        stub = StubBorrowingPositionsService(_make_borrowing_response([position]))
        app.dependency_overrides[get_borrowing_service] = lambda: stub

        try:
            # Act
            response = await client.get(
                f"/api/v2/analytics/{user_id}/borrowing/positions"
            )

            # Assert
            assert response.status_code == 200
            data = response.json()

            position_data = data["positions"][0]
            assert position_data["health_rate"] == 2.0
            assert position_data["health_status"] == "HEALTHY"  # >= 2.0
        finally:
            app.dependency_overrides.pop(get_borrowing_service, None)

    @pytest.mark.asyncio
    async def test_health_rate_exactly_at_warning_threshold(self, client: AsyncClient):
        """Test boundary classification at 1.5 threshold (WARNING)."""
        # Arrange
        user_id = uuid4()
        now = datetime.now(UTC)

        # Position with health_rate = 1.5 exactly (at WARNING threshold)
        position = _make_position_with_health_rate(1.5, "aave-v3", "arbitrum", now)
        stub = StubBorrowingPositionsService(_make_borrowing_response([position]))
        app.dependency_overrides[get_borrowing_service] = lambda: stub

        try:
            # Act
            response = await client.get(
                f"/api/v2/analytics/{user_id}/borrowing/positions"
            )

            # Assert
            assert response.status_code == 200
            data = response.json()

            position_data = data["positions"][0]
            assert position_data["health_rate"] == 1.5
            assert position_data["health_status"] == "WARNING"  # >= 1.5, < 2.0
        finally:
            app.dependency_overrides.pop(get_borrowing_service, None)

    @pytest.mark.asyncio
    async def test_health_rate_just_below_warning_threshold(self, client: AsyncClient):
        """Test CRITICAL classification just below 1.5 threshold."""
        # Arrange
        user_id = uuid4()
        now = datetime.now(UTC)

        # Position with health_rate = 1.4999 (just below WARNING threshold)
        position = _make_position_with_health_rate(1.4999, "compound", "ethereum", now)
        stub = StubBorrowingPositionsService(_make_borrowing_response([position]))
        app.dependency_overrides[get_borrowing_service] = lambda: stub

        try:
            # Act
            response = await client.get(
                f"/api/v2/analytics/{user_id}/borrowing/positions"
            )

            # Assert
            assert response.status_code == 200
            data = response.json()

            position_data = data["positions"][0]
            assert position_data["health_rate"] == 1.4999
            assert position_data["health_status"] == "CRITICAL"  # < 1.5
        finally:
            app.dependency_overrides.pop(get_borrowing_service, None)

    @pytest.mark.asyncio
    async def test_very_high_health_rate(self, client: AsyncClient):
        """Test behavior with extremely safe position (high health rate)."""
        # Arrange
        user_id = uuid4()
        now = datetime.now(UTC)

        # Position with health_rate = 10.5 (massive over-collateralization)
        position = _make_position_with_health_rate(10.5, "morpho", "ethereum", now)
        stub = StubBorrowingPositionsService(_make_borrowing_response([position]))
        app.dependency_overrides[get_borrowing_service] = lambda: stub

        try:
            # Act
            response = await client.get(
                f"/api/v2/analytics/{user_id}/borrowing/positions"
            )

            # Assert
            assert response.status_code == 200
            data = response.json()

            position_data = data["positions"][0]
            assert position_data["health_rate"] == 10.5
            assert position_data["health_status"] == "HEALTHY"

            # Verify no overflow or calculation errors
            assert position_data["collateral_usd"] > 0
            assert position_data["debt_usd"] == 10000.0
            assert position_data["net_value_usd"] > 0
        finally:
            app.dependency_overrides.pop(get_borrowing_service, None)

    @pytest.mark.asyncio
    async def test_very_low_health_rate(self, client: AsyncClient):
        """Test near-liquidation scenario (very low health rate)."""
        # Arrange
        user_id = uuid4()
        now = datetime.now(UTC)

        # Position with health_rate = 0.5 (critical undercollateralization)
        position = _make_position_with_health_rate(0.5, "aave-v3", "ethereum", now)
        stub = StubBorrowingPositionsService(_make_borrowing_response([position]))
        app.dependency_overrides[get_borrowing_service] = lambda: stub

        try:
            # Act
            response = await client.get(
                f"/api/v2/analytics/{user_id}/borrowing/positions"
            )

            # Assert
            assert response.status_code == 200
            data = response.json()

            position_data = data["positions"][0]
            assert position_data["health_rate"] == 0.5
            assert position_data["health_status"] == "CRITICAL"  # << 1.5

            # Verify system handles extreme risk correctly
            assert position_data["debt_usd"] == 10000.0
            assert position_data["collateral_usd"] < position_data["debt_usd"]
        finally:
            app.dependency_overrides.pop(get_borrowing_service, None)


class TestAggregateValidation:
    """Tests for explicit aggregate calculation correctness."""

    @pytest.mark.asyncio
    async def test_total_collateral_sum_correctness(self, client: AsyncClient):
        """Verify total_collateral_usd is exact sum of all position collateral values."""
        # Arrange
        user_id = uuid4()
        now = datetime.now(UTC)

        # Create 3 positions with specific collateral values
        positions = [
            BorrowingPosition(
                protocol_id="morpho",
                protocol_name="Morpho",
                chain="ethereum",
                health_rate=2.0,
                health_status="HEALTHY",
                collateral_usd=10000.0,
                debt_usd=5000.0,
                net_value_usd=5000.0,
                collateral_tokens=[],
                debt_tokens=[],
                updated_at=now,
            ),
            BorrowingPosition(
                protocol_id="aave-v3",
                protocol_name="Aave V3",
                chain="arbitrum",
                health_rate=1.8,
                health_status="WARNING",
                collateral_usd=20000.0,
                debt_usd=8333.0,
                net_value_usd=11667.0,
                collateral_tokens=[],
                debt_tokens=[],
                updated_at=now,
            ),
            BorrowingPosition(
                protocol_id="compound",
                protocol_name="Compound",
                chain="ethereum",
                health_rate=3.0,
                health_status="HEALTHY",
                collateral_usd=30000.0,
                debt_usd=7500.0,
                net_value_usd=22500.0,
                collateral_tokens=[],
                debt_tokens=[],
                updated_at=now,
            ),
        ]

        stub = StubBorrowingPositionsService(_make_borrowing_response(positions))
        app.dependency_overrides[get_borrowing_service] = lambda: stub

        try:
            # Act
            response = await client.get(
                f"/api/v2/analytics/{user_id}/borrowing/positions"
            )

            # Assert
            assert response.status_code == 200
            data = response.json()

            # Verify exact sum (10K + 20K + 30K = 60K)
            assert data["total_collateral_usd"] == 60000.0

            # Verify no rounding errors
            manual_sum = sum(p["collateral_usd"] for p in data["positions"])
            assert data["total_collateral_usd"] == manual_sum
        finally:
            app.dependency_overrides.pop(get_borrowing_service, None)

    @pytest.mark.asyncio
    async def test_total_debt_sum_correctness(self, client: AsyncClient):
        """Verify total_debt_usd is exact sum of all position debt values."""
        # Arrange
        user_id = uuid4()
        now = datetime.now(UTC)

        # Create 4 positions with specific debt values
        positions = [
            BorrowingPosition(
                protocol_id="morpho",
                protocol_name="Morpho",
                chain="ethereum",
                health_rate=2.0,
                health_status="HEALTHY",
                collateral_usd=2667.0,
                debt_usd=1000.0,
                net_value_usd=1667.0,
                collateral_tokens=[],
                debt_tokens=[],
                updated_at=now,
            ),
            BorrowingPosition(
                protocol_id="aave-v3",
                protocol_name="Aave V3",
                chain="arbitrum",
                health_rate=1.5,
                health_status="WARNING",
                collateral_usd=6667.0,
                debt_usd=5000.0,
                net_value_usd=1667.0,
                collateral_tokens=[],
                debt_tokens=[],
                updated_at=now,
            ),
            BorrowingPosition(
                protocol_id="compound",
                protocol_name="Compound",
                chain="ethereum",
                health_rate=1.8,
                health_status="WARNING",
                collateral_usd=13333.0,
                debt_usd=10000.0,
                net_value_usd=3333.0,
                collateral_tokens=[],
                debt_tokens=[],
                updated_at=now,
            ),
            BorrowingPosition(
                protocol_id="dolomite",
                protocol_name="Dolomite",
                chain="arbitrum",
                health_rate=2.5,
                health_status="HEALTHY",
                collateral_usd=33333.0,
                debt_usd=25000.0,
                net_value_usd=8333.0,
                collateral_tokens=[],
                debt_tokens=[],
                updated_at=now,
            ),
        ]

        stub = StubBorrowingPositionsService(_make_borrowing_response(positions))
        app.dependency_overrides[get_borrowing_service] = lambda: stub

        try:
            # Act
            response = await client.get(
                f"/api/v2/analytics/{user_id}/borrowing/positions"
            )

            # Assert
            assert response.status_code == 200
            data = response.json()

            # Verify exact sum (1K + 5K + 10K + 25K = 41K)
            assert data["total_debt_usd"] == 41000.0

            # Verify no rounding errors
            manual_sum = sum(p["debt_usd"] for p in data["positions"])
            assert data["total_debt_usd"] == manual_sum
        finally:
            app.dependency_overrides.pop(get_borrowing_service, None)

    @pytest.mark.asyncio
    async def test_worst_health_rate_selection(self, client: AsyncClient):
        """Verify worst_health_rate equals minimum of all position health rates."""
        # Arrange
        user_id = uuid4()
        now = datetime.now(UTC)

        # Create 5 positions with varying health rates
        health_rates = [3.5, 2.1, 1.8, 1.2, 4.0]
        positions = [
            _make_position_with_health_rate(hr, f"protocol-{i}", "ethereum", now)
            for i, hr in enumerate(health_rates)
        ]

        stub = StubBorrowingPositionsService(_make_borrowing_response(positions))
        app.dependency_overrides[get_borrowing_service] = lambda: stub

        try:
            # Act
            response = await client.get(
                f"/api/v2/analytics/{user_id}/borrowing/positions"
            )

            # Assert
            assert response.status_code == 200
            data = response.json()

            # Verify worst_health_rate = min(all health rates) = 1.2
            assert data["worst_health_rate"] == 1.2

            # Verify positions are sorted by health_rate (ascending)
            returned_health_rates = [p["health_rate"] for p in data["positions"]]
            assert returned_health_rates == sorted(health_rates)

            # Verify first position has worst health rate
            assert data["positions"][0]["health_rate"] == 1.2
        finally:
            app.dependency_overrides.pop(get_borrowing_service, None)

    @pytest.mark.asyncio
    async def test_last_updated_max_timestamp(self, client: AsyncClient):
        """Verify last_updated equals max of all position timestamps."""
        # Arrange
        user_id = uuid4()

        # Create 3 positions with different timestamps
        timestamps = [
            datetime(2026, 1, 10, 8, 0, 0, tzinfo=UTC),
            datetime(2026, 1, 12, 14, 30, 0, tzinfo=UTC),  # Latest
            datetime(2026, 1, 11, 10, 0, 0, tzinfo=UTC),
        ]

        positions = [
            _make_position_with_health_rate(2.0, f"protocol-{i}", "ethereum", ts)
            for i, ts in enumerate(timestamps)
        ]

        stub = StubBorrowingPositionsService(_make_borrowing_response(positions))
        app.dependency_overrides[get_borrowing_service] = lambda: stub

        try:
            # Act
            response = await client.get(
                f"/api/v2/analytics/{user_id}/borrowing/positions"
            )

            # Assert
            assert response.status_code == 200
            data = response.json()

            # Verify last_updated = max timestamp (2026-01-12 14:30:00)
            expected_timestamp = "2026-01-12T14:30:00Z"
            assert data["last_updated"] == expected_timestamp

            # Verify it's the latest of all position timestamps
            position_timestamps = [p["updated_at"] for p in data["positions"]]
            assert max(position_timestamps) == expected_timestamp
        finally:
            app.dependency_overrides.pop(get_borrowing_service, None)


class TestBorrowingPositionsTokenArrays:
    """Test token array structure and validation in API responses."""

    @pytest.mark.asyncio
    async def test_positions_include_token_arrays_structure(self, client: AsyncClient):
        """Verify collateral_tokens and debt_tokens array structure in response."""
        # Arrange
        user_id = uuid4()

        # Create positions with token arrays
        position = _make_position_with_health_rate(1.85, "aave_v3", "ethereum")
        position.collateral_tokens = [
            TokenDetail(symbol="ETH", amount=10.5, value_usd=36757.88),
            TokenDetail(symbol="USDC", amount=5000.0, value_usd=5000.0),
        ]
        position.debt_tokens = [
            TokenDetail(symbol="DAI", amount=20000.0, value_usd=20000.0)
        ]

        stub = StubBorrowingPositionsService(_make_borrowing_response([position]))
        app.dependency_overrides[get_borrowing_service] = lambda: stub

        try:
            # Act
            response = await client.get(
                f"/api/v2/analytics/{user_id}/borrowing/positions"
            )

            # Assert
            assert response.status_code == 200
            data = response.json()

            position_data = data["positions"][0]

            # Verify collateral_tokens structure
            assert "collateral_tokens" in position_data
            assert len(position_data["collateral_tokens"]) == 2

            eth_token = position_data["collateral_tokens"][0]
            assert eth_token["symbol"] == "ETH"
            assert eth_token["amount"] == 10.5
            assert eth_token["value_usd"] == pytest.approx(36757.88, rel=1e-2)

            usdc_token = position_data["collateral_tokens"][1]
            assert usdc_token["symbol"] == "USDC"
            assert usdc_token["amount"] == 5000.0
            assert usdc_token["value_usd"] == pytest.approx(5000.0, rel=1e-2)

            # Verify debt_tokens structure
            assert "debt_tokens" in position_data
            assert len(position_data["debt_tokens"]) == 1

            dai_token = position_data["debt_tokens"][0]
            assert dai_token["symbol"] == "DAI"
            assert dai_token["amount"] == 20000.0
            assert dai_token["value_usd"] == pytest.approx(20000.0, rel=1e-2)
        finally:
            app.dependency_overrides.pop(get_borrowing_service, None)

    @pytest.mark.asyncio
    async def test_token_value_usd_precision(self, client: AsyncClient):
        """Verify value_usd calculated correctly with 2-decimal precision."""
        # Arrange
        user_id = uuid4()

        # High precision token data: 10.123456789 × 3500.999 = 35442.562...
        position = _make_position_with_health_rate(1.85, "aave_v3", "ethereum")
        position.collateral_tokens = [
            TokenDetail(
                symbol="ETH",
                amount=10.123456789,
                value_usd=35442.56,  # Expected: rounded to 2 decimals
            )
        ]
        position.debt_tokens = []

        stub = StubBorrowingPositionsService(_make_borrowing_response([position]))
        app.dependency_overrides[get_borrowing_service] = lambda: stub

        try:
            # Act
            response = await client.get(
                f"/api/v2/analytics/{user_id}/borrowing/positions"
            )

            # Assert
            assert response.status_code == 200
            data = response.json()

            token = data["positions"][0]["collateral_tokens"][0]

            # Verify 2-decimal precision (35442.562... → 35442.56)
            assert token["value_usd"] == pytest.approx(35442.56, abs=0.01)

            # Verify JSON serialization maintains 2 decimals
            response_text = response.text
            # Check for either compact or spaced JSON format
            assert (
                '"value_usd":35442.56' in response_text
                or '"value_usd": 35442.56' in response_text
            )
        finally:
            app.dependency_overrides.pop(get_borrowing_service, None)

    @pytest.mark.asyncio
    async def test_empty_token_lists_return_empty_arrays(self, client: AsyncClient):
        """Verify missing token lists return [] instead of null."""
        # Arrange
        user_id = uuid4()

        # Position with no tokens
        position = _make_position_with_health_rate(1.85, "aave_v3", "ethereum")
        position.collateral_tokens = []
        position.debt_tokens = []

        stub = StubBorrowingPositionsService(_make_borrowing_response([position]))
        app.dependency_overrides[get_borrowing_service] = lambda: stub

        try:
            # Act
            response = await client.get(
                f"/api/v2/analytics/{user_id}/borrowing/positions"
            )

            # Assert
            assert response.status_code == 200
            data = response.json()

            position_data = data["positions"][0]

            # Should return empty arrays, not null
            assert position_data["collateral_tokens"] == []
            assert position_data["debt_tokens"] == []

            # Verify JSON serialization uses arrays
            response_text = response.text
            assert (
                '"collateral_tokens":[]' in response_text
                or '"collateral_tokens": []' in response_text
            )
            assert (
                '"debt_tokens":[]' in response_text
                or '"debt_tokens": []' in response_text
            )
        finally:
            app.dependency_overrides.pop(get_borrowing_service, None)

    @pytest.mark.asyncio
    async def test_large_token_dataset_performance(self, client: AsyncClient):
        """Verify performance with 25+ tokens in a single position."""
        from src.services.dependencies import get_canonical_snapshot_service

        # Arrange
        user_id = uuid4()

        # Generate 25 collateral tokens
        position = _make_position_with_health_rate(1.85, "aave_v3", "ethereum")
        position.collateral_tokens = [
            TokenDetail(
                symbol=f"TOKEN{i}",
                amount=100.0 + i,
                value_usd=(100.0 + i) * (1.0 + (i * 0.1)),
            )
            for i in range(25)
        ]
        position.debt_tokens = []

        stub = StubBorrowingPositionsService(_make_borrowing_response([position]))
        mock_canonical_service = _make_canonical_snapshot_service_mock(None)
        app.dependency_overrides[get_borrowing_service] = lambda: stub
        app.dependency_overrides[get_canonical_snapshot_service] = (
            lambda: mock_canonical_service
        )

        try:
            # Act - measure timing
            import time

            start = time.time()
            response = await client.get(
                f"/api/v2/analytics/{user_id}/borrowing/positions"
            )
            duration = time.time() - start

            # Assert
            assert response.status_code == 200
            data = response.json()

            # All 25 tokens should be present
            assert len(data["positions"][0]["collateral_tokens"]) == 25

            # Verify first and last token structure
            first_token = data["positions"][0]["collateral_tokens"][0]
            assert first_token["symbol"] == "TOKEN0"
            assert first_token["amount"] == 100.0

            last_token = data["positions"][0]["collateral_tokens"][24]
            assert last_token["symbol"] == "TOKEN24"
            assert last_token["amount"] == 124.0

            # Performance: Should complete in <1 second
            assert duration < 1.0, f"Request took {duration:.2f}s (expected <1s)"
        finally:
            app.dependency_overrides.pop(get_borrowing_service, None)
            app.dependency_overrides.pop(get_canonical_snapshot_service, None)


class StubBorrowingPositionsServiceWithSnapshot(StubBorrowingPositionsService):
    """Stub service that tracks snapshot_date in calls."""

    def get_borrowing_positions(
        self, user_id: UUID, snapshot_date: datetime | None = None
    ) -> BorrowingPositionsResponse:
        self.calls.append(f"{user_id}:snapshot={snapshot_date}")
        if isinstance(self.response, Exception):
            raise self.response
        return self.response


class TestBorrowingPositionsSnapshotSignature:
    """Tests for snapshot date passing to service."""

    @pytest.mark.asyncio
    async def test_passes_snapshot_date_to_service(self, client: AsyncClient):
        """Test endpoint passes canonical snapshot_date to service."""
        from src.services.dependencies import get_canonical_snapshot_service

        user_id = uuid4()
        now = datetime.now(UTC)
        canonical_date = datetime(2025, 1, 1).date()

        mock_canonical_service = _make_canonical_snapshot_service_mock(canonical_date)

        positions = [_make_position_with_health_rate(2.0, "aave", "eth", now)]
        stub = StubBorrowingPositionsServiceWithSnapshot(
            _make_borrowing_response(positions)
        )

        app.dependency_overrides[get_canonical_snapshot_service] = (
            lambda: mock_canonical_service
        )
        app.dependency_overrides[get_borrowing_service] = lambda: stub

        try:
            await client.get(f"/api/v2/analytics/{user_id}/borrowing/positions")

            assert f"{user_id}:snapshot={canonical_date}" in stub.calls
        finally:
            app.dependency_overrides.pop(get_canonical_snapshot_service, None)
            app.dependency_overrides.pop(get_borrowing_service, None)
