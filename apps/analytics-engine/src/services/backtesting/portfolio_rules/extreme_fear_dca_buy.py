"""Portfolio rule 40: DCA buy assets during extreme fear regardless of DMA zone."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import TYPE_CHECKING

from src.services.backtesting.decision import AllocationIntent, RuleGroup
from src.services.backtesting.portfolio_rules.base import (
    PortfolioRuleConfig,
    PortfolioSnapshot,
    allocation_key_for_symbol,
    current_fgi_regime_for_symbol,
    current_target,
    portfolio_target_intent,
    signals_consulted_for_symbols,
    symbols_for_snapshot,
)
from src.services.backtesting.sizing.flat import FlatSizing
from src.services.backtesting.target_allocation import normalize_target_allocation

if TYPE_CHECKING:
    from src.services.backtesting.sizing.base import SizingStrategy


@dataclass(frozen=True)
class ExtremeFearDcaBuyRule:
    name: str = "extreme_fear_dca_buy"
    priority: int = 40
    cooldown_days: int = 14
    buy_delay_days: int = 0
    rule_group: RuleGroup = "dma_fgi"
    description: str = "DCA buy assets when their relevant FGI is extreme fear."
    buy_step: float = 0.01
    sizing: SizingStrategy = field(default_factory=FlatSizing)
    _detection_dates: dict[str, date] = field(
        default_factory=dict,
        init=False,
        compare=False,
        repr=False,
    )

    def reset(self) -> None:
        """Clear per-symbol detection state at backtest start."""
        self._detection_dates.clear()

    def observe(
        self,
        snapshot: PortfolioSnapshot,
        *,
        config: PortfolioRuleConfig,
    ) -> None:
        """Record first extreme-fear detection and drop closed-cycle detections."""
        del config
        if self.buy_delay_days <= 0 or snapshot.current_date is None:
            return
        for symbol in _extreme_fear_symbols(snapshot):
            self._detection_dates.setdefault(symbol, snapshot.current_date)
        for symbol in list(self._detection_dates):
            if not snapshot.cycle_open_per_symbol.get(symbol, False):
                self._detection_dates.pop(symbol, None)

    def record_intent(self, intent: AllocationIntent) -> None:
        """Clear detection state for delayed buys that survived risk guards."""
        if self.buy_delay_days <= 0:
            return
        if intent.action == "hold":
            return
        if intent.reason != "portfolio_extreme_fear_dca_buy":
            return
        diagnostics = intent.diagnostics or {}
        for symbol in diagnostics.get("portfolio_rule_assets", ()):
            self._detection_dates.pop(str(symbol).upper(), None)

    def matches(
        self,
        snapshot: PortfolioSnapshot,
        *,
        config: PortfolioRuleConfig,
    ) -> bool:
        del config
        if self.buy_delay_days <= 0:
            return bool(_extreme_fear_symbols(snapshot))
        return bool(self._delay_eligible_symbols(snapshot))

    def _delay_eligible_symbols(self, snapshot: PortfolioSnapshot) -> list[str]:
        if snapshot.current_date is None:
            return []
        eligible: list[str] = []
        for symbol, detection in self._detection_dates.items():
            if not snapshot.cycle_open_per_symbol.get(symbol, False):
                continue
            if (snapshot.current_date - detection).days >= self.buy_delay_days:
                eligible.append(symbol)
        return eligible

    def build_intent(
        self,
        snapshot: PortfolioSnapshot,
        *,
        config: PortfolioRuleConfig,
    ) -> AllocationIntent:
        if self.buy_delay_days <= 0:
            matching_symbols = _extreme_fear_symbols(snapshot)
        else:
            matching_symbols = self._delay_eligible_symbols(snapshot)
        target = current_target(snapshot)
        stable_available = max(0.0, float(target.get("stable", 0.0)))
        adjusted_step_by_symbol: dict[str, float] = {}
        if matching_symbols and stable_available > 0.0:
            for symbol in matching_symbols:
                adjusted_step = self.sizing.adjust_step(
                    self.buy_step,
                    snapshot=snapshot,
                    asset=symbol,
                )
                adjusted_step_by_symbol[symbol] = max(0.0, float(adjusted_step))
            total_desired = sum(adjusted_step_by_symbol.values())
            stable_scale = (
                min(1.0, stable_available / total_desired)
                if total_desired > 0.0
                else 0.0
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
            allocation_name="portfolio_extreme_fear_dca_buy",
            reason="portfolio_extreme_fear_dca_buy",
            rule_group=self.rule_group,
            assets=matching_symbols,
            signals_consulted=signals_consulted_for_symbols(
                snapshot,
                tuple(matching_symbols),
            )
            if config.emit_signals_consulted
            else None,
        )


def _extreme_fear_symbols(snapshot: PortfolioSnapshot) -> list[str]:
    return [
        symbol
        for symbol in symbols_for_snapshot(snapshot)
        if current_fgi_regime_for_symbol(snapshot, symbol) == "extreme_fear"
        and snapshot.cycle_open_per_symbol.get(symbol, False)
    ]


__all__ = ["ExtremeFearDcaBuyRule"]
