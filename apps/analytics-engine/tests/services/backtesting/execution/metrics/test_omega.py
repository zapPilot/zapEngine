"""Tests for OmegaRatio."""

from __future__ import annotations

import numpy as np

from src.services.backtesting.execution.metrics.omega import OmegaRatio


class TestOmegaRatio:
    def test_empty_returns_zero(self) -> None:
        omega = OmegaRatio().compute(np.array([]))
        assert omega == 0.0

    def test_known_formula(self) -> None:
        # gains above 0: 0.01 + 0.02 + 0.015 = 0.045
        # losses below 0: 0.005 + 0.01 = 0.015
        returns = np.array([0.01, -0.005, 0.02, -0.01, 0.015])
        omega = OmegaRatio(threshold=0.0).compute(returns)
        assert omega == 0.045 / 0.015

    def test_threshold_shifts_ratio(self) -> None:
        # Raising the threshold above the gains shrinks the numerator.
        returns = np.array([0.01, -0.005, 0.02, -0.01, 0.015])
        below_zero = OmegaRatio(threshold=0.0).compute(returns)
        above_mean = OmegaRatio(threshold=0.05).compute(returns)
        # With threshold = 0.05 nothing exceeds, so numerator is 0 and
        # losses dominate; ratio falls to 0.0 by convention.
        assert above_mean < below_zero
        assert above_mean == 0.0

    def test_no_losses_returns_zero(self) -> None:
        # All gains: zero losses → undefined; convention returns 0.0
        returns = np.array([0.01, 0.02, 0.03])
        omega = OmegaRatio(threshold=0.0).compute(returns)
        assert omega == 0.0

    def test_only_losses_returns_zero(self) -> None:
        # All losses: zero gains, positive losses → numerator 0 → 0.0
        returns = np.array([-0.01, -0.02, -0.03])
        omega = OmegaRatio(threshold=0.0).compute(returns)
        assert omega == 0.0

    def test_symmetric_distribution_near_one(self) -> None:
        # Symmetric ±x around 0 → omega = 1.0
        returns = np.array([0.01, -0.01, 0.02, -0.02])
        omega = OmegaRatio(threshold=0.0).compute(returns)
        assert omega == 1.0

    def test_metric_protocol_fields(self) -> None:
        m = OmegaRatio()
        assert m.key == "omega_ratio"
        assert "Omega" in m.description
