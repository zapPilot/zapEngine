"""Target normalization protects tradeable weights and rejects display buckets."""

import pytest

from src.services.backtesting.target_allocation import (
    normalize_target_allocation,
    target_from_current_allocation,
)

CASH = {"btc": 0.0, "eth": 0.0, "spy": 0.0, "stable": 1.0, "alt": 0.0}


@pytest.mark.parametrize("raw", [None, {}, {"btc": -1, "stable": -2}])
def test_empty_or_negative_targets_fall_back_to_cash(raw):
    assert normalize_target_allocation(raw) == CASH


def test_target_weights_are_normalized_and_negative_weights_clamped():
    assert normalize_target_allocation(
        {"btc": 2, "eth": 1, "spy": -10, "stable": 1, "alt": 0}
    ) == {"btc": 0.5, "eth": 0.25, "spy": 0.0, "stable": 0.25, "alt": 0.0}


@pytest.mark.parametrize("raw", [{"spot": 1}, {"unknown": 1}, {"alt": 0.1}])
def test_display_or_unknown_buckets_cannot_become_trade_targets(raw):
    with pytest.raises(ValueError, match="unsupported buckets|cannot allocate to alt"):
        normalize_target_allocation(raw)


def test_tiny_target_weights_are_removed_then_remaining_weights_renormalized():
    assert normalize_target_allocation({"btc": 1e-13, "eth": 1}) == {
        "btc": 0.0,
        "eth": 1.0,
        "spy": 0.0,
        "stable": 0.0,
        "alt": 0.0,
    }


def test_display_alt_is_reassigned_to_stable_without_inventing_spot_exposure():
    assert target_from_current_allocation(
        {"btc": 2, "eth": 1, "spy": -1, "stable": 1, "alt": 4, "spot": 100}
    ) == {"btc": 0.25, "eth": 0.125, "spy": 0.0, "stable": 0.625, "alt": 0.0}
    assert target_from_current_allocation(None) == CASH
    assert target_from_current_allocation({"alt": -1}) == CASH


def test_large_finite_weights_do_not_overflow_during_normalization():
    assert normalize_target_allocation({"btc": 1e308, "eth": 1e308}) == {
        "btc": 0.5,
        "eth": 0.5,
        "spy": 0.0,
        "stable": 0.0,
        "alt": 0.0,
    }
    assert target_from_current_allocation({"stable": 1e308, "alt": 1e308}) == CASH


@pytest.mark.parametrize("value", [float("nan"), float("inf"), float("-inf")])
@pytest.mark.parametrize(
    "normalize", [normalize_target_allocation, target_from_current_allocation]
)
def test_non_finite_weights_cannot_become_trade_targets(normalize, value):
    with pytest.raises(ValueError, match="finite"):
        normalize({"btc": value})
