"""Tests for the recipe-first backtesting endpoints."""

from __future__ import annotations

from datetime import date
from typing import Any, cast

import pytest
from httpx import AsyncClient

from src.main import app
from src.models.backtesting import (
    Allocation,
    AssetAllocation,
    BacktestCompareRequestV3,
    BacktestPeriodInfo,
    BacktestResponse,
    BacktestStrategyCatalogResponseV3,
    BacktestWindowInfo,
    DecisionState,
    ExecutionDiagnostics,
    ExecutionState,
    MarketSnapshot,
    PortfolioState,
    SignalState,
    StrategyState,
    StrategySummary,
    TimelinePoint,
    TransferRecord,
)
from src.services.dependencies import get_backtesting_service


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

    async def run_compare_v3(
        self, request: BacktestCompareRequestV3
    ) -> BacktestResponse:
        self.call_count += 1
        self.last_request = request
        if self.error is not None:
            raise self.error
        assert self.response is not None
        return self.response


def _dma_params() -> dict[str, object]:
    return {
        "signal": {
            "cross_cooldown_days": 30,
            "cross_on_touch": True,
        },
        "pacing": {
            "k": 5.0,
            "r_max": 1.0,
        },
        "buy_gate": {
            "window_days": 5,
            "sideways_max_range": 0.04,
            "leg_caps": [0.05, 0.10, 0.20],
        },
        "trade_quota": {
            "min_trade_interval_days": None,
            "max_trades_7d": None,
            "max_trades_30d": None,
        },
    }


def _dma_runtime_params() -> dict[str, object]:
    return {
        "cross_cooldown_days": 30,
        "cross_on_touch": True,
        "pacing_k": 5.0,
        "pacing_r_max": 1.0,
        "buy_sideways_window_days": 5,
        "buy_sideways_max_range": 0.04,
        "buy_leg_caps": [0.05, 0.10, 0.20],
        "dma_overextension_threshold": 0.3,
        "fgi_slope_reversal_threshold": -0.05,
    }


def _eth_rotation_params() -> dict[str, object]:
    return {
        "signal": {
            "cross_cooldown_days": 30,
            "cross_on_touch": True,
            "ratio_cross_cooldown_days": 30,
            "rotation_neutral_band": 0.05,
            "rotation_max_deviation": 0.20,
        },
        "pacing": {
            "k": 5.0,
            "r_max": 1.0,
        },
        "buy_gate": {
            "window_days": 5,
            "sideways_max_range": 0.04,
            "leg_caps": [0.05, 0.10, 0.20],
        },
        "trade_quota": {
            "min_trade_interval_days": 1,
            "max_trades_7d": None,
            "max_trades_30d": None,
        },
        "rotation": {
            "drift_threshold": 0.03,
            "cooldown_days": 14,
        },
    }


def _eth_rotation_runtime_params() -> dict[str, object]:
    return {
        "cross_cooldown_days": 30,
        "cross_on_touch": True,
        "ratio_cross_cooldown_days": 30,
        "rotation_neutral_band": 0.05,
        "rotation_max_deviation": 0.20,
        "pacing_k": 5.0,
        "pacing_r_max": 1.0,
        "buy_sideways_window_days": 5,
        "buy_sideways_max_range": 0.04,
        "buy_leg_caps": [0.05, 0.10, 0.20],
        "dma_overextension_threshold": 0.3,
        "fgi_slope_reversal_threshold": -0.05,
        "min_trade_interval_days": 1,
        "rotation_drift_threshold": 0.03,
        "rotation_cooldown_days": 14,
    }


def _compare_payload(**overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "token_symbol": "BTC",
        "total_capital": 10_000,
        "days": 30,
        "configs": [
            {"config_id": "dca_classic", "strategy_id": "dca_classic", "params": {}},
            {
                "config_id": "dma_gated_fgi_default",
                "strategy_id": "dma_gated_fgi",
                "params": _dma_params(),
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
        strategies={
            "dca_classic": StrategySummary(
                strategy_id="dca_classic",
                display_name="dca_classic",
                signal_id=None,
                total_invested=10_000.0,
                final_value=10_250.0,
                roi_percent=2.5,
                trade_count=10,
                calmar_ratio=0.31,
                max_drawdown_percent=-4.2,
                final_allocation=Allocation(spot=0.5, stable=0.5),
                final_asset_allocation=AssetAllocation(
                    btc=0.5,
                    eth=0.0,
                    stable=0.5,
                    alt=0.0,
                ),
                parameters={},
            ),
            "dma_gated_fgi_default": StrategySummary(
                strategy_id="dma_gated_fgi",
                display_name="dma_gated_fgi_default",
                signal_id="dma_gated_fgi",
                total_invested=10_000.0,
                final_value=10_500.0,
                roi_percent=5.0,
                trade_count=4,
                calmar_ratio=0.78,
                max_drawdown_percent=-2.5,
                final_allocation=Allocation(spot=0.0, stable=1.0),
                final_asset_allocation=AssetAllocation(
                    btc=0.0,
                    eth=0.0,
                    stable=1.0,
                    alt=0.0,
                ),
                parameters=_dma_params(),
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
                    "dca_classic": StrategyState(
                        portfolio=PortfolioState(
                            spot_usd=5_000.0,
                            stable_usd=5_000.0,
                            total_value=10_000.0,
                            allocation=Allocation(spot=0.5, stable=0.5),
                            asset_allocation=AssetAllocation(
                                btc=0.5,
                                eth=0.0,
                                stable=0.5,
                                alt=0.0,
                            ),
                            spot_asset="BTC",
                        ),
                        signal=None,
                        decision=DecisionState(
                            action="buy",
                            reason="daily_buy",
                            rule_group="none",
                            target_allocation=Allocation(spot=1.0, stable=0.0),
                            target_asset_allocation=AssetAllocation(
                                btc=1.0,
                                eth=0.0,
                                stable=0.0,
                                alt=0.0,
                            ),
                            immediate=False,
                        ),
                        execution=ExecutionState(
                            event="buy",
                            transfers=[
                                TransferRecord(
                                    from_bucket="stable",
                                    to_bucket="spot",
                                    amount_usd=500.0,
                                )
                            ],
                            blocked_reason=None,
                            step_count=1,
                            steps_remaining=0,
                            interval_days=1,
                            diagnostics=ExecutionDiagnostics(),
                        ),
                    ),
                    "dma_gated_fgi_default": StrategyState(
                        portfolio=PortfolioState(
                            spot_usd=0.0,
                            stable_usd=10_000.0,
                            total_value=10_000.0,
                            allocation=Allocation(spot=0.0, stable=1.0),
                            asset_allocation=AssetAllocation(
                                btc=0.0,
                                eth=0.0,
                                stable=1.0,
                                alt=0.0,
                            ),
                            spot_asset=None,
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
                            target_allocation=Allocation(spot=0.0, stable=1.0),
                            target_asset_allocation=AssetAllocation(
                                btc=0.0,
                                eth=0.0,
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
                            step_count=1,
                            steps_remaining=0,
                            interval_days=1,
                            diagnostics=ExecutionDiagnostics(
                                plugins={
                                    "dma_buy_gate": {
                                        "buy_strength": None,
                                        "sideways_confirmed": None,
                                    }
                                }
                            ),
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
                    "dca_classic": StrategyState(
                        portfolio=PortfolioState(
                            spot_usd=5_200.0,
                            stable_usd=5_000.0,
                            total_value=10_200.0,
                            allocation=Allocation(spot=0.51, stable=0.49),
                            asset_allocation=AssetAllocation(
                                btc=0.51,
                                eth=0.0,
                                stable=0.49,
                                alt=0.0,
                            ),
                            spot_asset="BTC",
                        ),
                        signal=None,
                        decision=DecisionState(
                            action="buy",
                            reason="daily_buy",
                            rule_group="none",
                            target_allocation=Allocation(spot=1.0, stable=0.0),
                            target_asset_allocation=AssetAllocation(
                                btc=1.0,
                                eth=0.0,
                                stable=0.0,
                                alt=0.0,
                            ),
                            immediate=False,
                        ),
                        execution=ExecutionState(
                            event="buy",
                            transfers=[
                                TransferRecord(
                                    from_bucket="stable",
                                    to_bucket="spot",
                                    amount_usd=500.0,
                                )
                            ],
                            blocked_reason=None,
                            step_count=1,
                            steps_remaining=0,
                            interval_days=1,
                            diagnostics=ExecutionDiagnostics(),
                        ),
                    ),
                    "dma_gated_fgi_default": StrategyState(
                        portfolio=PortfolioState(
                            spot_usd=6_000.0,
                            stable_usd=4_000.0,
                            total_value=10_000.0,
                            allocation=Allocation(spot=0.6, stable=0.4),
                            asset_allocation=AssetAllocation(
                                btc=0.0,
                                eth=0.6,
                                stable=0.4,
                                alt=0.0,
                            ),
                            spot_asset="ETH",
                        ),
                        signal=SignalState(
                            id="dma_gated_fgi",
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
                            target_allocation=Allocation(spot=1.0, stable=0.0),
                            target_asset_allocation=AssetAllocation(
                                btc=0.0,
                                eth=1.0,
                                stable=0.0,
                                alt=0.0,
                            ),
                            immediate=False,
                            details={"target_spot_asset": "ETH"},
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
                            step_count=1,
                            steps_remaining=0,
                            interval_days=1,
                            diagnostics=ExecutionDiagnostics(
                                plugins={
                                    "dma_buy_gate": {
                                        "buy_strength": 0.8,
                                        "sideways_confirmed": False,
                                    }
                                }
                            ),
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
    assert strategy_ids == ["dca_classic", "dma_gated_fgi", "eth_btc_rotation"]
    dma_entry = next(
        entry for entry in catalog.strategies if entry.strategy_id == "dma_gated_fgi"
    )
    assert (
        cast(dict[str, object], dma_entry.default_params["signal"])[
            "cross_cooldown_days"
        ]
        == 30
    )
    assert "signal" in dma_entry.param_schema["properties"]
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
    assert service.last_request.configs[1].params == _dma_runtime_params()

    parsed = BacktestResponse.model_validate(response.json())
    assert set(parsed.strategies) == {"dca_classic", "dma_gated_fgi_default"}
    assert parsed.strategies["dca_classic"].calmar_ratio == pytest.approx(0.31)
    assert parsed.strategies["dca_classic"].max_drawdown_percent == pytest.approx(-4.2)
    assert parsed.strategies["dma_gated_fgi_default"].calmar_ratio == pytest.approx(
        0.78
    )
    assert parsed.strategies[
        "dma_gated_fgi_default"
    ].max_drawdown_percent == pytest.approx(-2.5)
    assert parsed.window is not None
    assert parsed.window.truncated is True
    assert parsed.window.requested.days == 30
    assert parsed.window.effective.start_date == date(2024, 1, 10)
    assert len(parsed.timeline) == 2
    dma_point = parsed.timeline[0].strategies["dma_gated_fgi_default"]
    dma_eth_point = parsed.timeline[1].strategies["dma_gated_fgi_default"]
    assert dma_point.signal is not None
    assert dma_point.signal.id == "dma_gated_fgi"
    assert parsed.timeline[0].strategies["dca_classic"].portfolio.spot_asset == "BTC"
    assert dma_point.portfolio.spot_asset is None
    assert dma_eth_point.portfolio.spot_asset == "ETH"
    assert (
        response.json()["timeline"][0]["strategies"]["dca_classic"]["portfolio"][
            "spot_asset"
        ]
        == "BTC"
    )
    assert (
        response.json()["timeline"][0]["strategies"]["dma_gated_fgi_default"][
            "portfolio"
        ]["spot_asset"]
        is None
    )
    assert (
        response.json()["timeline"][1]["strategies"]["dma_gated_fgi_default"][
            "portfolio"
        ]["spot_asset"]
        == "ETH"
    )
    assert dma_point.signal.details["ath_event"] == "token_ath"
    assert cast(dict[str, object], dma_point.signal.details["dma"])["zone"] == "above"
    assert (
        dma_point.execution.diagnostics.plugins["dma_buy_gate"]["sideways_confirmed"]
        is None
    )
    assert dma_point.decision.reason == "dma_cross_down"
    assert dma_eth_point.decision.details["target_spot_asset"] == "ETH"


@pytest.mark.asyncio
async def test_backtesting_compare_v3_accepts_nested_eth_btc_rotation_params(
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
                    "config_id": "eth_btc_rotation_default",
                    "strategy_id": "eth_btc_rotation",
                    "params": _eth_rotation_params(),
                }
            ],
        },
        service=service,
    )

    assert response.status_code == 200
    assert service.last_request is not None
    assert service.last_request.configs[0].params == _eth_rotation_runtime_params()


@pytest.mark.asyncio
async def test_backtesting_compare_v3_rejects_flat_eth_btc_rotation_params(
    client: AsyncClient,
) -> None:
    response = await _post_compare(
        client,
        payload={
            "token_symbol": "BTC",
            "total_capital": 10_000,
            "days": 30,
            "configs": [
                {
                    "config_id": "eth_btc_rotation_default",
                    "strategy_id": "eth_btc_rotation",
                    "params": {
                        "cross_cooldown_days": 30,
                        "rotation_cooldown_days": 7,
                    },
                }
            ],
        },
    )

    assert response.status_code == 422
    payload = cast(dict[str, object], response.json())
    detail = cast(list[dict[str, object]], payload["detail"])
    assert any(item["loc"][-1] == "rotation_cooldown_days" for item in detail)


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
                    "config_id": "dca_classic",
                    "strategy_id": "dca_classic",
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
                    "config_id": "dma_runtime",
                    "strategy_id": "dma_gated_fgi",
                    "params": {"signal": {"cross_cooldown_days": 30}},
                }
            ],
        ),
        service=service,
    )

    assert response.status_code == 400
    assert "No usable backtest data available" in response.json()["detail"]
