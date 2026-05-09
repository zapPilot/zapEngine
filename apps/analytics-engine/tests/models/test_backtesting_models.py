from __future__ import annotations

import pytest
from pydantic import ValidationError

from src.models.backtesting import BacktestCompareConfigV3, TargetAllocation


def test_target_allocation_rejects_nonzero_alt_bucket() -> None:
    with pytest.raises(
        ValidationError, match="target allocation cannot allocate to alt"
    ):
        TargetAllocation(
            btc=0.0,
            eth=0.0,
            spy=0.0,
            stable=0.95,
            alt=0.05,
        )


def test_backtest_compare_config_accepts_saved_config_only_path() -> None:
    config = BacktestCompareConfigV3(
        config_id="saved_config_compare",
        saved_config_id="dma_fgi_portfolio_rules",
    )

    assert config.saved_config_id == "dma_fgi_portfolio_rules"
    assert config.strategy_id is None
    assert config.params == {}
