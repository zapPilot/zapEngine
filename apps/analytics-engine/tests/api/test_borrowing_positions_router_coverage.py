"""Coverage tests for borrowing router canonical snapshot error handling."""

from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace
from uuid import uuid4

import pytest
from httpx import AsyncClient

from src.main import app
from src.services.dependencies import (
    get_borrowing_service,
    get_canonical_snapshot_service,
)
from tests.api.test_borrowing_positions import (
    StubBorrowingPositionsService,
    _make_borrowing_response,
    _make_position_with_health_rate,
)


@pytest.mark.asyncio
async def test_canonical_snapshot_failure_propagates_as_500(
    client: AsyncClient,
) -> None:
    """Canonical lookup errors propagate as 500 to the caller."""
    stub = StubBorrowingPositionsService(
        _make_borrowing_response(
            [
                _make_position_with_health_rate(
                    2.2, "morpho", "ethereum", datetime.now(UTC)
                )
            ]
        )
    )
    app.dependency_overrides[get_borrowing_service] = lambda: stub
    app.dependency_overrides[get_canonical_snapshot_service] = lambda: SimpleNamespace(
        get_snapshot_date=lambda _user_id: (_ for _ in ()).throw(RuntimeError("boom"))
    )

    try:
        response = await client.get(f"/api/v2/analytics/{uuid4()}/borrowing/positions")
        assert response.status_code == 500
        assert "Error fetching borrowing positions" in response.json()["detail"]
    finally:
        app.dependency_overrides.pop(get_borrowing_service, None)
        app.dependency_overrides.pop(get_canonical_snapshot_service, None)
