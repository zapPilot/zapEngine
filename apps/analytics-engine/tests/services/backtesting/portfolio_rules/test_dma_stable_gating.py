from __future__ import annotations

from datetime import date

import pytest

from src.services.backtesting.portfolio_rules.base import PortfolioRuleConfig
from src.services.backtesting.portfolio_rules.decision_policy import (
    resolve_portfolio_rules_intent,
)
from src.services.backtesting.portfolio_rules.dma_stable_gating import (
    DmaStableGatingRule,
)
from tests.services.backtesting.portfolio_rules.helpers import snapshot, state


def test_below_dma_fear_sells_crypto_to_stable() -> None:
    rule_snapshot = snapshot(
        assets={
            "SPY": state(symbol="SPY", zone="above", dma_distance=0.05),
            "BTC": state(
                symbol="BTC",
                zone="below",
                dma_distance=-0.10,
                fgi_regime="fear",
            ),
            "ETH": state(
                symbol="ETH",
                zone="below",
                dma_distance=-0.20,
                fgi_regime="fear",
            ),
        },
        current={"btc": 0.30, "eth": 0.20, "spy": 0.10, "stable": 0.40, "alt": 0.0},
    )

    intent = DmaStableGatingRule().build_intent(
        rule_snapshot,
        config=PortfolioRuleConfig(),
    )

    assert intent.action == "sell"
    assert intent.allocation_name == "portfolio_dma_stable_gating"
    assert intent.target_allocation == pytest.approx(
        {"btc": 0.0, "eth": 0.0, "spy": 0.10, "stable": 0.90, "alt": 0.0}
    )
    assert intent.diagnostics is not None
    assert intent.diagnostics["portfolio_rule_assets"] == ["BTC", "ETH"]


def test_below_dma_extreme_fear_does_not_match() -> None:
    rule_snapshot = snapshot(
        assets={
            "BTC": state(
                symbol="BTC",
                zone="below",
                dma_distance=-0.10,
                fgi_regime="extreme_fear",
            )
        }
    )

    assert (
        DmaStableGatingRule().matches(rule_snapshot, config=PortfolioRuleConfig())
        is False
    )


def test_above_dma_fear_does_not_match() -> None:
    rule_snapshot = snapshot(
        assets={
            "BTC": state(
                symbol="BTC",
                zone="above",
                dma_distance=0.10,
                fgi_regime="fear",
            )
        }
    )

    assert (
        DmaStableGatingRule().matches(rule_snapshot, config=PortfolioRuleConfig())
        is False
    )


def test_cooldown_blocks_refire_for_30_days() -> None:
    rule_snapshot = snapshot(
        assets={
            "BTC": state(
                symbol="BTC",
                zone="below",
                dma_distance=-0.10,
                fgi_regime="fear",
            )
        },
        current={"btc": 0.30, "eth": 0.0, "spy": 0.20, "stable": 0.50, "alt": 0.0},
        current_date=date(2025, 8, 15),
    )

    intent = resolve_portfolio_rules_intent(
        rule_snapshot,
        rules=(DmaStableGatingRule(),),
        config=PortfolioRuleConfig(),
        rule_last_executed_at={"dma_stable_gating": date(2025, 8, 1)},
    )

    assert intent.action == "hold"
    assert intent.reason == "regime_no_signal"
    assert intent.diagnostics is not None
    assert intent.diagnostics["cooldown_skipped_rules"] == [
        {
            "rule": "dma_stable_gating",
            "last_executed_at": "2025-08-01",
            "cooldown_days": 30,
            "remaining_days": 16,
        }
    ]
