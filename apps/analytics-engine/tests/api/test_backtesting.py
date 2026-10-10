"""Tests for the recipe-first backtesting endpoints."""

from __future__ import annotations

import inspect
from datetime import date
from pathlib import Path
from typing import Any, cast
from unittest.mock import MagicMock

import pytest
from httpx import ASGITransport, AsyncClient

from src.main import app
from src.models.backtesting import (
    Allocation,
    AssetAllocation,
    BacktestAssumptions,
    BacktestCompareRequestV3,
    BacktestPeriodInfo,
    BacktestResponse,
    BacktestStrategyCatalogResponseV3,
    BacktestWindowInfo,
    DecisionState,
    ExecutionState,
    MarketSnapshot,
    PnlAttribution,
    PortfolioState,
    SignalState,
    StrategyState,
    StrategySummary,
    TargetAllocation,
    TimelinePoint,
    TransferRecord,
)
from src.services.backtesting.execution import compare as compare_module
from src.services.backtesting.strategy_registry import list_strategy_recipes
from src.services.dependencies import get_backtesting_service
from src.services.strategy.backtesting_service import BacktestingService
from tests.services.backtesting.support import price_series, sentiment_map


class MockBacktestingService:
    def __init__(
        self,
        response: BacktestResponse | None = None,
        error: Exception | None = None,
    ) -> None:
        self.response = response
        self.error = error
        self.last_request: BacktestCompareRequestV3 | None = None
        self.call_count = 0

    def run_compare_v3(self, request: BacktestCompareRequestV3) -> BacktestResponse:
        self.call_count += 1
        self.last_request = request
        if self.error is not None:
            raise self.error
        assert self.response is not None
        return self.response


def _strategy_parameters() -> dict[str, object]:
    """What a spec-backed strategy reports about itself in a summary."""
    return {"signal_id": "dma_fgi_portfolio_rules_signal", "spec_ref": SPEC_REF}


SPEC_REF = "reference/dma_fgi@1#a22bccfabb4b"


def _compare_payload(**overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "token_symbol": "BTC",
        "total_capital": 10_000,
        "days": 30,
        "configs": [
            {
                "config_id": "portfolio_rules_runtime",
                "strategy_id": "dma_fgi_portfolio_rules",
            },
        ],
    }
    payload.update(overrides)
    return payload


async def _post_compare(
    client: AsyncClient,
    *,
    payload: dict[str, object],
    service: MockBacktestingService | None = None,
) -> Any:
    if service is not None:
        app.dependency_overrides[get_backtesting_service] = lambda: service
    try:
        return await client.post("/api/v3/backtesting/compare", json=payload)
    finally:
        app.dependency_overrides.pop(get_backtesting_service, None)


def _response() -> BacktestResponse:
    return BacktestResponse(
        assumptions=BacktestAssumptions(),
        strategies={
            "portfolio_rules_runtime": StrategySummary(
                strategy_id="dma_fgi_portfolio_rules",
                display_name="portfolio_rules_runtime",
                signal_id="dma_fgi_portfolio_rules_signal",
                total_invested=10_000.0,
                final_value=10_500.0,
                roi_percent=5.0,
                trade_count=4,
                calmar_ratio=0.78,
                max_drawdown_percent=-2.5,
                pnl_attribution=PnlAttribution(
                    price_usd=520.0, yield_usd=30.0, cost_usd=-50.0
                ),
                final_allocation=Allocation(spot=0.0, stable=1.0),
                final_asset_allocation=AssetAllocation(
                    btc=0.0,
                    eth=0.0,
                    spy=0.0,
                    stable=1.0,
                    alt=0.0,
                ),
                parameters=_strategy_parameters(),
            ),
        },
        timeline=[
            TimelinePoint(
                market=MarketSnapshot(
                    date=date(2025, 1, 1),
                    token_price={"btc": 100_000.0},
                    sentiment=72,
                    sentiment_label="greed",
                ),
                strategies={
                    "portfolio_rules_runtime": StrategyState(
                        portfolio=PortfolioState(
                            spot_usd=0.0,
                            stable_usd=10_000.0,
                            total_value=10_000.0,
                            allocation=Allocation(spot=0.0, stable=1.0),
                            asset_allocation=AssetAllocation(
                                btc=0.0,
                                eth=0.0,
                                spy=0.0,
                                stable=1.0,
                                alt=0.0,
                            ),
                            spot_asset=None,
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
                                    "cross_event": "cross_down",
                                    "cooldown_active": False,
                                    "cooldown_remaining_days": 0,
                                    "cooldown_blocked_zone": None,
                                    "fgi_slope": 0.1,
                                },
                            },
                        ),
                        decision=DecisionState(
                            action="sell",
                            reason="dma_cross_down",
                            rule_group="cross",
                            target_allocation=TargetAllocation(
                                btc=0.0,
                                eth=0.0,
                                spy=0.0,
                                stable=1.0,
                                alt=0.0,
                            ),
                            immediate=True,
                        ),
                        execution=ExecutionState(
                            event="rebalance",
                            transfers=[
                                TransferRecord(
                                    from_bucket="spot",
                                    to_bucket="stable",
                                    amount_usd=2_500.0,
                                )
                            ],
                            blocked_reason=None,
                        ),
                    ),
                },
            ),
            TimelinePoint(
                market=MarketSnapshot(
                    date=date(2025, 1, 2),
                    token_price={"btc": 102_000.0, "eth": 5_100.0},
                    sentiment=15,
                    sentiment_label="extreme_fear",
                ),
                strategies={
                    "portfolio_rules_runtime": StrategyState(
                        portfolio=PortfolioState(
                            spot_usd=6_000.0,
                            stable_usd=4_000.0,
                            total_value=10_000.0,
                            allocation=Allocation(spot=0.6, stable=0.4),
                            asset_allocation=AssetAllocation(
                                btc=0.0,
                                eth=0.6,
                                spy=0.0,
                                stable=0.4,
                                alt=0.0,
                            ),
                            spot_asset="ETH",
                        ),
                        signal=SignalState(
                            id="dma_fgi_portfolio_rules_signal",
                            regime="extreme_fear",
                            raw_value=15.0,
                            confidence=1.0,
                            details={
                                "dma": {
                                    "dma_200": 105_000.0,
                                    "distance": -0.0286,
                                    "zone": "below",
                                    "cross_event": None,
                                    "cooldown_active": False,
                                    "cooldown_remaining_days": 0,
                                    "cooldown_blocked_zone": None,
                                    "fgi_slope": -0.2,
                                },
                            },
                        ),
                        decision=DecisionState(
                            action="buy",
                            reason="below_extreme_fear_buy",
                            rule_group="dma_fgi",
                            target_allocation=TargetAllocation(
                                btc=0.0,
                                eth=1.0,
                                spy=0.0,
                                stable=0.0,
                                alt=0.0,
                            ),
                            immediate=False,
                        ),
                        execution=ExecutionState(
                            event="rebalance",
                            transfers=[
                                TransferRecord(
                                    from_bucket="stable",
                                    to_bucket="spot",
                                    amount_usd=2_000.0,
                                )
                            ],
                            blocked_reason=None,
                        ),
                    ),
                },
            ),
        ],
        window=BacktestWindowInfo(
            requested=BacktestPeriodInfo(
                start_date=date(2024, 1, 1),
                end_date=date(2024, 1, 31),
                days=30,
            ),
            effective=BacktestPeriodInfo(
                start_date=date(2024, 1, 10),
                end_date=date(2024, 1, 31),
                days=21,
            ),
        ),
    )


@pytest.mark.asyncio
async def test_backtesting_strategies_v3_returns_recipe_catalog(
    client: AsyncClient,
) -> None:
    response = await client.get("/api/v3/backtesting/strategies")
    assert response.status_code == 200

    payload = cast(dict[str, object], response.json())
    catalog = BacktestStrategyCatalogResponseV3.model_validate(payload)
    strategy_ids = [entry.strategy_id for entry in catalog.strategies]
    expected_strategy_ids = [recipe.strategy_id for recipe in list_strategy_recipes()]
    assert strategy_ids == expected_strategy_ids
    assert "dma_fgi_portfolio_rules" in strategy_ids
    assert "dma_fgi_portfolio_rules" in strategy_ids
    assert "dma_gated_fgi_btc_asset_control" not in strategy_ids
    assert "dma_gated_fgi_eth_btc_control" not in strategy_ids
    dma_entry = next(
        entry
        for entry in catalog.strategies
        if entry.strategy_id == "dma_fgi_portfolio_rules"
    )
    assert dma_entry.default_params == {}
    assert dma_entry.param_schema == {
        "type": "object",
        "properties": {},
        "additionalProperties": False,
    }
    assert dma_entry.supports_daily_suggestion is True

    configs_response = await client.get("/api/v3/strategy/configs")
    assert configs_response.status_code == 200
    configs_payload = cast(dict[str, object], configs_response.json())
    assert configs_payload["strategies"] == payload["strategies"]


@pytest.mark.asyncio
async def test_backtesting_compare_v3_returns_shared_snapshot_response(
    client: AsyncClient,
) -> None:
    service = MockBacktestingService(response=_response())
    response = await _post_compare(
        client,
        payload=_compare_payload(),
        service=service,
    )

    assert response.status_code == 200
    assert service.call_count == 1
    assert service.last_request is not None
    assert service.last_request.configs[0].params == {}

    parsed = BacktestResponse.model_validate(response.json())
    assert set(parsed.strategies) == {"portfolio_rules_runtime"}
    assert parsed.strategies["portfolio_rules_runtime"].calmar_ratio == pytest.approx(
        0.78
    )
    assert parsed.strategies[
        "portfolio_rules_runtime"
    ].max_drawdown_percent == pytest.approx(-2.5)
    assert parsed.window is not None
    assert parsed.window.truncated is True
    assert parsed.window.requested.days == 30
    assert parsed.window.effective.start_date == date(2024, 1, 10)
    assert len(parsed.timeline) == 2
    dma_point = parsed.timeline[0].strategies["portfolio_rules_runtime"]
    dma_eth_point = parsed.timeline[1].strategies["portfolio_rules_runtime"]
    assert dma_point.signal is not None
    assert dma_point.signal.id == "dma_fgi_portfolio_rules_signal"
    assert dma_point.portfolio.spot_asset is None
    assert dma_eth_point.portfolio.spot_asset == "ETH"
    assert (
        response.json()["timeline"][0]["strategies"]["portfolio_rules_runtime"][
            "portfolio"
        ]["spot_asset"]
        is None
    )
    assert (
        response.json()["timeline"][1]["strategies"]["portfolio_rules_runtime"][
            "portfolio"
        ]["spot_asset"]
        == "ETH"
    )
    assert dma_point.signal.details["ath_event"] == "token_ath"
    assert cast(dict[str, object], dma_point.signal.details["dma"])["zone"] == "above"
    assert dma_point.decision.reason == "dma_cross_down"


@pytest.mark.asyncio
async def test_backtesting_compare_v3_accepts_a_strategy_with_empty_params(
    client: AsyncClient,
) -> None:
    service = MockBacktestingService(response=_response())
    response = await _post_compare(
        client,
        payload={
            "token_symbol": "BTC",
            "total_capital": 10_000,
            "days": 30,
            "configs": [
                {
                    "config_id": "dma_fgi_portfolio_rules_default",
                    "strategy_id": "dma_fgi_portfolio_rules",
                    "params": {},
                }
            ],
        },
        service=service,
    )

    assert response.status_code == 200
    assert service.last_request is not None
    assert service.last_request.configs[0].params == {}


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "params",
    [
        {"max_trades_7d": 3, "rotation_cooldown_days": 7},
        {"trade_quota": {"max_trades_7d": 3}},
        {"enabled_rules": ["cross_down_exit"]},
    ],
)
async def test_backtesting_compare_v3_rejects_any_params(
    client: AsyncClient, params: dict[str, object]
) -> None:
    """What a strategy does is stated by its spec: the request tunes nothing."""
    response = await _post_compare(
        client,
        payload={
            "token_symbol": "BTC",
            "total_capital": 10_000,
            "days": 30,
            "configs": [
                {
                    "config_id": "dma_fgi_portfolio_rules_default",
                    "strategy_id": "dma_fgi_portfolio_rules",
                    "params": params,
                }
            ],
        },
    )

    assert response.status_code == 422
    assert "does not accept params" in response.text


@pytest.mark.asyncio
async def test_backtesting_compare_v3_rejects_unknown_strategy_id(
    client: AsyncClient,
) -> None:
    response = await _post_compare(
        client,
        payload=_compare_payload(
            configs=[
                {
                    "config_id": "legacy",
                    "strategy_id": "simple_regime",
                    "params": {"pacing_policy": "fgi_exponential"},
                }
            ]
        ),
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_backtesting_compare_v3_maps_value_error_to_400(
    client: AsyncClient,
) -> None:
    service = MockBacktestingService(error=ValueError("Invalid parameter"))
    response = await _post_compare(
        client,
        payload=_compare_payload(
            configs=[
                {
                    "config_id": "portfolio_rules",
                    "strategy_id": "dma_fgi_portfolio_rules",
                    "params": {},
                }
            ]
        ),
        service=service,
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid parameter"


@pytest.mark.asyncio
async def test_backtesting_compare_v3_returns_400_for_unusable_window(
    client: AsyncClient,
) -> None:
    service = MockBacktestingService(
        error=ValueError(
            "No usable backtest data available for BTC between 2024-01-01 and "
            "2024-01-31 after applying data availability constraints"
        )
    )
    response = await _post_compare(
        client,
        payload=_compare_payload(
            start_date="2024-01-01",
            end_date="2024-01-31",
            configs=[
                {
                    "config_id": "portfolio_rules_runtime",
                    "strategy_id": "dma_fgi_portfolio_rules",
                }
            ],
        ),
        service=service,
    )

    assert response.status_code == 400
    assert "No usable backtest data available" in response.json()["detail"]


@pytest.mark.asyncio
async def test_backtesting_compare_v3_http_cannot_choose_or_trigger_decision_log(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """HTTP callers must not reach the decision-log writer or pick its directory."""
    original_writer = compare_module.write_decision_log
    writer_dirs: list[Path] = []

    def recording_writer(**kwargs: Any) -> Path:
        writer_dirs.append(kwargs["output_dir"])
        return original_writer(**kwargs)

    monkeypatch.setattr(compare_module, "write_decision_log", recording_writer)
    # Real service and real compare runner over synthetic data, so any write the
    # HTTP path could trigger would actually happen.
    service = BacktestingService(
        token_price_service=MagicMock(),
        sentiment_service=MagicMock(),
    )
    service.data_provider.fetch_token_prices = MagicMock(  # type: ignore[method-assign]
        return_value=price_series(days=5)
    )
    service.data_provider.fetch_sentiments = MagicMock(  # type: ignore[method-assign]
        return_value=sentiment_map(days=5, label="greed", value=70)
    )
    attacker_dir = tmp_path / "attacker"
    payload = _compare_payload(
        start_date="2025-01-01",
        end_date="2025-01-05",
        days=None,
        decision_log_dir=str(attacker_dir),
        emit_decision_log=True,
    )

    app.dependency_overrides[get_backtesting_service] = lambda: service
    try:
        # Own client: this test does not touch the database, so it skips the
        # db_session-backed `client` fixture.
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.post(
                "/api/v3/backtesting/compare?emit_decision_log=true",
                json=payload,
            )
    finally:
        app.dependency_overrides.pop(get_backtesting_service, None)

    assert response.status_code == 200, response.text
    assert writer_dirs == [], (
        f"HTTP compare reached the decision-log writer: {writer_dirs}"
    )
    assert not attacker_dir.exists()
    assert "decision_log_path" not in response.json()


def test_the_compare_route_runs_in_the_threadpool_not_on_the_event_loop() -> None:
    """A backtest is seconds of synchronous work; FastAPI only threads a plain def."""
    from src.api.routers.backtesting import compare_backtesting_configs_v3

    assert not inspect.iscoroutinefunction(compare_backtesting_configs_v3)
    assert not inspect.iscoroutinefunction(BacktestingService.run_compare_v3)
