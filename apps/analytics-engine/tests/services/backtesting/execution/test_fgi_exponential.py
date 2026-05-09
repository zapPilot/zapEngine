"""Targeted coverage tests for fgi_exponential.py uncovered branches."""

from __future__ import annotations

import pytest

from src.services.backtesting.execution.pacing.fgi_exponential import (
    FgiExponentialPacingPolicy,
)


def test_get_mapped_t_returns_linear_when_k_is_zero() -> None:
    """Line 57: when k <= 0, _get_mapped_t returns the raw linear t."""
    policy = FgiExponentialPacingPolicy(k=0.0)
    # FGI=0 → max distance → t=1.0 linearly
    t = policy._get_mapped_t(fgi_value=0.0)
    assert t == pytest.approx(1.0)


def test_get_mapped_t_returns_linear_when_k_is_negative() -> None:
    """Line 57: when k < 0, _get_mapped_t falls back to linear t."""
    policy = FgiExponentialPacingPolicy(k=-1.0)
    t = policy._get_mapped_t(fgi_value=50.0)  # neutral → t=0
    assert t == pytest.approx(0.0)


def test_get_mapped_t_handles_near_zero_denom() -> None:
    """Line 60: if exp(k)-1 <= 0, _get_mapped_t returns linear t.

    This is hard to trigger with floating-point exp but k=0 branch covers line 57.
    For extra coverage, use k just below zero so denom < 0:
    k=-1e-300 → exp(-1e-300) ≈ 1, denom ≈ 0, but since k<0 line 57 fires first.
    We test line 60 by monkeypatching math.exp.
    """
    import math
    from unittest.mock import patch

    # Patch exp so that exp(k) - 1.0 <= 0 even though k > 0
    original_exp = math.exp

    def _patched_exp(x: float) -> float:
        if x == pytest.approx(3.0, abs=0.1) and x > 0:
            return 1.0  # forces denom = 0
        return original_exp(x)

    policy = FgiExponentialPacingPolicy(k=3.0)
    with patch(
        "src.services.backtesting.execution.pacing.fgi_exponential.math.exp",
        _patched_exp,
    ):
        t = policy._get_mapped_t(fgi_value=0.0)

    # Falls back to linear t=1.0 (FGI=0 → max distance)
    assert t == pytest.approx(1.0)
