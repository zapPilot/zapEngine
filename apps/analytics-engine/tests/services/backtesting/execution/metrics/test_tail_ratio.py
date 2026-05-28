"""Tests for TailRatio."""

from __future__ import annotations

import numpy as np

from src.services.backtesting.execution.metrics.tail_ratio import TailRatio


class TestTailRatio:
    def test_empty_returns_zero(self) -> None:
        assert TailRatio().compute(np.array([])) == 0.0

    def test_symmetric_distribution_near_one(self) -> None:
        # Symmetric distribution around 0 → tails are equal magnitudes.
        rng = np.random.default_rng(seed=42)
        returns = rng.standard_normal(10_000) * 0.01
        ratio = TailRatio().compute(returns)
        assert 0.85 < ratio < 1.15

    def test_positive_skew_above_one(self) -> None:
        # Big positive outliers, small negative noise → upper tail dominates.
        returns = np.concatenate(
            [
                np.full(95, -0.001),  # small consistent loss
                np.full(5, 0.05),  # rare large win
            ]
        )
        ratio = TailRatio().compute(returns)
        assert ratio > 1.0

    def test_negative_skew_below_one(self) -> None:
        # Mirror of the above: small wins + rare big losses.
        returns = np.concatenate(
            [
                np.full(95, 0.001),
                np.full(5, -0.05),
            ]
        )
        ratio = TailRatio().compute(returns)
        assert ratio < 1.0

    def test_zero_lower_quantile_returns_zero(self) -> None:
        # All returns identical -> both quantiles equal, lower = 0 etc.
        # When lower quantile is exactly 0, convention is to return 0.0.
        returns = np.zeros(10)
        assert TailRatio().compute(returns) == 0.0

    def test_invalid_quantile_bounds_returns_zero(self) -> None:
        returns = np.array([0.01, -0.01, 0.02])
        # lower >= upper is invalid
        assert TailRatio(lower=0.95, upper=0.05).compute(returns) == 0.0

    def test_metric_protocol_fields(self) -> None:
        m = TailRatio()
        assert m.key == "tail_ratio"
        assert "tail" in m.description.lower()
