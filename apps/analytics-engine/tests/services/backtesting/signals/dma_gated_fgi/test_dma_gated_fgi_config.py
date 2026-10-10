"""Tests for DmaGatedFgiConfig with regime/ATH gating."""

import pytest

from src.services.backtesting.signals.dma_gated_fgi.config import DmaGatedFgiConfig


def test_cross_cooldown_days_is_required() -> None:
    # A strategy spec states the cooldown for each asset, so a config cannot omit it.
    with pytest.raises(TypeError, match="cross_cooldown_days"):
        DmaGatedFgiConfig()  # type: ignore[call-arg]


def test_cross_on_touch_defaults_to_true() -> None:
    cfg = DmaGatedFgiConfig(cross_cooldown_days=30)

    assert cfg.cross_on_touch is True


def test_immutability() -> None:
    cfg = DmaGatedFgiConfig(cross_cooldown_days=30)

    with pytest.raises(AttributeError):
        cfg.cross_cooldown_days = 10  # type: ignore[misc]


def test_custom_values() -> None:
    cfg = DmaGatedFgiConfig(
        cross_cooldown_days=7,
        cross_on_touch=False,
    )

    assert cfg.cross_cooldown_days == 7
    assert cfg.cross_on_touch is False
