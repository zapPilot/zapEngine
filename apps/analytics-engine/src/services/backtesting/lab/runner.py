"""Run specs (and benchmarks) over a bundle through the engine's one simulation path."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from datetime import date
from typing import Any

from src.models.backtesting import BacktestAssumptions, BacktestResponse
from src.services.backtesting.constants import MODEL_TOTAL_CAPITAL
from src.services.backtesting.execution.compare import (
    build_compare_strategies_from_resolved_configs,
    neutral_initial_allocation,
    simulate,
)
from src.services.backtesting.lab.benchmarks import BENCHMARK_IDS, build_benchmarks
from src.services.backtesting.lab.bundle import Bundle
from src.services.backtesting.spec import StrategySpec
from src.services.backtesting.strategy_registry import resolve_spec_strategy_config

TOKEN_SYMBOL = "BTC"


@dataclass(frozen=True)
class EvalConfig:
    """Everything about a run that is not the spec or the data."""

    assumptions: BacktestAssumptions = field(default_factory=BacktestAssumptions)
    total_capital: float = MODEL_TOTAL_CAPITAL
    # The user window inside the bundle; ``None`` takes the bundle's own.
    start: date | None = None
    end: date | None = None
    leave_one_out: bool = True
    benchmarks: tuple[str, ...] = BENCHMARK_IDS

    def as_dict(self) -> dict[str, Any]:
        return {
            "assumptions": self.assumptions.model_dump(),
            "total_capital": self.total_capital,
            "start": self.start,
            "end": self.end,
            "leave_one_out": self.leave_one_out,
            "benchmarks": list(self.benchmarks),
        }


@dataclass(frozen=True)
class Prepared:
    """A bundle cut to the window a run asked for (fresh copies of its rows)."""

    prices: list[dict[str, Any]]
    sentiments: dict[date, dict[str, Any]]
    start: date
    end: date

    @property
    def user_prices(self) -> list[dict[str, Any]]:
        return [row for row in self.prices if row["date"] >= self.start]


def prepare(bundle: Bundle, config: EvalConfig) -> Prepared:
    prices, sentiments, bundle_start, bundle_end = bundle.history()
    end = config.end or bundle_end
    return Prepared(
        prices=[row for row in prices if row["date"] <= end],
        sentiments=sentiments,
        start=config.start or bundle_start,
        end=end,
    )


def run_specs(
    specs: Mapping[str, StrategySpec],
    prepared: Prepared,
    config: EvalConfig,
    *,
    benchmarks: Sequence[str] = (),
) -> BacktestResponse:
    """Every spec, then the benchmarks, over the same bars and assumptions.

    The response names each spec's strategy by its key in ``specs``.
    """
    initial_allocation = neutral_initial_allocation()
    user_prices = prepared.user_prices
    built = build_compare_strategies_from_resolved_configs(
        [
            resolve_spec_strategy_config(spec, config_id=key)
            for key, spec in specs.items()
        ],
        user_prices=user_prices,
        total_capital=config.total_capital,
        initial_allocation=initial_allocation,
        user_start_date=prepared.start,
    )
    extra = build_benchmarks(
        benchmarks,
        total_capital=config.total_capital,
        total_days=len(user_prices),
        user_start_date=prepared.start,
        initial_allocation=initial_allocation,
    )
    return simulate(
        [*built, *extra],
        prices=prepared.prices,
        sentiments=prepared.sentiments,
        user_start_date=prepared.start,
        total_capital=config.total_capital,
        token_symbol=TOKEN_SYMBOL,
        assumptions=config.assumptions,
    )


__all__ = ["EvalConfig", "Prepared", "TOKEN_SYMBOL", "prepare", "run_specs"]
