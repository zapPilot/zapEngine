"""Hierarchical SPY/crypto attribution variants."""

from __future__ import annotations

from dataclasses import dataclass

from src.services.backtesting.constants import (
    STRATEGY_DISPLAY_NAMES,
    STRATEGY_DMA_FGI_HIERARCHICAL_CONTROL,
    STRATEGY_DMA_FGI_HIERARCHICAL_FULL,
    STRATEGY_DMA_FGI_HIERARCHICAL_FULL_MINUS_ADAPTIVE_DMA,
    STRATEGY_DMA_FGI_HIERARCHICAL_PROD,
)

LEGACY_DMA_BUY_STRENGTH_FLOOR = 0.10
CURRENT_DMA_BUY_STRENGTH_FLOOR = 0.03
PLAIN_GREED_SELL_RULE = "above_greed_sell"
FEAR_RECOVERY_BUY_RULE = "below_fear_recovering_buy"
FULL_DISABLED_RULES = frozenset({PLAIN_GREED_SELL_RULE})


@dataclass(frozen=True)
class HierarchicalAttributionVariant:
    strategy_id: str
    display_name: str
    description: str
    adaptive_crypto_dma_reference: bool
    spy_cross_up_latch: bool
    disabled_rules: frozenset[str]
    dma_buy_strength_floor: float


def _variant(
    strategy_id: str,
    *,
    description: str,
    adaptive_crypto_dma_reference: bool,
    spy_cross_up_latch: bool,
    disabled_rules: frozenset[str],
    dma_buy_strength_floor: float,
) -> HierarchicalAttributionVariant:
    return HierarchicalAttributionVariant(
        strategy_id=strategy_id,
        display_name=STRATEGY_DISPLAY_NAMES[strategy_id],
        description=description,
        adaptive_crypto_dma_reference=adaptive_crypto_dma_reference,
        spy_cross_up_latch=spy_cross_up_latch,
        disabled_rules=disabled_rules,
        dma_buy_strength_floor=dma_buy_strength_floor,
    )


HIERARCHICAL_ATTRIBUTION_VARIANTS: dict[str, HierarchicalAttributionVariant] = {
    STRATEGY_DMA_FGI_HIERARCHICAL_CONTROL: _variant(
        STRATEGY_DMA_FGI_HIERARCHICAL_CONTROL,
        description="Attribution control: legacy BTC crypto-DMA reference, no SPY latch, canonical greed sell, and legacy buy floor.",
        adaptive_crypto_dma_reference=False,
        spy_cross_up_latch=False,
        disabled_rules=frozenset(),
        dma_buy_strength_floor=LEGACY_DMA_BUY_STRENGTH_FLOOR,
    ),
    STRATEGY_DMA_FGI_HIERARCHICAL_FULL: _variant(
        STRATEGY_DMA_FGI_HIERARCHICAL_FULL,
        description="Attribution full: adaptive crypto-DMA reference, SPY cross-up latch, plain greed sell suppression, and current buy floor.",
        adaptive_crypto_dma_reference=True,
        spy_cross_up_latch=True,
        disabled_rules=FULL_DISABLED_RULES,
        dma_buy_strength_floor=CURRENT_DMA_BUY_STRENGTH_FLOOR,
    ),
    STRATEGY_DMA_FGI_HIERARCHICAL_FULL_MINUS_ADAPTIVE_DMA: _variant(
        STRATEGY_DMA_FGI_HIERARCHICAL_FULL_MINUS_ADAPTIVE_DMA,
        description="Leave-one-out: full hierarchical stack without adaptive crypto-DMA reference.",
        adaptive_crypto_dma_reference=False,
        spy_cross_up_latch=True,
        disabled_rules=FULL_DISABLED_RULES,
        dma_buy_strength_floor=CURRENT_DMA_BUY_STRENGTH_FLOOR,
    ),
    STRATEGY_DMA_FGI_HIERARCHICAL_PROD: _variant(
        STRATEGY_DMA_FGI_HIERARCHICAL_PROD,
        description="Stable production alias for the full hierarchical attribution stack.",
        adaptive_crypto_dma_reference=True,
        spy_cross_up_latch=True,
        disabled_rules=FULL_DISABLED_RULES,
        dma_buy_strength_floor=CURRENT_DMA_BUY_STRENGTH_FLOOR,
    ),
}


__all__ = [
    "CURRENT_DMA_BUY_STRENGTH_FLOOR",
    "FULL_DISABLED_RULES",
    "HIERARCHICAL_ATTRIBUTION_VARIANTS",
    "HierarchicalAttributionVariant",
    "LEGACY_DMA_BUY_STRENGTH_FLOOR",
]
