"""Execution plugin that enforces shared trade-frequency quotas."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, timedelta

from src.services.backtesting.domain import ExecutionPluginDiagnostic
from src.services.backtesting.execution.plugins import (
    ExecutionPluginResult,
    PluginInvocation,
)
from src.services.backtesting.strategies.base import TransferIntent

_PLUGIN_ID = "trade_quota_guard"
_BLOCK_REASON_MIN_INTERVAL = "trade_quota_min_interval_active"
_BLOCK_REASON_7D = "trade_quota_7d_limit_reached"
_BLOCK_REASON_30D = "trade_quota_30d_limit_reached"


def _normalize_limit(value: int | None, *, field_name: str) -> int | None:
    if value is None:
        return None
    if isinstance(value, bool):
        raise ValueError(f"{field_name} must be greater than 0 when provided")
    normalized = int(value)
    if normalized <= 0:
        raise ValueError(f"{field_name} must be greater than 0 when provided")
    return normalized


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

    def __post_init__(self) -> None:
        self.min_trade_interval_days = _normalize_limit(
            self.min_trade_interval_days,
            field_name="min_trade_interval_days",
        )
        self.max_trades_7d = _normalize_limit(
            self.max_trades_7d,
            field_name="max_trades_7d",
        )
        self.max_trades_30d = _normalize_limit(
            self.max_trades_30d,
            field_name="max_trades_30d",
        )

    @property
    def history_lookback_days(self) -> int:
        if not self.enabled:
            return 0
        return max(
            self.min_trade_interval_days or 0,
            7 if self.max_trades_7d is not None else 0,
            30 if self.max_trades_30d is not None else 0,
        )

    @property
    def enabled(self) -> bool:
        return any(
            value is not None
            for value in (
                self.min_trade_interval_days,
                self.max_trades_7d,
                self.max_trades_30d,
            )
        )

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
        last_trade_date = self._last_trade_date(current_date)
        if (
            self.min_trade_interval_days is not None
            and last_trade_date is not None
            and (current_date - last_trade_date).days < self.min_trade_interval_days
        ):
            return (
                _BLOCK_REASON_MIN_INTERVAL,
                last_trade_date + timedelta(days=self.min_trade_interval_days),
            )

        trades_7d = self._trade_count_in_window(current_date, window_days=7)
        if self.max_trades_7d is not None and trades_7d >= self.max_trades_7d:
            return (
                _BLOCK_REASON_7D,
                self._window_release_date(current_date, window_days=7),
            )

        trades_30d = self._trade_count_in_window(current_date, window_days=30)
        if self.max_trades_30d is not None and trades_30d >= self.max_trades_30d:
            return (
                _BLOCK_REASON_30D,
                self._window_release_date(current_date, window_days=30),
            )

        return None, None

    def _last_trade_date(self, current_date: date) -> date | None:
        eligible = [
            trade_date for trade_date in self._trade_dates if trade_date <= current_date
        ]
        if not eligible:
            return None
        return eligible[-1]

    def _trade_count_in_window(self, current_date: date, *, window_days: int) -> int:
        return len(self._trade_dates_in_window(current_date, window_days=window_days))

    def _trade_dates_in_window(
        self, current_date: date, *, window_days: int
    ) -> list[date]:
        return [
            trade_date
            for trade_date in self._trade_dates
            if 0 <= (current_date - trade_date).days < window_days
        ]

    def _window_release_date(
        self, current_date: date, *, window_days: int
    ) -> date | None:
        in_window = self._trade_dates_in_window(current_date, window_days=window_days)
        if not in_window:
            return None
        return min(in_window) + timedelta(days=window_days)

    def _build_diagnostic(
        self,
        *,
        current_date: date,
        block_reason: str | None,
        next_trade_date: date | None,
    ) -> ExecutionPluginDiagnostic:
        last_trade_date = self._last_trade_date(current_date)
        return ExecutionPluginDiagnostic(
            plugin_id=_PLUGIN_ID,
            payload={
                "enabled": self.enabled,
                "min_trade_interval_days": self.min_trade_interval_days,
                "max_trades_7d": self.max_trades_7d,
                "max_trades_30d": self.max_trades_30d,
                "trades_7d": self._trade_count_in_window(current_date, window_days=7),
                "trades_30d": self._trade_count_in_window(current_date, window_days=30),
                "last_trade_date": (
                    None if last_trade_date is None else last_trade_date.isoformat()
                ),
                "days_since_last_trade": (
                    None
                    if last_trade_date is None
                    else (current_date - last_trade_date).days
                ),
                "next_trade_date": (
                    None if next_trade_date is None else next_trade_date.isoformat()
                ),
                "block_reason": block_reason,
            },
        )
