"""V3 strategy API router for the strategy/preset framework."""

from __future__ import annotations

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query

from src.api.routers._errors import market_data_unavailable_http_exception
from src.models.strategy import DailySuggestionResponse
from src.models.strategy_config import StrategyConfigsResponse
from src.services.dependencies import (
    StrategyDailySuggestionServiceDep,
    get_strategy_config_store,
)
from src.services.exceptions import MarketDataUnavailableError
from src.services.strategy.strategy_bootstrap_service import (
    build_strategy_configs_response,
)
from src.services.strategy.strategy_config_store import StrategyConfigStore

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v3/strategy", tags=["Strategy"])


@router.get(
    "/configs",
    response_model=StrategyConfigsResponse,
    summary="Get strategy catalog, public presets, and backtest defaults",
)
def get_strategy_configs(
    strategy_config_store: StrategyConfigStore = Depends(get_strategy_config_store),
) -> StrategyConfigsResponse:
    try:
        return build_strategy_configs_response(strategy_config_store)
    except ValueError as error:
        logger.exception("Invalid public strategy bootstrap state: %s", error)
        raise HTTPException(status_code=500, detail=str(error)) from error


@router.get(
    "/daily-suggestion/{user_id}",
    response_model=DailySuggestionResponse,
    summary="Get daily DMA-first strategy suggestion",
)
def get_daily_suggestion(
    user_id: UUID,
    service: StrategyDailySuggestionServiceDep,
    config_id: str | None = Query(
        default=None,
        description="Saved strategy preset id. If omitted, the backend default preset is used.",
    ),
) -> DailySuggestionResponse:
    try:
        return service.get_daily_suggestion(user_id=user_id, config_id=config_id)
    except MarketDataUnavailableError as error:
        logger.warning("Market data unavailable for user %s: %s", user_id, error)
        raise market_data_unavailable_http_exception(error) from error
    except ValueError as error:
        # Unknown config ids are caller errors even when the service test seam
        # raises them without the original query param. Unsupported presets are
        # caller errors only when the caller explicitly selected one. Everything
        # else is an internal strategy/data/serialization failure and must be 500.
        detail = str(error)
        is_config_request_error = detail.startswith("Unknown config_id ") or (
            config_id is not None and "does not support /daily-suggestion" in detail
        )
        if is_config_request_error:
            logger.warning(
                "Invalid daily suggestion config for user %s: %s", user_id, error
            )
            raise HTTPException(status_code=400, detail=detail) from error
        logger.exception("Internal daily suggestion ValueError for user %s", user_id)
        raise HTTPException(
            status_code=500,
            detail="Failed to generate daily suggestion",
        ) from error
    except Exception as error:
        logger.exception("Error getting daily suggestion for user %s", user_id)
        raise HTTPException(
            status_code=500,
            detail="Failed to generate daily suggestion",
        ) from error
