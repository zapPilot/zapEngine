from __future__ import annotations

from datetime import date, timedelta

import pytest

from src.services.backtesting.portfolio_rules.base import (
    PortfolioRuleConfig,
    PortfolioSnapshot,
)
from src.services.backtesting.portfolio_rules.extreme_fear_dca_buy import (
    ExtremeFearDcaBuyRule,
)
from tests.services.backtesting.portfolio_rules.helpers import snapshot, state


def _delay_snapshot(
    *,
    current_date: date,
    btc_regime: str = "neutral",
    eth_regime: str = "neutral",
    btc_open: bool = True,
    eth_open: bool = False,
) -> PortfolioSnapshot:
    return snapshot(
        assets={
            "SPY": state(symbol="SPY"),
            "BTC": state(symbol="BTC", fgi_regime=btc_regime),
            "ETH": state(symbol="ETH", fgi_regime=eth_regime),
        },
        current={"btc": 0.10, "eth": 0.20, "spy": 0.0, "stable": 0.70, "alt": 0.0},
        cycle_open={"BTC": btc_open, "ETH": eth_open},
        current_date=current_date,
    )


def test_extreme_fear_buy_uses_macro_fgi_for_spy() -> None:
    rule = ExtremeFearDcaBuyRule()
    rule_snapshot = snapshot(
        assets={
            "SPY": state(
                symbol="SPY",
                zone="below",
                dma_distance=-0.05,
                fgi_regime="neutral",
                macro_fear_greed_regime="extreme_fear",
            ),
            "BTC": state(symbol="BTC"),
            "ETH": state(symbol="ETH"),
        },
        current={"btc": 0.0, "eth": 0.0, "spy": 0.0, "stable": 1.0, "alt": 0.0},
        macro_regime="extreme_fear",
        crypto_regime="neutral",
        cycle_open={"SPY": True},
    )

    intent = rule.build_intent(rule_snapshot, config=PortfolioRuleConfig())

    assert rule.matches(rule_snapshot, config=PortfolioRuleConfig())
    assert intent.action == "buy"
    assert intent.reason == "portfolio_extreme_fear_dca_buy"
    assert intent.target_allocation == pytest.approx(
        {"btc": 0.0, "eth": 0.0, "spy": 0.01, "stable": 0.99, "alt": 0.0}
    )
    assert intent.diagnostics == {"portfolio_rule_assets": ["SPY"]}


def test_extreme_fear_buy_uses_crypto_fgi_for_btc_and_eth() -> None:
    rule = ExtremeFearDcaBuyRule()
    rule_snapshot = snapshot(
        assets={
            "SPY": state(
                symbol="SPY",
                zone="below",
                dma_distance=-0.05,
                macro_fear_greed_regime="neutral",
            ),
            "BTC": state(symbol="BTC", zone="below", dma_distance=-0.05),
            "ETH": state(symbol="ETH", zone="below", dma_distance=-0.04),
        },
        current={"btc": 0.10, "eth": 0.20, "spy": 0.0, "stable": 0.70, "alt": 0.0},
        macro_regime="neutral",
        crypto_regime="extreme_fear",
        cycle_open={"BTC": True, "ETH": True},
    )

    intent = rule.build_intent(rule_snapshot, config=PortfolioRuleConfig())

    assert intent.target_allocation == pytest.approx(
        {"btc": 0.11, "eth": 0.21, "spy": 0.0, "stable": 0.68, "alt": 0.0}
    )
    assert intent.diagnostics is not None
    assert intent.diagnostics["portfolio_rule_assets"] == ["BTC", "ETH"]


def test_extreme_fear_buy_caps_by_available_stable() -> None:
    rule = ExtremeFearDcaBuyRule(buy_step=0.05)
    rule_snapshot = snapshot(
        assets={
            "SPY": state(symbol="SPY"),
            "BTC": state(symbol="BTC", zone="below", dma_distance=-0.05),
            "ETH": state(symbol="ETH", zone="below", dma_distance=-0.04),
        },
        current={"btc": 0.48, "eth": 0.48, "spy": 0.0, "stable": 0.04, "alt": 0.0},
        crypto_regime="extreme_fear",
        cycle_open={"BTC": True, "ETH": True},
    )

    intent = rule.build_intent(rule_snapshot, config=PortfolioRuleConfig())

    assert intent.target_allocation == pytest.approx(
        {"btc": 0.50, "eth": 0.50, "spy": 0.0, "stable": 0.0, "alt": 0.0}
    )


def test_extreme_fear_buy_includes_above_dma_assets() -> None:
    rule = ExtremeFearDcaBuyRule()
    rule_snapshot = snapshot(
        assets={
            "SPY": state(
                symbol="SPY",
                zone="above",
                dma_distance=0.05,
                fgi_regime="neutral",
                macro_fear_greed_regime="extreme_fear",
            ),
            "BTC": state(symbol="BTC", zone="above", dma_distance=0.05),
            "ETH": state(symbol="ETH", zone="below", dma_distance=-0.05),
        },
        current={"btc": 0.0, "eth": 0.0, "spy": 0.0, "stable": 1.0, "alt": 0.0},
        macro_regime="extreme_fear",
        crypto_regime="neutral",
        cycle_open={"SPY": True},
    )

    intent = rule.build_intent(rule_snapshot, config=PortfolioRuleConfig())

    assert rule.matches(rule_snapshot, config=PortfolioRuleConfig())
    assert intent.action == "buy"
    assert intent.diagnostics is not None
    assert intent.diagnostics["portfolio_rule_assets"] == ["SPY"]


def test_extreme_fear_buy_excludes_non_extreme_fear_assets() -> None:
    rule = ExtremeFearDcaBuyRule()
    rule_snapshot = snapshot(
        assets={
            "SPY": state(
                symbol="SPY",
                zone="below",
                dma_distance=-0.05,
                macro_fear_greed_regime="neutral",
            ),
            "BTC": state(symbol="BTC", zone="below", dma_distance=-0.05),
            "ETH": state(symbol="ETH", zone="above", dma_distance=0.05),
        },
        current={"btc": 0.0, "eth": 0.0, "spy": 0.0, "stable": 1.0, "alt": 0.0},
        macro_regime="neutral",
        crypto_regime="neutral",
        cycle_open={"BTC": True, "ETH": True, "SPY": True},
    )

    assert not rule.matches(rule_snapshot, config=PortfolioRuleConfig())


def test_extreme_fear_buy_blocked_when_cycle_closed() -> None:
    rule = ExtremeFearDcaBuyRule()
    rule_snapshot = snapshot(
        assets={
            "SPY": state(symbol="SPY"),
            "BTC": state(symbol="BTC", fgi_regime="extreme_fear"),
            "ETH": state(symbol="ETH"),
        },
        current={"btc": 0.10, "eth": 0.0, "spy": 0.0, "stable": 0.90, "alt": 0.0},
        crypto_regime="extreme_fear",
        cycle_open={"BTC": False},
    )

    assert rule.matches(rule_snapshot, config=PortfolioRuleConfig()) is False


def test_extreme_fear_buy_fires_when_cycle_open() -> None:
    rule = ExtremeFearDcaBuyRule()
    rule_snapshot = snapshot(
        assets={
            "SPY": state(symbol="SPY"),
            "BTC": state(symbol="BTC", fgi_regime="extreme_fear"),
            "ETH": state(symbol="ETH"),
        },
        current={"btc": 0.10, "eth": 0.0, "spy": 0.0, "stable": 0.90, "alt": 0.0},
        crypto_regime="extreme_fear",
        cycle_open={"BTC": True},
    )

    assert rule.matches(rule_snapshot, config=PortfolioRuleConfig()) is True
    intent = rule.build_intent(rule_snapshot, config=PortfolioRuleConfig())
    assert (
        intent.target_allocation["btc"] > rule_snapshot.current_asset_allocation["btc"]
    )


def test_extreme_fear_buy_per_asset_gate() -> None:
    rule_snapshot = snapshot(
        assets={
            "SPY": state(symbol="SPY"),
            "BTC": state(symbol="BTC", fgi_regime="extreme_fear"),
            "ETH": state(symbol="ETH", fgi_regime="extreme_fear"),
        },
        current={"btc": 0.10, "eth": 0.10, "spy": 0.0, "stable": 0.80, "alt": 0.0},
        crypto_regime="extreme_fear",
        cycle_open={"BTC": True, "ETH": False},
    )

    intent = ExtremeFearDcaBuyRule().build_intent(
        rule_snapshot,
        config=PortfolioRuleConfig(),
    )
    diagnostics_assets = intent.diagnostics["portfolio_rule_assets"]
    assert "BTC" in diagnostics_assets
    assert "ETH" not in diagnostics_assets


def test_extreme_fear_buy_delay_zero_uses_immediate_path() -> None:
    rule = ExtremeFearDcaBuyRule(buy_delay_days=0)
    rule_snapshot = _delay_snapshot(
        current_date=date(2026, 1, 1),
        btc_regime="extreme_fear",
    )

    rule.observe(rule_snapshot, config=PortfolioRuleConfig())

    assert rule._detection_dates == {}
    assert rule.matches(rule_snapshot, config=PortfolioRuleConfig())
    intent = rule.build_intent(rule_snapshot, config=PortfolioRuleConfig())
    assert intent.action == "buy"
    assert intent.reason == "portfolio_extreme_fear_dca_buy"
    assert intent.target_allocation == pytest.approx(
        {"btc": 0.11, "eth": 0.20, "spy": 0.0, "stable": 0.69, "alt": 0.0}
    )
    assert intent.diagnostics is not None
    assert intent.diagnostics["portfolio_rule_assets"] == ["BTC"]


def test_extreme_fear_buy_delay_waits_until_delay_elapses() -> None:
    detected_at = date(2026, 1, 1)
    rule = ExtremeFearDcaBuyRule(buy_delay_days=3)
    detection_snapshot = _delay_snapshot(
        current_date=detected_at,
        btc_regime="extreme_fear",
    )
    day_two_snapshot = _delay_snapshot(
        current_date=detected_at + timedelta(days=2),
        btc_regime="neutral",
    )

    rule.observe(detection_snapshot, config=PortfolioRuleConfig())
    assert not rule.matches(detection_snapshot, config=PortfolioRuleConfig())

    rule.observe(day_two_snapshot, config=PortfolioRuleConfig())
    assert not rule.matches(day_two_snapshot, config=PortfolioRuleConfig())


def test_extreme_fear_buy_delay_fires_after_delay_even_if_fgi_recovers() -> None:
    detected_at = date(2026, 1, 1)
    rule = ExtremeFearDcaBuyRule(buy_delay_days=3)
    detection_snapshot = _delay_snapshot(
        current_date=detected_at,
        btc_regime="extreme_fear",
    )
    recovered_snapshot = _delay_snapshot(
        current_date=detected_at + timedelta(days=3),
        btc_regime="neutral",
    )

    rule.observe(detection_snapshot, config=PortfolioRuleConfig())
    rule.observe(recovered_snapshot, config=PortfolioRuleConfig())

    assert rule.matches(recovered_snapshot, config=PortfolioRuleConfig())
    intent = rule.build_intent(recovered_snapshot, config=PortfolioRuleConfig())
    assert intent.target_allocation == pytest.approx(
        {"btc": 0.11, "eth": 0.20, "spy": 0.0, "stable": 0.69, "alt": 0.0}
    )
    assert intent.diagnostics is not None
    assert intent.diagnostics["portfolio_rule_assets"] == ["BTC"]


def test_extreme_fear_buy_delay_drops_detection_when_cycle_closes() -> None:
    detected_at = date(2026, 1, 1)
    rule = ExtremeFearDcaBuyRule(buy_delay_days=3)
    detection_snapshot = _delay_snapshot(
        current_date=detected_at,
        btc_regime="extreme_fear",
    )
    closed_cycle_snapshot = _delay_snapshot(
        current_date=detected_at + timedelta(days=1),
        btc_open=False,
    )
    recovered_snapshot = _delay_snapshot(
        current_date=detected_at + timedelta(days=3),
        btc_regime="neutral",
    )

    rule.observe(detection_snapshot, config=PortfolioRuleConfig())
    rule.observe(closed_cycle_snapshot, config=PortfolioRuleConfig())
    rule.observe(recovered_snapshot, config=PortfolioRuleConfig())

    assert "BTC" not in rule._detection_dates
    assert not rule.matches(recovered_snapshot, config=PortfolioRuleConfig())


def test_extreme_fear_buy_delay_clears_detection_after_fire() -> None:
    detected_at = date(2026, 1, 1)
    rule = ExtremeFearDcaBuyRule(buy_delay_days=3)
    detection_snapshot = _delay_snapshot(
        current_date=detected_at,
        btc_regime="extreme_fear",
    )
    fire_snapshot = _delay_snapshot(
        current_date=detected_at + timedelta(days=3),
        btc_regime="neutral",
    )

    rule.observe(detection_snapshot, config=PortfolioRuleConfig())
    rule.observe(fire_snapshot, config=PortfolioRuleConfig())
    intent = rule.build_intent(fire_snapshot, config=PortfolioRuleConfig())
    rule.record_intent(intent)

    assert "BTC" not in rule._detection_dates


def test_extreme_fear_buy_delay_tracks_each_symbol_independently() -> None:
    detected_at = date(2026, 1, 1)
    rule = ExtremeFearDcaBuyRule(buy_delay_days=3)
    btc_detection_snapshot = _delay_snapshot(
        current_date=detected_at,
        btc_regime="extreme_fear",
        eth_open=True,
    )
    eth_detection_snapshot = _delay_snapshot(
        current_date=detected_at + timedelta(days=2),
        eth_regime="extreme_fear",
        eth_open=True,
    )
    btc_fire_snapshot = _delay_snapshot(
        current_date=detected_at + timedelta(days=3),
        eth_open=True,
    )
    eth_fire_snapshot = _delay_snapshot(
        current_date=detected_at + timedelta(days=5),
        eth_open=True,
    )

    rule.observe(btc_detection_snapshot, config=PortfolioRuleConfig())
    rule.observe(eth_detection_snapshot, config=PortfolioRuleConfig())
    rule.observe(btc_fire_snapshot, config=PortfolioRuleConfig())

    btc_intent = rule.build_intent(btc_fire_snapshot, config=PortfolioRuleConfig())
    assert btc_intent.diagnostics is not None
    assert btc_intent.diagnostics["portfolio_rule_assets"] == ["BTC"]

    rule.record_intent(btc_intent)
    rule.observe(eth_fire_snapshot, config=PortfolioRuleConfig())

    eth_intent = rule.build_intent(eth_fire_snapshot, config=PortfolioRuleConfig())
    assert eth_intent.diagnostics is not None
    assert eth_intent.diagnostics["portfolio_rule_assets"] == ["ETH"]


def test_extreme_fear_buy_delay_reset_clears_detection_state() -> None:
    rule = ExtremeFearDcaBuyRule(buy_delay_days=3)
    rule_snapshot = _delay_snapshot(
        current_date=date(2026, 1, 1),
        btc_regime="extreme_fear",
    )

    rule.observe(rule_snapshot, config=PortfolioRuleConfig())
    assert rule._detection_dates

    rule.reset()

    assert rule._detection_dates == {}
