from __future__ import annotations

from typing import cast

import pytest

from src.services.backtesting.decision import AllocationIntent
from src.services.backtesting.signals.dma_gated_fgi.types import (
    AthEvent,
    BlockedZone,
    CrossEvent,
    DmaCooldownState,
    DmaMarketState,
    Zone,
)
from src.services.backtesting.strategies.dma_gated_fgi import (
    _resolve_dma_allocation_intent,
)
from src.services.backtesting.tactics.base import RuleConfig
from src.services.backtesting.tactics.rules import DEFAULT_RULES


def _state(
    *,
    zone: str = "above",
    dma_distance: float = 0.05,
    cross_event: str | None = None,
    actionable_cross_event: str | None = None,
    cooldown_active: bool = False,
    cooldown_blocked_zone: str | None = None,
    fgi_regime: str = "neutral",
    fgi_slope: float = 0.0,
    ath_event: str | None = None,
) -> DmaMarketState:
    return DmaMarketState(
        signal_id="dma_gated_fgi",
        dma_200=100.0,
        dma_distance=dma_distance,
        zone=cast(Zone, zone),
        cross_event=cast(CrossEvent | None, cross_event),
        actionable_cross_event=cast(CrossEvent | None, actionable_cross_event),
        cooldown_state=DmaCooldownState(
            active=cooldown_active,
            remaining_days=3 if cooldown_active else 0,
            blocked_zone=cast(BlockedZone | None, cooldown_blocked_zone),
        ),
        fgi_value=50.0,
        fgi_slope=fgi_slope,
        fgi_regime=fgi_regime,
        regime_source="value",
        ath_event=cast(AthEvent | None, ath_event),
    )


RULE_CASES: dict[str, tuple[DmaMarketState, str, str]] = {
    "actionable_cross_cooldown_block": (
        _state(
            cross_event="cross_down",
            actionable_cross_event="cross_down",
            cooldown_active=True,
            cooldown_blocked_zone="below",
        ),
        "hold",
        "below_side_cooldown_active",
    ),
    "actionable_cross_down_sell": (
        _state(cross_event="cross_down", actionable_cross_event="cross_down"),
        "sell",
        "dma_cross_down",
    ),
    "actionable_cross_up_buy": (
        _state(
            zone="below",
            cross_event="cross_up",
            actionable_cross_event="cross_up",
        ),
        "buy",
        "dma_cross_up",
    ),
    "zone_cooldown_hold": (
        _state(cooldown_active=True, cooldown_blocked_zone="above"),
        "hold",
        "above_side_cooldown_active",
    ),
    "above_overextended_sell": (
        _state(dma_distance=0.31),
        "sell",
        "above_dma_overextended_sell",
    ),
    "above_extreme_greed_sell": (
        _state(fgi_regime="extreme_greed"),
        "sell",
        "above_extreme_greed_sell",
    ),
    "above_greed_fading_sell": (
        _state(fgi_regime="greed", fgi_slope=-0.10),
        "sell",
        "above_greed_fading_sell",
    ),
    "above_greed_sell": (
        _state(fgi_regime="greed"),
        "sell",
        "above_greed_sell",
    ),
    "below_extreme_fear_buy": (
        _state(zone="below", dma_distance=-0.05, fgi_regime="extreme_fear"),
        "buy",
        "below_extreme_fear_buy",
    ),
    "below_fear_recovering_buy": (
        _state(
            zone="below",
            dma_distance=-0.05,
            fgi_regime="fear",
            fgi_slope=0.10,
        ),
        "buy",
        "below_fear_recovering_buy",
    ),
    "above_ath_sell": (
        _state(ath_event="token_ath"),
        "sell",
        "ath_sell",
    ),
    "regime_no_signal_hold": (
        _state(zone="at", dma_distance=0.0),
        "hold",
        "price_equal_dma_hold",
    ),
}


@pytest.mark.parametrize("rule", DEFAULT_RULES, ids=lambda rule: rule.name)
def test_each_rule_unit_isolation(rule) -> None:
    snapshot, expected_action, expected_reason = RULE_CASES[rule.name]

    assert rule.matches(snapshot, config=RuleConfig())
    intent = rule.build_intent(snapshot, config=RuleConfig())

    assert isinstance(intent, AllocationIntent)
    assert intent.action == expected_action
    assert intent.reason == expected_reason
    assert intent.rule_group == rule.rule_group


def test_rule_priority_ordering() -> None:
    snapshot = _state(fgi_regime="extreme_greed", fgi_slope=-0.10)

    intent = _resolve_dma_allocation_intent(snapshot)

    assert intent.reason == "above_extreme_greed_sell"
    assert intent.diagnostics == {"matched_rule_name": "above_extreme_greed_sell"}


def test_disabled_rules_skip() -> None:
    snapshot = _state(fgi_regime="extreme_greed", fgi_slope=-0.10)

    intent = _resolve_dma_allocation_intent(
        snapshot,
        disabled_rules=frozenset({"above_extreme_greed_sell"}),
    )

    assert intent.reason == "above_greed_fading_sell"


def test_disabled_plain_greed_falls_through_to_hold() -> None:
    snapshot = _state(fgi_regime="greed")

    intent = _resolve_dma_allocation_intent(
        snapshot,
        disabled_rules=frozenset({"above_greed_sell"}),
    )

    assert intent.action == "hold"
    assert intent.reason == "regime_no_signal"
