"""Targeted coverage tests for pacing/base.py uncovered lines."""

from __future__ import annotations

import pytest

from src.services.backtesting.execution.pacing.base import (
    FgiPacingPolicyBase,
    RebalancePacingInputs,
    compute_dma_buy_strength,
)


def test_compute_dma_buy_strength_returns_zero_for_none() -> None:
    """Line 77: compute_dma_buy_strength returns 0.0 when dma_distance is None."""
    result = compute_dma_buy_strength(None)
    assert result == 0.0


class _ConcretePolicy(FgiPacingPolicyBase):
    """Minimal concrete subclass that implements _get_mapped_t."""

    @property
    def name(self) -> str:
        return "concrete_test"

    def _get_mapped_t(self, fgi_value: float | None) -> float:
        return 0.5


class _BasePolicyNoOverride(FgiPacingPolicyBase):
    """Subclass that does NOT override _get_mapped_t to trigger NotImplementedError."""

    @property
    def name(self) -> str:
        return "no_override"


def test_fgi_pacing_policy_base_get_mapped_t_raises_not_implemented() -> None:
    """Line 214: FgiPacingPolicyBase._get_mapped_t raises NotImplementedError."""
    policy = _BasePolicyNoOverride()
    with pytest.raises(NotImplementedError):
        policy._get_mapped_t(50.0)


def test_fgi_pacing_policy_base_step_weights_returns_uniform_list() -> None:
    """Line 254: FgiPacingPolicyBase.step_weights returns [1.0] * step_count."""
    policy = _ConcretePolicy()
    inputs = RebalancePacingInputs(current_regime="neutral", fgi_value=50.0)
    weights = policy.step_weights(inputs, step_count=4)
    assert weights == [1.0, 1.0, 1.0, 1.0]


def test_fgi_pacing_policy_base_step_weights_clamps_to_minimum_one() -> None:
    """step_weights clamps step_count to at least 1."""
    policy = _ConcretePolicy()
    inputs = RebalancePacingInputs(current_regime="neutral", fgi_value=50.0)
    weights = policy.step_weights(inputs, step_count=0)
    assert weights == [1.0]
