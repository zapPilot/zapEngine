"""Portfolio-level rule contracts for flat DMA/FGI strategies."""

from __future__ import annotations

from collections.abc import Callable, Mapping
from dataclasses import dataclass, field, replace
from datetime import date
from enum import Enum
from typing import TYPE_CHECKING, Any, Protocol, Self, runtime_checkable

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
DIAG_MATCHED_RULE_NAME = "matched_rule_name"
DIAG_PORTFOLIO_RULE_TRIGGER_ASSETS = "portfolio_rule_trigger_assets"
DIAG_PORTFOLIO_RULE_COOLDOWN_KEY = "portfolio_rule_cooldown_key"
DIAG_COOLDOWN_SKIPPED_RULES = "cooldown_skipped_rules"
DIAG_SIGNALS_CONSULTED = "signals_consulted"
DIAG_PORTFOLIO_RULE_MATCHES = "portfolio_rule_matches"
_EPSILON = 1e-12

if TYPE_CHECKING:
    from src.services.backtesting.sizing.base import SizingStrategy


class FgiRegime(str, Enum):
    EXTREME_FEAR = "extreme_fear"
    FEAR = "fear"
    NEUTRAL = "neutral"
    GREED = "greed"
    EXTREME_GREED = "extreme_greed"


@dataclass(frozen=True)
class PortfolioRuleConfig:
    """Config shared by portfolio-level DMA/FGI rules."""

    emit_signals_consulted: bool = False


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
    last_trade_date: date | None = None
    current_date: date | None = None
    trade_dates: tuple[date, ...] = ()


class PortfolioRule(Protocol):
    @property
    def name(self) -> str: ...

    @property
    def priority(self) -> int: ...

    @property
    def cooldown_days(self) -> int: ...

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


@runtime_checkable
class HasPublicParams(Protocol):
    @classmethod
    def public_params_section(cls) -> str | None: ...

    @classmethod
    def with_public_params(cls, section: Any) -> Self: ...


class DecisionPolicy(Protocol):
    """Decision policy that maps a signal snapshot to an allocation intent."""

    decision_policy_id: str

    def decide(self, snapshot: Any) -> AllocationIntent: ...


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
    per_symbol: Mapping[str, int],
    default: int,
) -> int:
    return int(
        per_symbol.get(
            normalize_symbol(symbol),
            default,
        )
    )


def rule_cooldown_remaining_days(
    *,
    cooldown_days: int,
    last_executed_at: date | None,
    current_date: date | None,
) -> int:
    days = max(0, int(cooldown_days))
    if days <= 0 or last_executed_at is None or current_date is None:
        return 0
    elapsed_days = (current_date - last_executed_at).days
    if elapsed_days < 0:
        return days
    return max(0, days - elapsed_days)


def normalize_regime(regime: str | None) -> FgiRegime | None:
    if regime is None:
        return None
    if isinstance(regime, FgiRegime):
        return regime
    normalized = str(regime).strip().lower().replace(" ", "_")
    if not normalized:
        return None
    try:
        return FgiRegime(normalized)
    except ValueError as exc:
        raise ValueError(f"Unsupported FGI regime '{regime}'") from exc


def current_fgi_regime_for_symbol(
    snapshot: PortfolioSnapshot,
    symbol: str,
) -> FgiRegime | None:
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


def portfolio_target_intent(
    *,
    action: DecisionAction,
    target: Mapping[str, float],
    allocation_name: str,
    reason: str,
    rule_group: RuleGroup,
    assets: list[str],
    immediate: bool = False,
    signals_consulted: Mapping[str, Any] | None = None,
) -> AllocationIntent:
    intent = target_intent(
        action=action,
        target=normalize_target_allocation(target),
        allocation_name=allocation_name,
        reason=reason,
        rule_group=rule_group,
        immediate=immediate,
    )
    diagnostics: dict[str, Any] = {
        "portfolio_rule_assets": [normalize_symbol(asset) for asset in assets]
    }
    if signals_consulted:
        diagnostics[DIAG_SIGNALS_CONSULTED] = dict(signals_consulted)
    return replace(intent, diagnostics=diagnostics)


def signals_consulted_for_symbols(
    snapshot: PortfolioSnapshot,
    symbols: list[str] | tuple[str, ...],
) -> dict[str, Any]:
    signals: dict[str, Any] = {}
    for symbol in symbols:
        normalized = normalize_symbol(symbol)
        state = snapshot.assets.get(normalized)
        if state is None:
            continue
        key = normalized.lower()
        signals[f"{key}.zone"] = state.zone
        signals[f"{key}.cross"] = state.actionable_cross_event or state.cross_event
        signals[f"{key}.dma_distance"] = state.dma_distance
        regime = current_fgi_regime_for_symbol(snapshot, normalized)
        if regime is not None:
            signals[f"{key}.fgi"] = regime
        signals[f"{key}.cycle_open"] = snapshot.cycle_open_per_symbol.get(
            normalized,
            False,
        )
        cooldown = state.cooldown_state
        signals[f"{key}.cooldown_active"] = cooldown.active
    return signals


def ratio_signals_consulted(snapshot: PortfolioSnapshot) -> dict[str, Any]:
    ratio = snapshot.eth_btc_ratio_state
    if ratio is None:
        return {}
    return {
        "eth_btc_ratio.zone": ratio.zone,
        "eth_btc_ratio.cross": ratio.actionable_cross_event or ratio.cross_event,
        "eth_btc_ratio.distance": (ratio.ratio - ratio.ratio_dma_200)
        / ratio.ratio_dma_200
        if ratio.ratio_dma_200 > 0.0
        else None,
        "eth_btc_ratio.cooldown_active": ratio.cooldown_state.active,
    }


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


def build_dca_sell_intent(
    *,
    snapshot: PortfolioSnapshot,
    matching_symbols: list[str],
    sizing: SizingStrategy,
    sell_step: float,
    proceeds_handler: Callable[[dict[str, float], float], None],
    allocation_name: str,
    reason: str,
    rule_group: RuleGroup,
    emit_signals_consulted: bool,
) -> AllocationIntent:
    target = current_target(snapshot)
    for symbol in matching_symbols:
        adjusted_sell_step = max(
            0.0,
            float(
                sizing.adjust_step(
                    sell_step,
                    snapshot=snapshot,
                    asset=symbol,
                )
            ),
        )
        key = allocation_key_for_symbol(symbol)
        sold = min(adjusted_sell_step, max(0.0, float(target.get(key, 0.0))))
        target[key] = max(0.0, float(target.get(key, 0.0)) - sold)
        proceeds_handler(target, sold)
    return portfolio_target_intent(
        action="sell",
        target=normalize_target_allocation(target),
        allocation_name=allocation_name,
        reason=reason,
        rule_group=rule_group,
        assets=matching_symbols,
        signals_consulted=signals_consulted_for_symbols(
            snapshot,
            tuple(matching_symbols),
        )
        if emit_signals_consulted
        else None,
    )


def build_dca_buy_intent(
    *,
    snapshot: PortfolioSnapshot,
    matching_symbols: list[str],
    sizing: SizingStrategy,
    buy_step: float,
    allocation_name: str,
    reason: str,
    rule_group: RuleGroup,
    emit_signals_consulted: bool,
) -> AllocationIntent:
    target = current_target(snapshot)
    stable_available = max(0.0, float(target.get("stable", 0.0)))
    adjusted_step_by_symbol: dict[str, float] = {}
    if matching_symbols and stable_available > 0.0:
        for symbol in matching_symbols:
            adjusted_step = sizing.adjust_step(
                buy_step,
                snapshot=snapshot,
                asset=symbol,
            )
            adjusted_step_by_symbol[symbol] = max(0.0, float(adjusted_step))
        total_desired = sum(adjusted_step_by_symbol.values())
        stable_scale = (
            min(1.0, stable_available / total_desired) if total_desired > 0.0 else 0.0
        )
        for symbol in matching_symbols:
            key = allocation_key_for_symbol(symbol)
            per_asset_buy = adjusted_step_by_symbol[symbol] * stable_scale
            target[key] = max(0.0, float(target.get(key, 0.0))) + per_asset_buy
        target["stable"] = max(
            0.0,
            stable_available - sum(adjusted_step_by_symbol.values()) * stable_scale,
        )
    return portfolio_target_intent(
        action="buy",
        target=normalize_target_allocation(target),
        allocation_name=allocation_name,
        reason=reason,
        rule_group=rule_group,
        assets=matching_symbols,
        signals_consulted=signals_consulted_for_symbols(
            snapshot,
            tuple(matching_symbols),
        )
        if emit_signals_consulted
        else None,
    )


class DcaSellRuleBase:
    allocation_name: str
    reason: str
    rule_group: RuleGroup
    sell_step: float
    sizing: SizingStrategy

    def matches(
        self,
        snapshot: PortfolioSnapshot,
        *,
        config: PortfolioRuleConfig,
    ) -> bool:
        del config
        return bool(self._matching_symbols(snapshot))

    def build_intent(
        self,
        snapshot: PortfolioSnapshot,
        *,
        config: PortfolioRuleConfig,
    ) -> AllocationIntent:
        return build_dca_sell_intent(
            snapshot=snapshot,
            matching_symbols=self._matching_symbols(snapshot),
            sizing=self.sizing,
            sell_step=self.sell_step,
            proceeds_handler=self.proceeds_handler,
            allocation_name=self.allocation_name,
            reason=self.reason,
            rule_group=self.rule_group,
            emit_signals_consulted=config.emit_signals_consulted,
        )

    def _matching_symbols(self, snapshot: PortfolioSnapshot) -> list[str]:
        raise NotImplementedError

    def proceeds_handler(self, target: dict[str, float], sold: float) -> None:
        raise NotImplementedError


class DcaBuyRuleBase:
    allocation_name: str
    buy_step: float
    reason: str
    rule_group: RuleGroup
    sizing: SizingStrategy

    def matches(
        self,
        snapshot: PortfolioSnapshot,
        *,
        config: PortfolioRuleConfig,
    ) -> bool:
        del config
        return bool(self._matching_symbols(snapshot))

    def build_intent(
        self,
        snapshot: PortfolioSnapshot,
        *,
        config: PortfolioRuleConfig,
    ) -> AllocationIntent:
        return build_dca_buy_intent(
            snapshot=snapshot,
            matching_symbols=self._matching_symbols(snapshot),
            sizing=self.sizing,
            buy_step=self.buy_step,
            allocation_name=self.allocation_name,
            reason=self.reason,
            rule_group=self.rule_group,
            emit_signals_consulted=config.emit_signals_consulted,
        )

    def _matching_symbols(self, snapshot: PortfolioSnapshot) -> list[str]:
        raise NotImplementedError


__all__ = [
    "ALLOCATION_KEY_BY_SYMBOL",
    "DIAG_COOLDOWN_SKIPPED_RULES",
    "DIAG_MATCHED_RULE_NAME",
    "DIAG_PORTFOLIO_RULE_MATCHES",
    "DIAG_PORTFOLIO_RULE_COOLDOWN_KEY",
    "DIAG_PORTFOLIO_RULE_TRIGGER_ASSETS",
    "DIAG_SIGNALS_CONSULTED",
    "DcaBuyRuleBase",
    "DcaSellRuleBase",
    "PORTFOLIO_RULE_SYMBOLS",
    "SYMBOL_BY_ALLOCATION_KEY",
    "DecisionPolicy",
    "FgiRegime",
    "HasPublicParams",
    "PortfolioRule",
    "PortfolioRuleConfig",
    "PortfolioSnapshot",
    "add_split_proceeds",
    "add_stable",
    "allocation_key_for_symbol",
    "build_dca_buy_intent",
    "build_dca_sell_intent",
    "current_fgi_regime_for_symbol",
    "current_target",
    "cross_down_cooldown_days_for",
    "normalize_regime",
    "normalize_symbol",
    "portfolio_target_intent",
    "ratio_signals_consulted",
    "rule_cooldown_remaining_days",
    "signals_consulted_for_symbols",
    "symbols_for_snapshot",
]
