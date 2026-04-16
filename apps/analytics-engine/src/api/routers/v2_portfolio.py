"""V2 portfolio endpoints built on canonical services."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Path, Response

from src.api.cache_headers import apply_analytics_cache_headers
from src.models.portfolio import PortfolioResponse
from src.services.dependencies import get_landing_page_service
from src.services.portfolio.landing_page_service import LandingPageService

router = APIRouter(prefix="/v2/portfolio", tags=["Portfolio V2"])


@router.get("/{user_id}/landing", response_model=PortfolioResponse)
def get_portfolio_landing_v2(
    response: Response,
    user_id: UUID = Path(..., description="User ID"),
    landing_service: LandingPageService = Depends(get_landing_page_service),
) -> PortfolioResponse:
    """Return the canonical landing page response (snapshot + ROI + pools)."""

    result = landing_service.get_landing_page_data(user_id)
    apply_analytics_cache_headers(response)
    return result
