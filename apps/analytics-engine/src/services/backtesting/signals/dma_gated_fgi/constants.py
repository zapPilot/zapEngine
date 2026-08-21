"""Shared constants for the dedicated DMA-gated FGI runtime."""

from __future__ import annotations

RULE_PRIORITY_ORDER = "cross>cooldown>dma_fgi>ath"

VALID_ATH_EVENTS = frozenset({"token_ath", "portfolio_ath", "both_ath"})

__all__ = [
    "RULE_PRIORITY_ORDER",
    "VALID_ATH_EVENTS",
]
