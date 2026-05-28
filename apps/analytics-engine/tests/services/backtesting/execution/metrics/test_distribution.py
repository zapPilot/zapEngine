"""Tests for Skewness and ExcessKurtosis."""

from __future__ import annotations

import numpy as np

from src.services.backtesting.execution.metrics.distribution import (
    ExcessKurtosis,
    Skewness,
)


class TestSkewness:
    def test_empty_returns_zero(self) -> None:
        assert Skewness().compute(np.array([])) == 0.0

    def test_single_value_returns_zero(self) -> None:
        assert Skewness().compute(np.array([0.01])) == 0.0

    def test_constant_series_returns_zero(self) -> None:
        # Zero std deviation -> guard returns 0.0
        assert Skewness().compute(np.full(20, 0.01)) == 0.0

    def test_symmetric_distribution_near_zero(self) -> None:
        rng = np.random.default_rng(seed=11)
        returns = rng.standard_normal(20_000) * 0.01
        skew = Skewness().compute(returns)
        assert abs(skew) < 0.1

    def test_positive_skew_detected(self) -> None:
        # Mostly small losses, rare large gains -> right tail heavier.
        returns = np.concatenate(
            [
                np.full(95, -0.001),
                np.full(5, 0.05),
            ]
        )
        assert Skewness().compute(returns) > 0.5

    def test_negative_skew_detected(self) -> None:
        returns = np.concatenate(
            [
                np.full(95, 0.001),
                np.full(5, -0.05),
            ]
        )
        assert Skewness().compute(returns) < -0.5

    def test_known_value_matches_numpy_formula(self) -> None:
        returns = np.array([0.01, -0.02, 0.03, -0.01, 0.04])
        mean = float(np.mean(returns))
        std = float(np.std(returns))
        expected = float(np.mean((returns - mean) ** 3)) / (std**3)
        assert Skewness().compute(returns) == expected

    def test_metric_protocol_fields(self) -> None:
        m = Skewness()
        assert m.key == "skewness"
        assert "skew" in m.description.lower()


class TestExcessKurtosis:
    def test_empty_returns_zero(self) -> None:
        assert ExcessKurtosis().compute(np.array([])) == 0.0

    def test_constant_series_returns_zero(self) -> None:
        assert ExcessKurtosis().compute(np.full(20, 0.01)) == 0.0

    def test_normal_distribution_near_zero(self) -> None:
        rng = np.random.default_rng(seed=42)
        returns = rng.standard_normal(50_000) * 0.01
        # Excess kurtosis of N(0,1) is 0; sample estimator should be small.
        assert abs(ExcessKurtosis().compute(returns)) < 0.2

    def test_fat_tail_positive(self) -> None:
        # Mostly tiny moves + a few extreme outliers -> highly leptokurtic.
        returns = np.concatenate(
            [
                np.full(95, 0.0001),
                np.full(5, 0.1),
            ]
        )
        assert ExcessKurtosis().compute(returns) > 1.0

    def test_known_value_matches_numpy_formula(self) -> None:
        returns = np.array([0.01, -0.02, 0.03, -0.01, 0.04])
        mean = float(np.mean(returns))
        std = float(np.std(returns))
        expected = float(np.mean((returns - mean) ** 4)) / (std**4) - 3.0
        assert ExcessKurtosis().compute(returns) == expected

    def test_metric_protocol_fields(self) -> None:
        m = ExcessKurtosis()
        assert m.key == "excess_kurtosis"
        assert "kurtosis" in m.description.lower()
