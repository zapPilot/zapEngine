from __future__ import annotations

from datetime import date

from src.services.backtesting.portfolio_rules import (
    DEFAULT_PORTFOLIO_RULE_NAMES,
)
from src.services.backtesting.portfolio_rules.base import (
    DIAG_PORTFOLIO_RULE_MATCHES,
)
from src.services.backtesting.portfolio_rules.cross_down_exit import CrossDownExitRule
from src.services.backtesting.portfolio_rules.dma_stable_gating import (
    DmaStableGatingRule,
)
from src.services.backtesting.signals.dma_gated_fgi.types import DmaMarketState
from src.services.backtesting.strategies.dma_fgi_portfolio_rules import (
    DmaFgiPortfolioRulesDecisionPolicy,
    DmaFgiPortfolioRulesStrategy,
)
from src.services.backtesting.strategies.minimum import FlatMinimumState
from tests.services.backtesting.portfolio_rules.helpers import state


def test_decision_trace_records_shadowed_matching_rules() -> None:
    policy = DmaFgiPortfolioRulesDecisionPolicy(
        rules=(CrossDownExitRule(), DmaStableGatingRule()),
    )

    intent = policy.decide(
        _flat_state(
            btc=state(
                symbol="BTC",
                zone="below",
                dma_distance=-0.05,
                cross_event="cross_down",
                actionable_cross_event="cross_down",
                fgi_regime="fear",
            ),
            current={"btc": 1.0, "eth": 0.0, "spy": 0.0, "stable": 0.0, "alt": 0.0},
            current_date=date(2025, 3, 13),
        )
    )

    assert intent.reason == "portfolio_cross_down_exit"
    assert intent.diagnostics is not None
    trace = {
        entry["rule_name"]: entry
        for entry in intent.diagnostics[DIAG_PORTFOLIO_RULE_MATCHES]
    }
    assert trace["cross_down_exit"] == {
        "rule_name": "cross_down_exit",
        "matched": True,
        "would_have_acted_action": "sell",
        "suppressed_by": None,
    }
    assert trace["dma_stable_gating"] == {
        "rule_name": "dma_stable_gating",
        "matched": True,
        "would_have_acted_action": "sell",
        "suppressed_by": "cross_down_exit",
    }


def test_enabled_rules_can_isolate_non_default_rule() -> None:
    policy = DmaFgiPortfolioRulesDecisionPolicy(
        rules=(CrossDownExitRule(), DmaStableGatingRule()),
        enabled_rules=frozenset({"dma_stable_gating"}),
    )

    intent = policy.decide(
        _flat_state(
            btc=state(
                symbol="BTC",
                zone="below",
                dma_distance=-0.05,
                cross_event="cross_down",
                actionable_cross_event="cross_down",
                fgi_regime="fear",
            ),
            current={"btc": 1.0, "eth": 0.0, "spy": 0.0, "stable": 0.0, "alt": 0.0},
            current_date=date(2025, 3, 13),
        )
    )

    assert intent.reason == "portfolio_dma_stable_gating"
    assert intent.diagnostics is not None
    trace = {
        entry["rule_name"]: entry
        for entry in intent.diagnostics[DIAG_PORTFOLIO_RULE_MATCHES]
    }
    assert trace["cross_down_exit"]["matched"] is True
    assert trace["cross_down_exit"]["suppressed_by"] is None
    assert trace["dma_stable_gating"]["matched"] is True
    assert trace["dma_stable_gating"]["suppressed_by"] is None


def test_strategy_default_traces_non_default_rules_without_enabling_them() -> None:
    strategy = DmaFgiPortfolioRulesStrategy(total_capital=10_000.0)

    intent = strategy.decision_policy.decide(
        _flat_state(
            btc=state(
                symbol="BTC",
                zone="below",
                dma_distance=-0.05,
                fgi_regime="fear",
            ),
            current={"btc": 1.0, "eth": 0.0, "spy": 0.0, "stable": 0.0, "alt": 0.0},
            current_date=date(2025, 3, 13),
        )
    )

    assert strategy.decision_policy.enabled_rules == DEFAULT_PORTFOLIO_RULE_NAMES
    assert intent.reason == "regime_no_signal"
    assert intent.diagnostics is not None
    trace = {
        entry["rule_name"]: entry
        for entry in intent.diagnostics[DIAG_PORTFOLIO_RULE_MATCHES]
    }
    assert trace["dma_stable_gating"]["matched"] is True
    assert trace["dma_stable_gating"]["suppressed_by"] is None


def test_strategy_enabled_rules_param_activates_non_default_rule() -> None:
    strategy = DmaFgiPortfolioRulesStrategy(
        total_capital=10_000.0,
        params={"enabled_rules": ["dma_stable_gating"]},
    )

    intent = strategy.decision_policy.decide(
        _flat_state(
            btc=state(
                symbol="BTC",
                zone="below",
                dma_distance=-0.05,
                fgi_regime="fear",
            ),
            current={"btc": 1.0, "eth": 0.0, "spy": 0.0, "stable": 0.0, "alt": 0.0},
            current_date=date(2025, 3, 13),
        )
    )

    assert intent.reason == "portfolio_dma_stable_gating"


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
