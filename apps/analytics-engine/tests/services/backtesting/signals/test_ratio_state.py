from __future__ import annotations

from src.services.backtesting.signals.ratio_state import (
    EthBtcRatioState,
    classify_ratio_zone,
    detect_ratio_cross,
)
from src.services.backtesting.signals.dma_gated_fgi.types import DmaCooldownState


def test_classify_zone_above() -> None:
    assert classify_ratio_zone(ratio=0.07, ratio_dma=0.06) == "above"


def test_classify_zone_below() -> None:
    assert classify_ratio_zone(ratio=0.05, ratio_dma=0.06) == "below"


def test_classify_zone_at() -> None:
    assert classify_ratio_zone(ratio=0.06, ratio_dma=0.06) == "at"


def test_detect_cross_up() -> None:
    assert detect_ratio_cross(prev_zone="below", current_zone="above") == "cross_up"


def test_detect_cross_down() -> None:
    assert detect_ratio_cross(prev_zone="above", current_zone="below") == "cross_down"


def test_no_cross_when_same_zone() -> None:
    assert detect_ratio_cross(prev_zone="above", current_zone="above") is None


def test_ratio_state_carries_actionable_cross_and_cooldown() -> None:
    state = EthBtcRatioState(
        ratio=0.07,
        ratio_dma_200=0.06,
        zone="above",
        cross_event="cross_up",
        actionable_cross_event="cross_up",
        cooldown_state=DmaCooldownState(
            active=False,
            remaining_days=0,
            blocked_zone=None,
        ),
    )

    assert state.actionable_cross_event == "cross_up"
    assert state.cooldown_state.active is False
