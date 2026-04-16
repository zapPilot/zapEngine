from __future__ import annotations

from src.services.backtesting.utils.two_bucket import (
    calculate_runtime_allocation,
    normalize_runtime_allocation,
    sanitize_runtime_allocation,
)


def test_runtime_allocation_helpers_normalize_and_sanitize() -> None:
    assert normalize_runtime_allocation({"spot": 0.0, "stable": 0.0}) == {
        "spot": 0.0,
        "stable": 1.0,
    }
    assert sanitize_runtime_allocation({"spot": -1e-9, "stable": -2.0}) == {
        "spot": 0.0,
        "stable": 1.0,
    }
    assert calculate_runtime_allocation(spot_value=2.0, stable_value=6.0) == {
        "spot": 0.25,
        "stable": 0.75,
    }
    assert calculate_runtime_allocation(spot_value=0.0, stable_value=0.0) == {
        "spot": 0.0,
        "stable": 1.0,
    }
