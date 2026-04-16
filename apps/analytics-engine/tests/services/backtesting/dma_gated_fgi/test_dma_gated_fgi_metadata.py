"""Tests for DMA signal metadata serialization."""

from __future__ import annotations

from src.services.backtesting.decision import AllocationIntent
from src.services.backtesting.signals.dma_gated_fgi.metadata import (
    build_signal_metadata,
    build_signal_output,
)
from src.services.backtesting.signals.dma_gated_fgi.types import (
    DmaCooldownState,
    DmaMarketState,
)


def _market_state() -> DmaMarketState:
    return DmaMarketState(
        signal_id="dma_gated_fgi",
        dma_200=50_000.0,
        dma_distance=-0.2,
        zone="below",
        cross_event=None,
        actionable_cross_event=None,
        cooldown_state=DmaCooldownState(False, 0, None),
        fgi_value=10.0,
        fgi_slope=-0.1,
        fgi_regime="extreme_fear",
        regime_source="label",
        ath_event="portfolio_ath",
    )


def _intent() -> AllocationIntent:
    return AllocationIntent(
        action="buy",
        target_allocation={"spot": 1.0, "stable": 0.0},
        allocation_name="dma_below_extreme_fear_buy",
        immediate=False,
        reason="below_extreme_fear_buy",
        rule_group="dma_fgi",
        decision_score=1.0,
    )


def test_signal_metadata_serializer_preserves_dma_fields() -> None:
    metadata = build_signal_metadata(
        market_state=_market_state(),
        intent=_intent(),
    )

    assert metadata["reason"] == "below_extreme_fear_buy"
    assert metadata["ath_event"] == "portfolio_ath"
    assert metadata["matched_rule_group"] == "dma_fgi"
    assert metadata["allocation_intent"]["target"] == {"spot": 1.0, "stable": 0.0}
    assert metadata["rule_priority_order"] == "cross>cooldown>dma_fgi>ath"


def test_signal_output_uses_legacy_metadata_shape() -> None:
    signal = build_signal_output(
        market_state=_market_state(),
        intent=_intent(),
    )

    assert signal.source == "dma_gated_fgi"
    assert signal.score == 1.0
    assert signal.metadata["reason"] == "below_extreme_fear_buy"
    assert signal.metadata["allocation_intent"]["name"] == (
        "dma_below_extreme_fear_buy"
    )
