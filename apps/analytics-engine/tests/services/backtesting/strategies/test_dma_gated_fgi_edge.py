"""Edge-case tests for DmaGatedFgiStrategy."""

from __future__ import annotations

import pytest

from src.services.backtesting.strategies.dma_gated_fgi import DmaGatedFgiStrategy


def test_wrong_signal_id_raises() -> None:
    with pytest.raises(ValueError, match="signal_id must be 'dma_gated_fgi'"):
        DmaGatedFgiStrategy(
            total_capital=10_000.0,
            signal_id="wrong_id",
        )
