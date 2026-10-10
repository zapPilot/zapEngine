from __future__ import annotations

import pytest

from src.services.backtesting.portfolio_rules.base import (
    PortfolioRuleConfig,
    PortfolioSnapshot,
)
from src.services.backtesting.portfolio_rules.trend_dca_entry import TrendDcaEntryRule
from src.services.backtesting.signals.dma_gated_fgi.types import DmaCooldownState
from src.services.backtesting.sizing.weights import HeadroomSizing
from tests.services.backtesting.portfolio_rules.helpers import snapshot, state

CONFIG = PortfolioRuleConfig()


def _entry(**overrides: object) -> TrendDcaEntryRule:
    settings: dict[str, object] = {
        "name": "trend_dca_entry",
        "priority": 70,
        "cooldown_days": 7,
        "buy_step": 0.10,
        "max_weight": 0.50,
    }
    return TrendDcaEntryRule(**{**settings, **overrides})  # type: ignore[arg-type]


def _cash_day(**states: str) -> PortfolioSnapshot:
    """A portfolio that is all stable; ``states`` maps a symbol to its zone."""
    return snapshot(
        assets={
            symbol: state(
                symbol=symbol,
                zone=states.get(symbol, "below"),
                dma_distance=0.05 if states.get(symbol) == "above" else -0.05,
            )
            for symbol in ("SPY", "BTC", "ETH")
        },
        current={"btc": 0.0, "eth": 0.0, "spy": 0.0, "stable": 1.0, "alt": 0.0},
    )


def test_it_buys_a_step_into_an_asset_above_its_dma_out_of_stable() -> None:
    rule = _entry()
    day = _cash_day(BTC="above")

    assert rule.matches(day, config=CONFIG)
    intent = rule.build_intent(day, config=CONFIG)

    assert intent.action == "buy"
    assert intent.reason == "portfolio_trend_dca_entry"
    assert intent.allocation_name == "portfolio_trend_dca_entry"
    assert intent.rule_group == "dma_fgi"
    assert intent.target_allocation == pytest.approx(
        {"btc": 0.10, "eth": 0.0, "spy": 0.0, "stable": 0.90, "alt": 0.0}
    )
    assert intent.diagnostics is not None
    assert intent.diagnostics["portfolio_rule_assets"] == ["BTC"]


def test_it_buys_into_every_asset_the_trend_favors() -> None:
    rule = _entry()
    day = _cash_day(BTC="above", ETH="above")

    intent = rule.build_intent(day, config=CONFIG)

    assert intent.target_allocation == pytest.approx(
        {"btc": 0.10, "eth": 0.10, "spy": 0.0, "stable": 0.80, "alt": 0.0}
    )


def test_it_ignores_assets_below_their_dma() -> None:
    assert not _entry().matches(_cash_day(), config=CONFIG)


def test_a_purchase_never_takes_an_asset_past_its_weight_cap() -> None:
    rule = _entry(max_weight=0.50)
    day = snapshot(
        assets={"BTC": state(symbol="BTC")},
        current={"btc": 0.45, "eth": 0.0, "spy": 0.0, "stable": 0.55, "alt": 0.0},
    )

    intent = rule.build_intent(day, config=CONFIG)

    assert intent.target_allocation == pytest.approx(
        {"btc": 0.50, "eth": 0.0, "spy": 0.0, "stable": 0.50, "alt": 0.0}
    )


def test_an_asset_at_its_cap_is_not_bought_again() -> None:
    rule = _entry(max_weight=0.50)
    day = snapshot(
        assets={"BTC": state(symbol="BTC")},
        current={"btc": 0.50, "eth": 0.0, "spy": 0.0, "stable": 0.50, "alt": 0.0},
    )

    assert not rule.matches(day, config=CONFIG)


def test_with_no_stable_the_rule_does_not_match_and_shadow_the_rules_below() -> None:
    rule = _entry()
    day = snapshot(
        assets={"BTC": state(symbol="BTC")},
        current={"btc": 0.30, "eth": 0.0, "spy": 0.0, "stable": 0.0, "alt": 0.70},
    )

    assert not rule.matches(day, config=CONFIG)


def test_an_asset_barred_by_the_cross_cooldown_is_not_entered() -> None:
    rule = _entry()
    barred = DmaCooldownState(active=True, remaining_days=12, blocked_zone="above")
    day = snapshot(
        assets={
            "BTC": state(symbol="BTC", cooldown_state=barred),
            "ETH": state(symbol="ETH"),
        },
        current={"btc": 0.0, "eth": 0.0, "spy": 0.0, "stable": 1.0, "alt": 0.0},
    )

    intent = rule.build_intent(day, config=CONFIG)

    assert intent.diagnostics is not None
    assert intent.diagnostics["portfolio_rule_assets"] == ["ETH"]


def test_a_cooldown_that_bars_a_different_zone_does_not_matter() -> None:
    rule = _entry()
    barred_below = DmaCooldownState(
        active=True, remaining_days=12, blocked_zone="below"
    )
    day = snapshot(
        assets={"BTC": state(symbol="BTC", cooldown_state=barred_below)},
        current={"btc": 0.0, "eth": 0.0, "spy": 0.0, "stable": 1.0, "alt": 0.0},
    )

    assert rule.matches(day, config=CONFIG)


def test_the_weight_cap_is_the_headroom_the_rule_sizes_with() -> None:
    assert _entry(max_weight=0.35).sizing == HeadroomSizing(max_weight=0.35)
