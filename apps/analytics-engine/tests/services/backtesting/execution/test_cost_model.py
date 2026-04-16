"""Tests for CostModel edge cases."""

from __future__ import annotations

from src.services.backtesting.execution.cost_model import PercentageSlippageModel


def test_calculate_cost_zero_amount_returns_zero() -> None:
    model = PercentageSlippageModel(percent=0.01)
    assert model.calculate_cost(0.0) == 0.0


def test_calculate_cost_negative_amount_returns_zero() -> None:
    model = PercentageSlippageModel(percent=0.01)
    assert model.calculate_cost(-100.0) == 0.0
