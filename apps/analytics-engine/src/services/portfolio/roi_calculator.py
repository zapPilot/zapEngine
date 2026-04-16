"""
ROI Calculator Service

Provides reusable ROI calculations for the landing page service.
"""

from __future__ import annotations

import logging
from collections import defaultdict
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from functools import lru_cache
from typing import Any, cast
from uuid import UUID

from sqlalchemy.orm import Session

from src.core.cache_service import analytics_cache
from src.core.constants import CALENDAR_DAYS_PER_YEAR
from src.core.financial_utils import calculate_percentage, safe_float, safe_int
from src.core.utils import normalize_date
from src.services.interfaces import (
    PortfolioROIComputed,
    QueryServiceProtocol,
    RecommendedROIPeriod,
    ROICalculatorProtocol,
    ROIWindowData,
)
from src.services.shared.query_names import QUERY_NAMES

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class EvaluatedWindow:
    period: RecommendedROIPeriod
    data: ROIWindowData
    effective_days: int
    annualized: float


ROI_PERIODS: dict[RecommendedROIPeriod, int] = {
    "roi_3d": 3,
    "roi_7d": 7,
    "roi_14d": 14,
    "roi_30d": 30,
    "roi_60d": 60,
    "roi_180d": 180,
    "roi_365d": 365,
}

DEFAULT_RECOMMENDED_PERIOD: RecommendedROIPeriod = (
    "roi_30d" if "roi_30d" in ROI_PERIODS else next(iter(ROI_PERIODS))
)


class ROICalculator(ROICalculatorProtocol):
    """Service for computing portfolio ROI from historical snapshots."""

    CACHE_VERSION = "v1"

    def __init__(self, query_service: QueryServiceProtocol):
        self.query_service = query_service

    def compute_portfolio_roi(
        self,
        db: Session,
        user_id: UUID,
        *,
        current_snapshot_date: date | None = None,
    ) -> PortfolioROIComputed:
        """See ROICalculatorProtocol.compute_portfolio_roi."""
        # Build cache key (include snapshot_date for proper cache isolation)
        if current_snapshot_date is None:
            logger.warning(
                "compute_portfolio_roi called without current_snapshot_date for user %s - "
                "consider using CanonicalSnapshotService for consistency",
                user_id,
            )

        key_parts: list[Any] = [
            self.__class__.__name__,
            self.CACHE_VERSION,
            "portfolio_roi",
            user_id,
        ]
        if current_snapshot_date is not None:
            key_parts.extend(["date", str(current_snapshot_date)])

        cache_key = analytics_cache.build_key(*key_parts)

        # Check cache first
        cached = analytics_cache.get(cache_key)
        if cached is not None:
            # Cache store is untyped; cast to the expected ROI payload when present.
            cached = cast(PortfolioROIComputed, cached)
            logger.debug("ROI cache hit for user %s", user_id)
            return cached

        # Cache miss - compute fresh
        logger.debug("ROI cache miss for user %s", user_id)
        result = self._compute_roi_internal(
            db, user_id, current_snapshot_date=current_snapshot_date
        )

        # Store in cache (12-hour TTL)
        analytics_cache.set(cache_key, result)

        return result

    def _compute_roi_internal(
        self,
        db: Session,
        user_id: UUID,
        *,
        current_snapshot_date: date | None = None,
    ) -> PortfolioROIComputed:
        """Internal method to compute ROI (separated for caching).

        Args:
            db: Database session
            user_id: User identifier
            current_snapshot_date: Explicit snapshot date to use as endpoint.
                                  If provided, uses this date + 1 day as end_dt (exclusive upper bound).
                                  If None, uses current datetime (legacy).
        """
        try:
            if current_snapshot_date is not None:
                # Add 1 day for exclusive upper bound (SQL queries use < end_date)
                end_dt = datetime.combine(
                    current_snapshot_date + timedelta(days=1),
                    datetime.min.time(),
                    tzinfo=UTC,
                )
                logger.debug(
                    "Computing ROI relative to snapshot_date=%s (end_dt=%s)",
                    current_snapshot_date,
                    end_dt,
                )
            else:
                # LEGACY: Use current datetime
                end_dt = datetime.now(UTC)

            lookback = max(ROI_PERIODS.values(), default=0) + 1
            start_dt = end_dt - timedelta(days=lookback)

            rows = self._fetch_portfolio_snapshots(db, user_id, start_dt, end_dt)
            daily_totals = self._aggregate_daily_totals(rows)
            if not daily_totals:
                return self._empty_result()

            windows = self._calculate_windows(daily_totals)
            if not windows:
                return self._empty_result()  # pragma: no cover

            return self._build_result(windows)
        except Exception as exc:  # pragma: no cover - defensive fallback
            logger.error(
                "Failed to compute ROI for user %s: %s. Falling back to zeros.",
                user_id,
                exc,
            )
            return self._empty_result()

    def _fetch_portfolio_snapshots(
        self,
        db: Session,
        user_id: UUID,
        start_dt: datetime,
        end_dt: datetime,
    ) -> Iterable[Mapping[str, Any]]:
        return self.query_service.execute_query(
            db,
            QUERY_NAMES.PORTFOLIO_CATEGORY_TREND_MV,
            {
                "user_id": str(user_id),
                "start_date": start_dt,
                "end_date": end_dt,
                "wallet_address": None,
            },
        )

    def _aggregate_daily_totals(
        self, rows: Iterable[Mapping[str, Any]]
    ) -> dict[date, float]:
        # Use defaultdict to avoid dictionary lookups (20-30ms saved)
        daily_totals: defaultdict[date, float] = defaultdict(float)
        for row in rows:
            day = self._cached_normalize_date(row.get("date"))
            if day is None:
                continue

            # Category-based query returns category_value_usd per source slice
            value = safe_float(row.get("category_value_usd", row.get("net_value_usd")))
            daily_totals[day] += value  # Optimized: no .get() lookup needed
        return dict(daily_totals)  # Convert back to regular dict

    def _calculate_windows(
        self, daily_totals: Mapping[date, float]
    ) -> dict[RecommendedROIPeriod, ROIWindowData]:
        if not daily_totals:
            return {}

        # No sort needed: SQL query orders by date ASC, dict maintains insertion order (Py3.7+)
        sorted_days = list(daily_totals.keys())
        if not sorted_days:
            return {}  # pragma: no cover

        last_day = sorted_days[-1]
        latest_value = safe_float(daily_totals.get(last_day, 0.0))

        return {
            period: self._compute_window(
                window_days,
                last_day,
                sorted_days,
                daily_totals,
                latest_value,
            )
            for period, window_days in ROI_PERIODS.items()
        }

    def _build_result(
        self, windows: Mapping[RecommendedROIPeriod, ROIWindowData]
    ) -> PortfolioROIComputed:
        full_windows: dict[RecommendedROIPeriod, ROIWindowData] = {
            period: self._normalize_window(windows.get(period))
            for period in ROI_PERIODS
        }

        (
            recommended_period,
            recommended_window,
            effective_days,
        ) = self._select_recommended(full_windows)
        # Use actual span when available; fallback to nominal window
        if effective_days <= 0:  # pragma: no cover
            effective_days = ROI_PERIODS.get(recommended_period, 0)
        recommended_yearly_roi = self._annualize(
            recommended_window["value"], effective_days
        )
        start_balance = recommended_window.get("start_balance", 0.0)
        estimated_yearly_pnl = (recommended_yearly_roi / 100.0) * start_balance

        return {
            "windows": full_windows,
            "recommended_roi": recommended_window["value"],
            "recommended_period": recommended_period,
            "recommended_yearly_roi": recommended_yearly_roi,
            "estimated_yearly_pnl": estimated_yearly_pnl,
        }

    def _compute_window(
        self,
        window_days: int,
        last_day: date,
        sorted_days: list[date],
        daily_totals: Mapping[date, float],
        latest_value: float,
    ) -> ROIWindowData:
        if window_days <= 0:
            return self._empty_roi_window()

        boundary = last_day - timedelta(days=window_days)
        earliest_day: date | None = None
        data_points = 0

        for day in sorted_days:
            if day < boundary:
                continue
            if day > last_day:
                break

            data_points += 1
            if earliest_day is None:
                earliest_day = day

        if earliest_day is None:
            return self._empty_roi_window()

        days_spanned = (last_day - earliest_day).days
        start_balance = safe_float(daily_totals.get(earliest_day, 0.0))
        if start_balance <= 0.0:
            window = self._empty_roi_window()
            window["data_points"] = data_points
            window["start_balance"] = start_balance
            window["days_spanned"] = days_spanned
            return window

        change = latest_value - start_balance
        percentage_change = calculate_percentage(abs(change), start_balance)
        roi_value = percentage_change if change >= 0 else -percentage_change
        return {
            "value": roi_value,
            "data_points": data_points,
            "start_balance": start_balance,
            "days_spanned": days_spanned,
        }

    def _normalize_window(self, data: Mapping[str, Any] | None) -> ROIWindowData:
        if not data:
            return self._empty_roi_window()

        value = safe_float(data.get("value"))
        data_points = safe_int(data.get("data_points", 0))
        start_balance = safe_float(data.get("start_balance"))
        days_spanned = safe_int(data.get("days_spanned", 0))

        if data_points < 0:
            data_points = 0

        return {
            "value": value,
            "data_points": data_points,
            "start_balance": start_balance,
            "days_spanned": days_spanned,
        }

    def _evaluate_windows(
        self, windows: Mapping[RecommendedROIPeriod, ROIWindowData]
    ) -> list[EvaluatedWindow]:
        evaluated: list[EvaluatedWindow] = []
        for period, data in windows.items():
            if data["data_points"] <= 0:
                continue
            effective_days = self._resolve_effective_days(period, data)
            annualized = (
                self._annualize(data["value"], effective_days)
                if effective_days > 0
                else 0.0
            )
            evaluated.append(
                EvaluatedWindow(
                    period=period,
                    data=data,
                    effective_days=effective_days,
                    annualized=annualized,
                )
            )
        return evaluated

    def _resolve_effective_days(
        self, period: RecommendedROIPeriod, data: ROIWindowData
    ) -> int:
        days = safe_int(data.get("days_spanned", 0))
        if days <= 0:
            days = ROI_PERIODS.get(period, 0)
        return days

    def _select_recommended(
        self, windows: Mapping[RecommendedROIPeriod, ROIWindowData]
    ) -> tuple[RecommendedROIPeriod, ROIWindowData, int]:
        def _fallback() -> tuple[RecommendedROIPeriod, ROIWindowData, int]:
            default_period = self._default_period(windows)
            default_window = windows.get(default_period, self._empty_roi_window())
            return (
                default_period,
                default_window,
                self._resolve_effective_days(default_period, default_window),
            )

        evaluated = self._evaluate_windows(windows)
        if not evaluated:
            return _fallback()

        # Prefer lowest positive annualized ROI (most conservative/realistic signal)
        positives = [w for w in evaluated if w.annualized > 0.0]
        if positives:
            best = min(
                positives,
                key=lambda w: (
                    w.annualized,
                    -w.data["data_points"],
                    int(w.period != DEFAULT_RECOMMENDED_PERIOD),
                ),
            )
            return best.period, best.data, best.effective_days

        # Prefer zero ROI: maximize data points, favour the default period
        zeros = [w for w in evaluated if w.annualized == 0.0]
        if zeros:
            best = max(
                zeros,
                key=lambda w: (
                    w.data["data_points"],
                    int(w.period == DEFAULT_RECOMMENDED_PERIOD),
                ),
            )
            return best.period, best.data, best.effective_days

        # Prefer least-negative annualized ROI
        negatives = [w for w in evaluated if w.annualized < 0.0]
        if negatives:
            best = min(
                negatives,
                key=lambda w: (
                    abs(w.annualized),
                    -w.data["data_points"],
                    int(w.period != DEFAULT_RECOMMENDED_PERIOD),
                ),
            )
            return best.period, best.data, best.effective_days

        return _fallback()  # pragma: no cover

    @staticmethod
    def _default_period(
        windows: Mapping[RecommendedROIPeriod, Any],
    ) -> RecommendedROIPeriod:
        if DEFAULT_RECOMMENDED_PERIOD in windows:
            return DEFAULT_RECOMMENDED_PERIOD
        return next(iter(windows), DEFAULT_RECOMMENDED_PERIOD)

    @staticmethod
    @lru_cache(maxsize=512)  # Cache date conversions (20-30ms saved)
    def _cached_normalize_date(value: Any) -> date | None:
        return normalize_date(value, nullable=True)

    @staticmethod
    def _empty_roi_window() -> ROIWindowData:
        return {"value": 0.0, "data_points": 0, "start_balance": 0.0, "days_spanned": 0}

    def _empty_result(self) -> PortfolioROIComputed:
        return self._build_result({})

    @staticmethod
    def _annualize(roi_percent: float, window_days: int) -> float:
        if window_days <= 0:
            return 0.0
        return float(roi_percent * (CALENDAR_DAYS_PER_YEAR / window_days))
