"""Tests for the DMA-first two-bucket portfolio."""

from __future__ import annotations

import pytest

from src.services.backtesting.execution.cost_model import PercentageSlippageModel
from src.services.backtesting.execution.portfolio import Portfolio


def test_from_allocation_creates_two_bucket_portfolio() -> None:
    portfolio = Portfolio.from_allocation(
        total_capital=10_000.0,
        allocation={"spot": 0.25, "stable": 0.75},
        price=100_000.0,
    )
    assert portfolio.spot_balance == pytest.approx(0.025)
    assert portfolio.stable_balance == pytest.approx(7_500.0)


def test_total_value_and_allocation_percentages_use_two_buckets() -> None:
    portfolio = Portfolio(spot_balance=0.05, stable_balance=5_000.0)
    assert portfolio.total_value(100_000.0) == pytest.approx(10_000.0)
    allocation = portfolio.allocation_percentages(100_000.0)
    assert allocation == {"spot": pytest.approx(0.5), "stable": pytest.approx(0.5)}


def test_apply_daily_yield_updates_spot_and_stable() -> None:
    portfolio = Portfolio(spot_balance=1.0, stable_balance=1_000.0)
    breakdown = portfolio.apply_daily_yield(
        100.0,
        {"spot": 0.365, "stable": 0.365},
    )
    assert breakdown["spot_yield"] == pytest.approx(0.1)
    assert breakdown["stable_yield"] == pytest.approx(1.0)
    assert portfolio.spot_balance > 1.0
    assert portfolio.stable_balance > 1_000.0


def test_execute_transfer_respects_spot_stable_only_and_costs() -> None:
    portfolio = Portfolio(
        spot_balance=0.0,
        stable_balance=1_000.0,
        cost_model=PercentageSlippageModel(percent=0.01),
    )
    portfolio.execute_transfer("stable", "spot", 500.0, 100.0)
    assert portfolio.stable_balance == pytest.approx(500.0)
    assert portfolio.spot_balance == pytest.approx(4.95)

    portfolio.execute_transfer("spot", "stable", 100.0, 100.0)
    assert portfolio.stable_balance > 500.0

    with pytest.raises(ValueError, match="Only spot<->stable transfers are supported"):
        portfolio.execute_transfer("spot", "cash", 10.0, 100.0)


def test_allocation_percentages_sanitize_full_liquidation_residue() -> None:
    portfolio = Portfolio(spot_balance=5.0, stable_balance=-1e-13)

    portfolio.execute_transfer("spot", "stable", 500.0, 100.0)

    allocation = portfolio.allocation_percentages(100.0)
    assert allocation["spot"] == pytest.approx(0.0)
    assert allocation["stable"] == pytest.approx(1.0)
    assert allocation["spot"] >= 0.0
    assert allocation["stable"] >= 0.0
    assert allocation["spot"] + allocation["stable"] == pytest.approx(1.0)


def test_allocation_percentages_sanitize_full_deployment_residue() -> None:
    portfolio = Portfolio(spot_balance=-1e-13, stable_balance=500.0)

    portfolio.execute_transfer("stable", "spot", 500.0, 100.0)

    allocation = portfolio.allocation_percentages(100.0)
    assert allocation["spot"] == pytest.approx(1.0)
    assert allocation["stable"] == pytest.approx(0.0)
    assert allocation["spot"] >= 0.0
    assert allocation["stable"] >= 0.0
    assert allocation["spot"] + allocation["stable"] == pytest.approx(1.0)


def test_rotate_spot_asset_switches_spot_units_with_cost() -> None:
    portfolio = Portfolio(
        spot_balance=1.0,
        stable_balance=0.0,
        spot_asset="BTC",
        cost_model=PercentageSlippageModel(percent=0.01),
    )

    rotated = portfolio.rotate_spot_asset(
        "ETH",
        {"btc": 100_000.0, "eth": 5_000.0},
    )

    assert rotated is True
    assert portfolio.spot_asset == "ETH"
    assert portfolio.spot_balance == pytest.approx(19.8)
    assert portfolio.total_value({"btc": 100_000.0, "eth": 5_000.0}) == pytest.approx(
        99_000.0
    )


def test_rotate_spot_asset_relabels_when_spot_is_empty() -> None:
    portfolio = Portfolio(spot_balance=0.0, stable_balance=1_000.0, spot_asset="BTC")

    rotated = portfolio.rotate_spot_asset(
        "ETH",
        {"btc": 100_000.0, "eth": 5_000.0},
    )

    assert rotated is False
    assert portfolio.spot_asset == "ETH"


# ---------------------------------------------------------------------------
# Targeted coverage tests for uncovered branches
# ---------------------------------------------------------------------------


def test_allocation_percentages_returns_all_stable_when_total_is_zero() -> None:
    """Cover line 60: total <= 0 → {"spot": 0.0, "stable": 1.0}."""
    portfolio = Portfolio(spot_balance=0.0, stable_balance=0.0)
    result = portfolio.allocation_percentages(50_000.0)
    assert result == {"spot": 0.0, "stable": 1.0}


def test_apply_daily_yield_ignores_stable_rate_when_it_is_dict() -> None:
    """Cover line 85: stable_rate is a dict → treated as 0.0."""
    portfolio = Portfolio(spot_balance=0.0, stable_balance=1_000.0)
    breakdown = portfolio.apply_daily_yield(
        50_000.0,
        {"stable": {"sub": 0.365}, "spot": 0.0},
    )
    assert breakdown["stable_yield"] == pytest.approx(0.0)
    assert portfolio.stable_balance == pytest.approx(1_000.0)


def test_execute_transfer_is_noop_for_non_positive_amount() -> None:
    """Cover line 115: amount_usd <= 0 → early return, no change."""
    portfolio = Portfolio(spot_balance=0.0, stable_balance=1_000.0)
    portfolio.execute_transfer("stable", "spot", 0.0, 50_000.0)
    assert portfolio.stable_balance == pytest.approx(1_000.0)
    assert portfolio.spot_balance == pytest.approx(0.0)


def test_execute_transfer_is_noop_when_from_equals_to_bucket() -> None:
    """Cover line 117: from_bucket == to_bucket → early return, no change."""
    portfolio = Portfolio(spot_balance=0.0, stable_balance=1_000.0)
    portfolio.execute_transfer("stable", "stable", 500.0, 50_000.0)
    assert portfolio.stable_balance == pytest.approx(1_000.0)


def test_execute_transfer_stable_to_spot_raises_for_zero_price() -> None:
    """Zero-price stable-to-spot transfers should be rejected."""
    portfolio = Portfolio(spot_balance=0.0, stable_balance=1_000.0)
    with pytest.raises(ValueError, match="must be positive"):
        portfolio.execute_transfer("stable", "spot", 100.0, 0.0)


def test_execute_transfer_spot_to_stable_raises_for_zero_price() -> None:
    """Zero-price spot-to-stable transfers should be rejected."""
    portfolio = Portfolio(spot_balance=1.0, stable_balance=0.0)
    with pytest.raises(ValueError, match="must be positive"):
        portfolio.execute_transfer("spot", "stable", 100.0, 0.0)


def test_normalize_asset_symbol_raises_for_empty_string() -> None:
    """Cover line 186: empty symbol → ValueError."""
    with pytest.raises(ValueError, match="must not be empty"):
        Portfolio._normalize_asset_symbol("")


def test_resolve_price_for_asset_raises_when_key_missing_from_mapping() -> None:
    """Cover line 198: asset not in price Mapping → ValueError."""
    with pytest.raises(ValueError, match="Missing price"):
        Portfolio._resolve_price_for_asset({"eth": 3_000.0}, "BTC")


def test_resolve_price_for_asset_raises_for_non_positive_scalar() -> None:
    """Cover line 204: scalar price <= 0 → ValueError."""
    with pytest.raises(ValueError, match="must be positive"):
        Portfolio._resolve_price_for_asset(0.0, "BTC")
