"""Portfolio rule 40: DCA buy assets during extreme fear regardless of DMA zone."""

from __future__ import annotations

from dataclasses import dataclass

from src.services.backtesting.decision import AllocationIntent, RuleGroup
from src.services.backtesting.portfolio_rules.base import (
    PortfolioRuleConfig,
    PortfolioSnapshot,
    allocation_key_for_symbol,
    combine_sizing_meta,
    current_fgi_regime_for_symbol,
    current_target,
    portfolio_target_intent,
    signals_consulted_for_symbols,
    sizing_meta_for_symbol,
    symbols_for_snapshot,
)
from src.services.backtesting.target_allocation import normalize_target_allocation


@dataclass(frozen=True)
class ExtremeFearDcaBuyRule:
    name: str = "extreme_fear_dca_buy"
    priority: int = 40
    rule_group: RuleGroup = "dma_fgi"
    description: str = "DCA buy assets when their relevant FGI is extreme fear."

    def matches(
        self,
        snapshot: PortfolioSnapshot,
        *,
        config: PortfolioRuleConfig,
    ) -> bool:
        del config
        return bool(_extreme_fear_symbols(snapshot))

    def build_intent(
        self,
        snapshot: PortfolioSnapshot,
        *,
        config: PortfolioRuleConfig,
    ) -> AllocationIntent:
        matching_symbols = _extreme_fear_symbols(snapshot)
        target = current_target(snapshot)
        stable_available = max(0.0, float(target.get("stable", 0.0)))
        adjusted_step_by_symbol: dict[str, float] = {}
        sizing_meta_by_symbol: dict[str, dict[str, object]] = {}
        if matching_symbols and stable_available > 0.0:
            for symbol in matching_symbols:
                adjusted_step = config.extreme_fear_buy_sizing.adjust_step(
                    config.extreme_fear_buy_step,
                    snapshot=snapshot,
                    asset=symbol,
                )
                adjusted_step_by_symbol[symbol] = max(0.0, float(adjusted_step))
                sizing_meta_by_symbol[symbol] = sizing_meta_for_symbol(
                    sizing=config.extreme_fear_buy_sizing,
                    base_step=config.extreme_fear_buy_step,
                    adjusted_step=adjusted_step,
                    snapshot=snapshot,
                    asset=symbol,
                )
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
            sizing_meta=combine_sizing_meta(sizing_meta_by_symbol),
        )


def _extreme_fear_symbols(snapshot: PortfolioSnapshot) -> list[str]:
    return [
        symbol
        for symbol in symbols_for_snapshot(snapshot)
        if current_fgi_regime_for_symbol(snapshot, symbol) == "extreme_fear"
        and snapshot.cycle_open_per_symbol.get(symbol, False)
    ]


__all__ = ["ExtremeFearDcaBuyRule"]
