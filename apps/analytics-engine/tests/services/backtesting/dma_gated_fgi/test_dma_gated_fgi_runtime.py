from __future__ import annotations

from datetime import date

import pytest

from src.services.backtesting.signals.contracts import SignalContext
from src.services.backtesting.signals.dma_gated_fgi.config import DmaGatedFgiConfig
from src.services.backtesting.signals.dma_gated_fgi.errors import SignalDataError
from src.services.backtesting.signals.dma_gated_fgi.signal_engine import (
    DmaSignalEngine,
)
from src.services.backtesting.signals.dma_gated_fgi.types import (
    DmaCooldownState,
    DmaMarketState,
)
from src.services.backtesting.strategies.dma_gated_fgi import (
    _resolve_dma_allocation_intent,
)


def _context(
    *,
    day: int,
    price: float,
    sentiment: dict[str, object] | None = None,
    dma_200: float | None = 50_000.0,
    ath_event: str | None = None,
    extra_data: dict[str, object] | None = None,
) -> SignalContext:
    resolved_extra_data = dict(extra_data or {})
    if dma_200 is not None:
        resolved_extra_data["dma_200"] = dma_200
    return SignalContext(
        date=date(2025, 1, day),
        price=price,
        sentiment=sentiment,
        price_history=[50_000.0, price],
        portfolio_value=10_000.0,
        ath_event=ath_event,
        extra_data=resolved_extra_data,
    )


def _market_state(
    *,
    zone: str,
    regime: str,
    ath_event: str | None = None,
    cross_event: str | None = None,
    actionable_cross_event: str | None = None,
    cooldown_state: DmaCooldownState | None = None,
) -> DmaMarketState:
    dma_distance = {"above": 0.1, "below": -0.1, "at": 0.0}[zone]
    return DmaMarketState(
        signal_id="dma_gated_fgi",
        dma_200=50_000.0,
        dma_distance=dma_distance,
        zone=zone,  # type: ignore[arg-type]
        cross_event=cross_event,  # type: ignore[arg-type]
        actionable_cross_event=actionable_cross_event,  # type: ignore[arg-type]
        cooldown_state=cooldown_state or DmaCooldownState(False, 0, None),
        fgi_value=15.0,
        fgi_slope=0.0,
        fgi_regime=regime,
        regime_source="label",
        ath_event=ath_event,  # type: ignore[arg-type]
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


def test_decision_resolver_prioritizes_dma_fgi_over_ath_fallback() -> None:
    buy_state = _market_state(
        zone="below",
        regime="extreme_fear",
        ath_event="portfolio_ath",
    )
    buy_intent = _resolve_dma_allocation_intent(buy_state)
    assert buy_intent.reason == "below_extreme_fear_buy"
    assert buy_intent.rule_group == "dma_fgi"

    sell_state = _market_state(
        zone="above",
        regime="greed",
        ath_event="both_ath",
    )
    sell_intent = _resolve_dma_allocation_intent(sell_state)
    assert sell_intent.reason == "above_greed_sell"
    assert sell_intent.rule_group == "dma_fgi"


def test_decision_resolver_above_only_ath_fallback() -> None:
    hold_intent = _resolve_dma_allocation_intent(
        _market_state(zone="below", regime="neutral", ath_event="token_ath")
    )
    assert hold_intent.reason == "regime_no_signal"
    assert hold_intent.rule_group == "none"

    ath_intent = _resolve_dma_allocation_intent(
        _market_state(zone="above", regime="neutral", ath_event="token_ath")
    )
    assert ath_intent.reason == "ath_sell"
    assert ath_intent.rule_group == "ath"


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
    assert blocked_state.actionable_cross_event == "cross_up"
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
