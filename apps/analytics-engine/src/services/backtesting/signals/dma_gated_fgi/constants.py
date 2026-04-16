"""Shared constants for the dedicated DMA-gated FGI runtime."""

from __future__ import annotations

RULE_PRIORITY_ORDER = "cross>cooldown>dma_fgi>ath"

VALID_ATH_EVENTS = frozenset({"token_ath", "portfolio_ath", "both_ath"})

SELL_TARGET: dict[str, float] = {"spot": 0.0, "stable": 1.0}
BUY_TARGET: dict[str, float] = {"spot": 1.0, "stable": 0.0}

SCORE_BY_REASON = {
    "dma_cross_up": 1.0,
    "dma_cross_down": -1.0,
    "below_extreme_fear_buy": 1.0,
    "above_dma_overextended_sell": -0.8,
    "above_greed_fading_sell": -0.6,
    "above_greed_sell": -0.5,
    "above_extreme_greed_sell": -1.0,
    "ath_sell": -1.0,
}

__all__ = [
    "BUY_TARGET",
    "RULE_PRIORITY_ORDER",
    "SCORE_BY_REASON",
    "SELL_TARGET",
    "VALID_ATH_EVENTS",
]
