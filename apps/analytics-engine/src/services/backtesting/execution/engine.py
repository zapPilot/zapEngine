"""Shared simulation engine for the DMA-first backtesting framework."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Any

from src.models.backtesting import (
    BacktestAssumptions,
    BacktestResponse,
    MarketSnapshot,
    StrategyState,
    TimelinePoint,
)
from src.services.backtesting.execution.cost_model import PercentageSlippageModel
from src.services.backtesting.execution.portfolio import Portfolio
from src.services.backtesting.execution.rebalance_calculator import (
    plan_transfers_to_target,
)
from src.services.backtesting.execution.state import (
    build_strategy_state,
    build_strategy_summaries,
)
from src.services.backtesting.features import MACRO_FEAR_GREED_FEATURE
from src.services.backtesting.strategies.base import (
    BaseStrategy,
    Order,
    StrategyContext,
)


@dataclass(frozen=True)
class _DayFlags:
    record_point: bool
    is_warmup: bool


@dataclass(frozen=True)
class _MarketDaySnapshot:
    current_date: date
    price: float
    price_map: dict[str, float]
    sentiment: dict[str, Any] | None
    sentiment_value: Any
    sentiment_label: str
    price_data: dict[str, Any]
    extra_data: dict[str, Any]


@dataclass(frozen=True)
class _PlacedOrder:
    order: Order
    fill_bar: int


@dataclass
class _EngineRunState:
    timeline: list[TimelinePoint] = field(default_factory=list)
    benchmark_daily_prices: list[float] = field(default_factory=list)
    # Bars processed so far; an order's fill bar is counted in these.
    bar_index: int = 0
    previous_date: date | None = None
    previous_valuation_price: float | dict[str, float] | None = None
    pending_orders: dict[str, list[_PlacedOrder]] = field(default_factory=dict)
    price_pnl_usd: dict[str, float] = field(default_factory=dict)


class StrategyEngine:
    """Simulates strategies bar by bar under explicit ``BacktestAssumptions``.

    Each bar, in order: price moves are attributed, stablecoin yield accrues for
    the days since the last bar, orders whose fill bar has come are filled at this
    bar's prices, then every strategy decides on the holdings those fills left.
    An order placed on bar ``i`` fills on bar ``i + fill_lag_days``; orders still
    pending when the data ends are never filled.
    """

    def __init__(self, assumptions: BacktestAssumptions | None = None):
        self.assumptions = assumptions or BacktestAssumptions()
        self.cost_model = PercentageSlippageModel(self.assumptions.slippage_rate)

    def run(
        self,
        prices: list[dict[str, Any]],
        sentiments: dict[date, dict[str, Any]],
        strategies: list[BaseStrategy],
        initial_allocation: dict[str, float] | None = None,
        total_capital: float = 10000.0,
        token_symbol: str = "BTC",
        user_start_date: date | None = None,
    ) -> BacktestResponse:
        if not prices:
            return BacktestResponse(
                assumptions=self.assumptions, strategies={}, timeline=[]
            )

        allocation = initial_allocation or {"spot": 0.5, "stable": 0.5}
        first_price, init_date, init_extra_data, init_price_map = (
            self._resolve_start_snapshot(
                prices=prices,
                user_start_date=user_start_date,
            )
        )
        portfolios, trade_counts, daily_values = self._initialize_strategy_runtime(
            strategies=strategies,
            allocation=allocation,
            first_price=first_price,
            init_date=init_date,
            init_extra_data=init_extra_data,
            init_price_map=init_price_map,
            sentiments=sentiments,
            total_capital=total_capital,
            token_symbol=token_symbol,
        )
        run_state = _EngineRunState(
            pending_orders={strategy.strategy_id: [] for strategy in strategies},
            price_pnl_usd={strategy.strategy_id: 0.0 for strategy in strategies},
        )

        for price_data in prices:
            snapshot = self._build_market_day_snapshot(price_data, sentiments)
            flags = _DayFlags(
                record_point=user_start_date is None
                or snapshot.current_date >= user_start_date,
                is_warmup=user_start_date is not None
                and snapshot.current_date < user_start_date,
            )
            if flags.record_point:
                run_state.benchmark_daily_prices.append(snapshot.price)
            strategy_points = self._process_strategies_for_day(
                strategies=strategies,
                portfolios=portfolios,
                snapshot=snapshot,
                run_state=run_state,
                day_flags=flags,
                trade_counts=trade_counts,
                strategy_daily_values=daily_values,
            )
            if not flags.is_warmup:
                run_state.bar_index += 1
                run_state.previous_date = snapshot.current_date
                run_state.previous_valuation_price = (
                    dict(snapshot.price_map) if snapshot.price_map else snapshot.price
                )
            if flags.record_point:
                run_state.timeline.append(
                    TimelinePoint(
                        market=MarketSnapshot(
                            date=snapshot.current_date,
                            token_price=snapshot.price_data.get(
                                "prices", {token_symbol.lower(): float(snapshot.price)}
                            ),
                            sentiment=snapshot.sentiment_value,
                            sentiment_label=snapshot.sentiment_label,
                            macro_fear_greed=snapshot.extra_data.get(
                                MACRO_FEAR_GREED_FEATURE
                            ),
                        ),
                        strategies=strategy_points,
                    )
                )

        return BacktestResponse(
            assumptions=self.assumptions,
            strategies=build_strategy_summaries(
                strategies=strategies,
                portfolios=portfolios,
                trade_counts=trade_counts,
                total_capital=total_capital,
                last_price=prices[-1]["price"],
                last_market_prices=self._resolve_price_map(prices[-1]),
                strategy_daily_values=daily_values,
                benchmark_daily_prices=run_state.benchmark_daily_prices,
                price_pnl_usd=run_state.price_pnl_usd,
                risk_free_apr=self.assumptions.stable_apr,
            ),
            timeline=run_state.timeline,
        )

    @staticmethod
    def _build_market_day_snapshot(
        price_data: dict[str, Any],
        sentiments: dict[date, dict[str, Any]],
    ) -> _MarketDaySnapshot:
        current_date = price_data["date"]
        price = price_data["price"]
        price_map = StrategyEngine._resolve_price_map(price_data)
        sentiment = sentiments.get(current_date)
        sentiment_value = sentiment.get("value") if sentiment else None
        sentiment_label = sentiment.get("label", "neutral") if sentiment else "neutral"
        return _MarketDaySnapshot(
            current_date=current_date,
            price=price,
            price_map=price_map,
            sentiment=sentiment,
            sentiment_value=sentiment_value,
            sentiment_label=sentiment_label,
            price_data=price_data,
            extra_data=dict(price_data.get("extra_data") or {}),
        )

    @staticmethod
    def _resolve_price_map(price_data: dict[str, Any]) -> dict[str, float]:
        raw_map = price_data.get("prices")
        if not isinstance(raw_map, dict):
            return {}
        prices: dict[str, float] = {}
        for symbol, value in raw_map.items():
            if not isinstance(symbol, str):
                continue
            if not isinstance(value, int | float):
                continue
            numeric_value = float(value)
            if numeric_value <= 0:
                continue
            prices[symbol.lower()] = numeric_value
        return prices

    @staticmethod
    def _resolve_start_snapshot(
        *,
        prices: list[dict[str, Any]],
        user_start_date: date | None,
    ) -> tuple[float, date, dict[str, Any], dict[str, float]]:
        first_price = prices[0]["price"]
        init_date = prices[0]["date"]
        init_extra_data = dict(prices[0].get("extra_data") or {})
        init_price_map = StrategyEngine._resolve_price_map(prices[0])
        if user_start_date is None:
            return first_price, init_date, init_extra_data, init_price_map
        for price_data in prices:
            if price_data["date"] >= user_start_date:
                return (
                    price_data["price"],
                    price_data["date"],
                    dict(price_data.get("extra_data") or {}),
                    StrategyEngine._resolve_price_map(price_data),
                )
        return first_price, init_date, init_extra_data, init_price_map

    def _initialize_strategy_runtime(
        self,
        *,
        strategies: list[BaseStrategy],
        allocation: dict[str, float],
        first_price: float,
        init_date: date,
        init_extra_data: dict[str, Any],
        init_price_map: dict[str, float],
        sentiments: dict[date, dict[str, Any]],
        total_capital: float,
        token_symbol: str,
    ) -> tuple[dict[str, Portfolio], dict[str, int], dict[str, list[float]]]:
        default_spot_asset = str(token_symbol).upper()
        portfolios: dict[str, Portfolio] = {}
        for strategy in strategies:
            spot_asset = str(
                getattr(strategy, "initial_spot_asset", default_spot_asset)
            ).upper()
            initial_asset_allocation = getattr(
                strategy, "initial_asset_allocation", None
            )
            if isinstance(initial_asset_allocation, dict):
                price_input: float | dict[str, float]
                price_input = (
                    dict(init_price_map)
                    if init_price_map
                    else {"btc": first_price, "eth": first_price}
                )
                portfolios[strategy.strategy_id] = Portfolio.from_asset_allocation(
                    total_capital,
                    initial_asset_allocation,
                    price_input,
                    spot_asset=spot_asset,
                    cost_model=self.cost_model,
                )
            else:
                portfolios[strategy.strategy_id] = Portfolio.from_allocation(
                    total_capital,
                    allocation,
                    first_price,
                    spot_asset=spot_asset,
                    cost_model=self.cost_model,
                )
        for strategy in strategies:
            portfolio = portfolios[strategy.strategy_id]
            strategy.initialize(
                portfolio,
                self.assumptions,
                StrategyContext(
                    date=init_date,
                    price=portfolio.resolve_spot_price(
                        init_price_map or {"btc": first_price}
                    ),
                    sentiment=sentiments.get(init_date),
                    portfolio=portfolio,
                    price_map=dict(init_price_map),
                    extra_data=init_extra_data,
                ),
            )
        trade_counts = {strategy.strategy_id: 0 for strategy in strategies}
        daily_values: dict[str, list[float]] = {
            strategy.strategy_id: [] for strategy in strategies
        }
        return portfolios, trade_counts, daily_values

    def _process_strategies_for_day(
        self,
        *,
        strategies: list[BaseStrategy],
        portfolios: dict[str, Portfolio],
        snapshot: _MarketDaySnapshot,
        run_state: _EngineRunState,
        day_flags: _DayFlags,
        trade_counts: dict[str, int],
        strategy_daily_values: dict[str, list[float]],
    ) -> dict[str, StrategyState]:
        points: dict[str, StrategyState] = {}
        for strategy in strategies:
            portfolio = portfolios[strategy.strategy_id]
            context_price = self._resolve_context_price(
                portfolio=portfolio,
                fallback_price=snapshot.price,
                price_map=snapshot.price_map,
            )
            context = StrategyContext(
                date=snapshot.current_date,
                price=context_price,
                sentiment=snapshot.sentiment,
                portfolio=portfolio,
                price_map=dict(snapshot.price_map),
                extra_data=dict(snapshot.extra_data),
            )
            if day_flags.is_warmup:
                strategy.warmup_day(context)
                continue
            state = self._process_single_strategy_day(
                strategy=strategy,
                portfolio=portfolio,
                context=context,
                run_state=run_state,
                trade_counts=trade_counts,
                strategy_daily_values=strategy_daily_values,
            )
            points[strategy.strategy_id] = state
        return points

    def _process_single_strategy_day(
        self,
        *,
        strategy: BaseStrategy,
        portfolio: Portfolio,
        context: StrategyContext,
        run_state: _EngineRunState,
        trade_counts: dict[str, int],
        strategy_daily_values: dict[str, list[float]],
    ) -> StrategyState:
        strategy_id = strategy.strategy_id
        price = context.portfolio_price
        if run_state.previous_valuation_price is not None:
            # The holdings carried over from the last bar, repriced; fills and
            # yield below move value around or add to it, so only this is price.
            run_state.price_pnl_usd[strategy_id] += portfolio.total_value(
                price
            ) - portfolio.total_value(run_state.previous_valuation_price)
        if run_state.previous_date is not None:
            portfolio.accrue_stable_yield(
                self.assumptions.stable_apr,
                (context.date - run_state.previous_date).days,
            )
        self._fill_due_orders(portfolio, run_state, strategy_id, price)
        action = strategy.on_day(context)
        if action.order is not None:
            run_state.pending_orders[strategy_id].append(
                _PlacedOrder(
                    order=action.order,
                    fill_bar=run_state.bar_index + self.assumptions.fill_lag_days,
                )
            )
            trade_counts[strategy_id] += 1
            # Only fills now when there is no lag; otherwise the order waits.
            self._fill_due_orders(portfolio, run_state, strategy_id, price)
        strategy_daily_values[strategy_id].append(portfolio.total_value(price))
        strategy.record_day(context, action)
        return build_strategy_state(
            portfolio=portfolio,
            price=price,
            snapshot=action.snapshot,
        )

    @staticmethod
    def _fill_due_orders(
        portfolio: Portfolio,
        run_state: _EngineRunState,
        strategy_id: str,
        price: float | dict[str, float],
    ) -> None:
        pending = run_state.pending_orders[strategy_id]
        due = [placed for placed in pending if placed.fill_bar <= run_state.bar_index]
        if not due:
            return
        pending[:] = [
            placed for placed in pending if placed.fill_bar > run_state.bar_index
        ]
        for placed in due:
            order = placed.order
            transfers = (
                plan_transfers_to_target(
                    portfolio=portfolio,
                    price=price,
                    target_allocation=order.target_allocation,
                )
                if order.target_allocation is not None
                else order.transfers
            )
            for transfer in transfers:
                if transfer.amount_usd <= 0:
                    continue
                portfolio.execute_transfer(
                    transfer.from_bucket,
                    transfer.to_bucket,
                    transfer.amount_usd,
                    price,
                )

    @staticmethod
    def _resolve_context_price(
        *,
        portfolio: Portfolio,
        fallback_price: float,
        price_map: dict[str, float],
    ) -> float:
        if not price_map:
            return fallback_price
        try:
            return portfolio.resolve_spot_price(price_map)
        except ValueError:
            return fallback_price
