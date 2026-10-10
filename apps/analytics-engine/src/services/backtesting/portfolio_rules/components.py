"""The built pieces a rule-based portfolio strategy runs on."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass

from src.services.backtesting.portfolio_rules.base import PortfolioRule


@dataclass(frozen=True)
class SignalSettings:
    """Tunables of the DMA and ETH/BTC ratio signals the rules read."""

    warmup_days: int
    # A price touching its DMA counts as a cross.
    cross_on_touch: bool
    # Days a DMA cross blocks the opposite cross of the same asset.
    dma_cross_cooldown_days: Mapping[str, int]
    # Days a ratio rotation blocks the next ratio cross.
    ratio_cross_cooldown_days: int


@dataclass(frozen=True)
class PortfolioRuleComponents:
    """Rules and signal settings of one rule-based strategy.

    ``rules`` is in precedence order: the first rule that matches and is off
    cooldown decides. A strategy spec compiles to exactly this.
    """

    rules: tuple[PortfolioRule, ...]
    signals: SignalSettings


__all__ = ["PortfolioRuleComponents", "SignalSettings"]
