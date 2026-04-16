"""V2 analytics endpoints exposing individual services."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Response
from sqlalchemy.orm import Session

from src.api.cache_headers import apply_analytics_cache_headers
from src.core.database import get_db
from src.models.analytics_responses import PortfolioTrendResponse
from src.models.dashboard import DashboardTimeRanges
from src.models.yield_returns import YieldReturnsResponse
from src.services.dependencies import (
    CanonicalSnapshotServiceDep,
    DashboardServiceDep,
    TrendAnalysisServiceDep,
    YieldReturnServiceDep,
    get_wallet_service,
)
from src.services.interfaces import WalletServiceProtocol
from src.utils.wallet_validation import validate_wallet_format

router = APIRouter(prefix="/v2/analytics", tags=["Analytics V2"])


def _resolve_wallet_address(
    *,
    wallet_address: str | None,
    wallet_address_camel: str | None,
) -> str | None:
    """Resolve optional wallet address from snake/camel query params."""
    resolved_wallet_address = wallet_address_camel or wallet_address
    if not resolved_wallet_address:
        return None
    return validate_wallet_format(resolved_wallet_address)


@router.get("/{user_id}/trend", response_model=PortfolioTrendResponse)
def get_trend_v2(
    response: Response,
    trend_service: TrendAnalysisServiceDep,
    canonical_snapshot_service: CanonicalSnapshotServiceDep,
    user_id: UUID = Path(..., description="User ID"),
    days: int = Query(90, ge=1, le=365, description="Number of days for trend data"),
) -> PortfolioTrendResponse:
    """Return canonical portfolio trend data for the requested user."""

    snapshot_date = canonical_snapshot_service.get_snapshot_date(user_id)
    result = trend_service.get_portfolio_trend(
        user_id, days, snapshot_date=snapshot_date
    )
    apply_analytics_cache_headers(response)
    return result


@router.get("/{user_id}/yield/daily", response_model=YieldReturnsResponse)
async def get_daily_yield_returns_v2(
    response: Response,
    yield_return_service: YieldReturnServiceDep,
    user_id: UUID = Path(..., description="User ID"),
    days: int = Query(
        30,
        ge=2,
        le=1460,
        description=(
            "Lookback period for snapshots (min 2, max 1460 days recommended). "
            "Larger windows may increase response size; consider downsampling on the client."
        ),
    ),
    min_threshold: float = Query(
        0.0,
        ge=0.0,
        description="Minimum absolute Yield Return (USD) to include in results.",
    ),
    protocols: list[str] | None = Query(
        None, description="Optional protocol filter (repeat param for multiples)."
    ),
    chains: list[str] | None = Query(
        None, description="Optional chain filter (repeat param for multiples)."
    ),
    wallet_address: str | None = Query(
        None,
        description="Optional wallet filter. When provided, returns data for specific wallet. Omit for bundle aggregation.",
        pattern=r"^0x[a-fA-F0-9]{40}$",
    ),
    wallet_address_camel: str | None = Query(
        None,
        alias="walletAddress",
        description="Optional wallet filter (camelCase alias).",
        pattern=r"^0x[a-fA-F0-9]{40}$",
    ),
) -> YieldReturnsResponse:
    """Return canonical daily yield returns from shared yield service."""

    resolved_wallet_address = _resolve_wallet_address(
        wallet_address=wallet_address,
        wallet_address_camel=wallet_address_camel,
    )

    result = await yield_return_service.get_daily_yield_returns(
        user_id=user_id,
        days=days,
        min_threshold=min_threshold,
        protocols=protocols,
        chains=chains,
        wallet_address=resolved_wallet_address,
    )
    apply_analytics_cache_headers(response)
    return result


@router.get("/{user_id}/dashboard")
async def get_dashboard_v2(
    response: Response,
    dashboard_service: DashboardServiceDep,
    user_id: UUID = Path(..., description="User ID"),
    metrics: str = Query(
        "trend,drawdown,rolling",
        description="Comma-delimited list of metrics to include",
    ),
    trend_days: int = Query(90, ge=1),
    drawdown_days: int = Query(90, ge=1),
    rolling_days: int = Query(
        90, ge=7, description="Days for rolling analytics (min 7)"
    ),
    wallet_address: str | None = Query(
        None,
        description="Optional wallet filter. When provided, returns data for specific wallet. Omit for bundle aggregation.",
        pattern=r"^0x[a-fA-F0-9]{40}$",
    ),
    wallet_address_camel: str | None = Query(
        None,
        alias="walletAddress",
        description="Optional wallet filter (camelCase alias).",
        pattern=r"^0x[a-fA-F0-9]{40}$",
    ),
    db: Session = Depends(get_db),
    wallet_service: WalletServiceProtocol = Depends(get_wallet_service),
) -> dict[str, Any]:
    """Return aggregated dashboard data with flexible metric selection."""

    # Validate wallet ownership if wallet_address provided
    validated_wallet = _resolve_wallet_address(
        wallet_address=wallet_address,
        wallet_address_camel=wallet_address_camel,
    )
    if validated_wallet and not wallet_service.verify_wallet_ownership(
        db, user_id, validated_wallet
    ):
        raise HTTPException(
            status_code=403,
            detail="Wallet address does not belong to the specified user",
        )

    requested_metrics = tuple(
        metric.strip().lower() for metric in metrics.split(",") if metric.strip()
    )
    allowed_metrics = set(dashboard_service.DEFAULT_METRICS)
    invalid = [metric for metric in requested_metrics if metric not in allowed_metrics]
    if invalid:
        raise HTTPException(status_code=422, detail={"invalid_metrics": invalid})

    time_ranges = DashboardTimeRanges(
        trend_days=trend_days,
        drawdown_days=drawdown_days,
        rolling_days=rolling_days,
    )
    result = await dashboard_service.get_portfolio_dashboard(
        user_id=user_id,
        wallet_address=validated_wallet,
        time_ranges=time_ranges,
        metrics=requested_metrics,
    )
    apply_analytics_cache_headers(response)
    return result
