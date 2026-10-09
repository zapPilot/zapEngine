"""Tests for DmaGatedFgiConfig with regime/ATH gating."""

import pytest

from src.services.backtesting.signals.dma_gated_fgi.config import DmaGatedFgiConfig


def test_default_values() -> None:
    cfg = DmaGatedFgiConfig()

    assert cfg.cross_cooldown_days == 30
    assert cfg.cross_on_touch is True


def test_immutability() -> None:
    cfg = DmaGatedFgiConfig()

    with pytest.raises(AttributeError):
        cfg.cross_cooldown_days = 10  # type: ignore[misc]


def test_custom_values() -> None:
    cfg = DmaGatedFgiConfig(
        cross_cooldown_days=7,
        cross_on_touch=False,
    )

    assert cfg.cross_cooldown_days == 7
    assert cfg.cross_on_touch is False
