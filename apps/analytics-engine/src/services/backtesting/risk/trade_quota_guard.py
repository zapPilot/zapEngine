"""Risk guard that enforces shared trade-frequency quotas."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from src.services.backtesting.decision import AllocationIntent
from src.services.backtesting.portfolio_rules.base import (
    DIAG_MATCHED_RULE_NAME,
    DIAG_SIGNALS_CONSULTED,
    PortfolioRuleConfig,
    PortfolioSnapshot,
    current_target,
    signals_consulted_for_symbols,
    symbols_for_snapshot,
)
from src.services.backtesting.trade_quota import TradeQuotaLimits


@dataclass
class TradeQuotaGuard:
    name: str = "trade_quota"
    priority: int = 0
    description: str = "Enforce min-interval and rolling trade quotas."
    min_trade_interval_days: int | None = None
    max_trades_7d: int | None = None
    max_trades_30d: int | None = None

    # jscpd:ignore-start
    # Reason: quota guard mirrors TradeQuotaLimits field normalization.
    def __post_init__(self) -> None:
        limits = self._limits
        self.min_trade_interval_days = limits.min_trade_interval_days
        self.max_trades_7d = limits.max_trades_7d
        self.max_trades_30d = limits.max_trades_30d

    # jscpd:ignore-end

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

    def allow(
        self,
        intent: AllocationIntent,
        snapshot: PortfolioSnapshot,
        *,
        config: PortfolioRuleConfig,
    ) -> AllocationIntent | None:
        current_date = snapshot.current_date
        del intent
        if not self.enabled or current_date is None:
            return None
        block_reason, next_trade_date = self._limits.resolve_block_state(
            current_date,
            snapshot.trade_dates,
        )
        if block_reason is None:
            return None
        return AllocationIntent(
            action="hold",
            target_allocation=current_target(snapshot),
            allocation_name=None,
            immediate=False,
            reason=block_reason,
            rule_group="none",
            decision_score=0.0,
            diagnostics=self._build_diagnostic(
                current_date=current_date,
                trade_dates=snapshot.trade_dates,
                block_reason=block_reason,
                next_trade_date=next_trade_date,
                signals_consulted=signals_consulted_for_symbols(
                    snapshot,
                    tuple(symbols_for_snapshot(snapshot)),
                )
                if config.emit_signals_consulted
                else None,
            ),
        )

    def _build_diagnostic(
        self,
        *,
        current_date: date,
        trade_dates: tuple[date, ...],
        block_reason: str | None,
        next_trade_date: date | None,
        signals_consulted: dict[str, object] | None,
    ) -> dict[str, object]:
        payload = self._limits.diagnostic_payload(
            current_date=current_date,
            trade_dates=trade_dates,
            block_reason=block_reason,
            next_trade_date=next_trade_date,
        )
        diagnostics: dict[str, object] = {
            DIAG_MATCHED_RULE_NAME: self.name,
            **payload,
        }
        if signals_consulted is not None:
            diagnostics[DIAG_SIGNALS_CONSULTED] = signals_consulted
        return diagnostics


__all__ = ["TradeQuotaGuard"]
