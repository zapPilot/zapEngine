"""Post-intent guard that keeps the portfolio out of assets below their DMA."""

from __future__ import annotations

from dataclasses import dataclass, field, replace
from typing import Literal

from src.services.backtesting.decision import AllocationIntent, RuleGroup
from src.services.backtesting.portfolio_rules.base import (
    PortfolioRuleConfig,
    PortfolioSnapshot,
    PostIntentOverlay,
    allocation_key_for_symbol,
    current_target,
    symbols_for_snapshot,
)
from src.services.backtesting.target_allocation import normalize_target_allocation

_EPSILON = 1e-9
FORCE_EXIT_REASON = "portfolio_trend_guard_force_exit"


@dataclass(kw_only=True)
class TrendGuardRule(PostIntentOverlay):
    """Caps an asset that has stayed below its DMA, whichever rule decided.

    An asset counts as below once it has closed more than ``below_dma_buffer``
    (a fraction of its DMA) under it for ``confirm_days`` days in a row. While it
    counts as below, ``block_adds`` stops any rule from adding to it (the
    purchase is undone, the cash stays in stable) and ``force_exit`` also sells
    what is held. The check runs every day, so it holds whatever route a
    position took to get there, not only on the day the price crossed.
    """

    name: str
    priority: int
    mode: Literal["block_adds", "force_exit"]
    below_dma_buffer: float
    confirm_days: int
    cooldown_days: int = 0
    rule_group: RuleGroup = "cross"
    description: str = (
        "Keep assets that stay below their DMA out of the portfolio: block "
        "purchases of them, or sell them."
    )
    _days_below: dict[str, int] = field(default_factory=dict, init=False)

    def reset(self) -> None:
        self._days_below.clear()

    def observe(
        self,
        snapshot: PortfolioSnapshot,
        *,
        config: PortfolioRuleConfig,
    ) -> None:
        del config
        for symbol in symbols_for_snapshot(snapshot):
            below = snapshot.assets[symbol].dma_distance < -self.below_dma_buffer
            self._days_below[symbol] = (
                self._days_below.get(symbol, 0) + 1 if below else 0
            )

    def _adjust(
        self,
        intent: AllocationIntent,
        snapshot: PortfolioSnapshot,
    ) -> AllocationIntent:
        if intent.target_allocation is None:
            return intent
        target = normalize_target_allocation(intent.target_allocation)
        held = current_target(snapshot)
        released: dict[str, float] = {}
        for symbol in self._confirmed_below(snapshot):
            key = allocation_key_for_symbol(symbol)
            ceiling = 0.0 if self.mode == "force_exit" else min(target[key], held[key])
            excess = target[key] - ceiling
            if excess > _EPSILON:
                target[key] = ceiling
                released[symbol] = excess
        if not released:
            return intent
        target["stable"] += sum(released.values())
        return self._adjusted(intent, target, released)

    def _confirmed_below(self, snapshot: PortfolioSnapshot) -> list[str]:
        return [
            symbol
            for symbol in symbols_for_snapshot(snapshot)
            if self._days_below.get(symbol, 0) >= self.confirm_days
        ]

    def _adjusted(
        self,
        intent: AllocationIntent,
        target: dict[str, float],
        released: dict[str, float],
    ) -> AllocationIntent:
        diagnostics = dict(intent.diagnostics or {})
        existing = diagnostics.get("post_intent_adjustments")
        diagnostics["post_intent_adjustments"] = [
            *(existing if isinstance(existing, list) else []),
            f"trend_guard_{self.mode}",
        ]
        diagnostics["trend_guard_released"] = released
        adjusted = replace(
            intent,
            target_allocation=normalize_target_allocation(target),
            diagnostics=diagnostics,
        )
        if intent.action != "hold":
            return adjusted
        # No rule traded today and the guard sells what is held below the trend:
        # the day is a sale, and says why.
        return replace(
            adjusted,
            action="sell",
            allocation_name=FORCE_EXIT_REASON,
            immediate=True,
            reason=FORCE_EXIT_REASON,
            rule_group=self.rule_group,
        )


__all__ = ["FORCE_EXIT_REASON", "TrendGuardRule"]
