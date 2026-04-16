"""Shared contracts for backtesting signal implementations."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import TYPE_CHECKING, Any, TypedDict

from src.services.backtesting.features import MarketFeatureSet

if TYPE_CHECKING:  # pragma: no cover
    from src.services.backtesting.execution.ath_tracker import ATHTracker
    from src.services.backtesting.strategies.base import StrategyContext


class AllocationIntent(TypedDict, total=False):
    """Standardized allocation intent emitted by signal runtimes."""

    target: dict[str, float] | None
    name: str | None
    hold: bool
    immediate: bool


def _resolve_signal_context_extra_data(
    *,
    context: StrategyContext,
    explicit_extra_data: dict[str, Any] | None,
) -> dict[str, Any]:
    """Resolve and defensively copy extra_data for SignalContext construction."""
    if explicit_extra_data is not None:
        return dict(explicit_extra_data)

    context_extra_data = getattr(context, "extra_data", None)
    if not context_extra_data:
        return {}
    return dict(context_extra_data)


def _resolve_signal_context_ath_event(ath_tracker: ATHTracker | None) -> str | None:
    """Resolve ATH event text from tracker when available."""
    if ath_tracker is None:
        return None
    return ath_tracker.current_ath_event


def _resolve_signal_context_portfolio_value(context: StrategyContext) -> float:
    """Resolve portfolio value using StrategyContext's configured price accessor."""
    price_input = getattr(context, "portfolio_price", context.price)
    return context.portfolio.total_value(price_input)


@dataclass(frozen=True)
class SignalOutput:
    """Standardized output from a signal runtime serialization layer."""

    score: float
    confidence: float
    regime: str
    raw_value: float | None = None
    source: str = ""
    metadata: dict[str, Any] = field(default_factory=dict)
    immediate: bool = False


@dataclass(frozen=True)
class SignalContext:
    """Context passed to signal runtimes for market-state extraction."""

    date: date
    price: float
    sentiment: dict[str, Any] | None
    price_history: list[float]
    portfolio_value: float
    regime_history: list[str] = field(default_factory=list)
    ath_event: str | None = None
    extra_data: dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_strategy_context(
        cls,
        context: StrategyContext,
        ath_tracker: ATHTracker | None = None,
        regime_history: list[str] | None = None,
        extra_data: dict[str, Any] | None = None,
    ) -> SignalContext:
        """Create SignalContext from StrategyContext.

        Args:
            context: Strategy execution context
            ath_tracker: Optional ATH tracker for ATH event detection
            regime_history: Optional regime history for pattern matching
            extra_data: Optional external indicator payload for runtimes

        Returns:
            SignalContext with data from the strategy context
        """
        return cls(
            date=context.date,
            price=context.price,
            sentiment=context.sentiment,
            price_history=list(context.price_history),
            portfolio_value=_resolve_signal_context_portfolio_value(context),
            regime_history=list(regime_history) if regime_history else [],
            ath_event=_resolve_signal_context_ath_event(ath_tracker),
            extra_data=_resolve_signal_context_extra_data(
                context=context,
                explicit_extra_data=extra_data,
            ),
        )

    @property
    def features(self) -> MarketFeatureSet:
        return MarketFeatureSet.from_extra_data(self.extra_data)
