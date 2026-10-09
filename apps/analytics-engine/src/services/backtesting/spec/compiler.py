"""Compiles a validated strategy spec into the pieces the engine runs."""

from __future__ import annotations

from src.services.backtesting.portfolio_rules.components import (
    PortfolioRuleComponents,
    SignalSettings,
)
from src.services.backtesting.risk import TradeQuotaGuard
from src.services.backtesting.spec.model import StrategySpec
from src.services.backtesting.spec.validation import require_valid

PRIORITY_STEP = 10


def compile_spec(spec: StrategySpec) -> PortfolioRuleComponents:
    """Rules, guards and signal settings for ``spec``.

    Array order is precedence, so priorities are the position in the spec.
    Overlays follow the rules. Each call builds fresh rule objects, because
    some rules (the SPY latch) carry state.
    """
    require_valid(spec)
    ordered = [*spec.rules, *spec.overlays]
    return PortfolioRuleComponents(
        rules=tuple(
            item.to_rule(priority=PRIORITY_STEP * (position + 1))
            for position, item in enumerate(ordered)
        ),
        risk_guards=tuple(
            TradeQuotaGuard(
                min_trade_interval_days=guard.min_trade_interval_days,
                max_trades_7d=guard.max_trades_7d,
                max_trades_30d=guard.max_trades_30d,
            )
            for guard in spec.guards
        ),
        signals=SignalSettings(
            warmup_days=spec.signals.warmup_days,
            cross_on_touch=spec.signals.dma.cross_on_touch,
            dma_cross_cooldown_days=dict(spec.signals.dma.cross_cooldown_days),
            ratio_cross_cooldown_days=spec.signals.ratio.cross_cooldown_days,
        ),
    )


__all__ = ["PRIORITY_STEP", "compile_spec"]
