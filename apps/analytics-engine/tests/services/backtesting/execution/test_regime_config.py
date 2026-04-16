"""Tests for RegimeConfig."""

from src.services.backtesting.constants import APR_BY_REGIME
from src.services.backtesting.execution.config import RegimeConfig


def test_regime_config_default() -> None:
    """Default config should keep only runtime-consumed settings."""
    config = RegimeConfig.default()
    assert config.apr_by_regime == APR_BY_REGIME
    assert config.trading_slippage_percent == 0.003


def test_regime_config_allows_custom_apr_mapping() -> None:
    custom_apr = {"neutral": {"spot": {"btc": 0.01}, "stable": 0.02}}
    config = RegimeConfig(apr_by_regime=custom_apr, trading_slippage_percent=0.01)

    assert config.apr_by_regime == custom_apr
    assert config.trading_slippage_percent == 0.01
