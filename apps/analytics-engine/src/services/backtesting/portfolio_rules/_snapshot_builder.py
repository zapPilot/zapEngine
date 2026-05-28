"""Portfolio snapshot construction and per-day context advancement."""

from __future__ import annotations

from collections.abc import Mapping
from datetime import date

from src.services.backtesting.decision import AllocationIntent
from src.services.backtesting.portfolio_rules._state_accessors import (
    _crypto_regime,
    _crypto_value,
    _macro_regime,
    _macro_value,
    _update_cycle_state,
)
from src.services.backtesting.portfolio_rules._types import (
    RuleExecutionContext,
    RuleExecutionState,
)
from src.services.backtesting.portfolio_rules.base import (
    PortfolioSnapshot,
    current_fgi_regime_for_symbol,
    symbols_for_snapshot,
)
from src.services.backtesting.signals.dma_gated_fgi.types import DmaMarketState
from src.services.backtesting.signals.flat_minimum import FlatMinimumState


def build_portfolio_snapshot(
    snapshot: FlatMinimumState,
    *,
    previous_fgi_regime: Mapping[str, str],
    cycle_open_per_symbol: Mapping[str, bool] | None = None,
    last_trade_date: date | None = None,
    trade_dates: tuple[date, ...] = (),
) -> PortfolioSnapshot:
    assets = _assets_from_flat_state(snapshot)
    return PortfolioSnapshot(
        assets=assets,
        current_asset_allocation=snapshot.current_asset_allocation,
        previous_fgi_regime=dict(previous_fgi_regime),
        cycle_open_per_symbol=dict(cycle_open_per_symbol or {}),
        eth_btc_ratio_state=snapshot.eth_btc_ratio_state,
        macro_fgi_regime=_macro_regime(assets),
        crypto_fgi_regime=_crypto_regime(assets),
        macro_fgi_value=_macro_value(assets),
        crypto_fgi_value=_crypto_value(assets),
        last_trade_date=last_trade_date,
        current_date=snapshot.current_date,
        trade_dates=trade_dates,
    )


def _advance_context(
    ctx: RuleExecutionContext,
    intent: AllocationIntent,
    *,
    snapshot: FlatMinimumState,
    track_local_execution_state: bool,
) -> RuleExecutionContext:
    portfolio_snapshot = build_portfolio_snapshot(
        snapshot,
        previous_fgi_regime=ctx.previous_fgi_regime,
        cycle_open_per_symbol=ctx.cycle_open_per_symbol,
        last_trade_date=ctx.execution_state.last_trade_date,
        trade_dates=ctx.execution_state.trade_dates,
    )
    execution_state = ctx.execution_state
    if track_local_execution_state and intent.action != "hold":
        trade_dates = list(execution_state.trade_dates)
        if snapshot.current_date is not None:
            trade_dates.append(snapshot.current_date)
        execution_state = RuleExecutionState(
            last_trade_date=snapshot.current_date,
            trade_dates=tuple(trade_dates),
        )
    return RuleExecutionContext(
        previous_fgi_regime=_current_fgi_regime_by_symbol(portfolio_snapshot),
        cycle_open_per_symbol=_update_cycle_state(
            dict(ctx.cycle_open_per_symbol),
            portfolio_snapshot,
        ),
        cooldown_tracker=ctx.cooldown_tracker,
        execution_state=execution_state,
    )


def _assets_from_flat_state(snapshot: FlatMinimumState) -> dict[str, DmaMarketState]:
    assets: dict[str, DmaMarketState] = {}
    if snapshot.spy_dma_state is not None:
        assets["SPY"] = snapshot.spy_dma_state
    if snapshot.btc_dma_state is not None:
        assets["BTC"] = snapshot.btc_dma_state
    if snapshot.eth_dma_state is not None:
        assets["ETH"] = snapshot.eth_dma_state
    return assets


def _current_fgi_regime_by_symbol(snapshot: PortfolioSnapshot) -> dict[str, str]:
    regimes: dict[str, str] = {}
    for symbol in symbols_for_snapshot(snapshot):
        regime = current_fgi_regime_for_symbol(snapshot, symbol)
        if regime is not None:
            regimes[symbol] = regime
    return regimes
