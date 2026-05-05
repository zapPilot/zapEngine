from __future__ import annotations

from typing import cast

import pytest

from src.services.backtesting.portfolio_rules.base import PortfolioRuleConfig
from src.services.backtesting.portfolio_rules.eth_btc_ratio_rotation import (
    EthBtcRatioRotationRule,
)
from src.services.backtesting.signals.dma_gated_fgi.types import (
    CrossEvent,
    DmaCooldownState,
    Zone,
)
from src.services.backtesting.signals.ratio_state import EthBtcRatioState
from tests.services.backtesting.portfolio_rules.helpers import snapshot


def _ratio_state(
    *,
    actionable_cross_event: str | None,
) -> EthBtcRatioState:
    cross_event = cast(CrossEvent | None, actionable_cross_event)
    zone = "above" if actionable_cross_event == "cross_up" else "below"
    return EthBtcRatioState(
        ratio=0.07 if zone == "above" else 0.05,
        ratio_dma_200=0.06,
        zone=cast(Zone, zone),
        cross_event=cross_event,
        actionable_cross_event=cross_event,
        cooldown_state=DmaCooldownState(
            active=False,
            remaining_days=0,
            blocked_zone=None,
        ),
    )


def test_rotation_cross_up_swaps_btc_to_eth() -> None:
    rule_snapshot = snapshot(
        current={"btc": 0.30, "eth": 0.10, "spy": 0.30, "stable": 0.30, "alt": 0.0},
        eth_btc_ratio_state=_ratio_state(actionable_cross_event="cross_up"),
    )

    intent = EthBtcRatioRotationRule().build_intent(
        rule_snapshot,
        config=PortfolioRuleConfig(),
    )

    assert intent.target_allocation["btc"] == pytest.approx(0.0)
    assert intent.target_allocation["eth"] == pytest.approx(0.40)
    assert intent.target_allocation["spy"] == pytest.approx(0.30)
    assert intent.target_allocation["stable"] == pytest.approx(0.30)
    assert intent.allocation_name == "portfolio_eth_btc_ratio_rotation_to_eth"
    assert intent.diagnostics == {"portfolio_rule_assets": ["BTC", "ETH"]}


def test_rotation_cross_down_swaps_eth_to_btc() -> None:
    rule_snapshot = snapshot(
        current={"btc": 0.10, "eth": 0.30, "spy": 0.30, "stable": 0.30, "alt": 0.0},
        eth_btc_ratio_state=_ratio_state(actionable_cross_event="cross_down"),
    )

    intent = EthBtcRatioRotationRule().build_intent(
        rule_snapshot,
        config=PortfolioRuleConfig(),
    )

    assert intent.target_allocation["btc"] == pytest.approx(0.40)
    assert intent.target_allocation["eth"] == pytest.approx(0.0)
    assert intent.target_allocation["spy"] == pytest.approx(0.30)
    assert intent.target_allocation["stable"] == pytest.approx(0.30)
    assert intent.allocation_name == "portfolio_eth_btc_ratio_rotation_to_btc"
    assert intent.diagnostics == {"portfolio_rule_assets": ["BTC", "ETH"]}


def test_rotation_does_not_match_without_actionable_cross() -> None:
    rule_snapshot = snapshot(
        eth_btc_ratio_state=_ratio_state(actionable_cross_event=None),
    )

    assert (
        EthBtcRatioRotationRule().matches(
            rule_snapshot,
            config=PortfolioRuleConfig(),
        )
        is False
    )
