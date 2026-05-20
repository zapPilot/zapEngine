"""Risk-guard contracts for post-decision constraints."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from src.services.backtesting.decision import AllocationIntent
from src.services.backtesting.portfolio_rules.base import (
    PortfolioRuleConfig,
    PortfolioSnapshot,
)


@dataclass(frozen=True, slots=True)
class RiskGuardResult:
    """Final intent after a risk-guard pass."""

    intent: AllocationIntent
    blocked_by: str | None = None


# jscpd:ignore-start
# Reason: guard Protocol mirrors concrete risk-guard method signatures.
class RiskGuard(Protocol):
    @property
    def name(self) -> str: ...

    @property
    def priority(self) -> int: ...

    @property
    def description(self) -> str: ...

    def allow(
        self,
        intent: AllocationIntent,
        snapshot: PortfolioSnapshot,
        *,
        config: PortfolioRuleConfig,
    ) -> AllocationIntent | None: ...


# jscpd:ignore-end


__all__ = ["RiskGuard", "RiskGuardResult"]
