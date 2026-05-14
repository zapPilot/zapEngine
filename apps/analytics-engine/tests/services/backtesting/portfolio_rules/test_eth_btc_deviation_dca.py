from __future__ import annotations

from datetime import date
from typing import cast

import pytest

from src.services.backtesting.portfolio_rules.base import PortfolioRuleConfig
from src.services.backtesting.portfolio_rules.cooldown_tracker import (
    RuleCooldownTracker,
)
from src.services.backtesting.portfolio_rules.decision_policy import (
    resolve_portfolio_rules_intent,
)
from src.services.backtesting.portfolio_rules.eth_btc_deviation_dca import (
    EthBtcDeviationDcaRule,
)
from src.services.backtesting.signals.dma_gated_fgi.types import (
    DmaCooldownState,
    Zone,
)
from src.services.backtesting.signals.ratio_state import EthBtcRatioState
from tests.services.backtesting.portfolio_rules.helpers import snapshot


def _ratio_state(deviation: float) -> EthBtcRatioState:
    ratio_dma = 1.0
    ratio = ratio_dma * (1.0 + deviation)
    zone = "above" if deviation > 0 else "below" if deviation < 0 else "at"
    return EthBtcRatioState(
        ratio=ratio,
        ratio_dma_200=ratio_dma,
        zone=cast(Zone, zone),
        cross_event=None,
        actionable_cross_event=None,
        cooldown_state=DmaCooldownState(
            active=False,
            remaining_days=0,
            blocked_zone=None,
        ),
    )


def test_below_threshold_does_not_match() -> None:
    rule_snapshot = snapshot(eth_btc_ratio_state=_ratio_state(-0.49))

    assert (
        EthBtcDeviationDcaRule().matches(
            rule_snapshot,
            config=PortfolioRuleConfig(),
        )
        is False
    )


def test_dca_tier_moves_25_percent_btc_to_eth() -> None:
    rule_snapshot = snapshot(
        current={"btc": 0.40, "eth": 0.10, "spy": 0.20, "stable": 0.30, "alt": 0.0},
        eth_btc_ratio_state=_ratio_state(-0.55),
    )

    intent = EthBtcDeviationDcaRule().build_intent(
        rule_snapshot,
        config=PortfolioRuleConfig(),
    )

    assert intent.action == "sell"
    assert intent.allocation_name == "portfolio_eth_btc_deviation_dca_to_eth"
    assert intent.target_allocation["btc"] == pytest.approx(0.30)
    assert intent.target_allocation["eth"] == pytest.approx(0.20)
    assert intent.target_allocation["spy"] == pytest.approx(0.20)
    assert intent.target_allocation["stable"] == pytest.approx(0.30)
    assert intent.diagnostics is not None
    assert intent.diagnostics["portfolio_rule_cooldown_key"] == [
        "eth_btc_deviation_dca",
        "dca_to_eth",
    ]


def test_large_tier_moves_75_percent_btc_to_eth() -> None:
    rule_snapshot = snapshot(
        current={"btc": 0.40, "eth": 0.10, "spy": 0.20, "stable": 0.30, "alt": 0.0},
        eth_btc_ratio_state=_ratio_state(-0.70),
    )

    intent = EthBtcDeviationDcaRule().build_intent(
        rule_snapshot,
        config=PortfolioRuleConfig(),
    )

    assert intent.allocation_name == "portfolio_eth_btc_deviation_large_to_eth"
    assert intent.target_allocation["btc"] == pytest.approx(0.10)
    assert intent.target_allocation["eth"] == pytest.approx(0.40)
    assert intent.diagnostics is not None
    assert intent.diagnostics["portfolio_rule_cooldown_key"] == [
        "eth_btc_deviation_dca",
        "large_to_eth",
    ]


@pytest.mark.parametrize(
    ("deviation", "allocation_name", "expected_btc", "expected_eth"),
    [
        (0.55, "portfolio_eth_btc_deviation_dca_to_btc", 0.20, 0.30),
        (0.70, "portfolio_eth_btc_deviation_large_to_btc", 0.40, 0.10),
    ],
)
def test_symmetric_upper_tiers_move_eth_to_btc(
    deviation: float,
    allocation_name: str,
    expected_btc: float,
    expected_eth: float,
) -> None:
    rule_snapshot = snapshot(
        current={"btc": 0.10, "eth": 0.40, "spy": 0.20, "stable": 0.30, "alt": 0.0},
        eth_btc_ratio_state=_ratio_state(deviation),
    )

    intent = EthBtcDeviationDcaRule().build_intent(
        rule_snapshot,
        config=PortfolioRuleConfig(),
    )

    assert intent.allocation_name == allocation_name
    assert intent.target_allocation["btc"] == pytest.approx(expected_btc)
    assert intent.target_allocation["eth"] == pytest.approx(expected_eth)


def test_dca_cooldown_does_not_block_large_tier() -> None:
    rule_snapshot = snapshot(
        current={"btc": 0.40, "eth": 0.10, "spy": 0.20, "stable": 0.30, "alt": 0.0},
        eth_btc_ratio_state=_ratio_state(-0.70),
        current_date=date(2025, 5, 8),
    )

    intent = resolve_portfolio_rules_intent(
        rule_snapshot,
        rules=(EthBtcDeviationDcaRule(),),
        config=PortfolioRuleConfig(),
        cooldown_tracker=RuleCooldownTracker(
            {("eth_btc_deviation_dca", "dca_to_eth"): date(2025, 5, 7)}
        ),
    )

    assert intent.allocation_name == "portfolio_eth_btc_deviation_large_to_eth"
    assert intent.diagnostics is not None
    assert "cooldown_skipped_rules" not in intent.diagnostics


@pytest.mark.parametrize(
    ("deviation", "cooldown_suffix", "expected_days"),
    [
        (-0.55, "dca_to_eth", 14),
        (-0.70, "large_to_eth", 60),
    ],
)
def test_tuned_cooldown_days_by_tier(
    deviation: float,
    cooldown_suffix: str,
    expected_days: int,
) -> None:
    rule = EthBtcDeviationDcaRule()
    rule_snapshot = snapshot(eth_btc_ratio_state=_ratio_state(deviation))

    assert rule.cooldown_key(
        rule_snapshot,
        config=PortfolioRuleConfig(),
    ) == ("eth_btc_deviation_dca", cooldown_suffix)
    assert (
        rule.cooldown_days_for_snapshot(
            rule_snapshot,
            config=PortfolioRuleConfig(),
        )
        == expected_days
    )
