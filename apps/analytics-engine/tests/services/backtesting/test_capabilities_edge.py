"""Tests for PortfolioBuckets edge cases and portfolio mapper functions."""

from __future__ import annotations

from types import SimpleNamespace

from src.services.backtesting.capabilities import (
    PortfolioBuckets,
    map_portfolio_to_eth_btc_stable_buckets,
    map_portfolio_to_two_buckets,
)


class TestAssetAllocation:
    """Cover lines 35-41: asset_allocation() with btc/eth values."""

    def test_asset_allocation_with_values(self) -> None:
        buckets = PortfolioBuckets(
            spot_value=5_000.0,
            stable_value=5_000.0,
            btc_value=3_000.0,
            eth_value=2_000.0,
        )
        result = buckets.asset_allocation()
        assert result is not None
        assert result["btc"] == 0.3
        assert result["eth"] == 0.2
        assert result["stable"] == 0.5
        assert result["alt"] == 0.0

    def test_asset_allocation_zero_total(self) -> None:
        buckets = PortfolioBuckets(
            spot_value=0.0,
            stable_value=0.0,
            btc_value=0.0,
            eth_value=0.0,
        )
        result = buckets.asset_allocation()
        assert result == {"btc": 0.0, "eth": 0.0, "spy": 0.0, "stable": 1.0, "alt": 0.0}

    def test_asset_allocation_none_returns_none(self) -> None:
        buckets = PortfolioBuckets(spot_value=1_000.0, stable_value=500.0)
        assert buckets.asset_allocation() is None


class TestToPortfolioWithAssets:
    """Cover lines 61-66: to_portfolio() with btc/eth values."""

    def test_to_portfolio_with_btc_eth(self) -> None:
        buckets = PortfolioBuckets(
            spot_value=5_000.0,
            stable_value=5_000.0,
            btc_value=3_000.0,
            eth_value=2_000.0,
        )
        portfolio = buckets.to_portfolio(
            current_price=100_000.0,
            price_map={"btc": 100_000.0, "eth": 3_000.0},
        )
        assert portfolio.total_value({"btc": 100_000.0, "eth": 3_000.0}) > 0

    def test_to_portfolio_with_btc_eth_no_price_map(self) -> None:
        buckets = PortfolioBuckets(
            spot_value=5_000.0,
            stable_value=5_000.0,
            btc_value=3_000.0,
            eth_value=2_000.0,
        )
        portfolio = buckets.to_portfolio(current_price=50_000.0)
        assert portfolio is not None


class TestMapPortfolioNoneAllocation:
    """Cover lines 83 and 100: mappers with None portfolio_allocation."""

    def test_two_buckets_none_allocation(self) -> None:
        portfolio = SimpleNamespace(portfolio_allocation=None)
        result = map_portfolio_to_two_buckets(portfolio)
        assert result == PortfolioBuckets(spot_value=0.0, stable_value=0.0)

    def test_eth_btc_stable_none_allocation(self) -> None:
        portfolio = SimpleNamespace(portfolio_allocation=None)
        result = map_portfolio_to_eth_btc_stable_buckets(portfolio)
        assert result == PortfolioBuckets(
            spot_value=0.0,
            stable_value=0.0,
            btc_value=0.0,
            eth_value=0.0,
            stable_category_value=0.0,
            alt_value=0.0,
        )

    def test_two_buckets_no_allocation_attr(self) -> None:
        result = map_portfolio_to_two_buckets(SimpleNamespace())
        assert result == PortfolioBuckets(spot_value=0.0, stable_value=0.0)

    def test_eth_btc_stable_no_allocation_attr(self) -> None:
        result = map_portfolio_to_eth_btc_stable_buckets(SimpleNamespace())
        assert result == PortfolioBuckets(
            spot_value=0.0,
            stable_value=0.0,
            btc_value=0.0,
            eth_value=0.0,
            stable_category_value=0.0,
            alt_value=0.0,
        )
