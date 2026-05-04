"""Portfolio-level rule contracts for flat DMA/FGI strategies."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field, replace
from typing import Protocol

from src.services.backtesting.decision import (
    AllocationIntent,
    DecisionAction,
    RuleGroup,
)
from src.services.backtesting.signals.dma_gated_fgi.types import DmaMarketState
from src.services.backtesting.signals.ratio_state import EthBtcRatioState
from src.services.backtesting.tactics.base import target_intent
from src.services.backtesting.target_allocation import (
    normalize_target_allocation,
    target_from_current_allocation,
)

PORTFOLIO_RULE_SYMBOLS: tuple[str, ...] = ("SPY", "BTC", "ETH")
ALLOCATION_KEY_BY_SYMBOL: dict[str, str] = {
    "SPY": "spy",
    "BTC": "btc",
    "ETH": "eth",
}
SYMBOL_BY_ALLOCATION_KEY: dict[str, str] = {
    value: key for key, value in ALLOCATION_KEY_BY_SYMBOL.items()
}
_EPSILON = 1e-12


@dataclass(frozen=True)
class PortfolioRuleConfig:
    """Config shared by portfolio-level DMA/FGI rules."""

    extreme_fear_buy_step: float = 0.05
    overextension_sell_step: float = 0.05
    fgi_downshift_sell_step: float = 0.05
    ratio_cross_cooldown_days: int = 30
    default_cross_down_cooldown_days: int = 30
    overextension_sell_spy_share: float = 0.5
    cross_down_cooldown_days_per_symbol: dict[str, int] = field(
        default_factory=lambda: {"BTC": 30, "ETH": 30, "SPY": 7}
    )
    default_dma_overextension_threshold: float = 0.30
    dma_overextension_thresholds: dict[str, float] = field(
        default_factory=lambda: {"BTC": 0.20, "ETH": 0.50, "SPY": 0.10}
    )


@dataclass(frozen=True)
class PortfolioSnapshot:
    """Whole-portfolio view consumed by portfolio-level rules."""

    assets: Mapping[str, DmaMarketState]
    current_asset_allocation: Mapping[str, float]
    previous_fgi_regime: Mapping[str, str]
    macro_fgi_regime: str | None = None
    crypto_fgi_regime: str | None = None
    macro_fgi_value: float | None = None
    crypto_fgi_value: float | None = None
    cycle_open_per_symbol: Mapping[str, bool] = field(default_factory=dict)
    eth_btc_ratio_state: EthBtcRatioState | None = None


class PortfolioRule(Protocol):
    @property
    def name(self) -> str: ...

    @property
    def priority(self) -> int: ...

    @property
    def rule_group(self) -> RuleGroup: ...

    @property
    def description(self) -> str: ...

    def matches(
        self,
        snapshot: PortfolioSnapshot,
        *,
        config: PortfolioRuleConfig,
    ) -> bool: ...

    def build_intent(
        self,
        snapshot: PortfolioSnapshot,
        *,
        config: PortfolioRuleConfig,
    ) -> AllocationIntent: ...


def normalize_symbol(symbol: str) -> str:
    return str(symbol).strip().upper()


def allocation_key_for_symbol(symbol: str) -> str:
    normalized = normalize_symbol(symbol)
    try:
        return ALLOCATION_KEY_BY_SYMBOL[normalized]
    except KeyError as exc:
        raise ValueError(f"Unsupported portfolio rule asset '{symbol}'") from exc


def symbols_for_snapshot(snapshot: PortfolioSnapshot) -> list[str]:
    present = {normalize_symbol(symbol) for symbol in snapshot.assets}
    return [symbol for symbol in PORTFOLIO_RULE_SYMBOLS if symbol in present]


def current_target(snapshot: PortfolioSnapshot) -> dict[str, float]:
    return target_from_current_allocation(snapshot.current_asset_allocation)


def cross_down_cooldown_days_for(
    symbol: str,
    *,
    config: PortfolioRuleConfig,
) -> int:
    return int(
        config.cross_down_cooldown_days_per_symbol.get(
            normalize_symbol(symbol),
            config.default_cross_down_cooldown_days,
        )
    )


def normalize_regime(regime: str | None) -> str | None:
    if regime is None:
        return None
    normalized = str(regime).strip().lower().replace(" ", "_")
    return normalized or None


def current_fgi_regime_for_symbol(
    snapshot: PortfolioSnapshot,
    symbol: str,
) -> str | None:
    normalized_symbol = normalize_symbol(symbol)
    state = snapshot.assets.get(normalized_symbol)
    if normalized_symbol == "SPY":
        return normalize_regime(
            snapshot.macro_fgi_regime
            or (None if state is None else state.macro_fear_greed_regime)
            or (None if state is None else state.fgi_regime)
        )
    return normalize_regime(
        snapshot.crypto_fgi_regime or (None if state is None else state.fgi_regime)
    )


def current_fgi_value_for_symbol(
    snapshot: PortfolioSnapshot,
    symbol: str,
) -> float | None:
    normalized_symbol = normalize_symbol(symbol)
    state = snapshot.assets.get(normalized_symbol)
    if normalized_symbol == "SPY":
        if snapshot.macro_fgi_value is not None:
            return snapshot.macro_fgi_value
        if state is None:
            return None
        if state.macro_fear_greed_value is not None:
            return state.macro_fear_greed_value
        return state.fgi_value
    if snapshot.crypto_fgi_value is not None:
        return snapshot.crypto_fgi_value
    if state is None:
        return None
    return state.fgi_value


def portfolio_target_intent(
    *,
    action: DecisionAction,
    target: Mapping[str, float],
    allocation_name: str,
    reason: str,
    rule_group: RuleGroup,
    assets: list[str],
    immediate: bool = False,
) -> AllocationIntent:
    intent = target_intent(
        action=action,
        target=normalize_target_allocation(target),
        allocation_name=allocation_name,
        reason=reason,
        rule_group=rule_group,
        immediate=immediate,
    )
    return replace(
        intent,
        diagnostics={
            "portfolio_rule_assets": [normalize_symbol(asset) for asset in assets]
        },
    )


def add_stable(target: dict[str, float], amount: float) -> None:
    if amount <= _EPSILON:
        return
    target["stable"] = max(0.0, float(target.get("stable", 0.0))) + amount


def add_split_proceeds(
    target: dict[str, float],
    amount: float,
    *,
    spy_share: float = 0.5,
) -> None:
    """Split sell proceeds between SPY and stable."""
    if amount <= _EPSILON:
        return
    spy_amount = amount * spy_share
    stable_amount = amount - spy_amount
    target["spy"] = max(0.0, float(target.get("spy", 0.0))) + spy_amount
    target["stable"] = max(0.0, float(target.get("stable", 0.0))) + stable_amount


__all__ = [
    "ALLOCATION_KEY_BY_SYMBOL",
    "PORTFOLIO_RULE_SYMBOLS",
    "SYMBOL_BY_ALLOCATION_KEY",
    "PortfolioRule",
    "PortfolioRuleConfig",
    "PortfolioSnapshot",
    "add_split_proceeds",
    "add_stable",
    "allocation_key_for_symbol",
    "current_fgi_regime_for_symbol",
    "current_fgi_value_for_symbol",
    "current_target",
    "cross_down_cooldown_days_for",
    "normalize_regime",
    "normalize_symbol",
    "portfolio_target_intent",
    "symbols_for_snapshot",
]
