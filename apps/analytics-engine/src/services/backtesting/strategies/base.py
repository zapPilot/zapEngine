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
class Order:
    """Money a strategy asks to move on one bar; the engine fills it later.

    Exactly one of ``target_allocation`` (rebalance to these weights at the fill
    bar's prices, from the holdings it finds then) or ``transfers`` (move exactly
    these amounts) is set.
    """

    target_allocation: dict[str, float] | None = None
    transfers: tuple[TransferIntent, ...] = ()

    def __post_init__(self) -> None:
        if (self.target_allocation is None) == (not self.transfers):
            raise ValueError("an order sets either target_allocation or transfers")


@dataclass(frozen=True)
class StrategyAction:
    """What a strategy decided on the current bar."""

    snapshot: StrategySnapshot
    order: Order | None = None


@dataclass(frozen=True)
class StrategyContext:
    """Context passed to strategies each day."""

    date: date
    price: float
    sentiment: dict[str, Any] | None
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

    def warmup_day(self, context: StrategyContext) -> None:
        """Warm up strategy state using pre-start data.

        This hook is called on days before `user_start_date` so strategies can
        accumulate indicator state (e.g., the DMA zone) without trading,
        applying yield, or triggering events.
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

    # jscpd:ignore-start - record_day signature is intentionally shared by BaseStrategy subclass overrides
    def record_day(self, context: StrategyContext, action: StrategyAction) -> None:
        """Hook to record the day's result after fills and yield."""
        daily_data = self._get_daily_data(self)
        if daily_data is None:
            return

        total_deployed = self._get_total_deployed(self)
        daily_data.append(self._build_daily_record(context, total_deployed))

    # jscpd:ignore-end

    def parameters(self) -> dict[str, Any]:
        """Return configuration parameters for summary output."""
        return {}
