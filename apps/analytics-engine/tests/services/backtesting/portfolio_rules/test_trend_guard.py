from __future__ import annotations

import pytest

from src.services.backtesting.decision import AllocationIntent
from src.services.backtesting.portfolio_rules.base import (
    PortfolioRuleConfig,
    PortfolioSnapshot,
)
from src.services.backtesting.portfolio_rules.trend_guard import (
    FORCE_EXIT_REASON,
    TrendGuardRule,
)
from tests.services.backtesting.portfolio_rules.helpers import snapshot, state

CONFIG = PortfolioRuleConfig()


def _guard(mode: str = "force_exit", **overrides: object) -> TrendGuardRule:
    settings: dict[str, object] = {
        "name": "trend_guard",
        "priority": 90,
        "mode": mode,
        "below_dma_buffer": 0.02,
        "confirm_days": 2,
    }
    return TrendGuardRule(**{**settings, **overrides})  # type: ignore[arg-type]


def _day(
    *,
    eth_distance: float = 0.05,
    btc_distance: float = 0.05,
    current: dict[str, float] | None = None,
) -> PortfolioSnapshot:
    return snapshot(
        assets={
            "SPY": state(symbol="SPY"),
            "BTC": state(symbol="BTC", dma_distance=btc_distance),
            "ETH": state(symbol="ETH", dma_distance=eth_distance),
        },
        current=current
        or {"btc": 0.30, "eth": 0.30, "spy": 0.20, "stable": 0.20, "alt": 0.0},
    )


def _intent(
    target: dict[str, float],
    *,
    action: str = "hold",
    reason: str = "regime_no_signal",
    diagnostics: dict[str, object] | None = None,
) -> AllocationIntent:
    return AllocationIntent(
        action=action,  # type: ignore[arg-type]
        target_allocation=target,
        allocation_name=None if action == "hold" else f"portfolio_{reason}",
        immediate=action != "hold",
        reason=reason,
        rule_group="none" if action == "hold" else "dma_fgi",
        decision_score=0.0,
        diagnostics=diagnostics,
    )


def _confirm(rule: TrendGuardRule, *days: PortfolioSnapshot) -> None:
    for day in days:
        rule.observe(day, config=CONFIG)


def _adjust(rule: TrendGuardRule, intent: AllocationIntent, day: PortfolioSnapshot):
    return rule.apply_post_intent_adjustments(
        intent=intent, snapshot=day, config=CONFIG
    )


def test_an_asset_counts_as_below_after_confirm_days_in_a_row() -> None:
    rule = _guard(confirm_days=3)
    below = _day(eth_distance=-0.05)

    _confirm(rule, below, below)
    assert rule._confirmed_below(below) == []

    _confirm(rule, below)
    assert rule._confirmed_below(below) == ["ETH"]


def test_a_day_back_above_starts_the_count_again() -> None:
    rule = _guard(confirm_days=2)
    below = _day(eth_distance=-0.05)
    above = _day(eth_distance=0.01)

    _confirm(rule, below, above, below)

    assert rule._confirmed_below(below) == []


def test_the_buffer_is_how_far_below_the_dma_a_close_must_be() -> None:
    rule = _guard(below_dma_buffer=0.02, confirm_days=1)

    _confirm(rule, _day(eth_distance=-0.02))
    assert rule._confirmed_below(_day()) == []

    _confirm(rule, _day(eth_distance=-0.0201))
    assert rule._confirmed_below(_day()) == ["ETH"]


def test_without_a_buffer_a_close_under_the_dma_counts() -> None:
    rule = _guard(below_dma_buffer=0.0, confirm_days=1)

    _confirm(rule, _day(eth_distance=-0.0001, btc_distance=0.0))

    assert rule._confirmed_below(_day()) == ["ETH"]


def test_reset_forgets_the_count() -> None:
    rule = _guard(confirm_days=1)
    _confirm(rule, _day(eth_distance=-0.05))

    rule.reset()

    assert rule._confirmed_below(_day()) == []


def test_force_exit_sells_a_position_held_below_the_trend() -> None:
    rule = _guard("force_exit", confirm_days=1)
    day = _day(eth_distance=-0.05)
    _confirm(rule, day)

    adjusted = _adjust(
        rule, _intent({"btc": 0.30, "eth": 0.30, "spy": 0.20, "stable": 0.20}), day
    )

    assert adjusted.target_allocation == pytest.approx(
        {"btc": 0.30, "eth": 0.0, "spy": 0.20, "stable": 0.50, "alt": 0.0}
    )
    assert adjusted.action == "sell"
    assert adjusted.reason == FORCE_EXIT_REASON
    assert adjusted.allocation_name == FORCE_EXIT_REASON
    assert adjusted.immediate is True
    assert adjusted.rule_group == "cross"
    assert adjusted.diagnostics is not None
    assert adjusted.diagnostics["post_intent_adjustments"] == ["trend_guard_force_exit"]
    assert adjusted.diagnostics["trend_guard_released"] == pytest.approx({"ETH": 0.30})


def test_force_exit_keeps_the_label_of_the_rule_that_decided() -> None:
    rule = _guard("force_exit", confirm_days=1)
    day = _day(eth_distance=-0.05)
    _confirm(rule, day)
    rotation = _intent(
        {"btc": 0.0, "eth": 0.60, "spy": 0.20, "stable": 0.20},
        action="sell",
        reason="portfolio_eth_btc_ratio_rotation_to_eth",
        diagnostics={"post_intent_adjustments": ["an_earlier_adjustment"]},
    )

    adjusted = _adjust(rule, rotation, day)

    assert adjusted.target_allocation == pytest.approx(
        {"btc": 0.0, "eth": 0.0, "spy": 0.20, "stable": 0.80, "alt": 0.0}
    )
    assert adjusted.reason == "portfolio_eth_btc_ratio_rotation_to_eth"
    assert adjusted.action == "sell"
    assert adjusted.diagnostics is not None
    assert adjusted.diagnostics["post_intent_adjustments"] == [
        "an_earlier_adjustment",
        "trend_guard_force_exit",
    ]


def test_force_exit_is_level_triggered_so_it_does_not_churn() -> None:
    rule = _guard("force_exit", confirm_days=1)
    day = _day(
        eth_distance=-0.05,
        current={"btc": 0.30, "eth": 0.0, "spy": 0.20, "stable": 0.50, "alt": 0.0},
    )
    _confirm(rule, day)
    holding = _intent({"btc": 0.30, "eth": 0.0, "spy": 0.20, "stable": 0.50})

    assert _adjust(rule, holding, day) is holding


def test_block_adds_undoes_a_purchase_of_an_asset_below_the_trend() -> None:
    rule = _guard("block_adds", confirm_days=1)
    day = _day(
        eth_distance=-0.05,
        current={"btc": 0.20, "eth": 0.10, "spy": 0.10, "stable": 0.60, "alt": 0.0},
    )
    _confirm(rule, day)
    entry = _intent(
        {"btc": 0.30, "eth": 0.20, "spy": 0.10, "stable": 0.40},
        action="buy",
        reason="portfolio_trend_dca_entry",
    )

    adjusted = _adjust(rule, entry, day)

    assert adjusted.target_allocation == pytest.approx(
        {"btc": 0.30, "eth": 0.10, "spy": 0.10, "stable": 0.50, "alt": 0.0}
    )
    assert adjusted.action == "buy"
    assert adjusted.reason == "portfolio_trend_dca_entry"
    assert adjusted.diagnostics is not None
    assert adjusted.diagnostics["post_intent_adjustments"] == ["trend_guard_block_adds"]
    assert adjusted.diagnostics["trend_guard_released"] == pytest.approx({"ETH": 0.10})


def test_block_adds_leaves_what_is_held_and_what_is_sold_alone() -> None:
    rule = _guard("block_adds", confirm_days=1)
    day = _day(eth_distance=-0.05)
    _confirm(rule, day)
    sale = _intent(
        {"btc": 0.30, "eth": 0.10, "spy": 0.20, "stable": 0.40},
        action="sell",
        reason="portfolio_dma_overextension_dca_sell",
    )

    assert _adjust(rule, sale, day) is sale
    hold = _intent({"btc": 0.30, "eth": 0.30, "spy": 0.20, "stable": 0.20})
    assert _adjust(rule, hold, day) is hold


def test_nothing_changes_while_no_asset_is_confirmed_below() -> None:
    rule = _guard("force_exit", confirm_days=3)
    day = _day(eth_distance=-0.05)
    _confirm(rule, day)
    intent = _intent({"btc": 0.30, "eth": 0.30, "spy": 0.20, "stable": 0.20})

    assert _adjust(rule, intent, day) is intent


def test_an_intent_without_a_target_is_left_alone() -> None:
    rule = _guard("force_exit", confirm_days=1)
    day = _day(eth_distance=-0.05)
    _confirm(rule, day)
    intent = AllocationIntent(
        action="hold",
        target_allocation=None,
        allocation_name=None,
        immediate=False,
        reason="regime_no_signal",
        rule_group="none",
        decision_score=0.0,
    )

    assert _adjust(rule, intent, day) is intent


def test_every_asset_confirmed_below_is_capped() -> None:
    rule = _guard("force_exit", confirm_days=1)
    day = _day(eth_distance=-0.05, btc_distance=-0.10)
    _confirm(rule, day)

    adjusted = _adjust(
        rule, _intent({"btc": 0.30, "eth": 0.30, "spy": 0.20, "stable": 0.20}), day
    )

    assert adjusted.target_allocation == pytest.approx(
        {"btc": 0.0, "eth": 0.0, "spy": 0.20, "stable": 0.80, "alt": 0.0}
    )


def test_the_guard_is_an_overlay_that_never_decides_a_day_by_itself() -> None:
    rule = _guard()
    day = _day()

    assert rule.matches(day, config=CONFIG) is False
    with pytest.raises(ValueError, match="only supports post-intent adjustments"):
        rule.build_intent(day, config=CONFIG)
