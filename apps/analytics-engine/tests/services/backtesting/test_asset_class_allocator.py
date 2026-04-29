from __future__ import annotations

import pytest

from src.services.backtesting.asset_class_allocator import (
    allocate_stock_crypto_target,
    fgi_risk_multiplier,
    score_dma_distance,
    stock_macro_fgi_overlay,
)
from src.services.backtesting.target_allocation import normalize_target_allocation


def test_dma_score_increases_below_dma_and_decreases_above_dma() -> None:
    assert score_dma_distance(-0.30) == pytest.approx(1.0)
    assert score_dma_distance(0.0) == pytest.approx(0.5)
    assert score_dma_distance(0.30) == pytest.approx(0.0)


def test_fgi_multiplier_boosts_fear_and_reduces_greed() -> None:
    assert fgi_risk_multiplier("extreme_fear") > fgi_risk_multiplier("neutral")
    assert fgi_risk_multiplier("extreme_greed") < fgi_risk_multiplier("neutral")


def test_stock_macro_fgi_overlay_caps_extreme_greed() -> None:
    assert stock_macro_fgi_overlay(0.95, 80) == pytest.approx(0.8)


def test_stock_macro_fgi_overlay_leaves_neutral_and_greed_unchanged() -> None:
    assert stock_macro_fgi_overlay(0.6, 50) == pytest.approx(0.6)
    assert stock_macro_fgi_overlay(0.6, 72) == pytest.approx(0.6)


def test_allocator_prefers_crypto_when_crypto_low_and_spy_high() -> None:
    result = allocate_stock_crypto_target(
        stock_dma_distance=0.30,
        crypto_dma_distance=-0.30,
        crypto_fgi_regime="fear",
        eth_share_in_crypto=0.25,
        current_allocation={"btc": 0.0, "eth": 0.0, "spy": 0.0, "stable": 1.0},
    )

    assert result.allocation["spy"] == pytest.approx(0.0)
    assert result.allocation["btc"] + result.allocation["eth"] == pytest.approx(1.0)
    assert result.allocation["eth"] == pytest.approx(0.25)
    assert result.allocation["stable"] == pytest.approx(0.0)


def test_allocator_moves_to_stable_when_both_classes_are_high() -> None:
    result = allocate_stock_crypto_target(
        stock_dma_distance=0.30,
        crypto_dma_distance=0.30,
        crypto_fgi_regime="extreme_greed",
        eth_share_in_crypto=0.5,
        current_allocation={"btc": 0.4, "eth": 0.0, "spy": 0.3, "stable": 0.3},
    )

    assert result.allocation == {
        "btc": 0.0,
        "eth": 0.0,
        "spy": 0.0,
        "stable": 1.0,
        "alt": 0.0,
    }


def test_allocator_sums_demands_when_both_attractive_and_over_one() -> None:
    result = allocate_stock_crypto_target(
        stock_dma_distance=-0.06,
        crypto_dma_distance=-0.06,
        crypto_fgi_regime="neutral",
        eth_share_in_crypto=0.5,
        current_allocation={"btc": 0.0, "eth": 0.0, "spy": 0.0, "stable": 1.0},
    )

    assert result.stock_score == pytest.approx(0.6)
    assert result.crypto_score == pytest.approx(0.6)
    assert result.allocation["spy"] == pytest.approx(0.5)
    assert result.allocation["btc"] + result.allocation["eth"] == pytest.approx(0.5)
    assert result.allocation["stable"] == pytest.approx(0.0)


def test_allocator_leaves_stable_when_demands_under_one() -> None:
    result = allocate_stock_crypto_target(
        stock_dma_distance=0.12,
        crypto_dma_distance=0.12,
        crypto_fgi_regime="neutral",
        eth_share_in_crypto=0.5,
        current_allocation={"btc": 0.0, "eth": 0.0, "spy": 0.0, "stable": 1.0},
    )

    assert result.stock_score == pytest.approx(0.3)
    assert result.crypto_score == pytest.approx(0.3)
    assert result.allocation["spy"] == pytest.approx(0.3)
    assert result.allocation["btc"] + result.allocation["eth"] == pytest.approx(0.3)
    assert result.allocation["stable"] == pytest.approx(0.4)


def test_allocator_does_not_starve_strong_signal_with_weak_other() -> None:
    result = allocate_stock_crypto_target(
        stock_dma_distance=-0.18,
        crypto_dma_distance=0.18,
        crypto_fgi_regime="neutral",
        eth_share_in_crypto=0.5,
        current_allocation={"btc": 0.0, "eth": 0.0, "spy": 0.0, "stable": 1.0},
    )

    assert result.stock_score == pytest.approx(0.8)
    assert result.crypto_score == pytest.approx(0.2)
    assert result.allocation["spy"] == pytest.approx(0.8)
    assert result.allocation["btc"] + result.allocation["eth"] == pytest.approx(0.2)
    assert result.allocation["stable"] == pytest.approx(0.0)


def test_allocator_preserves_missing_class_current_share() -> None:
    result = allocate_stock_crypto_target(
        stock_dma_distance=None,
        crypto_dma_distance=-0.30,
        crypto_fgi_regime="neutral",
        eth_share_in_crypto=0.0,
        current_allocation={"btc": 0.2, "eth": 0.0, "spy": 0.3, "stable": 0.5},
    )

    assert result.allocation["spy"] == pytest.approx(0.3)
    assert result.allocation["btc"] == pytest.approx(0.7)
    assert result.allocation["alt"] == pytest.approx(0.0)


def test_allocator_preserves_full_current_when_both_signals_missing() -> None:
    current = {"btc": 0.4, "eth": 0.1, "spy": 0.2, "stable": 0.3}
    result = allocate_stock_crypto_target(
        stock_dma_distance=None,
        crypto_dma_distance=None,
        crypto_fgi_regime="neutral",
        eth_share_in_crypto=0.5,
        current_allocation=current,
    )

    assert result.stock_score is None
    assert result.crypto_score is None
    assert result.allocation["btc"] == pytest.approx(0.4)
    assert result.allocation["eth"] == pytest.approx(0.1)
    assert result.allocation["spy"] == pytest.approx(0.2)
    assert result.allocation["stable"] == pytest.approx(0.3)
    assert result.allocation["alt"] == pytest.approx(0.0)


def test_allocator_falls_back_to_stable_when_both_signals_missing_and_no_current() -> (
    None
):
    result = allocate_stock_crypto_target(
        stock_dma_distance=None,
        crypto_dma_distance=None,
        crypto_fgi_regime="neutral",
        eth_share_in_crypto=0.5,
        current_allocation=None,
    )

    assert result.stock_score is None
    assert result.crypto_score is None
    assert result.allocation == {
        "btc": 0.0,
        "eth": 0.0,
        "spy": 0.0,
        "stable": 1.0,
        "alt": 0.0,
    }


def test_target_allocation_rejects_spot_and_nonzero_alt() -> None:
    with pytest.raises(ValueError, match="unsupported buckets: spot"):
        normalize_target_allocation({"spot": 1.0, "stable": 0.0})

    with pytest.raises(ValueError, match="cannot allocate to alt"):
        normalize_target_allocation(
            {"btc": 0.0, "eth": 0.0, "spy": 0.0, "stable": 0.9, "alt": 0.1}
        )
