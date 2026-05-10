from __future__ import annotations

import pytest

from src.services.backtesting.portfolio_rules.base import PortfolioRuleConfig
from src.services.backtesting.portfolio_rules.eth_btc_continuous_weight import (
    EthBtcContinuousWeightRule,
)
from src.services.backtesting.signals.dma_gated_fgi.types import DmaCooldownState
from src.services.backtesting.signals.ratio_state import EthBtcRatioState
from tests.services.backtesting.portfolio_rules.helpers import snapshot, state


def _ratio_state(
    *,
    ratio: float,
    ratio_dma_200: float = 1.0,
    cooldown_active: bool = False,
) -> EthBtcRatioState:
    return EthBtcRatioState(
        ratio=ratio,
        ratio_dma_200=ratio_dma_200,
        zone="below" if ratio < ratio_dma_200 else "above",
        cross_event=None,
        actionable_cross_event=None,
        cooldown_state=DmaCooldownState(
            active=cooldown_active,
            remaining_days=3 if cooldown_active else 0,
            blocked_zone="below" if cooldown_active else None,
        ),
    )


def test_continuous_weight_interpolates_eth_share_and_preserves_stable() -> None:
    rule = EthBtcContinuousWeightRule(rotation_max_deviation=0.20)
    rule_snapshot = snapshot(
        assets={"BTC": state(symbol="BTC"), "ETH": state(symbol="ETH")},
        current={"btc": 0.50, "eth": 0.10, "spy": 0.0, "stable": 0.40, "alt": 0.0},
        eth_btc_ratio_state=_ratio_state(ratio=0.90),
    )

    assert rule.matches(rule_snapshot, config=PortfolioRuleConfig())
    intent = rule.build_intent(rule_snapshot, config=PortfolioRuleConfig())

    assert intent.action == "sell"
    assert intent.reason == "portfolio_eth_btc_continuous_weight"
    assert intent.rule_group == "rotation"
    assert intent.target_allocation == pytest.approx(
        {"btc": 0.15, "eth": 0.45, "spy": 0.0, "stable": 0.40, "alt": 0.0}
    )
    assert intent.diagnostics is not None
    assert intent.diagnostics["eth_btc_ratio_deviation"] == pytest.approx(-0.10)
    assert intent.diagnostics["eth_btc_target_eth_share_in_risk_on"] == pytest.approx(
        0.75
    )


def test_continuous_weight_skips_when_bucket_drift_is_below_threshold() -> None:
    rule = EthBtcContinuousWeightRule(rotation_drift_threshold=0.03)
    rule_snapshot = snapshot(
        assets={"BTC": state(symbol="BTC"), "ETH": state(symbol="ETH")},
        current={"btc": 0.16, "eth": 0.44, "spy": 0.0, "stable": 0.40, "alt": 0.0},
        eth_btc_ratio_state=_ratio_state(ratio=0.90),
    )

    assert not rule.matches(rule_snapshot, config=PortfolioRuleConfig())


def test_continuous_weight_freezes_while_ratio_cooldown_is_active() -> None:
    rule = EthBtcContinuousWeightRule()
    rule_snapshot = snapshot(
        assets={"BTC": state(symbol="BTC"), "ETH": state(symbol="ETH")},
        current={"btc": 0.50, "eth": 0.10, "spy": 0.0, "stable": 0.40, "alt": 0.0},
        eth_btc_ratio_state=_ratio_state(ratio=0.90, cooldown_active=True),
    )

    assert not rule.matches(rule_snapshot, config=PortfolioRuleConfig())
