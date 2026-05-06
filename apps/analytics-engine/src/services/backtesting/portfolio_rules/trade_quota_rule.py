"""Portfolio rule that enforces shared trade-frequency quotas."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from src.services.backtesting.decision import AllocationIntent, RuleGroup
from src.services.backtesting.portfolio_rules.base import (
    PortfolioRuleConfig,
    PortfolioSnapshot,
    current_target,
)
from src.services.backtesting.trade_quota import TradeQuotaLimits


@dataclass
class TradeQuotaRule:
    name: str = "trade_quota"
    priority: int = 0
    rule_group: RuleGroup = "none"
    description: str = "Enforce min-interval and rolling trade quotas."
    min_trade_interval_days: int | None = None
    max_trades_7d: int | None = None
    max_trades_30d: int | None = None

    def __post_init__(self) -> None:
        limits = self._limits
        self.min_trade_interval_days = limits.min_trade_interval_days
        self.max_trades_7d = limits.max_trades_7d
        self.max_trades_30d = limits.max_trades_30d

    @property
    def _limits(self) -> TradeQuotaLimits:
        return TradeQuotaLimits(
            min_trade_interval_days=self.min_trade_interval_days,
            max_trades_7d=self.max_trades_7d,
            max_trades_30d=self.max_trades_30d,
        )

    @property
    def enabled(self) -> bool:
        return self._limits.enabled

    def matches(
        self,
        snapshot: PortfolioSnapshot,
        *,
        config: PortfolioRuleConfig,
    ) -> bool:
        del config
        current_date = snapshot.current_date
        if not self.enabled or current_date is None:
            return False
        block_reason, _next_trade_date = self._limits.resolve_block_state(
            current_date,
            snapshot.trade_dates,
        )
        return block_reason is not None

    def build_intent(
        self,
        snapshot: PortfolioSnapshot,
        *,
        config: PortfolioRuleConfig,
    ) -> AllocationIntent:
        del config
        current_date = snapshot.current_date
        assert current_date is not None
        block_reason, next_trade_date = self._limits.resolve_block_state(
            current_date,
            snapshot.trade_dates,
        )
        return AllocationIntent(
            action="hold",
            target_allocation=current_target(snapshot),
            allocation_name=None,
            immediate=False,
            reason=block_reason or "trade_quota_blocked",
            rule_group=self.rule_group,
            decision_score=0.0,
            diagnostics=self._build_diagnostic(
                current_date=current_date,
                trade_dates=snapshot.trade_dates,
                block_reason=block_reason,
                next_trade_date=next_trade_date,
            ),
        )

    def _build_diagnostic(
        self,
        *,
        current_date: date,
        trade_dates: tuple[date, ...],
        block_reason: str | None,
        next_trade_date: date | None,
    ) -> dict[str, object]:
        payload = self._limits.diagnostic_payload(
            current_date=current_date,
            trade_dates=trade_dates,
            block_reason=block_reason,
            next_trade_date=next_trade_date,
        )
        return {"matched_rule_name": self.name, **payload}


__all__ = ["TradeQuotaRule"]
