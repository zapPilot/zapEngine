from __future__ import annotations

from datetime import date

import pytest

from src.services.backtesting.execution.portfolio import Portfolio
from src.services.backtesting.signals.contracts import SignalContext
from src.services.backtesting.signals.dma_gated_fgi.component import (
    DmaGatedFgiSignalComponent,
    _hold_intent,
    _hold_reason,
    _resolve_dma_allocation_intent,
    _target_intent,
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


def test_decision_resolver_prioritizes_dma_fgi_over_ath_fallback() -> None:
    buy_state = state(
        symbol="BTC",
        zone="below",
        fgi_regime="extreme_fear",
        ath_event="portfolio_ath",
    )
    buy_intent = _resolve_dma_allocation_intent(buy_state)
    assert buy_intent.reason == "below_extreme_fear_buy"
    assert buy_intent.rule_group == "dma_fgi"

    sell_state = state(
        symbol="BTC",
        zone="above",
        fgi_regime="greed",
        ath_event="both_ath",
    )
    sell_intent = _resolve_dma_allocation_intent(sell_state)
    assert sell_intent.reason == "above_greed_sell"
    assert sell_intent.rule_group == "dma_fgi"


def test_component_intent_helpers_delegate_to_tactical_contracts() -> None:
    assert _hold_reason("at") == "price_equal_dma_hold"

    hold = _hold_intent(reason="custom_hold", rule_group="cooldown")
    assert hold.action == "hold"
    assert hold.reason == "custom_hold"

    target = _target_intent(
        action="buy",
        target={"btc": 1.0, "stable": 0.0},
        allocation_name="all_btc",
        reason="below_extreme_fear_buy",
        rule_group="dma_fgi",
        immediate=True,
    )
    assert target.action == "buy"
    assert target.immediate is True
    assert target.target_allocation == {"btc": 1.0, "stable": 0.0}


def test_decision_resolver_holds_when_matching_rule_is_disabled() -> None:
    intent = _resolve_dma_allocation_intent(
        state(symbol="BTC", zone="below", fgi_regime="extreme_fear"),
        disabled_rules=frozenset({"below_extreme_fear_buy"}),
    )

    assert intent.action == "hold"
    assert intent.reason == "regime_no_signal"
    assert intent.diagnostics == {"matched_rule_name": "regime_no_signal_hold"}


def test_decision_resolver_fallback_holds_when_rule_registry_is_empty() -> None:
    intent = _resolve_dma_allocation_intent(
        state(symbol="BTC", zone="at", fgi_regime="neutral"),
        rules=(),
    )

    assert intent.action == "hold"
    assert intent.reason == "price_equal_dma_hold"
    assert intent.diagnostics == {"matched_rule_name": "regime_no_signal_hold"}


def test_decision_resolver_above_only_ath_fallback() -> None:
    hold_intent = _resolve_dma_allocation_intent(
        state(
            symbol="BTC",
            zone="below",
            fgi_regime="neutral",
            ath_event="token_ath",
        )
    )
    assert hold_intent.reason == "regime_no_signal"
    assert hold_intent.rule_group == "none"

    ath_intent = _resolve_dma_allocation_intent(
        state(
            symbol="BTC",
            zone="above",
            fgi_regime="neutral",
            ath_event="token_ath",
        )
    )
    assert ath_intent.reason == "ath_sell"
    assert ath_intent.rule_group == "ath"


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
    intent = _resolve_dma_allocation_intent(market_state)

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


def test_component_builds_spy_macro_execution_hints_for_buy_gate() -> None:
    component = DmaGatedFgiSignalComponent()
    market_state = state(
        symbol="SPY",
        zone="below",
        dma_distance=-0.12,
        fgi_regime="neutral",
        macro_fear_greed_regime="extreme_fear",
        macro_fear_greed_value=4.0,
    )
    intent = _resolve_dma_allocation_intent(market_state)

    hints = component.build_execution_hints(
        snapshot=market_state,
        intent=intent,
        signal_confidence=0.81,
    )

    assert intent.reason == "spy_below_extreme_fear_buy"
    assert hints.enable_buy_gate is True
    assert hints.buy_strength is not None
    assert hints.current_regime == "extreme_fear"
    assert hints.signal_value == pytest.approx(4.0)
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
    intent = _resolve_dma_allocation_intent(market_state)
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
    cross_intent = _resolve_dma_allocation_intent(cross_state)
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
    blocked_intent = _resolve_dma_allocation_intent(blocked_state)

    assert committed_cross_state.cooldown_state.blocked_zone == "above"
    assert committed_debug_state.signal_cooldown_blocked_zone == "above"
    assert committed_debug_state.trade_cooldown_blocked_zone == "above"
    assert committed_debug_state.signal_cooldown_end_date == date(2025, 2, 1)
    assert committed_debug_state.trade_cooldown_end_date == date(2025, 2, 1)
    assert blocked_intent.reason == "above_side_cooldown_active"
    assert blocked_intent.rule_group == "cooldown"


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
        intent=_resolve_dma_allocation_intent(cross_state),
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
        intent=_resolve_dma_allocation_intent(blocked_state),
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
        intent=_resolve_dma_allocation_intent(final_blocked_state),
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
