"""Tests for two-bucket APR yield accrual in backtesting simulations."""

import pytest

from src.services.backtesting.constants import APR_BY_REGIME
from src.services.backtesting.execution.config import RegimeConfig
from src.services.backtesting.execution.portfolio import Portfolio

# NOTE: simulate_regime_strategy_pool was removed with Smart DCA strategy.
# Tests using it are skipped pending refactor to use Simple Regime or DCA Classic.


class TestAPRByRegimeConstants:
    """Tests for APR_BY_REGIME constant structure."""

    def test_apr_by_regime_has_all_regimes(self):
        """APR config should have all 5 regimes."""
        assert set(APR_BY_REGIME.keys()) == {
            "extreme_fear",
            "fear",
            "neutral",
            "greed",
            "extreme_greed",
        }

    def test_apr_by_regime_has_all_position_types(self):
        """Each regime should have spot and stable rates."""
        for _regime, rates in APR_BY_REGIME.items():
            assert set(rates.keys()) == {"spot", "stable"}

    def test_apr_values_are_non_negative(self):
        """All APR values should be non-negative.

        APR structure now supports per-token rates:
        - stable: float
        - spot: dict[str, float] (per-token)
        """
        for rates in APR_BY_REGIME.values():
            for rate in rates.values():
                if isinstance(rate, dict):
                    # Per-token rates for spot assets.
                    for token_rate in rate.values():
                        assert token_rate >= 0.0
                else:
                    # Flat rate (stable)
                    assert rate >= 0.0

    def test_apr_values_are_reasonable(self):
        """APR values should be reasonable (less than 200%)."""
        for rates in APR_BY_REGIME.values():
            for rate in rates.values():
                if isinstance(rate, dict):
                    # Per-token rates
                    for token_rate in rate.values():
                        assert token_rate < 2.0  # 200% max
                else:
                    # Flat rate
                    assert rate < 2.0  # 200% max


class TestRegimeConfigAPR:
    """Tests for APR configuration in RegimeConfig."""

    def test_default_config_has_apr_by_regime(self):
        """Default RegimeConfig should include APR_BY_REGIME."""
        config = RegimeConfig.default()
        assert config.apr_by_regime == APR_BY_REGIME

    def test_custom_apr_can_be_set(self):
        """Custom APR rates can be configured."""
        custom_apr = {
            "extreme_fear": {"spot": {}, "stable": 0.0},
            "fear": {"spot": {}, "stable": 0.0},
            "neutral": {"spot": {}, "stable": 0.0},
            "greed": {"spot": {}, "stable": 0.0},
            "extreme_greed": {"spot": {}, "stable": 0.0},
        }
        config = RegimeConfig(apr_by_regime=custom_apr)
        assert config.apr_by_regime == custom_apr


class TestPortfolioApplyDailyYield:
    """Tests for Portfolio.apply_daily_yield() method."""

    def test_zero_apr_gives_zero_yield(self):
        """Zero APR rates should result in zero yield."""
        portfolio = Portfolio(
            spot_balance=10.0,
            stable_balance=5000.0,
        )
        result = portfolio.apply_daily_yield(
            price=100.0, apr_rates={"spot": {}, "stable": 0.0}
        )
        assert result["total_yield"] == 0.0
        assert result["spot_yield"] == 0.0
        assert result["stable_yield"] == 0.0
        # Stable balance unchanged
        assert portfolio.stable_balance == 5000.0

    def test_stable_yield_calculated_correctly(self):
        """Stable yield = stable_balance * daily_rate."""
        portfolio = Portfolio(
            spot_balance=0.0,
            stable_balance=36500.0,
        )
        # 10% APR on $36,500 = $10 per day (36,500 * 0.10 / 365)
        result = portfolio.apply_daily_yield(
            price=100.0, apr_rates={"spot": {}, "stable": 0.10}
        )
        expected_daily_yield = 36500.0 * 0.10 / 365  # $10
        assert result["stable_yield"] == pytest.approx(expected_daily_yield, rel=1e-9)
        assert portfolio.stable_balance == pytest.approx(36510.0, rel=1e-9)

    def test_spot_yield_calculated_correctly(self):
        """Spot yield = spot_balance * price * daily_rate."""
        portfolio = Portfolio(
            spot_balance=10.0,
            stable_balance=0.0,
        )
        # 10 tokens at $100 = $1000, 10% APR = $1000 * 0.10 / 365 per day
        result = portfolio.apply_daily_yield(
            price=100.0, apr_rates={"spot": {"btc": 0.10}, "stable": 0.0}
        )
        expected_yield = 10.0 * 100.0 * 0.10 / 365
        assert result["spot_yield"] == pytest.approx(expected_yield, rel=1e-9)

    def test_spot_yield_converts_to_tokens_correctly(self):
        """Spot yield should accrue as additional spot tokens."""
        portfolio = Portfolio(
            spot_balance=10.0,
            stable_balance=0.0,
        )
        portfolio.apply_daily_yield(
            price=100.0, apr_rates={"spot": {"btc": 0.10}, "stable": 0.0}
        )
        expected_spot_yield = 10.0 * 100.0 * 0.10 / 365
        expected_spot_tokens = expected_spot_yield / 100.0
        assert portfolio.spot_balance == pytest.approx(
            10.0 + expected_spot_tokens, rel=1e-9
        )

    def test_yield_added_to_respective_balances(self):
        """Yield accrues to respective balances."""
        portfolio = Portfolio(
            spot_balance=10.0,
            stable_balance=1000.0,
        )
        initial_spot = portfolio.spot_balance
        initial_stable = portfolio.stable_balance

        result = portfolio.apply_daily_yield(
            price=100.0, apr_rates={"spot": {"btc": 0.10}, "stable": 0.10}
        )

        assert portfolio.spot_balance == pytest.approx(
            initial_spot + (result["spot_yield"] / 100.0), rel=1e-9
        )
        assert portfolio.stable_balance == pytest.approx(
            initial_stable + result["stable_yield"], rel=1e-9
        )

    def test_yield_breakdown_returned(self):
        """Method returns breakdown per position type."""
        portfolio = Portfolio(
            spot_balance=10.0,
            stable_balance=1000.0,
        )

        result = portfolio.apply_daily_yield(
            price=100.0, apr_rates={"spot": {"btc": 0.10}, "stable": 0.10}
        )

        assert "spot_yield" in result
        assert "stable_yield" in result
        assert "total_yield" in result
        assert result["total_yield"] == pytest.approx(
            result["spot_yield"] + result["stable_yield"], rel=1e-9
        )

    def test_missing_apr_rate_defaults_to_zero(self):
        """Missing APR rate keys default to zero."""
        portfolio = Portfolio(
            spot_balance=10.0,
            stable_balance=1000.0,
        )

        # Only provide spot rate
        result = portfolio.apply_daily_yield(
            price=100.0, apr_rates={"spot": {"btc": 0.10}}
        )

        assert result["stable_yield"] == 0.0

    def test_empty_apr_rates_gives_zero_yield(self):
        """Empty apr_rates dict gives zero yield."""
        portfolio = Portfolio(
            spot_balance=10.0,
            stable_balance=1000.0,
        )
        result = portfolio.apply_daily_yield(price=100.0, apr_rates={})
        assert result["total_yield"] == 0.0
