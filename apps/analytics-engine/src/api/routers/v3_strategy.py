"""V3 strategy API router for the strategy/preset framework."""

from __future__ import annotations

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query

from src.models.strategy import DailySuggestionResponse
from src.models.strategy_config import (
    CreateSavedStrategyConfigRequest,
    SavedStrategyConfigListResponse,
    SavedStrategyConfigResponse,
    StrategyConfigsResponse,
    UpdateSavedStrategyConfigRequest,
)
from src.services.dependencies import (
    StrategyConfigManagementServiceDep,
    StrategyDailySuggestionServiceDep,
    get_strategy_config_store,
)
from src.services.strategy.strategy_bootstrap_service import (
    build_strategy_configs_response,
)
from src.services.strategy.strategy_config_management_service import (
    StrategyConfigConflictError,
    StrategyConfigNotFoundError,
)
from src.services.strategy.strategy_config_store import StrategyConfigStore

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v3/strategy", tags=["Strategy"])


@router.get(
    "/configs",
    response_model=StrategyConfigsResponse,
    summary="Get strategy catalog, public presets, and backtest defaults",
)
async def get_strategy_configs(
    strategy_config_store: StrategyConfigStore = Depends(get_strategy_config_store),
) -> StrategyConfigsResponse:
    try:
        return build_strategy_configs_response(strategy_config_store)
    except ValueError as error:
        logger.exception("Invalid public strategy bootstrap state: %s", error)
        raise HTTPException(status_code=500, detail=str(error)) from error


@router.get(
    "/admin/configs",
    response_model=SavedStrategyConfigListResponse,
    summary="List global saved strategy configs (admin, unauthenticated)",
    description=(
        "Administrative saved-config catalog. This endpoint is intentionally "
        "unauthenticated in the current implementation; writes are still blocked "
        "when DATABASE_READ_ONLY=true."
    ),
)
async def list_saved_strategy_configs(
    service: StrategyConfigManagementServiceDep,
) -> SavedStrategyConfigListResponse:
    return SavedStrategyConfigListResponse(configs=service.list_configs())


@router.get(
    "/admin/configs/{config_id}",
    response_model=SavedStrategyConfigResponse,
    summary="Get one global saved strategy config (admin, unauthenticated)",
)
async def get_saved_strategy_config(
    config_id: str,
    service: StrategyConfigManagementServiceDep,
) -> SavedStrategyConfigResponse:
    try:
        return SavedStrategyConfigResponse(config=service.get_config(config_id))
    except StrategyConfigNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@router.post(
    "/admin/configs",
    response_model=SavedStrategyConfigResponse,
    summary="Create a global saved strategy config (admin, unauthenticated)",
)
async def create_saved_strategy_config(
    request: CreateSavedStrategyConfigRequest,
    service: StrategyConfigManagementServiceDep,
) -> SavedStrategyConfigResponse:
    try:
        return SavedStrategyConfigResponse(config=service.create_config(request))
    except ValueError as error:
        logger.warning("Invalid saved strategy config create request: %s", error)
        raise HTTPException(status_code=400, detail=str(error)) from error
    except StrategyConfigConflictError as error:
        logger.warning("Conflict creating saved strategy config: %s", error)
        raise HTTPException(status_code=409, detail=str(error)) from error
    except Exception as error:
        logger.exception("Error creating saved strategy config")
        raise HTTPException(
            status_code=500,
            detail="Failed to create saved strategy config",
        ) from error


@router.put(
    "/admin/configs/{config_id}",
    response_model=SavedStrategyConfigResponse,
    summary="Update a global saved strategy config (admin, unauthenticated)",
)
async def update_saved_strategy_config(
    config_id: str,
    request: UpdateSavedStrategyConfigRequest,
    service: StrategyConfigManagementServiceDep,
) -> SavedStrategyConfigResponse:
    try:
        return SavedStrategyConfigResponse(
            config=service.update_config(config_id, request)
        )
    except StrategyConfigNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        logger.warning("Invalid saved strategy config update request: %s", error)
        raise HTTPException(status_code=400, detail=str(error)) from error
    except StrategyConfigConflictError as error:
        logger.warning(
            "Conflict updating saved strategy config %s: %s", config_id, error
        )
        raise HTTPException(status_code=409, detail=str(error)) from error
    except Exception as error:
        logger.exception("Error updating saved strategy config %s", config_id)
        raise HTTPException(
            status_code=500,
            detail="Failed to update saved strategy config",
        ) from error


@router.post(
    "/admin/configs/{config_id}/set-default",
    response_model=SavedStrategyConfigResponse,
    summary="Promote a global saved strategy config to default (admin, unauthenticated)",
)
async def set_default_saved_strategy_config(
    config_id: str,
    service: StrategyConfigManagementServiceDep,
) -> SavedStrategyConfigResponse:
    try:
        return SavedStrategyConfigResponse(config=service.set_default(config_id))
    except StrategyConfigNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except StrategyConfigConflictError as error:
        logger.warning(
            "Conflict promoting saved strategy config %s to default: %s",
            config_id,
            error,
        )
        raise HTTPException(status_code=409, detail=str(error)) from error
    except Exception as error:
        logger.exception(
            "Error promoting saved strategy config %s to default", config_id
        )
        raise HTTPException(
            status_code=500,
            detail="Failed to set default saved strategy config",
        ) from error


@router.get(
    "/daily-suggestion/{user_id}",
    response_model=DailySuggestionResponse,
    summary="Get daily DMA-first strategy suggestion",
)
async def get_daily_suggestion(
    user_id: UUID,
    service: StrategyDailySuggestionServiceDep,
    config_id: str | None = Query(
        default=None,
        description="Saved strategy preset id. If omitted, the backend default preset is used.",
    ),
) -> DailySuggestionResponse:
    try:
        return service.get_daily_suggestion(user_id=user_id, config_id=config_id)
    except ValueError as error:
        logger.warning("Validation error for user %s: %s", user_id, error)
        raise HTTPException(status_code=400, detail=str(error)) from error
    except Exception as error:
        logger.exception("Error getting daily suggestion for user %s", user_id)
        raise HTTPException(
            status_code=500,
            detail="Failed to generate daily suggestion",
        ) from error
