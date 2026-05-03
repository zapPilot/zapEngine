from __future__ import annotations

import pytest

from src.services.backtesting.constants import STRATEGY_DMA_FGI_FLAT_MINIMUM
from src.services.backtesting.signals.dma_gated_fgi.types import (
    CrossEvent,
    DmaCooldownState,
    DmaMarketState,
    Zone,
)
from src.services.backtesting.strategies.minimum import (
    FlatMinimumDecisionPolicy,
    FlatMinimumState,
    FlatMinimumStrategy,
)


def _dma_state(
    *,
    zone: Zone,
    fgi_regime: str = "neutral",
    cross_event: CrossEvent | None = None,
    actionable_cross_event: CrossEvent | None = None,
) -> DmaMarketState:
    return DmaMarketState(
        signal_id="dma_gated_fgi",
        dma_200=100.0,
        dma_distance=0.10 if zone == "above" else -0.10,
        zone=zone,
        cross_event=cross_event,
        actionable_cross_event=actionable_cross_event,
        cooldown_state=DmaCooldownState(
            active=False,
            remaining_days=0,
            blocked_zone=None,
        ),
        fgi_value=_fgi_value_for_regime(fgi_regime),
        fgi_slope=0.0,
        fgi_regime=fgi_regime,
        regime_source="value",
        ath_event=None,
    )


def _state(
    *,
    spy: DmaMarketState,
    btc: DmaMarketState,
    eth: DmaMarketState,
    current: dict[str, float] | None = None,
) -> FlatMinimumState:
    return FlatMinimumState(
        spy_dma_state=spy,
        btc_dma_state=btc,
        eth_dma_state=eth,
        current_asset_allocation=current
        or {"btc": 0.0, "eth": 0.0, "spy": 0.0, "stable": 1.0, "alt": 0.0},
    )


def _decide(snapshot: FlatMinimumState):
    return FlatMinimumDecisionPolicy().decide(snapshot)


def _fgi_value_for_regime(regime: str) -> float:
    if regime == "extreme_fear":
        return 10.0
    if regime == "greed":
        return 65.0
    if regime == "extreme_greed":
        return 90.0
    return 50.0


def test_strategy_instantiates_with_research_identity() -> None:
    strategy = FlatMinimumStrategy(total_capital=10_000.0)

    assert strategy.strategy_id == STRATEGY_DMA_FGI_FLAT_MINIMUM
    assert strategy.feature_summary()["research_only"] is True


def test_all_above_dma_preserves_current_allocation_on_no_signal_day() -> None:
    current = {"spy": 0.2, "btc": 0.3, "eth": 0.1, "stable": 0.4, "alt": 0.0}
    intent = _decide(
        _state(
            spy=_dma_state(zone="above"),
            btc=_dma_state(zone="above"),
            eth=_dma_state(zone="above"),
            current=current,
        )
    )

    assert intent.action == "hold"
    assert intent.reason == "regime_no_signal"
    assert intent.target_allocation is not None
    assert intent.target_allocation == pytest.approx(current)


def test_eth_cross_down_sells_only_eth_to_stable() -> None:
    intent = _decide(
        _state(
            spy=_dma_state(zone="above"),
            btc=_dma_state(zone="above"),
            eth=_dma_state(
                zone="below",
                cross_event="cross_down",
                actionable_cross_event="cross_down",
            ),
            current={
                "spy": 0.2,
                "btc": 0.3,
                "eth": 0.1,
                "stable": 0.4,
                "alt": 0.0,
            },
        )
    )

    assert intent.action == "sell"
    assert intent.reason == "dma_cross_down"
    assert intent.immediate is True
    assert intent.target_allocation is not None
    assert intent.target_allocation["spy"] == pytest.approx(0.2)
    assert intent.target_allocation["btc"] == pytest.approx(0.3)
    assert intent.target_allocation["eth"] == pytest.approx(0.0)
    assert intent.target_allocation["stable"] == pytest.approx(0.5)
    assert intent.diagnostics is not None
    assert intent.diagnostics["flat_dma_assets"] == ["ETH"]


def test_spy_only_above_dma_does_not_redeploy_without_actionable_buy() -> None:
    current = {"spy": 0.0, "btc": 0.0, "eth": 0.0, "stable": 1.0, "alt": 0.0}
    intent = _decide(
        _state(
            spy=_dma_state(zone="above"),
            btc=_dma_state(zone="below"),
            eth=_dma_state(zone="below"),
            current=current,
        )
    )

    assert intent.action == "hold"
    assert intent.target_allocation is not None
    assert intent.target_allocation == pytest.approx(current)


def test_spy_cross_up_redeploys_existing_stable_to_spy() -> None:
    intent = _decide(
        _state(
            spy=_dma_state(
                zone="above",
                cross_event="cross_up",
                actionable_cross_event="cross_up",
            ),
            btc=_dma_state(zone="below"),
            eth=_dma_state(zone="below"),
            current={
                "btc": 0.0,
                "eth": 0.0,
                "spy": 0.0,
                "stable": 1.0,
                "alt": 0.0,
            },
        )
    )

    assert intent.action == "buy"
    assert intent.reason == "dma_cross_up"
    assert intent.immediate is True
    assert intent.target_allocation is not None
    assert intent.target_allocation["spy"] == pytest.approx(1.0)
    assert intent.target_allocation["stable"] == pytest.approx(0.0)


def test_plain_greed_above_dma_does_not_trigger_sell() -> None:
    current = {"spy": 0.6, "btc": 0.0, "eth": 0.0, "stable": 0.4, "alt": 0.0}
    intent = _decide(
        _state(
            spy=_dma_state(zone="above", fgi_regime="greed"),
            btc=_dma_state(zone="below"),
            eth=_dma_state(zone="below"),
            current=current,
        )
    )

    assert intent.action == "hold"
    assert intent.reason == "regime_no_signal"
    assert intent.target_allocation is not None
    assert intent.target_allocation == pytest.approx(current)


def test_cross_down_sells_even_during_extreme_greed() -> None:
    intent = _decide(
        _state(
            spy=_dma_state(zone="above"),
            btc=_dma_state(zone="above"),
            eth=_dma_state(
                zone="below",
                fgi_regime="extreme_greed",
                cross_event="cross_down",
                actionable_cross_event="cross_down",
            ),
            current={
                "btc": 0.2,
                "eth": 0.3,
                "spy": 0.1,
                "stable": 0.4,
                "alt": 0.0,
            },
        )
    )

    assert intent.action == "sell"
    assert intent.reason == "dma_cross_down"
    assert intent.target_allocation is not None
    assert intent.target_allocation["eth"] == pytest.approx(0.0)
    assert intent.target_allocation["stable"] == pytest.approx(0.7)


def test_extreme_fear_below_dma_buy_redeploys_existing_stable_to_asset() -> None:
    intent = _decide(
        _state(
            spy=_dma_state(zone="below"),
            btc=_dma_state(zone="below"),
            eth=_dma_state(zone="below", fgi_regime="extreme_fear"),
            current={
                "btc": 0.7,
                "eth": 0.0,
                "spy": 0.0,
                "stable": 0.3,
                "alt": 0.0,
            },
        )
    )

    assert intent.action == "buy"
    assert intent.reason == "below_extreme_fear_buy"
    assert intent.target_allocation is not None
    assert intent.target_allocation["btc"] == pytest.approx(0.7)
    assert intent.target_allocation["eth"] == pytest.approx(0.3)
    assert intent.target_allocation["spy"] == pytest.approx(0.0)
    assert intent.target_allocation["stable"] == pytest.approx(0.0)
