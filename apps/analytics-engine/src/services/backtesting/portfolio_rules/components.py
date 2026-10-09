"""The built pieces a rule-based portfolio strategy runs on."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field

from src.services.backtesting.portfolio_rules.base import PortfolioRule
from src.services.backtesting.risk import RiskGuard


@dataclass(frozen=True)
class SignalSettings:
    """Tunables of the DMA and ETH/BTC ratio signals the rules read."""

    warmup_days: int = 14
    # A price touching its DMA counts as a cross.
    cross_on_touch: bool = True
    # Days a DMA cross blocks the opposite cross of the same asset.
    dma_cross_cooldown_days: Mapping[str, int] = field(
        default_factory=lambda: {"SPY": 14, "BTC": 30, "ETH": 30}
    )
    # Days a ratio rotation blocks the next ratio cross.
    ratio_cross_cooldown_days: int = 30


@dataclass(frozen=True)
class PortfolioRuleComponents:
    """Rules, guards and signal settings of one rule-based strategy.

    ``rules`` is in precedence order: the first rule that matches decides. When
    ``enabled_rules`` is set, rules outside it are still evaluated and traced but
    never decide.
    """

    rules: tuple[PortfolioRule, ...]
    risk_guards: tuple[RiskGuard, ...] = ()
    signals: SignalSettings = field(default_factory=SignalSettings)
    disabled_rules: frozenset[str] = frozenset()
    enabled_rules: frozenset[str] | None = None


__all__ = ["PortfolioRuleComponents", "SignalSettings"]
