"""Execution plugin that enforces shared trade-frequency quotas."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date

from src.services.backtesting.domain import ExecutionPluginDiagnostic
from src.services.backtesting.execution.plugins import (
    ExecutionPluginResult,
    PluginInvocation,
)
from src.services.backtesting.strategies.base import TransferIntent
from src.services.backtesting.trade_quota import TradeQuotaLimits

_PLUGIN_ID = "trade_quota_guard"


@dataclass
class TradeQuotaGuardExecutionPlugin:
    """Block execution when recent trade frequency exceeds configured limits."""

    min_trade_interval_days: int | None = None
    max_trades_7d: int | None = None
    max_trades_30d: int | None = None
    _seeded_trade_dates: list[date] = field(
        default_factory=list, init=False, repr=False
    )
    _trade_dates: list[date] = field(default_factory=list, init=False, repr=False)
    _limits: TradeQuotaLimits = field(init=False, repr=False)

    def __post_init__(self) -> None:
        self._limits = TradeQuotaLimits(
            min_trade_interval_days=self.min_trade_interval_days,
            max_trades_7d=self.max_trades_7d,
            max_trades_30d=self.max_trades_30d,
        )
        self.min_trade_interval_days = self._limits.min_trade_interval_days
        self.max_trades_7d = self._limits.max_trades_7d
        self.max_trades_30d = self._limits.max_trades_30d

    @property
    def history_lookback_days(self) -> int:
        return self._limits.history_lookback_days

    @property
    def enabled(self) -> bool:
        return self._limits.enabled

    def load_trade_dates(self, trade_dates: list[date]) -> None:
        self._seeded_trade_dates = sorted(
            trade_date for trade_date in trade_dates if isinstance(trade_date, date)
        )
        self._trade_dates = list(self._seeded_trade_dates)

    def reset(self) -> None:
        self._trade_dates = list(self._seeded_trade_dates)

    def observe(self, hints: object) -> None:
        del hints

    def precheck(self, invocation: PluginInvocation) -> ExecutionPluginResult:
        if not self.enabled or invocation.intent.target_allocation is None:
            return ExecutionPluginResult()

        current_date = invocation.context.date
        block_reason, next_trade_date = self._resolve_block_state(current_date)
        diagnostics = (
            self._build_diagnostic(
                current_date=current_date,
                block_reason=block_reason,
                next_trade_date=next_trade_date,
            ),
        )
        if block_reason is None:
            return ExecutionPluginResult(diagnostics=diagnostics)
        return ExecutionPluginResult(
            allowed=False,
            blocked_reason=block_reason,
            diagnostics=diagnostics,
        )

    def adjust_step_plan(
        self,
        invocation: PluginInvocation,
        step_plan: dict[str, float],
    ) -> ExecutionPluginResult:
        del invocation, step_plan
        return ExecutionPluginResult()

    def after_execution(
        self,
        invocation: PluginInvocation,
        transfers: list[TransferIntent],
    ) -> ExecutionPluginResult:
        if not self.enabled:
            return ExecutionPluginResult()

        if transfers:
            self._trade_dates.append(invocation.context.date)
            self._trade_dates.sort()

        _block_reason, next_trade_date = self._resolve_block_state(
            invocation.context.date
        )
        return ExecutionPluginResult(
            diagnostics=(
                self._build_diagnostic(
                    current_date=invocation.context.date,
                    block_reason=None,
                    next_trade_date=next_trade_date,
                ),
            )
        )

    def _resolve_block_state(
        self, current_date: date
    ) -> tuple[str | None, date | None]:
        return self._limits.resolve_block_state(current_date, self._trade_dates)

    def _build_diagnostic(
        self,
        *,
        current_date: date,
        block_reason: str | None,
        next_trade_date: date | None,
    ) -> ExecutionPluginDiagnostic:
        return ExecutionPluginDiagnostic(
            plugin_id=_PLUGIN_ID,
            payload=self._limits.diagnostic_payload(
                current_date=current_date,
                trade_dates=self._trade_dates,
                block_reason=block_reason,
                next_trade_date=next_trade_date,
            ),
        )
