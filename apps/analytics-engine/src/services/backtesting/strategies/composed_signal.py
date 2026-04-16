"""Generic signal-driven strategy composed from runtime components."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Any

from src.services.backtesting.composition_types import (
    DecisionPolicy,
    StatefulSignalComponent,
)
from src.services.backtesting.decision import AllocationIntent
from src.services.backtesting.domain import ExecutionOutcome, StrategySnapshot
from src.services.backtesting.execution.allocation_intent_executor import (
    AllocationExecutionResult,
    AllocationIntentExecutor,
)
from src.services.backtesting.execution.contracts import ExecutionHints
from src.services.backtesting.features import MarketDataRequirements
from src.services.backtesting.strategies.base import (
    BaseStrategy,
    DailyRecommendationInput,
    StrategyAction,
    StrategyContext,
    StrategyResult,
)
from src.services.backtesting.utils import coerce_to_date, normalize_regime_label


@dataclass(frozen=True)
class _HistoricalSentimentEntry:
    entry_date: date
    label: str
    value: int | None


def _extract_sentiment_history_entries(
    sentiment_aggregates: list[dict[str, Any]],
) -> list[_HistoricalSentimentEntry]:
    history: list[_HistoricalSentimentEntry] = []
    for row in sentiment_aggregates:
        raw_date = row.get("snapshot_date") or row.get("date")
        if not raw_date:
            continue
        entry_date = coerce_to_date(raw_date)
        if entry_date is None:
            continue
        label = (
            row.get("primary_classification")
            or row.get("avg_label")
            or row.get("label")
            or "neutral"
        )
        raw_value = row.get("avg_sentiment", row.get("value"))
        try:
            value = None if raw_value is None else int(raw_value)
        except (TypeError, ValueError):
            value = None
        history.append(
            _HistoricalSentimentEntry(
                entry_date=entry_date,
                label=normalize_regime_label(str(label)),
                value=value,
            )
        )
    history.sort(key=lambda item: item.entry_date)
    return history


def _default_sentiment_payload(
    *,
    label: str | None,
    value: int | None,
) -> dict[str, Any]:
    return {
        "label": "neutral" if label is None else normalize_regime_label(label),
        "value": 50 if value is None else int(value),
    }


@dataclass
class ComposedSignalStrategy(BaseStrategy):
    """Strategy that wires signal, decision, pacing, and execution components."""

    total_capital: float
    signal_component: StatefulSignalComponent
    decision_policy: DecisionPolicy
    execution_engine: AllocationIntentExecutor
    public_params: dict[str, Any] = field(default_factory=dict)
    signal_id: str = ""
    summary_signal_id: str | None = None
    strategy_id: str = "composed_signal"
    display_name: str = "Composed Signal Strategy"
    canonical_strategy_id: str = "composed_signal"
    daily_data: list[dict[str, Any]] = field(default_factory=list)

    def initialize(self, portfolio: Any, config: Any, context: StrategyContext) -> None:
        del portfolio, config
        self.daily_data = []
        self.signal_component.reset()
        self.signal_component.initialize(context)
        self.execution_engine.reset()

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
        hints = self.signal_component.build_execution_hints(
            snapshot=committed_state,
            intent=decision,
            signal_confidence=signal_observation.confidence,
        )
        self.execution_engine.observe(hints)
        execution = self._execute(
            context=context,
            intent=decision,
            hints=hints,
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
                target_spot_asset=decision.target_spot_asset,
            ),
            execution=execution,
        )
        return StrategyAction(
            snapshot=snapshot,
            transfers=list(execution.transfers) or None,
            target_spot_asset=decision.target_spot_asset,
        )

    def record_day(
        self,
        context: StrategyContext,
        action: StrategyAction,
        yield_breakdown: dict[str, float],
        trade_executed: bool,
    ) -> None:
        del yield_breakdown, trade_executed
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

    def parameters(self) -> dict[str, Any]:
        return dict(self.public_params)

    def finalize(self) -> StrategyResult:
        return StrategyResult(metrics={})

    @staticmethod
    def _extract_sentiment_history_entries(
        sentiment_aggregates: list[dict[str, Any]],
    ) -> list[_HistoricalSentimentEntry]:
        return _extract_sentiment_history_entries(sentiment_aggregates)

    @property
    def regime_history(self) -> list[str]:
        history = getattr(self.signal_component, "_regime_history", [])
        return list(history)

    def get_daily_recommendation(
        self,
        input_data: DailyRecommendationInput,
    ) -> StrategyAction:
        history_entries = _extract_sentiment_history_entries(
            input_data.sentiment_aggregates
        )
        history_by_date = {
            entry.entry_date: _default_sentiment_payload(
                label=entry.label,
                value=entry.value,
            )
            for entry in history_entries
        }
        current_sentiment = self._resolve_current_sentiment(
            input_data=input_data,
            history_by_date=history_by_date,
        )
        initial_context = self._build_recommendation_context(
            input_data=input_data,
            context_date=input_data.current_date,
            price=input_data.price,
            sentiment=current_sentiment,
            price_map=dict(input_data.price_map),
            extra_data=dict(input_data.extra_data),
        )
        self.initialize(input_data.portfolio, None, initial_context)
        for warmup_context in self._build_warmup_contexts(
            input_data=input_data,
            history_by_date=history_by_date,
        ):
            self.warmup_day(warmup_context)
        today_context = self._build_recommendation_context(
            input_data=input_data,
            context_date=input_data.current_date,
            price=input_data.price,
            sentiment=current_sentiment,
            price_map=dict(input_data.price_map),
            extra_data=dict(input_data.extra_data),
        )
        return self.on_day(today_context)

    def _build_warmup_contexts(
        self,
        *,
        input_data: DailyRecommendationInput,
        history_by_date: dict[date, dict[str, Any]],
    ) -> list[StrategyContext]:
        requirements = getattr(
            self.signal_component,
            "market_data_requirements",
            MarketDataRequirements(),
        )
        fallback_sentiment = (
            _default_sentiment_payload(
                label=input_data.fallback_regime,
                value=input_data.fallback_sentiment_value,
            )
            if requirements.requires_sentiment
            else None
        )
        warmup_dates = sorted(
            warmup_date
            for warmup_date in (
                set(input_data.warmup_price_by_date)
                | set(input_data.warmup_extra_data_by_date)
                | set(history_by_date)
            )
            if warmup_date < input_data.current_date
        )
        contexts: list[StrategyContext] = []
        for warmup_date in warmup_dates:
            contexts.append(
                self._build_recommendation_context(
                    input_data=input_data,
                    context_date=warmup_date,
                    price=input_data.warmup_price_by_date.get(
                        warmup_date, input_data.price
                    ),
                    sentiment=history_by_date.get(warmup_date, fallback_sentiment),
                    price_map=dict(
                        input_data.warmup_price_map_by_date.get(
                            warmup_date,
                            input_data.price_map,
                        )
                    ),
                    extra_data=dict(
                        input_data.warmup_extra_data_by_date.get(warmup_date, {})
                    ),
                )
            )
        return contexts

    def _resolve_current_sentiment(
        self,
        *,
        input_data: DailyRecommendationInput,
        history_by_date: dict[date, dict[str, Any]],
    ) -> dict[str, Any] | None:
        if input_data.current_sentiment and input_data.current_sentiment.get("label"):
            return dict(input_data.current_sentiment)
        if input_data.current_date in history_by_date:
            return dict(history_by_date[input_data.current_date])
        requirements = getattr(
            self.signal_component,
            "market_data_requirements",
            MarketDataRequirements(),
        )
        if not requirements.requires_sentiment:
            return None
        return _default_sentiment_payload(
            label=input_data.fallback_regime,
            value=input_data.fallback_sentiment_value,
        )

    @staticmethod
    def _build_recommendation_context(
        *,
        input_data: DailyRecommendationInput,
        context_date: date,
        price: float,
        sentiment: dict[str, Any] | None,
        price_map: dict[str, float],
        extra_data: dict[str, Any],
    ) -> StrategyContext:
        return StrategyContext(
            date=context_date,
            price=price,
            sentiment=sentiment,
            price_history=input_data.price_history,
            portfolio=input_data.portfolio,
            price_map=dict(price_map),
            extra_data=extra_data,
        )

    def _execute(
        self,
        *,
        context: StrategyContext,
        intent: AllocationIntent,
        hints: ExecutionHints,
    ) -> ExecutionOutcome:
        if intent.action == "hold" and intent.target_allocation is None:
            return ExecutionOutcome(event=None, transfers=[])
        execution = self.execution_engine.execute(
            context=context,
            intent=intent,
            hints=hints,
        )
        return self._to_execution_outcome(execution)

    @staticmethod
    def _to_execution_outcome(
        execution: AllocationExecutionResult,
    ) -> ExecutionOutcome:
        return ExecutionOutcome(
            event=execution.event,
            transfers=[] if execution.transfers is None else list(execution.transfers),
            blocked_reason=execution.block_reason,
            step_count=execution.step_count,
            steps_remaining=execution.steps_remaining,
            interval_days=execution.interval_days,
            plugin_diagnostics=execution.plugin_diagnostics,
        )


__all__ = ["ComposedSignalStrategy"]
