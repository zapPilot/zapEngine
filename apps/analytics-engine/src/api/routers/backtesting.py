from fastapi import APIRouter, HTTPException

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
        return HTTPException(
            status_code=503,
            detail={
                "error_code": "MARKET_DATA_UNAVAILABLE",
                "message": str(error),
                "missing_assets": error.missing_assets,
                "oldest_data_date": error.oldest_data_date.isoformat()
                if error.oldest_data_date
                else None,
            },
        )
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
        "- If no `dca_classic` config is provided, the service auto-adds it as the baseline.\n\n"
        "Response shape:\n"
        "- BacktestResponse where `strategies` and `timeline[].strategies` are keyed by config_id."
    ),
)
async def compare_backtesting_configs_v3(
    request: BacktestCompareRequestV3,
    service: BacktestingServiceDep,
) -> BacktestResponse:
    try:
        return await service.run_compare_v3(request)
    except Exception as e:
        raise _build_backtest_http_error(e) from e


router.include_router(v3_router)
