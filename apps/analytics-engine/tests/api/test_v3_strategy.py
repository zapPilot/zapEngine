"""Tests for the recipe-first strategy endpoints."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import cast
from uuid import UUID

import pytest
from httpx import AsyncClient, Response
from sqlalchemy import text
from sqlalchemy.orm import Session

from src.config.strategy_presets import resolve_seed_strategy_config
from src.main import app
from src.models.backtesting import (
    Allocation,
    AssetAllocation,
    MarketSnapshot,
    SignalState,
)
from src.models.strategy import (
    DailySuggestionActionState,
    DailySuggestionContextState,
    DailySuggestionPortfolioState,
    DailySuggestionResponse,
    DailySuggestionStrategyContextState,
    DailySuggestionTargetState,
)
from src.services.dependencies import (
    get_strategy_config_management_service,
    get_strategy_config_store,
    get_strategy_daily_suggestion_service,
)
from src.services.strategy.strategy_config_management_service import (
    StrategyConfigNotFoundError,
)
from src.services.strategy.strategy_config_store import StrategyConfigStore

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


def _ensure_strategy_saved_configs_table(session: Session) -> None:
    session.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS strategy_saved_configs (
                config_id TEXT PRIMARY KEY,
                display_name TEXT NOT NULL,
                description TEXT,
                strategy_id TEXT NOT NULL,
                primary_asset TEXT NOT NULL,
                params TEXT NOT NULL,
                composition TEXT NOT NULL,
                supports_daily_suggestion BOOLEAN NOT NULL,
                is_default BOOLEAN NOT NULL,
                is_benchmark BOOLEAN NOT NULL,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
    )
    session.execute(
        text(
            """
            CREATE UNIQUE INDEX IF NOT EXISTS strategy_saved_configs_single_default_idx
            ON strategy_saved_configs (is_default)
            WHERE is_default
            """
        )
    )
    session.commit()


def _daily_response() -> DailySuggestionResponse:
    return DailySuggestionResponse(
        as_of=datetime.now(UTC),
        config_id="dma_gated_fgi_default",
        config_display_name="DMA Gated FGI Default",
        strategy_id="dma_gated_fgi",
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
                    stable=0.75,
                    alt=0.0,
                ),
            ),
            signal=SignalState(
                id="dma_gated_fgi",
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
                allocation=Allocation(spot=0.0, stable=1.0),
                asset_allocation=AssetAllocation(
                    btc=0.0,
                    eth=0.0,
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
        ),
    )


def _dma_public_params(
    *,
    cross_cooldown_days: int = 30,
    cross_on_touch: bool = True,
) -> dict[str, object]:
    return {
        "signal": {
            "cross_cooldown_days": cross_cooldown_days,
            "cross_on_touch": cross_on_touch,
        }
    }


@pytest.mark.asyncio
async def test_get_strategy_configs_returns_nested_recipe_presets(
    client: AsyncClient,
) -> None:
    response = await client.get("/api/v3/strategy/configs")
    assert response.status_code == 200
    body = cast(dict[str, object], response.json())
    strategies = cast(list[dict[str, object]], body["strategies"])
    presets = cast(list[dict[str, object]], body["presets"])
    assert [strategy["strategy_id"] for strategy in strategies] == [
        "dca_classic",
        "dma_gated_fgi",
        "eth_btc_rotation",
        "spy_eth_btc_rotation",
    ]
    assert {preset["config_id"] for preset in presets} == {
        "dma_gated_fgi_default",
        "eth_btc_rotation_default",
        "spy_eth_btc_rotation_default",
    }
    assert sum(bool(preset["is_default"]) for preset in presets) == 1
    dma_preset = next(
        preset for preset in presets if preset["config_id"] == "dma_gated_fgi_default"
    )
    rotation_preset = next(
        preset
        for preset in presets
        if preset["config_id"] == "eth_btc_rotation_default"
    )
    assert rotation_preset["strategy_id"] == "eth_btc_rotation"
    assert rotation_preset["is_default"] is True
    assert cast(dict[str, object], dma_preset["params"])["signal"] == {
        "cross_cooldown_days": 30,
        "cross_on_touch": True,
    }
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
async def test_get_strategy_configs_surfaces_only_one_default_after_db_override(
    client: AsyncClient,
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _ensure_strategy_saved_configs_table(db_session)
    monkeypatch.setattr(
        "src.services.strategy.strategy_config_store.validate_write_operation",
        lambda: None,
    )
    store = StrategyConfigStore(db_session)
    store.upsert_configs(
        [
            resolve_seed_strategy_config("eth_btc_rotation_default").model_copy(
                update={"is_default": False},
                deep=True,
            ),
            resolve_seed_strategy_config("dma_gated_fgi_default").model_copy(
                update={"is_default": True},
                deep=True,
            ),
        ]
    )

    response = await client.get("/api/v3/strategy/configs")

    assert response.status_code == 200
    presets = cast(list[dict[str, object]], response.json()["presets"])
    assert sum(bool(preset["is_default"]) for preset in presets) == 1
    assert next(preset for preset in presets if preset["is_default"])["config_id"] == (
        "dma_gated_fgi_default"
    )


@pytest.mark.asyncio
async def test_get_strategy_configs_returns_500_for_corrupted_multi_default_state(
    client: AsyncClient,
) -> None:
    corrupted_configs = [
        resolve_seed_strategy_config("dma_gated_fgi_default").model_copy(
            update={"is_default": True},
            deep=True,
        ),
        resolve_seed_strategy_config("eth_btc_rotation_default").model_copy(
            update={"is_default": True},
            deep=True,
        ),
        resolve_seed_strategy_config("dca_classic"),
    ]
    _override_strategy_config_store(MockStrategyConfigStore(corrupted_configs))
    try:
        response = await client.get("/api/v3/strategy/configs")
    finally:
        _clear_strategy_config_store_override()

    assert response.status_code == 500
    assert "multiple defaults" in response.json()["detail"]


@pytest.mark.asyncio
async def test_get_strategy_configs_restores_effective_default_when_none_are_flagged(
    client: AsyncClient,
) -> None:
    effective_default = resolve_seed_strategy_config("eth_btc_rotation_default")
    public_configs = [
        resolve_seed_strategy_config("dma_gated_fgi_default").model_copy(
            update={"is_default": False},
            deep=True,
        ),
        effective_default.model_copy(update={"is_default": False}, deep=True),
        resolve_seed_strategy_config("dca_classic"),
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
        "eth_btc_rotation_default"
    )


@pytest.mark.asyncio
async def test_admin_strategy_configs_return_full_saved_config_payload(
    client: AsyncClient,
) -> None:
    response = await client.get("/api/v3/strategy/admin/configs")

    assert response.status_code == 200
    body = cast(dict[str, object], response.json())
    configs = cast(list[dict[str, object]], body["configs"])
    assert {config["config_id"] for config in configs} == {
        "dma_gated_fgi_default",
        "eth_btc_rotation_default",
        "spy_eth_btc_rotation_default",
        "dca_classic",
    }
    rotation_config = next(
        config
        for config in configs
        if config["config_id"] == "eth_btc_rotation_default"
    )
    assert cast(dict[str, object], rotation_config["composition"])["kind"] == "composed"
    assert cast(dict[str, object], rotation_config["composition"])["signal"] == {
        "component_id": "eth_btc_rs_signal",
        "params": {
            "cross_cooldown_days": 30,
            "cross_on_touch": True,
            "ratio_cross_cooldown_days": 30,
            "rotation_neutral_band": 0.05,
            "rotation_max_deviation": 0.2,
        },
    }


@pytest.mark.asyncio
async def test_admin_strategy_config_detail_returns_full_composition_payload(
    client: AsyncClient,
) -> None:
    response = await client.get("/api/v3/strategy/admin/configs/dma_gated_fgi_default")

    assert response.status_code == 200
    body = cast(dict[str, object], response.json())
    config = cast(dict[str, object], body["config"])
    assert config["config_id"] == "dma_gated_fgi_default"
    assert cast(dict[str, object], config["composition"])["execution_profile"] == {
        "component_id": "two_bucket_rebalance",
        "params": {},
    }


@pytest.mark.asyncio
async def test_get_daily_suggestion_returns_shared_snapshot_shape(
    client: AsyncClient,
) -> None:
    service = MockSuggestionService(response=_daily_response())
    response = await _request_daily_suggestion(
        client=client,
        service=service,
        params={"config_id": "dma_gated_fgi_default"},
    )

    assert response.status_code == 200
    assert service.call_count == 1
    assert service.last_user_id == UUID(DEFAULT_TEST_USER_ID)
    assert service.last_config_id == "dma_gated_fgi_default"

    parsed = DailySuggestionResponse.model_validate(response.json())
    assert parsed.strategy_id == "dma_gated_fgi"
    assert parsed.config_display_name == "DMA Gated FGI Default"
    assert parsed.context.signal.id == "dma_gated_fgi"
    assert parsed.context.signal.details["ath_event"] == "token_ath"
    assert parsed.context.strategy.reason_code == "above_greed_sell"
    assert parsed.context.target.asset_allocation.stable == pytest.approx(1.0)
    assert parsed.context.portfolio.total_value == pytest.approx(10_000.0)
    assert parsed.context.portfolio.total_assets_usd == pytest.approx(10_000.0)
    assert parsed.context.portfolio.total_debt_usd == pytest.approx(2_000.0)
    assert parsed.context.portfolio.total_net_usd == pytest.approx(8_000.0)
    assert parsed.action.status == "blocked"
    assert parsed.action.required is False
    assert parsed.action.kind is None
    assert parsed.action.reason_code == "interval_wait"
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


@pytest.mark.asyncio
async def test_admin_create_saved_config_surfaces_in_public_presets(
    client: AsyncClient,
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _ensure_strategy_saved_configs_table(db_session)
    monkeypatch.setattr(
        "src.services.strategy.strategy_config_store.validate_write_operation",
        lambda: None,
    )
    response = await client.post(
        "/api/v3/strategy/admin/configs",
        json={
            "config_id": "dma_custom",
            "display_name": "DMA Custom",
            "description": "Custom live config",
            "strategy_id": "dma_gated_fgi",
            "primary_asset": "BTC",
            "params": _dma_public_params(cross_cooldown_days=12),
            "composition": {
                "kind": "composed",
                "bucket_mapper_id": "two_bucket_spot_stable",
                "signal": {
                    "component_id": "dma_gated_fgi_signal",
                    "params": {
                        "cross_cooldown_days": 12,
                        "cross_on_touch": True,
                    },
                },
                "decision_policy": {
                    "component_id": "dma_fgi_policy",
                    "params": {},
                },
                "pacing_policy": {
                    "component_id": "fgi_exponential",
                    "params": {"k": 5.0, "r_max": 1.0},
                },
                "execution_profile": {
                    "component_id": "two_bucket_rebalance",
                    "params": {},
                },
                "plugins": [
                    {
                        "component_id": "dma_buy_gate",
                        "params": {
                            "window_days": 5,
                            "sideways_max_range": 0.04,
                            "leg_caps": [0.05, 0.1, 0.2],
                        },
                    }
                ],
            },
            "supports_daily_suggestion": True,
        },
    )

    assert response.status_code == 200
    created = cast(dict[str, object], response.json()["config"])
    assert created["config_id"] == "dma_custom"
    presets_response = await client.get("/api/v3/strategy/configs")
    presets = cast(list[dict[str, object]], presets_response.json()["presets"])
    assert {preset["config_id"] for preset in presets} == {
        "eth_btc_rotation_default",
        "spy_eth_btc_rotation_default",
        "dma_custom",
        "dma_gated_fgi_default",
    }


@pytest.mark.asyncio
async def test_admin_update_saved_config_returns_updated_payload(
    client: AsyncClient,
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _ensure_strategy_saved_configs_table(db_session)
    monkeypatch.setattr(
        "src.services.strategy.strategy_config_store.validate_write_operation",
        lambda: None,
    )
    StrategyConfigStore(db_session).upsert_config(
        resolve_seed_strategy_config("dma_gated_fgi_default").model_copy(
            update={
                "config_id": "dma_custom",
                "display_name": "DMA Custom",
                "description": "Original",
                "is_default": False,
            },
            deep=True,
        )
    )

    response = await client.put(
        "/api/v3/strategy/admin/configs/dma_custom",
        json={
            "display_name": "DMA Custom Updated",
            "description": "Updated live config",
            "strategy_id": "dma_gated_fgi",
            "primary_asset": "BTC",
            "params": _dma_public_params(
                cross_cooldown_days=9,
                cross_on_touch=False,
            ),
            "composition": {
                "kind": "composed",
                "bucket_mapper_id": "two_bucket_spot_stable",
                "signal": {
                    "component_id": "dma_gated_fgi_signal",
                    "params": {
                        "cross_cooldown_days": 9,
                        "cross_on_touch": False,
                    },
                },
                "decision_policy": {
                    "component_id": "dma_fgi_policy",
                    "params": {},
                },
                "pacing_policy": {
                    "component_id": "fgi_exponential",
                    "params": {"k": 4.0, "r_max": 1.2},
                },
                "execution_profile": {
                    "component_id": "two_bucket_rebalance",
                    "params": {},
                },
                "plugins": [],
            },
            "supports_daily_suggestion": True,
        },
    )

    assert response.status_code == 200
    config = cast(dict[str, object], response.json()["config"])
    assert config["display_name"] == "DMA Custom Updated"
    assert cast(dict[str, object], config["params"])["signal"] == {
        "cross_cooldown_days": 9,
        "cross_on_touch": False,
    }
    assert cast(dict[str, object], config["composition"])["signal"] == {
        "component_id": "dma_gated_fgi_signal",
        "params": {"cross_cooldown_days": 9, "cross_on_touch": False},
    }


@pytest.mark.asyncio
async def test_admin_set_default_promotes_saved_config(
    client: AsyncClient,
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _ensure_strategy_saved_configs_table(db_session)
    monkeypatch.setattr(
        "src.services.strategy.strategy_config_store.validate_write_operation",
        lambda: None,
    )
    StrategyConfigStore(db_session).upsert_config(
        resolve_seed_strategy_config("dma_gated_fgi_default").model_copy(
            update={
                "config_id": "dma_custom",
                "display_name": "DMA Custom",
                "description": "Original",
                "is_default": False,
            },
            deep=True,
        )
    )

    response = await client.post(
        "/api/v3/strategy/admin/configs/dma_custom/set-default"
    )

    assert response.status_code == 200
    config = cast(dict[str, object], response.json()["config"])
    assert config["config_id"] == "dma_custom"
    assert config["is_default"] is True


@pytest.mark.asyncio
async def test_admin_update_benchmark_config_is_rejected(
    client: AsyncClient,
) -> None:
    response = await client.put(
        "/api/v3/strategy/admin/configs/dca_classic",
        json={
            "display_name": "Classic DCA Updated",
            "description": "Nope",
            "strategy_id": "dca_classic",
            "primary_asset": "BTC",
            "params": {},
            "composition": {
                "kind": "benchmark",
                "bucket_mapper_id": "two_bucket_spot_stable",
                "plugins": [],
            },
            "supports_daily_suggestion": False,
        },
    )

    assert response.status_code == 409
    assert "read-only" in response.json()["detail"]


@pytest.mark.asyncio
async def test_admin_set_default_benchmark_config_is_rejected(
    client: AsyncClient,
) -> None:
    response = await client.post(
        "/api/v3/strategy/admin/configs/dca_classic/set-default"
    )

    assert response.status_code == 409
    assert "read-only" in response.json()["detail"]


@pytest.mark.asyncio
async def test_admin_write_returns_409_when_store_is_read_only(
    client: AsyncClient,
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _ensure_strategy_saved_configs_table(db_session)
    monkeypatch.setattr(
        "src.services.strategy.strategy_config_store.validate_write_operation",
        lambda: (_ for _ in ()).throw(
            RuntimeError(
                "Write operations are disabled while the database is in read-only mode."
            )
        ),
    )

    response = await client.post(
        "/api/v3/strategy/admin/configs",
        json={
            "config_id": "dma_custom",
            "display_name": "DMA Custom",
            "description": "Custom live config",
            "strategy_id": "dma_gated_fgi",
            "primary_asset": "BTC",
            "params": _dma_public_params(cross_cooldown_days=12),
            "composition": {
                "kind": "composed",
                "bucket_mapper_id": "two_bucket_spot_stable",
                "signal": {"component_id": "dma_gated_fgi_signal", "params": {}},
                "decision_policy": {
                    "component_id": "dma_fgi_policy",
                    "params": {},
                },
                "pacing_policy": {
                    "component_id": "fgi_exponential",
                    "params": {},
                },
                "execution_profile": {
                    "component_id": "two_bucket_rebalance",
                    "params": {},
                },
                "plugins": [],
            },
            "supports_daily_suggestion": True,
        },
    )

    assert response.status_code == 409
    assert "read-only mode" in response.json()["detail"]


@pytest.mark.asyncio
async def test_admin_write_returns_409_when_strategy_config_table_missing(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        "src.services.strategy.strategy_config_store.validate_write_operation",
        lambda: None,
    )
    response = await client.post(
        "/api/v3/strategy/admin/configs",
        json={
            "config_id": "dma_custom",
            "display_name": "DMA Custom",
            "description": "Custom live config",
            "strategy_id": "dma_gated_fgi",
            "primary_asset": "BTC",
            "params": _dma_public_params(cross_cooldown_days=12),
            "composition": {
                "kind": "composed",
                "bucket_mapper_id": "two_bucket_spot_stable",
                "signal": {"component_id": "dma_gated_fgi_signal", "params": {}},
                "decision_policy": {
                    "component_id": "dma_fgi_policy",
                    "params": {},
                },
                "pacing_policy": {
                    "component_id": "fgi_exponential",
                    "params": {},
                },
                "execution_profile": {
                    "component_id": "two_bucket_rebalance",
                    "params": {},
                },
                "plugins": [],
            },
            "supports_daily_suggestion": True,
        },
    )

    assert response.status_code == 409
    assert "table is not available" in response.json()["detail"]


# ---------------------------------------------------------------------------
# Mock management service helper
# ---------------------------------------------------------------------------


class MockManagementService:
    """Stub for StrategyConfigManagementService that raises on demand."""

    def __init__(
        self,
        get_error: Exception | None = None,
        create_error: Exception | None = None,
        update_error: Exception | None = None,
        set_default_error: Exception | None = None,
    ) -> None:
        self.get_error = get_error
        self.create_error = create_error
        self.update_error = update_error
        self.set_default_error = set_default_error

    def list_configs(self):  # type: ignore[return]
        return []

    def get_config(self, config_id: str):  # type: ignore[return]
        if self.get_error is not None:
            raise self.get_error

    def create_config(self, request):  # type: ignore[return]
        if self.create_error is not None:
            raise self.create_error

    def update_config(self, config_id: str, request):  # type: ignore[return]
        if self.update_error is not None:
            raise self.update_error

    def set_default(self, config_id: str):  # type: ignore[return]
        if self.set_default_error is not None:
            raise self.set_default_error


def _override_management_service(service: MockManagementService) -> None:
    app.dependency_overrides[get_strategy_config_management_service] = lambda: service


def _clear_management_service_override() -> None:
    app.dependency_overrides.pop(get_strategy_config_management_service, None)


# ---------------------------------------------------------------------------
# get_saved_strategy_config – 404 branch (lines 80-81)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_saved_strategy_config_returns_404_when_not_found(
    client: AsyncClient,
) -> None:
    service = MockManagementService(
        get_error=StrategyConfigNotFoundError("Unknown config_id 'missing'")
    )
    _override_management_service(service)
    try:
        response = await client.get("/api/v3/strategy/admin/configs/missing")
    finally:
        _clear_management_service_override()

    assert response.status_code == 404
    assert "Unknown config_id" in response.json()["detail"]


# ---------------------------------------------------------------------------
# create_saved_strategy_config – 400 (lines 96-97) and 500 (lines 101-103)
# ---------------------------------------------------------------------------

_MINIMAL_CREATE_PAYLOAD = {
    "config_id": "dma_test",
    "display_name": "DMA Test",
    "description": "Test",
    "strategy_id": "dma_gated_fgi",
    "primary_asset": "BTC",
    "params": {},
    "composition": {
        "kind": "composed",
        "bucket_mapper_id": "two_bucket_spot_stable",
        "signal": {"component_id": "dma_gated_fgi_signal", "params": {}},
        "decision_policy": {"component_id": "dma_fgi_policy", "params": {}},
        "pacing_policy": {"component_id": "fgi_exponential", "params": {}},
        "execution_profile": {"component_id": "two_bucket_rebalance", "params": {}},
        "plugins": [],
    },
    "supports_daily_suggestion": True,
}


@pytest.mark.asyncio
async def test_create_saved_strategy_config_returns_400_on_value_error(
    client: AsyncClient,
) -> None:
    service = MockManagementService(create_error=ValueError("bad field value"))
    _override_management_service(service)
    try:
        response = await client.post(
            "/api/v3/strategy/admin/configs", json=_MINIMAL_CREATE_PAYLOAD
        )
    finally:
        _clear_management_service_override()

    assert response.status_code == 400
    assert "bad field value" in response.json()["detail"]


@pytest.mark.asyncio
async def test_create_saved_strategy_config_returns_500_on_unexpected_error(
    client: AsyncClient,
) -> None:
    service = MockManagementService(create_error=RuntimeError("unexpected boom"))
    _override_management_service(service)
    try:
        response = await client.post(
            "/api/v3/strategy/admin/configs", json=_MINIMAL_CREATE_PAYLOAD
        )
    finally:
        _clear_management_service_override()

    assert response.status_code == 500
    assert response.json()["detail"] == "Failed to create saved strategy config"


# ---------------------------------------------------------------------------
# update_saved_strategy_config – 404 (line 124), 400 (126-127), 500 (133-135)
# ---------------------------------------------------------------------------

_MINIMAL_UPDATE_PAYLOAD = {
    "display_name": "Updated",
    "description": "Updated desc",
    "strategy_id": "dma_gated_fgi",
    "primary_asset": "BTC",
    "params": {},
    "composition": {
        "kind": "composed",
        "bucket_mapper_id": "two_bucket_spot_stable",
        "signal": {"component_id": "dma_gated_fgi_signal", "params": {}},
        "decision_policy": {"component_id": "dma_fgi_policy", "params": {}},
        "pacing_policy": {"component_id": "fgi_exponential", "params": {}},
        "execution_profile": {"component_id": "two_bucket_rebalance", "params": {}},
        "plugins": [],
    },
    "supports_daily_suggestion": True,
}


@pytest.mark.asyncio
async def test_update_saved_strategy_config_returns_404_when_not_found(
    client: AsyncClient,
) -> None:
    service = MockManagementService(
        update_error=StrategyConfigNotFoundError("Unknown config_id 'ghost'")
    )
    _override_management_service(service)
    try:
        response = await client.put(
            "/api/v3/strategy/admin/configs/ghost", json=_MINIMAL_UPDATE_PAYLOAD
        )
    finally:
        _clear_management_service_override()

    assert response.status_code == 404
    assert "Unknown config_id" in response.json()["detail"]


@pytest.mark.asyncio
async def test_update_saved_strategy_config_returns_400_on_value_error(
    client: AsyncClient,
) -> None:
    service = MockManagementService(update_error=ValueError("invalid param"))
    _override_management_service(service)
    try:
        response = await client.put(
            "/api/v3/strategy/admin/configs/any", json=_MINIMAL_UPDATE_PAYLOAD
        )
    finally:
        _clear_management_service_override()

    assert response.status_code == 400
    assert "invalid param" in response.json()["detail"]


@pytest.mark.asyncio
async def test_update_saved_strategy_config_returns_500_on_unexpected_error(
    client: AsyncClient,
) -> None:
    service = MockManagementService(update_error=RuntimeError("db exploded"))
    _override_management_service(service)
    try:
        response = await client.put(
            "/api/v3/strategy/admin/configs/any", json=_MINIMAL_UPDATE_PAYLOAD
        )
    finally:
        _clear_management_service_override()

    assert response.status_code == 500
    assert response.json()["detail"] == "Failed to update saved strategy config"


# ---------------------------------------------------------------------------
# set_default_saved_strategy_config – 404 (line 153), 500 (lines 161-165)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_set_default_saved_strategy_config_returns_404_when_not_found(
    client: AsyncClient,
) -> None:
    service = MockManagementService(
        set_default_error=StrategyConfigNotFoundError("Unknown config_id 'ghost'")
    )
    _override_management_service(service)
    try:
        response = await client.post("/api/v3/strategy/admin/configs/ghost/set-default")
    finally:
        _clear_management_service_override()

    assert response.status_code == 404
    assert "Unknown config_id" in response.json()["detail"]


@pytest.mark.asyncio
async def test_set_default_saved_strategy_config_returns_500_on_unexpected_error(
    client: AsyncClient,
) -> None:
    service = MockManagementService(set_default_error=OSError("disk failure"))
    _override_management_service(service)
    try:
        response = await client.post("/api/v3/strategy/admin/configs/any/set-default")
    finally:
        _clear_management_service_override()

    assert response.status_code == 500
    assert response.json()["detail"] == "Failed to set default saved strategy config"
