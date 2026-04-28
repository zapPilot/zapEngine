"""Shared simulation engine for the DMA-first backtesting framework."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Any

from src.models.backtesting import (
    BacktestResponse,
    MarketSnapshot,
    StrategyState,
    TimelinePoint,
)
from src.services.backtesting.execution.config import RegimeConfig
from src.services.backtesting.execution.cost_model import (
    CostModel,
    PercentageSlippageModel,
)
from src.services.backtesting.execution.portfolio import Portfolio
from src.services.backtesting.execution.state import (
    build_strategy_state,
    build_strategy_summaries,
)
from src.services.backtesting.strategies.base import (
    BaseStrategy,
    StrategyAction,
    StrategyContext,
)
from src.services.backtesting.target_allocation import normalize_target_allocation


@dataclass
class EngineConfig:
    trading_slippage_percent: float = 0.0
    apr_by_regime: dict[str, dict[str, float | dict[str, float]]] = field(
        default_factory=dict
    )
    cost_model: CostModel = field(default_factory=PercentageSlippageModel)

    def __post_init__(self) -> None:
        if (
            isinstance(self.cost_model, PercentageSlippageModel)
            and self.cost_model.percent == 0.0
            and self.trading_slippage_percent != 0.0
        ):
            self.cost_model = PercentageSlippageModel(self.trading_slippage_percent)

    @classmethod
    def from_regime_config(cls, config: RegimeConfig) -> EngineConfig:
        return cls(
            trading_slippage_percent=config.trading_slippage_percent,
            apr_by_regime=config.apr_by_regime,
            cost_model=PercentageSlippageModel(config.trading_slippage_percent),
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


@dataclass
class _EngineRunState:
    timeline: list[TimelinePoint] = field(default_factory=list)
    price_history: list[float] = field(default_factory=list)
    benchmark_daily_prices: list[float] = field(default_factory=list)


class StrategyEngine:
    def __init__(self, config: EngineConfig):
        self.config = config

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
            return BacktestResponse(strategies={}, timeline=[])

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
        run_state = _EngineRunState()

        for price_data in prices:
            snapshot = self._build_market_day_snapshot(price_data, sentiments)
            run_state.price_history.append(snapshot.price)
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
                        ),
                        strategies=strategy_points,
                    )
                )

        return BacktestResponse(
            strategies=build_strategy_summaries(
                strategies=strategies,
                portfolios=portfolios,
                trade_counts=trade_counts,
                total_capital=total_capital,
                last_price=prices[-1]["price"],
                last_market_prices=self._resolve_price_map(prices[-1]),
                strategy_daily_values=daily_values,
                benchmark_daily_prices=run_state.benchmark_daily_prices,
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
                    cost_model=self.config.cost_model,
                )
            else:
                portfolios[strategy.strategy_id] = Portfolio.from_allocation(
                    total_capital,
                    allocation,
                    first_price,
                    spot_asset=spot_asset,
                    cost_model=self.config.cost_model,
                )
        for strategy in strategies:
            portfolio = portfolios[strategy.strategy_id]
            strategy.initialize(
                portfolio,
                self.config,
                StrategyContext(
                    date=init_date,
                    price=portfolio.resolve_spot_price(
                        init_price_map or {"btc": first_price}
                    ),
                    sentiment=sentiments.get(init_date),
                    price_history=[],
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
                price_history=run_state.price_history,
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
                sentiment_label=snapshot.sentiment_label,
                trade_counts=trade_counts,
                record_point=day_flags.record_point,
                strategy_daily_values=strategy_daily_values,
            )
            if state is not None:
                points[strategy.strategy_id] = state
        return points

    def _process_single_strategy_day(
        self,
        *,
        strategy: BaseStrategy,
        portfolio: Portfolio,
        context: StrategyContext,
        sentiment_label: str | None,
        trade_counts: dict[str, int],
        record_point: bool,
        strategy_daily_values: dict[str, list[float]],
    ) -> StrategyState | None:
        action = strategy.on_day(context)
        trade_executed = self._apply_action(portfolio, context, action)
        if trade_executed:
            trade_counts[strategy.strategy_id] += 1
        self._apply_yield(
            portfolio,
            context.portfolio_price,
            sentiment_label,
            apply_yield=action.apply_yield,
        )
        total_value = portfolio.total_value(context.portfolio_price)
        if not record_point:
            return None
        strategy_daily_values[strategy.strategy_id].append(total_value)
        strategy.record_day(context, action, {}, trade_executed)
        return build_strategy_state(
            portfolio=portfolio,
            price=context.portfolio_price,
            snapshot=action.snapshot,
        )

    def _apply_action(
        self,
        portfolio: Portfolio,
        context: StrategyContext,
        action: StrategyAction,
    ) -> bool:
        moved = False
        price = context.portfolio_price
        if action.transfers:
            for transfer in action.transfers:
                if transfer.amount_usd <= 0:
                    continue
                portfolio.execute_transfer(
                    transfer.from_bucket,
                    transfer.to_bucket,
                    transfer.amount_usd,
                    price,
                )
                moved = True
            return moved
        if not action.target_allocations:
            return moved

        target = normalize_target_allocation(action.target_allocations)
        total_value = portfolio.total_value(price)
        target_values = {bucket: total_value * pct for bucket, pct in target.items()}
        current_values = portfolio.values_for_allocation_keys(price, target)
        deltas = {
            bucket: target_values[bucket] - current_values[bucket]
            for bucket in target_values
        }
        to_bucket = max(deltas, key=lambda key: deltas[key])
        from_bucket = min(deltas, key=lambda key: deltas[key])
        amount = min(max(0.0, deltas[to_bucket]), max(0.0, -deltas[from_bucket]))
        if amount <= 0:
            return moved
        portfolio.execute_transfer(from_bucket, to_bucket, amount, price)
        return True

    def _apply_yield(
        self,
        portfolio: Portfolio,
        price: float | dict[str, float],
        sentiment_label: str | None,
        apply_yield: bool = True,
    ) -> dict[str, float]:
        if not apply_yield:
            return {"spot_yield": 0.0, "stable_yield": 0.0, "total_yield": 0.0}
        apr_rates = self.config.apr_by_regime.get(sentiment_label or "neutral", {})
        return portfolio.apply_daily_yield(price, apr_rates)

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
