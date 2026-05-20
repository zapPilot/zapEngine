"""
Outlier Filtering Strategies for Yield Calculations

Implements the Strategy pattern for outlier detection, replacing the monolithic
if-elif chain in YieldSummaryService with composable, testable strategy classes.

Key Design Decisions:
- Abstract base class defines the contract for all strategies
- Each strategy encapsulates its own configuration constants
- Strategies are stateless and can be used as singletons
- Robust edge case handling (zero IQR, zero std dev, tight distributions)
"""

from abc import ABC, abstractmethod
from collections.abc import Callable

import numpy as np

from src.models.yield_returns import OutlierInfo


class OutlierFilterStrategy(ABC):
    """
    Abstract base class for outlier detection strategies.

    Subclasses must implement the filter() method to detect and remove
    outliers according to their specific statistical approach.
    """

    MIN_SAMPLES_FOR_DETECTION = 4  # Minimum data points for statistical reliability

    @abstractmethod
    def filter(
        self,
        daily_totals: dict[str, float],
    ) -> tuple[list[float], list[OutlierInfo]]:
        """
        Apply outlier filtering strategy with robust edge case handling.

        Args:
            daily_totals: Mapping of dates to daily yield values

        Returns:
            Tuple of (filtered_values, outliers_detected)

        Note:
            Requires minimum 4 data points for statistical reliability.
            Guards against degenerate cases (zero IQR, identical values).
        """

    def _partition(
        self,
        daily_totals: dict[str, float],
        classify: Callable[[float], tuple[bool, float | None]],
        reason: str,
    ) -> tuple[list[float], list[OutlierInfo]]:
        """Split values into kept/outliers using a per-value classifier.

        ``classify(value)`` returns ``(keep, z_score)`` where ``keep`` decides
        whether the value is retained and ``z_score`` is recorded on the
        resulting :class:`OutlierInfo` (``None`` for non z-score strategies).
        """
        values = list(daily_totals.values())
        dates = list(daily_totals.keys())

        filtered: list[float] = []
        outliers: list[OutlierInfo] = []

        for date, value in zip(dates, values, strict=True):
            keep, z_score = classify(value)
            if keep:
                filtered.append(value)
            else:
                outliers.append(
                    OutlierInfo(date=date, value=value, reason=reason, z_score=z_score)
                )

        return filtered, outliers


class NoOpFilter(OutlierFilterStrategy):
    """No-operation filter that passes through all values unchanged."""

    def filter(
        self,
        daily_totals: dict[str, float],
    ) -> tuple[list[float], list[OutlierInfo]]:
        """Return all values without filtering."""
        return list(daily_totals.values()), []


class IQRFilter(OutlierFilterStrategy):
    """
    Interquartile Range (IQR) outlier detection strategy.

    Filters values outside Q1 - 1.5*IQR to Q3 + 1.5*IQR range.
    Robust to skewed distributions and handles zero IQR edge case.
    """

    IQR_MULTIPLIER = 1.5

    def filter(
        self,
        daily_totals: dict[str, float],
    ) -> tuple[list[float], list[OutlierInfo]]:
        """Apply IQR-based outlier filtering."""
        values = list(daily_totals.values())

        if len(values) < self.MIN_SAMPLES_FOR_DETECTION:
            return values, []

        q1, q3 = np.percentile(values, [25, 75])
        iqr = q3 - q1

        # Guard against zero IQR by using Q1/Q3 directly as bounds
        if iqr == 0:
            lower, upper = q1, q3
        else:
            lower = q1 - self.IQR_MULTIPLIER * iqr
            upper = q3 + self.IQR_MULTIPLIER * iqr

        return self._partition(
            daily_totals,
            lambda value: (lower <= value <= upper, None),
            "IQR",
        )


class ZScoreFilter(OutlierFilterStrategy):
    """
    Z-Score outlier detection strategy.

    Filters values with |z-score| > threshold (default 2.0).
    Assumes approximately normal distribution. Handles zero std dev edge case.
    """

    ZSCORE_THRESHOLD = 2.0

    def filter(
        self,
        daily_totals: dict[str, float],
    ) -> tuple[list[float], list[OutlierInfo]]:
        """Apply Z-score-based outlier filtering."""
        values = list(daily_totals.values())

        if len(values) < self.MIN_SAMPLES_FOR_DETECTION:
            return values, []

        mean = float(np.mean(values))
        std = float(np.std(values))

        def classify(value: float) -> tuple[bool, float | None]:
            z_score = abs((value - mean) / std) if std > 0 else 0.0
            return z_score <= self.ZSCORE_THRESHOLD, z_score

        return self._partition(daily_totals, classify, "zscore")


class PercentileFilter(OutlierFilterStrategy):
    """
    Percentile-based outlier detection strategy.

    Filters values outside the 5th-95th percentile range.
    Distribution-agnostic and handles tight distributions.
    """

    PERCENTILE_LOWER = 5
    PERCENTILE_UPPER = 95

    def filter(
        self,
        daily_totals: dict[str, float],
    ) -> tuple[list[float], list[OutlierInfo]]:
        """Apply percentile-based outlier filtering."""
        values = list(daily_totals.values())

        if len(values) < self.MIN_SAMPLES_FOR_DETECTION:
            return values, []

        p5 = float(np.percentile(values, self.PERCENTILE_LOWER))
        p95 = float(np.percentile(values, self.PERCENTILE_UPPER))

        # Guard against degenerate range (tight distribution)
        if p5 == p95:
            return values, []

        return self._partition(
            daily_totals,
            lambda value: (p5 <= value <= p95, None),
            "percentile",
        )
