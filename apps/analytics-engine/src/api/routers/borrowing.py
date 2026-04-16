"""
Borrowing positions endpoints for per-position risk tracking.

This module provides endpoints for detailed liquidation risk analysis.
"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Path, Response

from src.api.cache_headers import apply_analytics_cache_headers
from src.models.borrowing import BorrowingPositionsResponse
from src.services.dependencies import (
    BorrowingServiceDep,
    get_canonical_snapshot_service,
)
from src.services.interfaces import CanonicalSnapshotServiceProtocol

router = APIRouter(prefix="/v2/analytics", tags=["Borrowing"])


@router.get("/{user_id}/borrowing/positions", response_model=BorrowingPositionsResponse)
def get_borrowing_positions(
    response: Response,
    borrowing_service: BorrowingServiceDep,
    user_id: UUID = Path(..., description="User ID"),
    canonical_snapshot_service: CanonicalSnapshotServiceProtocol = Depends(
        get_canonical_snapshot_service
    ),
) -> BorrowingPositionsResponse:
    """
    Get all borrowing positions for a user with per-position risk metrics.

    Returns positions sorted by health rate (riskiest first) with detailed
    collateral and debt breakdowns. Useful for liquidation risk analysis.

    **Health Rate Classification:**
    - HEALTHY: ≥ 2.0 (100%+ buffer above liquidation)
    - WARNING: 1.5-2.0 (50%-100% buffer, needs attention)
    - CRITICAL: < 1.5 (approaching liquidation threshold)

    **Response includes:**
    - Individual position health rates and risk status
    - Collateral and debt token breakdowns
    - Portfolio-wide worst health rate
    - Total collateral and debt aggregates

    **Use Cases:**
    - Dashboard risk warnings
    - Liquidation alerts
    - Position-level risk management
    - Portfolio health monitoring

    Args:
        user_id: UUID of the user
        borrowing_service: Injected BorrowingService

    Returns:
        BorrowingPositionsResponse with sorted positions

    Raises:
        HTTPException 404: User has no borrowing positions
        HTTPException 500: Database or service error
    """
    try:
        snapshot_date = None
        if canonical_snapshot_service is not None:
            snapshot_date = canonical_snapshot_service.get_snapshot_date(user_id)

        result = borrowing_service.get_borrowing_positions(
            user_id, snapshot_date=snapshot_date
        )

        apply_analytics_cache_headers(response)
        return result
    except ValueError as e:
        # User has no borrowing positions
        raise HTTPException(
            status_code=404,
            detail=f"No borrowing positions found for user {user_id}",
        ) from e
    except Exception as e:
        # Unexpected error
        raise HTTPException(
            status_code=500,
            detail=f"Error fetching borrowing positions: {str(e)}",
        ) from e
