"""Tests for MaxDrawdownRecoveryTime."""

from __future__ import annotations

import numpy as np

from src.services.backtesting.execution.metrics.recovery_time import (
    MaxDrawdownRecoveryTime,
)


class TestMaxDrawdownRecoveryTime:
    def test_single_value_returns_zero(self) -> None:
        assert MaxDrawdownRecoveryTime().compute(np.array([100.0])) == 0.0

    def test_no_drawdown_returns_zero(self) -> None:
        values = np.array([100.0, 110.0, 120.0, 130.0])
        assert MaxDrawdownRecoveryTime().compute(values) == 0.0

    def test_recovers_within_window(self) -> None:
        # Peak 120 at index 1, trough 90 at index 2, recovers to 120 at index 4.
        # Recovery = 2 bars after the trough (idx 4 - idx 2).
        values = np.array([100.0, 120.0, 90.0, 110.0, 125.0])
        days = MaxDrawdownRecoveryTime().compute(values)
        assert days == 2.0

    def test_never_recovers_returns_lower_bound(self) -> None:
        # Peak 120 at idx 1, trough 80 at idx 4, end-of-series 110 < 120.
        # Returns bars remaining after trough = 5 - 1 - 4 = 0 ... wait,
        # values.size = 6, trough_idx = 4, remaining = 6 - 1 - 4 = 1.
        values = np.array([100.0, 120.0, 100.0, 90.0, 80.0, 110.0])
        days = MaxDrawdownRecoveryTime().compute(values)
        assert days == 1.0

    def test_trough_at_end_returns_zero_remaining(self) -> None:
        # Trough is the last bar; no bars left to recover.
        values = np.array([100.0, 120.0, 110.0, 90.0])
        days = MaxDrawdownRecoveryTime().compute(values)
        assert days == 0.0

    def test_immediate_one_bar_recovery(self) -> None:
        # Drop one bar, recover next.
        values = np.array([100.0, 80.0, 100.0])
        days = MaxDrawdownRecoveryTime().compute(values)
        assert days == 1.0

    def test_metric_protocol_fields(self) -> None:
        m = MaxDrawdownRecoveryTime()
        assert m.key == "max_drawdown_recovery_days"
        assert "recover" in m.description.lower()
