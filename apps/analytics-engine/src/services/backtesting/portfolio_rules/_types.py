"""Shared dataclasses for portfolio-rule decision policy modules.

These types are imported by both ``_evaluator`` (which holds the public
policy class) and ``_snapshot_builder`` (which advances the context), so
they live in a sibling-free module to avoid circular imports.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field
from datetime import date

from src.services.backtesting.portfolio_rules.cooldown_tracker import (
    RuleCooldownTracker,
)


@dataclass(frozen=True)
class RuleExecutionState:
    last_trade_date: date | None = None
    trade_dates: tuple[date, ...] = ()


@dataclass(frozen=True)
class RuleExecutionContext:
    previous_fgi_regime: Mapping[str, str] = field(default_factory=dict)
    cycle_open_per_symbol: Mapping[str, bool] = field(default_factory=dict)
    cooldown_tracker: RuleCooldownTracker = field(default_factory=RuleCooldownTracker)
    execution_state: RuleExecutionState = field(default_factory=RuleExecutionState)
