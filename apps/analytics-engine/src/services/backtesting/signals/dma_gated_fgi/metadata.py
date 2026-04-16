"""Metadata and compatibility serialization for the DMA signal runtime."""

from __future__ import annotations

from typing import Any

from src.services.backtesting.decision import AllocationIntent
from src.services.backtesting.signals.contracts import SignalOutput
from src.services.backtesting.signals.dma_gated_fgi.constants import (
    RULE_PRIORITY_ORDER,
)
from src.services.backtesting.signals.dma_gated_fgi.regime_classifier import (
    RegimeSource,
)
from src.services.backtesting.signals.dma_gated_fgi.types import (
    AthEvent,
    CrossEvent,
    DmaMarketState,
)


def build_signal_metadata(
    *,
    market_state: DmaMarketState,
    intent: AllocationIntent,
) -> dict[str, Any]:
    """Serialize market state and allocation intent to signal metadata."""
    return {
        "allocation_intent": intent.to_signal_payload(),
        "reason": intent.reason,
        "price_above_dma": market_state.price_above_dma,
        "dma_distance": market_state.dma_distance,
        "cross_event": (
            market_state.actionable_cross_event
            if intent.rule_group == "cross"
            else None
        ),
        "cooldown_active": market_state.cooldown_state.active,
        "cooldown_remaining_days": market_state.cooldown_state.remaining_days,
        "cooldown_blocked_zone": market_state.cooldown_state.blocked_zone,
        "fgi_value": market_state.fgi_value,
        "fgi_slope": market_state.fgi_slope,
        "fgi_regime": market_state.fgi_regime,
        "ath_event": market_state.ath_event,
        "matched_rule_group": intent.rule_group,
        "rule_priority_order": RULE_PRIORITY_ORDER,
    }


def build_signal_output(
    *,
    market_state: DmaMarketState,
    intent: AllocationIntent,
) -> SignalOutput:
    """Serialize market state and allocation intent to the generic output."""
    return SignalOutput(
        score=intent.decision_score,
        confidence=_confidence_for_context(
            cross_event=(
                market_state.actionable_cross_event
                if intent.rule_group == "cross"
                else None
            ),
            ath_event=market_state.ath_event,
            cooldown_active=market_state.cooldown_state.active,
            regime_source=market_state.regime_source,
        ),
        regime=market_state.fgi_regime,
        raw_value=market_state.fgi_value,
        source=market_state.signal_id,
        immediate=intent.immediate,
        metadata=build_signal_metadata(market_state=market_state, intent=intent),
    )


def _confidence_for_context(
    *,
    cross_event: CrossEvent | None,
    ath_event: AthEvent | None,
    cooldown_active: bool,
    regime_source: RegimeSource,
) -> float:
    has_decision_context = (
        cross_event is not None
        or ath_event is not None
        or cooldown_active
        or regime_source != "neutral_fallback"
    )
    return 1.0 if has_decision_context else 0.0


__all__ = [
    "build_signal_metadata",
    "build_signal_output",
]
