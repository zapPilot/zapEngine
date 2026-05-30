from __future__ import annotations

from datetime import date

from src.services.backtesting.portfolio_rules.base import (
    DIAG_PORTFOLIO_RULE_MATCHES,
)
from src.services.backtesting.portfolio_rules.cross_up_equal_weight import (
    CrossUpEqualWeightRule,
)
from src.services.backtesting.portfolio_rules.decision_policy import (
    RuleBasedPortfolioDecisionPolicy,
)
from src.services.backtesting.portfolio_rules.dma_overextension_dca_sell import (
    DmaOverextensionDcaSellRule,
)
from src.services.backtesting.signals.dma_gated_fgi.types import DmaMarketState
from src.services.backtesting.signals.flat_minimum import FlatMinimumState
from src.services.backtesting.strategies.rule_based_portfolio import (
    RuleBasedPortfolioStrategy,
)
from tests.services.backtesting.portfolio_rules.helpers import state


def test_decision_trace_records_shadowed_matching_rules() -> None:
    policy = RuleBasedPortfolioDecisionPolicy(
        rules=(CrossUpEqualWeightRule(), DmaOverextensionDcaSellRule()),
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


def test_enabled_rules_can_isolate_lower_priority_rule() -> None:
    policy = RuleBasedPortfolioDecisionPolicy(
        rules=(CrossUpEqualWeightRule(), DmaOverextensionDcaSellRule()),
        enabled_rules=frozenset({"dma_overextension_dca_sell"}),
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
    assert trace["cross_up_equal_weight"]["matched"] is True
    assert trace["cross_up_equal_weight"]["suppressed_by"] is None
    assert trace["dma_overextension_dca_sell"]["matched"] is True
    assert trace["dma_overextension_dca_sell"]["suppressed_by"] is None


def test_strategy_enabled_rules_param_activates_default_rule_subset() -> None:
    strategy = RuleBasedPortfolioStrategy(
        total_capital=10_000.0,
        params={"enabled_rules": ["dma_overextension_dca_sell"]},
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
