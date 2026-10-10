"""Flat portfolio-level rule strategy: what a strategy spec compiles to."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from src.services.backtesting.constants import (
    STRATEGY_DISPLAY_NAMES,
    STRATEGY_DMA_FGI_PORTFOLIO_RULES,
)
from src.services.backtesting.decision import AllocationIntent
from src.services.backtesting.domain import ExecutionOutcome, StrategySnapshot
from src.services.backtesting.execution.rule_based.allocation_executor import (
    AllocationExecutionResult,
    RuleBasedAllocationExecutor,
)
from src.services.backtesting.portfolio_rules.base import PortfolioRuleConfig
from src.services.backtesting.portfolio_rules.components import (
    PortfolioRuleComponents,
    SignalSettings,
)
from src.services.backtesting.portfolio_rules.decision_policy import (
    PORTFOLIO_RULES_SIGNAL_ID,
    RuleBasedPortfolioDecisionPolicy,
)
from src.services.backtesting.portfolio_rules.eth_btc_ratio_rotation import (
    EthBtcRatioRotationRule,
)
from src.services.backtesting.signals.dma_gated_fgi.config import DmaGatedFgiConfig
from src.services.backtesting.signals.flat_minimum import (
    FlatMinimumSignalComponent,
)
from src.services.backtesting.strategies.base import (
    BaseStrategy,
    Order,
    StrategyAction,
    StrategyContext,
)


@dataclass
class RuleBasedPortfolioStrategy(BaseStrategy):
    """Canonical flat SPY/BTC/ETH portfolio-rule strategy.

    Each day the signal component observes the three DMA signals, the first
    matching rule decides a target allocation, and the executor applies it in
    full on the same bar. ``components`` carries the compiled rules and signal
    settings of the strategy spec named by ``spec_ref``.
    """

    total_capital: float
    components: PortfolioRuleComponents
    spec_ref: str
    signal_component: FlatMinimumSignalComponent = field(init=False, repr=False)
    decision_policy: RuleBasedPortfolioDecisionPolicy = field(
        init=False,
        repr=False,
    )
    execution_engine: RuleBasedAllocationExecutor = field(init=False, repr=False)
    signal_id: str = PORTFOLIO_RULES_SIGNAL_ID
    summary_signal_id: str | None = PORTFOLIO_RULES_SIGNAL_ID
    strategy_id: str = STRATEGY_DMA_FGI_PORTFOLIO_RULES
    display_name: str = STRATEGY_DISPLAY_NAMES[STRATEGY_DMA_FGI_PORTFOLIO_RULES]
    canonical_strategy_id: str = STRATEGY_DMA_FGI_PORTFOLIO_RULES
    daily_data: list[dict[str, Any]] = field(default_factory=list)
    initial_spot_asset: str = "BTC"
    initial_asset_allocation: dict[str, float] | None = None

    def __post_init__(self) -> None:
        self.execution_engine = RuleBasedAllocationExecutor()
        self.decision_policy = RuleBasedPortfolioDecisionPolicy(
            rules=self.components.rules,
            config=PortfolioRuleConfig(emit_signals_consulted=True),
        )
        self.signal_component = build_signal_component(
            self.components.signals,
            signal_id=self.signal_id,
        )

    def initialize(
        self,
        portfolio: Any,
        config: Any,
        context: StrategyContext,
    ) -> None:
        del portfolio, config
        self.daily_data = []
        self.decision_policy.reset()
        self.signal_component.reset()
        self.signal_component.initialize(context)

    def warmup_day(self, context: StrategyContext) -> None:
        self.signal_component.warmup(context)

    def on_day(self, context: StrategyContext) -> StrategyAction:
        market_state = self.signal_component.observe(context)
        decision = self.decision_policy.decide(market_state)
        committed_state = self.signal_component.apply_intent(
            current_date=context.date,
            snapshot=market_state,
            intent=decision,
        )
        signal_observation = self.signal_component.build_signal_observation(
            snapshot=committed_state,
            intent=decision,
        )
        execution = self._execute(context=context, intent=decision)
        self.decision_policy.record_execution(
            context=context,
            intent=decision,
            execution=execution,
        )
        snapshot = StrategySnapshot(
            signal=signal_observation,
            decision=AllocationIntent(
                action=decision.action,
                target_allocation=(
                    None
                    if decision.target_allocation is None
                    else dict(decision.target_allocation)
                ),
                allocation_name=decision.allocation_name,
                immediate=decision.immediate,
                reason=decision.reason,
                rule_group=decision.rule_group,
                decision_score=decision.decision_score,
                diagnostics=(
                    None if decision.diagnostics is None else dict(decision.diagnostics)
                ),
            ),
            execution=execution,
        )
        # The executor found money to move; the order asks the engine to rebalance
        # to the decision's target when it fills, from whatever it holds by then.
        order = (
            Order(target_allocation=dict(decision.target_allocation))
            if execution.transfers and decision.target_allocation is not None
            else None
        )
        return StrategyAction(snapshot=snapshot, order=order)

    def record_day(self, context: StrategyContext, action: StrategyAction) -> None:
        snapshot = action.snapshot
        self.daily_data.append(
            {
                "date": context.date,
                "spot_balance": context.portfolio.spot_balance,
                "stable_balance": context.portfolio.stable_balance,
                "total_value": context.portfolio.total_value(context.portfolio_price),
                "signal_id": None
                if snapshot.signal is None
                else snapshot.signal.signal_id,
                "decision_reason": snapshot.decision.reason,
            }
        )

    def _execute(
        self,
        *,
        context: StrategyContext,
        intent: AllocationIntent,
    ) -> ExecutionOutcome:
        if intent.action == "hold" and intent.target_allocation is None:
            return ExecutionOutcome(event=None, transfers=[])
        return self._to_execution_outcome(
            self.execution_engine.execute(context=context, intent=intent)
        )

    @staticmethod
    def _to_execution_outcome(
        execution: AllocationExecutionResult,
    ) -> ExecutionOutcome:
        return ExecutionOutcome(
            event=execution.event,
            transfers=[] if execution.transfers is None else list(execution.transfers),
            blocked_reason=execution.block_reason,
        )

    def feature_summary(self) -> dict[str, Any]:
        rules = self.decision_policy.rules
        return {
            "policy": "RuleBasedPortfolioStrategy",
            "active_features": [
                "portfolio_level_rules",
                *(rule.name for rule in rules),
            ],
            "ratio_rotation": any(
                isinstance(rule, EthBtcRatioRotationRule) for rule in rules
            ),
            "research_only": True,
        }

    def parameters(self) -> dict[str, Any]:
        return {
            "signal_id": self.signal_id,
            "spec_ref": self.spec_ref,
            "feature_summary": self.feature_summary(),
        }


def build_signal_component(
    settings: SignalSettings,
    *,
    signal_id: str,
) -> FlatMinimumSignalComponent:
    return FlatMinimumSignalComponent(
        config=DmaGatedFgiConfig(cross_on_touch=settings.cross_on_touch),
        signal_id=signal_id,
        ratio_cross_cooldown_days=settings.ratio_cross_cooldown_days,
        warmup_lookback_days=settings.warmup_days,
        cross_down_cooldown_days_by_symbol=settings.dma_cross_cooldown_days,
    )


__all__ = [
    "RuleBasedPortfolioStrategy",
    "build_signal_component",
]
