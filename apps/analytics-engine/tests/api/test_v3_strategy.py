"""Tests for the recipe-first strategy endpoints."""

from __future__ import annotations

from datetime import UTC, date, datetime
from typing import cast
from uuid import UUID

import pytest
from httpx import AsyncClient, Response

from src.config.strategy_presets import resolve_seed_strategy_config
from src.main import app
from src.models.backtesting import (
    Allocation,
    AssetAllocation,
    BacktestPeriodInfo,
    BacktestWindowInfo,
    MarketSnapshot,
    SignalState,
    TargetAllocation,
)
from src.models.strategy import (
    DailySuggestionActionState,
    DailySuggestionContextState,
    DailySuggestionModelState,
    DailySuggestionPortfolioState,
    DailySuggestionResponse,
    DailySuggestionStrategyContextState,
    DailySuggestionTargetState,
)
from src.services.backtesting.strategy_registry import list_strategy_recipes
from src.services.dependencies import (
    get_strategy_config_store,
    get_strategy_daily_suggestion_service,
)

DEFAULT_TEST_USER_ID = "12345678-1234-5678-1234-567812345678"


class MockSuggestionService:
    def __init__(
        self,
        response: DailySuggestionResponse | None = None,
        error: Exception | None = None,
    ) -> None:
        self.response = response
        self.error = error
        self.last_user_id: UUID | None = None
        self.last_config_id: str | None = None
        self.call_count = 0

    def get_daily_suggestion(
        self,
        user_id: UUID,
        config_id: str | None = None,
    ) -> DailySuggestionResponse:
        self.call_count += 1
        self.last_user_id = user_id
        self.last_config_id = config_id
        if self.error is not None:
            raise self.error
        assert self.response is not None
        return self.response


async def _request_daily_suggestion(
    *,
    client: AsyncClient,
    service: MockSuggestionService,
    user_id: str = DEFAULT_TEST_USER_ID,
    params: dict[str, str] | None = None,
) -> Response:
    app.dependency_overrides[get_strategy_daily_suggestion_service] = lambda: service
    try:
        return await client.get(
            f"/api/v3/strategy/daily-suggestion/{user_id}", params=params
        )
    finally:
        app.dependency_overrides.pop(get_strategy_daily_suggestion_service, None)


_MODEL_WINDOW = BacktestPeriodInfo(
    start_date=date(2025, 1, 1),
    end_date=date(2026, 5, 15),
    days=499,
)


def _daily_response() -> DailySuggestionResponse:
    return DailySuggestionResponse(
        as_of=datetime.now(UTC),
        config_id="dma_fgi_portfolio_rules_default",
        config_display_name="DMA/FGI Portfolio Rules",
        strategy_id="dma_fgi_portfolio_rules",
        spec_ref="reference/dma_fgi@1#a22bccfabb4b",
        action=DailySuggestionActionState(
            status="blocked",
            required=False,
            kind=None,
            reason_code="interval_wait",
            transfers=[],
        ),
        context=DailySuggestionContextState(
            market=MarketSnapshot(
                date=datetime.now(UTC).date(),
                token_price={"btc": 100_000.0},
                sentiment=72,
                sentiment_label="greed",
            ),
            portfolio=DailySuggestionPortfolioState(
                spot_usd=2_500.0,
                stable_usd=7_500.0,
                total_value=10_000.0,
                total_assets_usd=10_000.0,
                total_debt_usd=2_000.0,
                total_net_usd=8_000.0,
                allocation=Allocation(spot=0.25, stable=0.75),
                asset_allocation=AssetAllocation(
                    btc=0.25,
                    eth=0.0,
                    spy=0.0,
                    stable=0.75,
                    alt=0.0,
                ),
            ),
            signal=SignalState(
                id="dma_fgi_portfolio_rules_signal",
                regime="greed",
                raw_value=72.0,
                confidence=1.0,
                details={
                    "ath_event": "token_ath",
                    "dma": {
                        "dma_200": 95_000.0,
                        "distance": 0.05,
                        "zone": "above",
                        "cross_event": None,
                        "cooldown_active": False,
                        "cooldown_remaining_days": 0,
                        "cooldown_blocked_zone": None,
                        "fgi_slope": 0.2,
                    },
                },
            ),
            target=DailySuggestionTargetState(
                allocation=TargetAllocation(
                    btc=0.0,
                    eth=0.0,
                    spy=0.0,
                    stable=1.0,
                    alt=0.0,
                ),
            ),
            strategy=DailySuggestionStrategyContextState(
                stance="sell",
                reason_code="above_greed_sell",
                rule_group="dma_fgi",
                details={},
            ),
            model=DailySuggestionModelState(
                allocation=AssetAllocation(
                    btc=0.0,
                    eth=0.0,
                    spy=0.0,
                    stable=1.0,
                    alt=0.0,
                ),
                window=BacktestWindowInfo(
                    requested=_MODEL_WINDOW,
                    effective=_MODEL_WINDOW,
                ),
            ),
        ),
    )


@pytest.mark.asyncio
async def test_get_strategy_configs_returns_nested_recipe_presets(
    client: AsyncClient,
) -> None:
    response = await client.get("/api/v3/strategy/configs")
    assert response.status_code == 200
    body = cast(dict[str, object], response.json())
    strategies = cast(list[dict[str, object]], body["strategies"])
    presets = cast(list[dict[str, object]], body["presets"])
    portfolio_rules = cast(list[dict[str, object]], body["portfolio_rules"])
    strategy_ids = [cast(str, strategy["strategy_id"]) for strategy in strategies]
    expected_strategy_ids = [recipe.strategy_id for recipe in list_strategy_recipes()]
    assert strategy_ids == expected_strategy_ids
    assert "dma_gated_fgi_btc_asset_control" not in strategy_ids
    assert "dma_gated_fgi_eth_btc_control" not in strategy_ids
    assert {preset["config_id"] for preset in presets} == {
        "dma_fgi_portfolio_rules_default",
    }
    assert sum(bool(preset["is_default"]) for preset in presets) == 1
    default_preset = next(
        preset
        for preset in presets
        if preset["config_id"] == "dma_fgi_portfolio_rules_default"
    )
    assert default_preset["strategy_id"] == "dma_fgi_portfolio_rules"
    assert default_preset["is_default"] is True
    assert default_preset["spec_ref"] == "reference/dma_fgi"
    assert "params" not in default_preset
    for strategy in strategies:
        assert strategy["default_params"] == {}
        assert strategy["param_schema"] == {
            "type": "object",
            "properties": {},
            "additionalProperties": False,
        }
    # The rules the default config's spec lists, in precedence order: nothing the
    # spec does not name is addressable.
    assert [
        (rule["name"], rule["priority"], isinstance(rule["description"], str))
        for rule in portfolio_rules
    ] == [
        ("cross_down_exit", 10, True),
        ("cross_up_equal_weight", 20, True),
        ("eth_btc_ratio_rotation", 30, True),
        ("eth_btc_deviation_dca", 40, True),
        ("dma_overextension_dca_sell", 50, True),
        ("fgi_downshift_dca_sell", 60, True),
    ]
    assert body["backtest_defaults"] == {"days": 500, "total_capital": 10000}


class MockStrategyConfigStore:
    def __init__(self, configs) -> None:
        self._configs = list(configs)

    def list_configs(self):  # type: ignore[return]
        return list(self._configs)

    def resolve_config(self, config_id: str | None):  # type: ignore[return]
        if config_id is None or not str(config_id).strip():
            for config in self._configs:
                if config.is_default:
                    return config
            return resolve_seed_strategy_config(None)
        target = str(config_id).strip()
        for config in self._configs:
            if config.config_id == target:
                return config
        raise ValueError(f"Unknown config_id '{target}'")


def _override_strategy_config_store(store: MockStrategyConfigStore) -> None:
    app.dependency_overrides[get_strategy_config_store] = lambda: store


def _clear_strategy_config_store_override() -> None:
    app.dependency_overrides.pop(get_strategy_config_store, None)


@pytest.mark.asyncio
async def test_get_strategy_configs_returns_500_for_corrupted_multi_default_state(
    client: AsyncClient,
) -> None:
    corrupted_configs = [
        resolve_seed_strategy_config("dma_fgi_portfolio_rules_default").model_copy(
            update={"config_id": "portfolio_rules_a", "is_default": True},
            deep=True,
        ),
        resolve_seed_strategy_config("dma_fgi_portfolio_rules_default").model_copy(
            update={"config_id": "portfolio_rules_b", "is_default": True},
            deep=True,
        ),
    ]
    _override_strategy_config_store(MockStrategyConfigStore(corrupted_configs))
    try:
        response = await client.get("/api/v3/strategy/configs")
    finally:
        _clear_strategy_config_store_override()

    assert response.status_code == 500
    assert "multiple defaults" in response.json()["detail"]


@pytest.mark.asyncio
async def test_get_strategy_configs_ignores_orphaned_saved_configs(
    client: AsyncClient,
) -> None:
    public_configs = [
        resolve_seed_strategy_config("dma_fgi_portfolio_rules_default"),
        resolve_seed_strategy_config("dma_fgi_portfolio_rules_default").model_copy(
            update={
                "config_id": "legacy_deleted_strategy_default",
                "strategy_id": "legacy_deleted_strategy",
                "is_default": True,
            },
            deep=True,
        ),
    ]
    _override_strategy_config_store(MockStrategyConfigStore(public_configs))
    try:
        response = await client.get("/api/v3/strategy/configs")
    finally:
        _clear_strategy_config_store_override()

    assert response.status_code == 200
    presets = cast(list[dict[str, object]], response.json()["presets"])
    assert [preset["config_id"] for preset in presets] == [
        "dma_fgi_portfolio_rules_default"
    ]


@pytest.mark.asyncio
async def test_get_strategy_configs_restores_effective_default_when_none_are_flagged(
    client: AsyncClient,
) -> None:
    effective_default = resolve_seed_strategy_config("dma_fgi_portfolio_rules_default")
    public_configs = [
        effective_default.model_copy(update={"is_default": False}, deep=True),
    ]
    store = MockStrategyConfigStore(public_configs)
    store.resolve_config = lambda config_id=None: effective_default  # type: ignore[method-assign]
    _override_strategy_config_store(store)
    try:
        response = await client.get("/api/v3/strategy/configs")
    finally:
        _clear_strategy_config_store_override()

    assert response.status_code == 200
    presets = cast(list[dict[str, object]], response.json()["presets"])
    assert sum(bool(preset["is_default"]) for preset in presets) == 1
    assert next(preset for preset in presets if preset["is_default"])["config_id"] == (
        "dma_fgi_portfolio_rules_default"
    )


@pytest.mark.asyncio
async def test_get_daily_suggestion_returns_shared_snapshot_shape(
    client: AsyncClient,
) -> None:
    service = MockSuggestionService(response=_daily_response())
    response = await _request_daily_suggestion(
        client=client,
        service=service,
        params={"config_id": "dma_fgi_portfolio_rules_default"},
    )

    assert response.status_code == 200
    assert service.call_count == 1
    assert service.last_user_id == UUID(DEFAULT_TEST_USER_ID)
    assert service.last_config_id == "dma_fgi_portfolio_rules_default"

    parsed = DailySuggestionResponse.model_validate(response.json())
    assert parsed.strategy_id == "dma_fgi_portfolio_rules"
    assert parsed.spec_ref == "reference/dma_fgi@1#a22bccfabb4b"
    assert parsed.config_display_name == "DMA/FGI Portfolio Rules"
    assert parsed.context.signal.id == "dma_fgi_portfolio_rules_signal"
    assert parsed.context.signal.details["ath_event"] == "token_ath"
    assert parsed.context.strategy.reason_code == "above_greed_sell"
    assert parsed.context.target.allocation.stable == pytest.approx(1.0)
    assert parsed.context.portfolio.total_value == pytest.approx(10_000.0)
    assert parsed.context.portfolio.total_assets_usd == pytest.approx(10_000.0)
    assert parsed.context.portfolio.total_debt_usd == pytest.approx(2_000.0)
    assert parsed.context.portfolio.total_net_usd == pytest.approx(8_000.0)
    assert parsed.action.status == "blocked"
    assert parsed.action.required is False
    assert parsed.action.kind is None
    assert parsed.action.reason_code == "interval_wait"
    assert parsed.context.model.allocation.stable == pytest.approx(1.0)
    assert parsed.context.model.window.requested.days == 499
    body = cast(dict[str, object], response.json())
    assert "decision" not in body
    assert "user_action" not in body
    assert "execution" not in body


@pytest.mark.asyncio
async def test_get_daily_suggestion_maps_value_error_to_400(
    client: AsyncClient,
) -> None:
    service = MockSuggestionService(
        error=ValueError("Unknown config_id 'optimized_default'")
    )
    response = await _request_daily_suggestion(client=client, service=service)
    assert response.status_code == 400
    assert "Unknown config_id" in response.json()["detail"]


@pytest.mark.asyncio
async def test_get_daily_suggestion_maps_internal_error_to_500(
    client: AsyncClient,
) -> None:
    service = MockSuggestionService(error=RuntimeError("boom"))
    response = await _request_daily_suggestion(client=client, service=service)
    assert response.status_code == 500
    assert response.json()["detail"] == "Failed to generate daily suggestion"


# ---------------------------------------------------------------------------
# Mock management service helper
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# get_saved_strategy_config – 404 branch (lines 80-81)
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# create_saved_strategy_config – 400 (lines 96-97) and 500 (lines 101-103)
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# update_saved_strategy_config – 404 (line 124), 400 (126-127), 500 (133-135)
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# set_default_saved_strategy_config – 404 (line 153), 500 (lines 161-165)
# ---------------------------------------------------------------------------
