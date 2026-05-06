"""Portfolio rule that enforces shared trade-frequency quotas."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta

from src.services.backtesting.decision import AllocationIntent, RuleGroup
from src.services.backtesting.portfolio_rules.base import (
    PortfolioRuleConfig,
    PortfolioSnapshot,
    current_target,
)

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
class TradeQuotaRule:
    name: str = "trade_quota"
    priority: int = 0
    rule_group: RuleGroup = "none"
    description: str = "Enforce min-interval and rolling trade quotas."
    min_trade_interval_days: int | None = None
    max_trades_7d: int | None = None
    max_trades_30d: int | None = None

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
    def enabled(self) -> bool:
        return any(
            value is not None
            for value in (
                self.min_trade_interval_days,
                self.max_trades_7d,
                self.max_trades_30d,
            )
        )

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
        block_reason, _next_trade_date = self._resolve_block_state(
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
        block_reason, next_trade_date = self._resolve_block_state(
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

    def _resolve_block_state(
        self,
        current_date: date,
        trade_dates: tuple[date, ...],
    ) -> tuple[str | None, date | None]:
        last_trade_date = self._last_trade_date(current_date, trade_dates)
        if (
            self.min_trade_interval_days is not None
            and last_trade_date is not None
            and (current_date - last_trade_date).days < self.min_trade_interval_days
        ):
            return (
                _BLOCK_REASON_MIN_INTERVAL,
                last_trade_date + timedelta(days=self.min_trade_interval_days),
            )

        trades_7d = self._trade_count_in_window(
            current_date,
            trade_dates,
            window_days=7,
        )
        if self.max_trades_7d is not None and trades_7d >= self.max_trades_7d:
            return (
                _BLOCK_REASON_7D,
                self._window_release_date(
                    current_date,
                    trade_dates,
                    window_days=7,
                ),
            )

        trades_30d = self._trade_count_in_window(
            current_date,
            trade_dates,
            window_days=30,
        )
        if self.max_trades_30d is not None and trades_30d >= self.max_trades_30d:
            return (
                _BLOCK_REASON_30D,
                self._window_release_date(
                    current_date,
                    trade_dates,
                    window_days=30,
                ),
            )

        return None, None

    @staticmethod
    def _last_trade_date(
        current_date: date,
        trade_dates: tuple[date, ...],
    ) -> date | None:
        eligible = [
            trade_date for trade_date in trade_dates if trade_date <= current_date
        ]
        if not eligible:
            return None
        return sorted(eligible)[-1]

    def _trade_count_in_window(
        self,
        current_date: date,
        trade_dates: tuple[date, ...],
        *,
        window_days: int,
    ) -> int:
        return len(
            self._trade_dates_in_window(
                current_date,
                trade_dates,
                window_days=window_days,
            )
        )

    @staticmethod
    def _trade_dates_in_window(
        current_date: date,
        trade_dates: tuple[date, ...],
        *,
        window_days: int,
    ) -> list[date]:
        return [
            trade_date
            for trade_date in trade_dates
            if 0 <= (current_date - trade_date).days < window_days
        ]

    def _window_release_date(
        self,
        current_date: date,
        trade_dates: tuple[date, ...],
        *,
        window_days: int,
    ) -> date | None:
        in_window = self._trade_dates_in_window(
            current_date,
            trade_dates,
            window_days=window_days,
        )
        if not in_window:
            return None
        return min(in_window) + timedelta(days=window_days)

    def _build_diagnostic(
        self,
        *,
        current_date: date,
        trade_dates: tuple[date, ...],
        block_reason: str | None,
        next_trade_date: date | None,
    ) -> dict[str, object]:
        last_trade_date = self._last_trade_date(current_date, trade_dates)
        return {
            "matched_rule_name": self.name,
            "enabled": self.enabled,
            "min_trade_interval_days": self.min_trade_interval_days,
            "max_trades_7d": self.max_trades_7d,
            "max_trades_30d": self.max_trades_30d,
            "trades_7d": self._trade_count_in_window(
                current_date,
                trade_dates,
                window_days=7,
            ),
            "trades_30d": self._trade_count_in_window(
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


__all__ = ["TradeQuotaRule"]
