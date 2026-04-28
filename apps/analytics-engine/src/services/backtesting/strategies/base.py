"""Strategy interfaces for backtesting."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import TYPE_CHECKING, Any

from src.services.backtesting.features import MarketFeatureSet

if TYPE_CHECKING:
    from src.services.backtesting.domain import StrategySnapshot
    from src.services.backtesting.execution.portfolio import Portfolio


@dataclass(frozen=True)
class TransferIntent:
    """Explicit transfer instruction for the engine.

    Attributes:
        from_bucket: Source bucket ("spot", "stable", "btc", or "eth").
        to_bucket: Destination bucket.
        amount_usd: USD value to transfer.
    """

    from_bucket: str
    to_bucket: str
    amount_usd: float


@dataclass(frozen=True)
class StrategyAction:
    """Action returned by a strategy for the current day."""

    snapshot: StrategySnapshot
    target_allocations: dict[str, float] | None = None
    transfers: list[TransferIntent] | None = None
    apply_yield: bool = True


@dataclass(frozen=True)
class DailyRecommendationInput:
    """Input for single-day recommendation from endpoint.

    This dataclass encapsulates all data needed for a strategy to generate
    a daily recommendation, including fallback support when primary data
    sources (sentiment aggregates) are unavailable.

    Attributes:
        current_date: The date for which to generate recommendation.
        price: Current price of the primary asset (e.g., BTC).
        portfolio: Portfolio instance with current holdings.
        price_history: Historical prices for volatility calculation.
        sentiment_aggregates: Historical sentiment rows from database.
            Each row should have 'primary_classification' or 'avg_label' or 'label'.
        current_sentiment: Today's sentiment data (label and value).
        fallback_regime: Regime from RegimeTrackingService when aggregates are empty.
        fallback_sentiment_value: Sentiment value from RegimeTrackingService fallback.
    """

    current_date: date
    price: float
    portfolio: Portfolio
    price_history: list[float]

    # Raw sentiment data (not pre-processed)
    sentiment_aggregates: list[dict[str, Any]]  # Historical sentiment rows
    current_sentiment: dict[str, Any] | None  # Today's sentiment (label, value)

    # Fallback regime from RegimeTrackingService
    fallback_regime: str | None = None
    fallback_sentiment_value: int | None = None
    price_map: dict[str, float] = field(default_factory=dict)
    extra_data: dict[str, Any] = field(default_factory=dict)
    warmup_extra_data_by_date: dict[date, dict[str, Any]] = field(default_factory=dict)
    warmup_price_by_date: dict[date, float] = field(default_factory=dict)
    warmup_price_map_by_date: dict[date, dict[str, float]] = field(default_factory=dict)

    @property
    def features(self) -> MarketFeatureSet:
        return MarketFeatureSet.from_extra_data(self.extra_data)


@dataclass(frozen=True)
class StrategyContext:
    """Context passed to strategies each day."""

    date: date
    price: float
    sentiment: dict[str, Any] | None
    price_history: list[float]
    portfolio: Portfolio
    price_map: dict[str, float] = field(default_factory=dict)
    extra_data: dict[str, Any] = field(default_factory=dict)

    @property
    def portfolio_price(self) -> float | dict[str, float]:
        """Return the price for Portfolio methods.

        Returns the full market price map when available; falls back to the
        single context price for legacy two-bucket behavior.
        """
        if self.price_map:
            return dict(self.price_map)
        return self.price

    @property
    def features(self) -> MarketFeatureSet:
        return MarketFeatureSet.from_extra_data(self.extra_data)


@dataclass
class StrategyResult:
    """Result payload from strategy finalization."""

    metrics: dict[str, Any] = field(default_factory=dict)


class BaseStrategy:
    """Base class for strategies executed by the backtest engine."""

    strategy_id: str = "base"
    display_name: str = "Base Strategy"
    canonical_strategy_id: str = "base"
    summary_signal_id: str | None = None

    def initialize(
        self, portfolio: Portfolio, config: Any, context: StrategyContext
    ) -> None:
        """Initialize strategy state before the simulation loop."""

    def on_day(self, context: StrategyContext) -> StrategyAction:
        """Return the action for a given day."""
        raise NotImplementedError

    def get_daily_recommendation(
        self,
        input_data: DailyRecommendationInput,
    ) -> StrategyAction:
        """Return the action for a single day (endpoint use).

        This optional entrypoint enables reuse of backtesting strategies in
        synchronous endpoint scenarios where the caller provides the necessary
        input data for a single recommendation.
        """
        raise NotImplementedError

    def warmup_day(self, context: StrategyContext) -> None:
        """Warm up strategy state using pre-start data.

        This hook is called on days before `user_start_date` so strategies can
        accumulate indicator/history state (e.g., regime history) without
        trading, applying yield, or triggering events.
        """
        pass

    def finalize(self) -> StrategyResult:
        """Finalize strategy results after simulation."""
        return StrategyResult()

    @staticmethod
    def _build_daily_record(
        context: StrategyContext,
        total_deployed: float,
    ) -> dict[str, Any]:
        """Build default per-day record payload."""
        price = context.price
        holdings = context.portfolio.spot_balance

        return {
            "date": context.date,
            "deployed": total_deployed,
            "holdings": holdings,
            "value": holdings * price,
            "remaining_capital": context.portfolio.stable_balance,
        }

    @staticmethod
    def _get_daily_data(strategy: BaseStrategy) -> list[dict[str, Any]] | None:
        """Return a mutable daily_data list when available."""
        daily_data = getattr(strategy, "daily_data", None)
        if not isinstance(daily_data, list):
            return None
        return daily_data

    @staticmethod
    def _get_total_deployed(strategy: BaseStrategy) -> Any:
        """Return tracked deployed capital, defaulting to 0.0."""
        return getattr(strategy, "total_deployed", 0.0)

    def record_day(
        self,
        context: StrategyContext,
        action: StrategyAction,
        yield_breakdown: dict[str, float],
        trade_executed: bool,
    ) -> None:
        """Hook to record daily results after trades and yield."""
        daily_data = self._get_daily_data(self)
        if daily_data is None:
            return

        total_deployed = self._get_total_deployed(self)
        daily_data.append(self._build_daily_record(context, total_deployed))

    def parameters(self) -> dict[str, Any]:
        """Return configuration parameters for summary output."""
        return {}
