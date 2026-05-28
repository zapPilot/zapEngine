"""Regime / FGI accessors and crypto-cycle state tracking.

Pure functions over ``PortfolioSnapshot`` / ``DmaMarketState``. No deps on
sibling modules in ``portfolio_rules`` — kept leaf-level to avoid cycles.
"""

from __future__ import annotations

from collections.abc import Mapping

from src.services.backtesting.portfolio_rules.base import PortfolioSnapshot
from src.services.backtesting.signals.dma_gated_fgi.types import DmaMarketState

_CRYPTO_CYCLE_SYMBOLS = ("BTC", "ETH")


def _macro_regime(assets: Mapping[str, DmaMarketState]) -> str | None:
    spy_state = assets.get("SPY")
    if spy_state is None:
        return None
    return spy_state.macro_fear_greed_regime


def _crypto_regime(assets: Mapping[str, DmaMarketState]) -> str | None:
    for symbol in ("BTC", "ETH"):
        state = assets.get(symbol)
        if state is not None:
            return state.fgi_regime
    return None


def _macro_value(assets: Mapping[str, DmaMarketState]) -> float | None:
    spy_state = assets.get("SPY")
    if spy_state is None:
        return None
    return spy_state.macro_fear_greed_value


def _crypto_value(assets: Mapping[str, DmaMarketState]) -> float | None:
    for symbol in ("BTC", "ETH"):
        state = assets.get(symbol)
        if state is not None:
            return state.fgi_value
    return None


def _update_cycle_state(
    previous: dict[str, bool],
    snapshot: PortfolioSnapshot,
) -> dict[str, bool]:
    updated = dict(previous)
    crypto_crossed_down = any(
        snapshot.assets.get(symbol) is not None
        and snapshot.assets[symbol].cross_event == "cross_down"
        for symbol in _CRYPTO_CYCLE_SYMBOLS
    )
    crypto_crossed_up = any(
        snapshot.assets.get(symbol) is not None
        and snapshot.assets[symbol].actionable_cross_event == "cross_up"
        for symbol in _CRYPTO_CYCLE_SYMBOLS
    )
    for symbol, state in snapshot.assets.items():
        event = state.actionable_cross_event
        if symbol in _CRYPTO_CYCLE_SYMBOLS:
            continue
        if event == "cross_down":
            updated[symbol] = True
        elif event == "cross_up":
            updated[symbol] = False
    if crypto_crossed_down:
        for symbol in _CRYPTO_CYCLE_SYMBOLS:
            updated[symbol] = True
    elif crypto_crossed_up:
        for symbol in _CRYPTO_CYCLE_SYMBOLS:
            updated[symbol] = False
    return updated
