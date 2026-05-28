"""Tests for PainIndex."""

from __future__ import annotations

import numpy as np

from src.services.backtesting.execution.metrics.pain_index import PainIndex


class TestPainIndex:
    def test_single_value_returns_zero(self) -> None:
        assert PainIndex().compute(np.array([100.0])) == 0.0

    def test_no_drawdown_returns_zero(self) -> None:
        # Monotonically increasing -> no drawdown -> 0
        values = np.array([100.0, 110.0, 120.0, 130.0])
        assert PainIndex().compute(values) == 0.0

    def test_known_drawdown_average(self) -> None:
        # values: 100 -> 120 -> 90 -> 110
        # running max: 100, 120, 120, 120
        # dd %:         0,   0,  -25, -8.333...
        # |dd|:         0,   0,   25,  8.333...
        # mean = (0 + 0 + 25 + 25/3) / 4 = (0 + 0 + 25 + 8.333...) / 4 = 8.333...
        values = np.array([100.0, 120.0, 90.0, 110.0])
        pain = PainIndex().compute(values)
        expected = (0.0 + 0.0 + 25.0 + (10.0 / 120.0) * 100.0) / 4.0
        assert pain == expected

    def test_pain_less_than_or_equal_to_max_drawdown(self) -> None:
        # Pain (linear mean) should never exceed |max DD| (worst single point).
        rng = np.random.default_rng(seed=7)
        # Simulate a noisy value series with a real drawdown.
        returns = rng.normal(loc=0.0005, scale=0.02, size=500)
        values = 100.0 * np.cumprod(1.0 + returns)
        running_max = np.maximum.accumulate(values)
        worst_dd_pct = float(
            np.min((values - running_max) / running_max) * 100.0
        )
        pain = PainIndex().compute(values)
        assert pain <= abs(worst_dd_pct) + 1e-9

    def test_non_negative(self) -> None:
        # Even a series with only losses: Pain is the mean of |dd|, always >= 0.
        values = np.array([100.0, 90.0, 80.0, 70.0])
        assert PainIndex().compute(values) >= 0.0

    def test_metric_protocol_fields(self) -> None:
        m = PainIndex()
        assert m.key == "pain_index"
        assert "drawdown" in m.description.lower()
