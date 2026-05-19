from fastapi import APIRouter, HTTPException, Query

from src.api.routers._errors import market_data_unavailable_http_exception
from src.models.backtesting import (
    BacktestCompareRequestV3,
    BacktestResponse,
    BacktestStrategyCatalogResponseV3,
)
from src.services.dependencies import BacktestingServiceDep
from src.services.exceptions import MarketDataUnavailableError
from src.services.strategy.strategy_bootstrap_service import (
    build_strategy_catalog_response,
)

router = APIRouter(tags=["Backtesting"])
v3_router = APIRouter(prefix="/v3/backtesting", tags=["Backtesting"])


def _build_backtest_http_error(error: Exception) -> HTTPException:
    """Map backtesting execution errors to HTTPException responses."""
    if isinstance(error, MarketDataUnavailableError):
        return market_data_unavailable_http_exception(error)
    if isinstance(error, ValueError):
        return HTTPException(status_code=400, detail=str(error))
    return HTTPException(
        status_code=500,
        detail=f"Backtest execution failed: {error}",
    )


@v3_router.get(
    "/strategies",
    response_model=BacktestStrategyCatalogResponseV3,
    summary="Backtesting Strategy Catalog (v3)",
    description=(
        "Deprecated compatibility endpoint. Returns the same strategy family "
        "catalog exposed at `/api/v3/strategy/configs.strategies`, including "
        "param schemas and curated default params."
    ),
)
async def list_backtesting_strategies_v3() -> BacktestStrategyCatalogResponseV3:
    return build_strategy_catalog_response()


@v3_router.post(
    "/compare",
    response_model=BacktestResponse,
    summary="Compare Multiple Backtesting Configurations (v3)",
    description=(
        "Runs a historical backtest for multiple client-provided configs.\n\n"
        "Request shape:\n"
        "- globals: token_symbol, start_date/end_date/days, total_capital\n"
        "- configs: [{config_id, saved_config_id?} | {config_id, strategy_id, params}, ...]\n\n"
        "Behavior:\n"
        "- Canonical path is `saved_config_id`; legacy `strategy_id + params` remains supported as an adapter.\n"
        "- The service compares exactly the configs provided in the request.\n\n"
        "Response shape:\n"
        "- BacktestResponse where `strategies` and `timeline[].strategies` are keyed by config_id."
    ),
)
async def compare_backtesting_configs_v3(
    request: BacktestCompareRequestV3,
    service: BacktestingServiceDep,
    emit_decision_log: bool = Query(
        default=False,
        description="Write a compact decisions.jsonl artifact and return its path.",
    ),
) -> BacktestResponse:
    try:
        if emit_decision_log:
            request = request.model_copy(update={"emit_decision_log": True})
        return await service.run_compare_v3(request)
    except Exception as e:
        raise _build_backtest_http_error(e) from e


router.include_router(v3_router)
