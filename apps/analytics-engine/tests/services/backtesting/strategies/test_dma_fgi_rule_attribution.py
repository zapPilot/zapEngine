from __future__ import annotations

from dataclasses import replace
from datetime import date

from src.services.backtesting.portfolio_rules.base import (
    DIAG_PORTFOLIO_RULE_MATCHES,
)
from src.services.backtesting.portfolio_rules.decision_policy import (
    RuleBasedPortfolioDecisionPolicy,
)
from src.services.backtesting.signals.dma_gated_fgi.types import DmaMarketState
from src.services.backtesting.signals.flat_minimum import FlatMinimumState
from tests.services.backtesting.portfolio_rules.helpers import state
from tests.services.backtesting.support.reference_rules import (
    reference_components,
    reference_rule,
    reference_strategy,
)


def test_decision_trace_records_shadowed_matching_rules() -> None:
    policy = RuleBasedPortfolioDecisionPolicy(
        rules=(
            reference_rule("cross_up_equal_weight"),
            reference_rule("dma_overextension_dca_sell"),
        ),
    )

    intent = policy.decide(
        _flat_state(
            btc=state(
                symbol="BTC",
                zone="above",
                dma_distance=0.35,
                cross_event="cross_up",
                actionable_cross_event="cross_up",
            ),
            current={"btc": 0.50, "eth": 0.0, "spy": 0.0, "stable": 0.50, "alt": 0.0},
            current_date=date(2025, 3, 13),
        )
    )

    assert intent.reason == "portfolio_cross_up_equal_weight"
    assert intent.diagnostics is not None
    trace = {
        entry["rule_name"]: entry
        for entry in intent.diagnostics[DIAG_PORTFOLIO_RULE_MATCHES]
    }
    assert trace["cross_up_equal_weight"] == {
        "rule_name": "cross_up_equal_weight",
        "matched": True,
        "would_have_acted_action": "buy",
        "suppressed_by": None,
    }
    assert trace["dma_overextension_dca_sell"] == {
        "rule_name": "dma_overextension_dca_sell",
        "matched": True,
        "would_have_acted_action": "sell",
        "suppressed_by": "cross_up_equal_weight",
    }


def test_a_policy_without_the_higher_rule_lets_the_lower_one_decide() -> None:
    policy = RuleBasedPortfolioDecisionPolicy(
        rules=(reference_rule("dma_overextension_dca_sell"),),
    )

    intent = policy.decide(
        _flat_state(
            btc=state(
                symbol="BTC",
                zone="above",
                dma_distance=0.35,
                cross_event="cross_up",
                actionable_cross_event="cross_up",
            ),
            current={"btc": 0.50, "eth": 0.0, "spy": 0.0, "stable": 0.50, "alt": 0.0},
            current_date=date(2025, 3, 13),
        )
    )

    assert intent.reason == "portfolio_dma_overextension_dca_sell"
    assert intent.diagnostics is not None
    trace = {
        entry["rule_name"]: entry
        for entry in intent.diagnostics[DIAG_PORTFOLIO_RULE_MATCHES]
    }
    assert list(trace) == ["dma_overextension_dca_sell"]
    assert trace["dma_overextension_dca_sell"]["matched"] is True
    assert trace["dma_overextension_dca_sell"]["suppressed_by"] is None


def test_a_strategy_runs_only_the_rules_of_its_components() -> None:
    strategy = reference_strategy(
        components=replace(
            reference_components(),
            rules=(reference_rule("dma_overextension_dca_sell"),),
        )
    )

    intent = strategy.decision_policy.decide(
        _flat_state(
            btc=state(
                symbol="BTC",
                zone="above",
                dma_distance=0.35,
            ),
            current={"btc": 0.50, "eth": 0.0, "spy": 0.0, "stable": 0.50, "alt": 0.0},
            current_date=date(2025, 3, 13),
        )
    )

    assert intent.reason == "portfolio_dma_overextension_dca_sell"


def _flat_state(
    *,
    btc: DmaMarketState,
    spy: DmaMarketState | None = None,
    eth: DmaMarketState | None = None,
    current: dict[str, float],
    current_date: date | None = None,
) -> FlatMinimumState:
    return FlatMinimumState(
        spy_dma_state=spy or state(symbol="SPY"),
        btc_dma_state=btc,
        eth_dma_state=eth or state(symbol="ETH"),
        current_asset_allocation=current,
        current_date=current_date,
    )
