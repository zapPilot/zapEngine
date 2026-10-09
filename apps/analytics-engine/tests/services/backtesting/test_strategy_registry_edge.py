"""Edge-case tests for strategy_registry helpers."""

from __future__ import annotations

from datetime import date

import pytest

from src.services.backtesting.strategy_registry import (
    StrategyBuildRequest,
    _require_compare_runtime_inputs,
)


def test_require_compare_runtime_inputs_raises_when_missing() -> None:
    request = StrategyBuildRequest(
        total_capital=10_000.0,
        initial_allocation=None,
        user_start_date=None,
    )
    with pytest.raises(ValueError, match="requires initial allocation and start date"):
        _require_compare_runtime_inputs(request)


def test_require_compare_runtime_inputs_passes_when_present() -> None:
    request = StrategyBuildRequest(
        total_capital=10_000.0,
        initial_allocation={"spot": 0.5, "stable": 0.5},
        user_start_date=date(2025, 1, 1),
    )
    _require_compare_runtime_inputs(request)  # Should not raise
