"""Edge-case tests for Portfolio to reach 100% coverage."""

from __future__ import annotations

import pytest

from src.services.backtesting.execution.portfolio import Portfolio


class TestFromAssetAllocationZeroTotal:
    def test_all_zero_allocation_defaults_to_stable(self) -> None:
        portfolio = Portfolio.from_asset_allocation(
            total_capital=10_000.0,
            allocation={"btc": 0.0, "eth": 0.0, "stable": 0.0},
            price={"btc": 50_000.0, "eth": 3_000.0},
        )
        assert portfolio.stable_balance == pytest.approx(10_000.0)
        assert portfolio.btc_balance == pytest.approx(0.0)
        assert portfolio.eth_balance == pytest.approx(0.0)


class TestAssetAllocationPercentagesZeroTotal:
    def test_zero_total_returns_stable_fallback(self) -> None:
        portfolio = Portfolio(btc_balance=0.0, eth_balance=0.0, stable_balance=0.0)
        result = portfolio.asset_allocation_percentages(
            {"btc": 50_000.0, "eth": 3_000.0}
        )
        assert result == {"btc": 0.0, "eth": 0.0, "spy": 0.0, "stable": 1.0, "alt": 0.0}


class TestExecuteTransferResolvedSameBucket:
    def test_resolved_same_bucket_is_noop(self) -> None:
        portfolio = Portfolio(btc_balance=1.0, stable_balance=1_000.0)
        original_btc = portfolio.btc_balance
        original_stable = portfolio.stable_balance
        # "spot" resolves to "btc" (default_spot_asset), same as "btc"
        portfolio.execute_transfer("spot", "btc", 500.0, 50_000.0)
        assert portfolio.btc_balance == original_btc
        assert portfolio.stable_balance == original_stable


class TestSnapshot:
    def test_snapshot_returns_expected_keys(self) -> None:
        portfolio = Portfolio(btc_balance=0.5, eth_balance=0.3, stable_balance=1_000.0)
        snap = portfolio.snapshot()
        assert "btc_balance" in snap
        assert "eth_balance" in snap
        assert "stable_balance" in snap
        assert "spot_balance" in snap
        assert snap["btc_balance"] == pytest.approx(0.5)
        assert snap["eth_balance"] == pytest.approx(0.3)
        assert snap["stable_balance"] == pytest.approx(1_000.0)


class TestNormalizeAssetSymbol:
    def test_empty_symbol_raises(self) -> None:
        with pytest.raises(ValueError, match="must not be empty"):
            Portfolio._normalize_asset_symbol("")

    def test_unsupported_symbol_raises(self) -> None:
        with pytest.raises(ValueError, match="Unsupported spot asset"):
            Portfolio._normalize_asset_symbol("SOL")


class TestMixedAssetPriceError:
    def test_scalar_price_with_mixed_assets_raises(self) -> None:
        portfolio = Portfolio(btc_balance=1.0, eth_balance=1.0, stable_balance=0.0)
        with pytest.raises(ValueError, match="price map required"):
            portfolio.asset_values(50_000.0)


class TestResolveTradeBucketActiveAssetNone:
    def test_spot_source_with_both_assets_uses_default(self) -> None:
        portfolio = Portfolio(btc_balance=1.0, eth_balance=1.0, stable_balance=1_000.0)
        # active_spot_asset is None when both have balance
        assert portfolio.active_spot_asset is None
        resolved = portfolio._resolve_trade_bucket("spot", for_source=True)
        assert resolved == portfolio.default_spot_asset.lower()


class TestMoveStableToAssetZeroPrice:
    def test_zero_price_raises(self) -> None:
        portfolio = Portfolio(btc_balance=0.0, stable_balance=1_000.0)
        with pytest.raises(ValueError, match="price for .* must be positive"):
            portfolio._move_stable_to_asset(500.0, "btc", {"btc": 0.0, "eth": 3_000.0})


class TestMoveAssetToStableEdgeCases:
    def test_zero_price_raises(self) -> None:
        portfolio = Portfolio(btc_balance=1.0, stable_balance=0.0)
        with pytest.raises(ValueError, match="price for .* must be positive"):
            portfolio._move_asset_to_stable("btc", 500.0, {"btc": 0.0, "eth": 3_000.0})

    def test_zero_available_amount_is_noop(self) -> None:
        portfolio = Portfolio(btc_balance=0.0, stable_balance=1_000.0)
        original_stable = portfolio.stable_balance
        portfolio._move_asset_to_stable("btc", 500.0, {"btc": 50_000.0, "eth": 3_000.0})
        assert portfolio.stable_balance == original_stable


class TestMoveAssetToAssetEdgeCases:
    def test_zero_price_raises(self) -> None:
        portfolio = Portfolio(btc_balance=1.0, eth_balance=0.0, stable_balance=0.0)
        with pytest.raises(ValueError, match="price for .* must be positive"):
            portfolio._move_asset_to_asset(
                "btc", "eth", 500.0, {"btc": 0.0, "eth": 3_000.0}
            )

    def test_zero_available_amount_is_noop(self) -> None:
        portfolio = Portfolio(btc_balance=0.0, eth_balance=0.5, stable_balance=0.0)
        original_eth = portfolio.eth_balance
        portfolio._move_asset_to_asset(
            "btc", "eth", 500.0, {"btc": 50_000.0, "eth": 3_000.0}
        )
        assert portfolio.eth_balance == original_eth


class TestAssetBalanceUnsupportedBucket:
    def test_asset_balance_raises_for_stable(self) -> None:
        portfolio = Portfolio(btc_balance=1.0, stable_balance=0.0)
        with pytest.raises(ValueError, match="Unsupported asset bucket"):
            portfolio._asset_balance("stable")

    def test_add_asset_balance_raises_for_stable(self) -> None:
        portfolio = Portfolio(btc_balance=1.0, stable_balance=0.0)
        with pytest.raises(ValueError, match="Unsupported asset bucket"):
            portfolio._add_asset_balance("stable", 1.0)
