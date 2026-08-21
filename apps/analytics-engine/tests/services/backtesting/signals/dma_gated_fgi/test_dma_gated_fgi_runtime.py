from __future__ import annotations

from datetime import date

import pytest

from src.services.backtesting.decision import AllocationIntent
from src.services.backtesting.execution.portfolio import Portfolio
from src.services.backtesting.signals.contracts import SignalContext
from src.services.backtesting.signals.dma_gated_fgi.component import (
    DmaGatedFgiSignalComponent,
)
from src.services.backtesting.signals.dma_gated_fgi.config import DmaGatedFgiConfig
from src.services.backtesting.signals.dma_gated_fgi.errors import SignalDataError
from src.services.backtesting.signals.dma_gated_fgi.signal_engine import (
    DmaSignalEngine,
)
from src.services.backtesting.strategies.base import StrategyContext
from tests.services.backtesting.helpers import state


def _context(
    *,
    day: int,
    price: float,
    sentiment: dict[str, object] | None = None,
    dma_200: float | None = 50_000.0,
    ath_event: str | None = None,
    extra_data: dict[str, object] | None = None,
    price_history: list[float] | None = None,
) -> SignalContext:
    resolved_extra_data = dict(extra_data or {})
    if dma_200 is not None:
        resolved_extra_data["dma_200"] = dma_200
    return SignalContext(
        date=date(2025, 1, day),
        price=price,
        sentiment=sentiment,
        price_history=price_history or [50_000.0, price],
        portfolio_value=10_000.0,
        ath_event=ath_event,
        extra_data=resolved_extra_data,
    )


def _strategy_context(
    *,
    day: int,
    price: float,
    sentiment: dict[str, object] | None = None,
    dma_200: float = 50_000.0,
) -> StrategyContext:
    return StrategyContext(
        date=date(2025, 1, day),
        price=price,
        sentiment=sentiment,
        price_history=[50_000.0, price],
        portfolio=Portfolio(spot_balance=0.0, stable_balance=10_000.0),
        extra_data={"dma_200": dma_200},
    )


def test_signal_engine_builds_actionable_cross_after_dma_warmup() -> None:
    engine = DmaSignalEngine(config=DmaGatedFgiConfig())
    engine.warmup(
        _context(
            day=1,
            price=45_000.0,
            sentiment={"label": "fear", "value": 30},
        )
    )

    market_state = engine.build_market_state(
        _context(
            day=2,
            price=55_000.0,
            sentiment={"label": "greed", "value": 70},
        )
    )

    assert market_state.zone == "above"
    assert market_state.cross_event == "cross_up"
    assert market_state.actionable_cross_event == "cross_up"


def test_signal_engine_extracts_macro_fear_greed_state() -> None:
    engine = DmaSignalEngine(config=DmaGatedFgiConfig())

    market_state = engine.build_market_state(
        _context(
            day=2,
            price=45_000.0,
            sentiment={"label": "neutral", "value": 50},
            extra_data={
                "dma_asset": "SPY",
                "macro_fear_greed": {
                    "score": 4.0,
                    "label": "Extreme Fear",
                },
            },
        )
    )

    assert market_state.asset_symbol == "SPY"
    assert market_state.macro_fear_greed_value == pytest.approx(4.0)
    assert market_state.macro_fear_greed_regime == "extreme_fear"


def test_signal_engine_uses_macro_label_not_score_threshold() -> None:
    engine = DmaSignalEngine(config=DmaGatedFgiConfig())

    market_state = engine.build_market_state(
        _context(
            day=2,
            price=45_000.0,
            sentiment={"label": "neutral", "value": 50},
            extra_data={
                "macro_fear_greed": {
                    "score": 4.0,
                    "label": "Fear",
                },
            },
        )
    )

    assert market_state.macro_fear_greed_value == pytest.approx(4.0)
    assert market_state.macro_fear_greed_regime == "fear"
    assert market_state.macro_fear_greed_regime_source == "label"


def test_component_builds_signal_observation_for_cross_intent() -> None:
    component = DmaGatedFgiSignalComponent()
    market_state = state(
        symbol="BTC",
        zone="above",
        cross_event="cross_up",
        actionable_cross_event="cross_up",
        fgi_regime="greed",
        fgi_value=72.0,
        fgi_slope=0.08,
    )
    intent = AllocationIntent(
        action="buy",
        target_allocation={"btc": 1.0, "stable": 0.0},
        allocation_name="cross_up",
        immediate=True,
        reason="portfolio_cross_up_equal_weight",
        rule_group="cross",
        decision_score=1.0,
    )

    observation = component.build_signal_observation(
        snapshot=market_state,
        intent=intent,
    )

    assert observation.signal_id == "dma_gated_fgi"
    assert observation.regime == "greed"
    assert observation.raw_value == pytest.approx(72.0)
    assert observation.dma is not None
    assert observation.dma.cross_event == "cross_up"
    assert observation.dma.fgi_slope == pytest.approx(0.08)


def test_component_builds_execution_hints_for_buy_gate() -> None:
    component = DmaGatedFgiSignalComponent()
    market_state = state(
        symbol="SPY",
        zone="below",
        dma_distance=-0.12,
        fgi_regime="neutral",
        fgi_value=50.0,
        macro_fear_greed_regime="extreme_fear",
        macro_fear_greed_value=4.0,
    )
    intent = AllocationIntent(
        action="buy",
        target_allocation={"spy": 0.2, "stable": 0.8},
        allocation_name="spy_buy",
        immediate=False,
        reason="portfolio_extreme_fear_dca_buy",
        rule_group="dma_fgi",
        decision_score=1.0,
    )

    hints = component.build_execution_hints(
        snapshot=market_state,
        intent=intent,
        signal_confidence=0.81,
    )

    assert hints.enable_buy_gate is True
    assert hints.buy_strength is not None
    assert hints.current_regime == "neutral"
    assert hints.signal_value == pytest.approx(50.0)
    assert hints.signal_confidence == pytest.approx(0.81)


def test_component_warmup_observe_apply_and_reset_cycle() -> None:
    component = DmaGatedFgiSignalComponent()
    warmup_context = _strategy_context(
        day=1,
        price=45_000.0,
        sentiment={"label": "fear", "value": 30},
    )
    live_context = _strategy_context(
        day=2,
        price=55_000.0,
        sentiment={"label": "greed", "value": 70},
    )

    component.initialize(warmup_context)
    component.warmup(warmup_context)
    market_state = component.observe(live_context)
    intent = AllocationIntent(
        action="buy",
        target_allocation={"btc": 1.0, "stable": 0.0},
        allocation_name="cross_up",
        immediate=True,
        reason="portfolio_cross_up_equal_weight",
        rule_group="cross",
        decision_score=1.0,
    )
    committed = component.apply_intent(
        current_date=date(2025, 1, 2),
        snapshot=market_state,
        intent=intent,
    )

    assert market_state.cross_event == "cross_up"
    assert committed.cooldown_state.active is True

    component.reset()
    after_reset = component.observe(live_context)
    assert after_reset.cross_event is None


def test_signal_engine_cooldown_transition_blocks_opposite_side() -> None:
    engine = DmaSignalEngine(config=DmaGatedFgiConfig(cross_cooldown_days=30))

    engine.warmup(
        _context(
            day=1,
            price=55_000.0,
            sentiment={"label": "greed", "value": 70},
        )
    )
    cross_state = engine.build_market_state(
        _context(
            day=2,
            price=45_000.0,
            sentiment={"label": "fear", "value": 20},
        )
    )
    cross_intent = AllocationIntent(
        action="sell",
        target_allocation={"btc": 0.0, "stable": 1.0},
        allocation_name="cross_down",
        immediate=True,
        reason="portfolio_cross_down_exit",
        rule_group="cross",
        decision_score=-1.0,
    )
    committed_cross_state = engine.apply_intent(
        current_date=date(2025, 1, 2),
        market_state=cross_state,
        intent=cross_intent,
    )
    committed_debug_state = engine.debug_state()

    blocked_state = engine.build_market_state(
        _context(
            day=3,
            price=55_000.0,
            sentiment={"label": "greed", "value": 80},
            ath_event="token_ath",
        )
    )
    assert committed_cross_state.cooldown_state.blocked_zone == "above"
    assert committed_debug_state.cooldown_blocked_zone == "above"
    assert committed_debug_state.cooldown_end_date == date(2025, 2, 1)
    assert blocked_state.actionable_cross_event is None


def test_signal_engine_missing_dma_strict_resolve_but_warmup_degrades() -> None:
    engine = DmaSignalEngine()

    engine.warmup(
        _context(
            day=1,
            price=45_000.0,
            sentiment={"label": "extreme_fear", "value": 10},
            dma_200=None,
        )
    )

    with pytest.raises(
        SignalDataError, match=r"Missing required extra_data\['dma_200'\]"
    ):
        engine.build_market_state(
            _context(
                day=2,
                price=45_000.0,
                sentiment={"label": "extreme_fear", "value": 10},
                dma_200=None,
            )
        )


def test_signal_engine_cross_on_touch_disabled_requires_direct_cross_down() -> None:
    engine = DmaSignalEngine(config=DmaGatedFgiConfig(cross_on_touch=False))
    engine.warmup(
        _context(
            day=1,
            price=55_000.0,
            sentiment={"label": "greed", "value": 70},
        )
    )

    at_state = engine.build_market_state(
        _context(
            day=2,
            price=50_000.0,
            sentiment={"label": "greed", "value": 70},
        )
    )
    below_state = engine.build_market_state(
        _context(
            day=3,
            price=45_000.0,
            sentiment={"label": "fear", "value": 20},
        )
    )

    assert at_state.cross_event is None
    assert below_state.cross_event == "cross_down"


def test_signal_engine_cross_on_touch_disabled_requires_direct_cross_up() -> None:
    engine = DmaSignalEngine(config=DmaGatedFgiConfig(cross_on_touch=False))
    engine.warmup(
        _context(
            day=1,
            price=45_000.0,
            sentiment={"label": "fear", "value": 20},
        )
    )

    at_state = engine.build_market_state(
        _context(
            day=2,
            price=50_000.0,
            sentiment={"label": "neutral", "value": 50},
        )
    )
    above_state = engine.build_market_state(
        _context(
            day=3,
            price=55_000.0,
            sentiment={"label": "greed", "value": 70},
        )
    )

    assert at_state.cross_event is None
    assert above_state.cross_event == "cross_up"


def test_signal_engine_releases_cooldown_without_retroactive_cross() -> None:
    engine = DmaSignalEngine(config=DmaGatedFgiConfig(cross_cooldown_days=2))

    engine.warmup(
        _context(
            day=1,
            price=55_000.0,
            sentiment={"label": "greed", "value": 70},
        )
    )
    cross_state = engine.build_market_state(
        _context(
            day=2,
            price=45_000.0,
            sentiment={"label": "fear", "value": 20},
        )
    )
    committed_state = engine.apply_intent(
        current_date=date(2025, 1, 2),
        market_state=cross_state,
        intent=AllocationIntent(
            action="sell",
            target_allocation={"btc": 0.0, "stable": 1.0},
            allocation_name="cross_down",
            immediate=True,
            reason="portfolio_cross_down_exit",
            rule_group="cross",
            decision_score=-1.0,
        ),
    )
    assert committed_state.cooldown_state.active is True

    blocked_state = engine.build_market_state(
        _context(
            day=3,
            price=55_000.0,
            sentiment={"label": "greed", "value": 70},
        )
    )
    assert blocked_state.cross_event == "cross_up"
    assert blocked_state.actionable_cross_event is None
    engine.apply_intent(
        current_date=date(2025, 1, 3),
        market_state=blocked_state,
        intent=AllocationIntent(
            action="hold",
            target_allocation=None,
            allocation_name=None,
            immediate=False,
            reason="cooldown_active",
            rule_group="cooldown",
            decision_score=0.0,
        ),
    )

    final_blocked_state = engine.build_market_state(
        _context(
            day=4,
            price=55_000.0,
            sentiment={"label": "greed", "value": 70},
        )
    )
    assert final_blocked_state.cooldown_state.active is True
    engine.apply_intent(
        current_date=date(2025, 1, 4),
        market_state=final_blocked_state,
        intent=AllocationIntent(
            action="hold",
            target_allocation=None,
            allocation_name=None,
            immediate=False,
            reason="cooldown_active",
            rule_group="cooldown",
            decision_score=0.0,
        ),
    )

    released_state = engine.build_market_state(
        _context(
            day=5,
            price=55_000.0,
            sentiment={"label": "greed", "value": 70},
        )
    )

    assert released_state.cooldown_state.active is False
    assert released_state.cross_event is None
    assert released_state.actionable_cross_event is None
