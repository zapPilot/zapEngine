"""Portfolio rule 23: block DCA-tier rules during the global trade cooldown."""

from __future__ import annotations

from dataclasses import dataclass

from src.services.backtesting.decision import AllocationIntent, RuleGroup
from src.services.backtesting.portfolio_rules.base import (
    PortfolioRuleConfig,
    PortfolioSnapshot,
    current_target,
    signals_consulted_for_symbols,
    symbols_for_snapshot,
)


@dataclass(frozen=True)
class GlobalCooldownGateRule:
    name: str = "global_cooldown_gate"
    priority: int = 23
    rule_group: RuleGroup = "none"
    description: str = "Block all DCA-tier rules after any trade."

    def matches(
        self,
        snapshot: PortfolioSnapshot,
        *,
        config: PortfolioRuleConfig,
    ) -> bool:
        if snapshot.last_trade_date is None or snapshot.current_date is None:
            return False
        elapsed_days = (snapshot.current_date - snapshot.last_trade_date).days
        return 0 <= elapsed_days < config.global_cooldown_days

    def build_intent(
        self,
        snapshot: PortfolioSnapshot,
        *,
        config: PortfolioRuleConfig,
    ) -> AllocationIntent:
        signals_consulted = (
            {
                **signals_consulted_for_symbols(
                    snapshot,
                    tuple(symbols_for_snapshot(snapshot)),
                ),
                "last_trade_date": snapshot.last_trade_date.isoformat()
                if snapshot.last_trade_date is not None
                else None,
                "current_date": snapshot.current_date.isoformat()
                if snapshot.current_date is not None
                else None,
            }
            if config.emit_signals_consulted
            else None
        )
        return AllocationIntent(
            action="hold",
            target_allocation=current_target(snapshot),
            allocation_name=None,
            immediate=False,
            reason="global_cooldown_active",
            rule_group=self.rule_group,
            decision_score=0.0,
            diagnostics={
                "matched_rule_name": self.name,
                **(
                    {"signals_consulted": signals_consulted}
                    if signals_consulted is not None
                    else {}
                ),
            },
        )


__all__ = ["GlobalCooldownGateRule"]
