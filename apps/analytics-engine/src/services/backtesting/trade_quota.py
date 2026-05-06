"""Shared trade-frequency quota calculations for backtesting."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, timedelta

BLOCK_REASON_MIN_INTERVAL = "trade_quota_min_interval_active"
BLOCK_REASON_7D = "trade_quota_7d_limit_reached"
BLOCK_REASON_30D = "trade_quota_30d_limit_reached"


def normalize_limit(value: int | None, *, field_name: str) -> int | None:
    if value is None:
        return None
    if isinstance(value, bool):
        raise ValueError(f"{field_name} must be greater than 0 when provided")
    normalized = int(value)
    if normalized <= 0:
        raise ValueError(f"{field_name} must be greater than 0 when provided")
    return normalized


@dataclass(frozen=True, slots=True)
class TradeQuotaLimits:
    """Validated trade-frequency limits plus rolling-window calculations."""

    min_trade_interval_days: int | None = None
    max_trades_7d: int | None = None
    max_trades_30d: int | None = None

    def __post_init__(self) -> None:
        object.__setattr__(
            self,
            "min_trade_interval_days",
            normalize_limit(
                self.min_trade_interval_days,
                field_name="min_trade_interval_days",
            ),
        )
        object.__setattr__(
            self,
            "max_trades_7d",
            normalize_limit(self.max_trades_7d, field_name="max_trades_7d"),
        )
        object.__setattr__(
            self,
            "max_trades_30d",
            normalize_limit(self.max_trades_30d, field_name="max_trades_30d"),
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

    @property
    def history_lookback_days(self) -> int:
        if not self.enabled:
            return 0
        return max(
            self.min_trade_interval_days or 0,
            7 if self.max_trades_7d is not None else 0,
            30 if self.max_trades_30d is not None else 0,
        )

    def resolve_block_state(
        self,
        current_date: date,
        trade_dates: Sequence[date],
    ) -> tuple[str | None, date | None]:
        last_trade_date = self.last_trade_date(current_date, trade_dates)
        if (
            self.min_trade_interval_days is not None
            and last_trade_date is not None
            and (current_date - last_trade_date).days < self.min_trade_interval_days
        ):
            return (
                BLOCK_REASON_MIN_INTERVAL,
                last_trade_date + timedelta(days=self.min_trade_interval_days),
            )

        trades_7d = self.trade_count_in_window(
            current_date,
            trade_dates,
            window_days=7,
        )
        if self.max_trades_7d is not None and trades_7d >= self.max_trades_7d:
            return (
                BLOCK_REASON_7D,
                self.window_release_date(current_date, trade_dates, window_days=7),
            )

        trades_30d = self.trade_count_in_window(
            current_date,
            trade_dates,
            window_days=30,
        )
        if self.max_trades_30d is not None and trades_30d >= self.max_trades_30d:
            return (
                BLOCK_REASON_30D,
                self.window_release_date(current_date, trade_dates, window_days=30),
            )

        return None, None

    @staticmethod
    def last_trade_date(
        current_date: date,
        trade_dates: Sequence[date],
    ) -> date | None:
        eligible = (
            trade_date for trade_date in trade_dates if trade_date <= current_date
        )
        return max(eligible, default=None)

    def trade_count_in_window(
        self,
        current_date: date,
        trade_dates: Sequence[date],
        *,
        window_days: int,
    ) -> int:
        return len(
            self.trade_dates_in_window(
                current_date,
                trade_dates,
                window_days=window_days,
            )
        )

    @staticmethod
    def trade_dates_in_window(
        current_date: date,
        trade_dates: Sequence[date],
        *,
        window_days: int,
    ) -> list[date]:
        return [
            trade_date
            for trade_date in trade_dates
            if 0 <= (current_date - trade_date).days < window_days
        ]

    def window_release_date(
        self,
        current_date: date,
        trade_dates: Sequence[date],
        *,
        window_days: int,
    ) -> date | None:
        in_window = self.trade_dates_in_window(
            current_date,
            trade_dates,
            window_days=window_days,
        )
        if not in_window:
            return None
        return min(in_window) + timedelta(days=window_days)

    def diagnostic_payload(
        self,
        *,
        current_date: date,
        trade_dates: Sequence[date],
        block_reason: str | None,
        next_trade_date: date | None,
    ) -> dict[str, object]:
        last_trade_date = self.last_trade_date(current_date, trade_dates)
        return {
            "enabled": self.enabled,
            "min_trade_interval_days": self.min_trade_interval_days,
            "max_trades_7d": self.max_trades_7d,
            "max_trades_30d": self.max_trades_30d,
            "trades_7d": self.trade_count_in_window(
                current_date,
                trade_dates,
                window_days=7,
            ),
            "trades_30d": self.trade_count_in_window(
                current_date,
                trade_dates,
                window_days=30,
            ),
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
        }
