"""Portfolio rule 23: suppress DMA overextension sells in extreme greed."""

from __future__ import annotations

from dataclasses import dataclass, field, replace

from src.services.backtesting.decision import AllocationIntent, RuleGroup
from src.services.backtesting.portfolio_rules.base import (
    PortfolioRuleConfig,
    PortfolioSnapshot,
    current_fgi_regime_for_symbol,
    current_target,
    normalize_symbol,
    portfolio_target_intent,
    signals_consulted_for_symbols,
    symbols_for_snapshot,
)
from src.services.backtesting.portfolio_rules.dma_overextension_dca_sell import (
    DmaOverextensionDcaSellRule,
)
from src.services.backtesting.target_allocation import normalize_target_allocation


def _default_dma_overextension_thresholds() -> dict[str, float]:
    return dict(DmaOverextensionDcaSellRule().dma_overextension_thresholds)


@dataclass(frozen=True)
class GreedSellSuppressionRule:
    name: str = "greed_sell_suppression"
    priority: int = 23
    cooldown_days: int = 0
    rule_group: RuleGroup = "dma_fgi"
    description: str = (
        "Hold through DMA overextension sells while crypto FGI is extreme greed."
    )
    default_dma_overextension_threshold: float = 0.30
    dma_overextension_thresholds: dict[str, float] = field(
        default_factory=_default_dma_overextension_thresholds
    )

    def matches(
        self,
        snapshot: PortfolioSnapshot,
        *,
        config: PortfolioRuleConfig,
    ) -> bool:
        del config
        return bool(_matching_symbols(snapshot, rule=self))

    def build_intent(
        self,
        snapshot: PortfolioSnapshot,
        *,
        config: PortfolioRuleConfig,
    ) -> AllocationIntent:
        matching_symbols = _matching_symbols(snapshot, rule=self)
        intent = portfolio_target_intent(
            action="hold",
            target=normalize_target_allocation(current_target(snapshot)),
            allocation_name="portfolio_greed_sell_suppression",
            reason="portfolio_greed_sell_suppression",
            rule_group=self.rule_group,
            assets=matching_symbols,
            signals_consulted=signals_consulted_for_symbols(
                snapshot,
                tuple(matching_symbols),
            )
            if config.emit_signals_consulted
            else None,
        )
        diagnostics = dict(intent.diagnostics or {})
        diagnostics["matched_rule_name"] = self.name
        return replace(intent, diagnostics=diagnostics)


def _matching_symbols(
    snapshot: PortfolioSnapshot,
    *,
    rule: GreedSellSuppressionRule,
) -> list[str]:
    return [
        symbol
        for symbol in symbols_for_snapshot(snapshot)
        if symbol in {"BTC", "ETH"}
        and snapshot.assets[symbol].zone == "above"
        and current_fgi_regime_for_symbol(snapshot, symbol) == "extreme_greed"
        and snapshot.assets[symbol].dma_distance > _threshold(symbol, rule=rule)
    ]


def _threshold(symbol: str, *, rule: GreedSellSuppressionRule) -> float:
    return float(
        rule.dma_overextension_thresholds.get(
            normalize_symbol(symbol),
            rule.default_dma_overextension_threshold,
        )
    )


__all__ = ["GreedSellSuppressionRule"]
