"""Minimum hierarchical SPY/crypto strategy and attribution variants."""

from __future__ import annotations

from dataclasses import dataclass, field

from src.services.backtesting.constants import (
    STRATEGY_DISPLAY_NAMES,
    STRATEGY_DMA_FGI_ETH_BTC_MINIMUM_STRUCTURAL,
    STRATEGY_DMA_FGI_ETH_BTC_MINIMUM_SURGICAL,
    STRATEGY_DMA_FGI_HIERARCHICAL_MINIMUM,
    STRATEGY_DMA_FGI_HIERARCHICAL_MINIMUM_BELOW_DMA_HOLD,
    STRATEGY_DMA_FGI_HIERARCHICAL_MINIMUM_CROSS_COOLDOWN,
    STRATEGY_DMA_FGI_HIERARCHICAL_MINIMUM_DMA_BUFFER,
    STRATEGY_DMA_FGI_HIERARCHICAL_MINIMUM_DMA_DISCIPLINED,
    STRATEGY_DMA_FGI_HIERARCHICAL_MINIMUM_DUAL_ABOVE_HOLD,
)
from src.services.backtesting.strategies.hierarchical_attribution import (
    LEGACY_DMA_BUY_STRENGTH_FLOOR,
)
from src.services.backtesting.strategies.hierarchical_outer_policy import (
    HierarchicalOuterDecisionPolicy,
    MinimumHierarchicalOuterPolicy,
    MinimumHierarchicalOuterPolicyBelowDmaHold,
    MinimumHierarchicalOuterPolicyCrossCooldown,
    MinimumHierarchicalOuterPolicyDmaDisciplined,
    MinimumHierarchicalOuterPolicyDualAboveHold,
    MinimumHierarchicalOuterPolicyWithBuffer,
)
from src.services.backtesting.strategies.spy_crypto_hierarchical_rotation import (
    SPY_CRYPTO_TEMPLATE,
    HierarchicalSpyCryptoRotationStrategy,
    HierarchicalTargetComposer,
    _compose_structural,
    _compose_surgical,
)


@dataclass
class HierarchicalMinimumStrategy(HierarchicalSpyCryptoRotationStrategy):
    """Minimum hierarchical SPY/crypto strategy."""

    strategy_id: str = STRATEGY_DMA_FGI_HIERARCHICAL_MINIMUM
    display_name: str = STRATEGY_DISPLAY_NAMES[STRATEGY_DMA_FGI_HIERARCHICAL_MINIMUM]
    canonical_strategy_id: str = STRATEGY_DMA_FGI_HIERARCHICAL_MINIMUM
    adaptive_crypto_dma_reference: bool = field(default=False, init=False)
    spy_cross_up_latch: bool = field(default=False, init=False)
    outer_disabled_rules: frozenset[str] = field(default_factory=frozenset, init=False)
    dma_buy_strength_floor: float = field(
        default=LEGACY_DMA_BUY_STRENGTH_FLOOR,
        init=False,
    )
    outer_policy: HierarchicalOuterDecisionPolicy | None = field(
        default_factory=MinimumHierarchicalOuterPolicy
    )

    def __post_init__(self) -> None:
        if self.signal_id != SPY_CRYPTO_TEMPLATE.signal_id:
            raise ValueError(f"signal_id must be '{SPY_CRYPTO_TEMPLATE.signal_id}'")
        if self.outer_policy is None:
            self.outer_policy = MinimumHierarchicalOuterPolicy()
        super().__post_init__()


@dataclass(frozen=True)
class MinimumHierarchicalVariant:
    strategy_id: str
    display_name: str
    description: str
    outer_policy: MinimumHierarchicalOuterPolicy
    composer: HierarchicalTargetComposer | None = None


def _variant(
    strategy_id: str,
    *,
    description: str,
    outer_policy: MinimumHierarchicalOuterPolicy,
    composer: HierarchicalTargetComposer | None = None,
) -> MinimumHierarchicalVariant:
    return MinimumHierarchicalVariant(
        strategy_id=strategy_id,
        display_name=STRATEGY_DISPLAY_NAMES[strategy_id],
        description=description,
        outer_policy=outer_policy,
        composer=composer,
    )


MINIMUM_HIERARCHICAL_VARIANTS: dict[str, MinimumHierarchicalVariant] = {
    STRATEGY_DMA_FGI_HIERARCHICAL_MINIMUM: _variant(
        STRATEGY_DMA_FGI_HIERARCHICAL_MINIMUM,
        description=(
            "Minimum hierarchical stack: outer DMA stable gating and plain "
            "greed sell suppression."
        ),
        outer_policy=MinimumHierarchicalOuterPolicy(),
    ),
    STRATEGY_DMA_FGI_HIERARCHICAL_MINIMUM_DMA_BUFFER: _variant(
        STRATEGY_DMA_FGI_HIERARCHICAL_MINIMUM_DMA_BUFFER,
        description=(
            "Research variant for S1: require a 3% DMA entry buffer before "
            "SPY or crypto can enter from a DMA buy intent."
        ),
        outer_policy=MinimumHierarchicalOuterPolicyWithBuffer(),
    ),
    STRATEGY_DMA_FGI_HIERARCHICAL_MINIMUM_DUAL_ABOVE_HOLD: _variant(
        STRATEGY_DMA_FGI_HIERARCHICAL_MINIMUM_DUAL_ABOVE_HOLD,
        description=(
            "Research variant for S4: hold the current outer allocation while "
            "both SPY and crypto are above DMA."
        ),
        outer_policy=MinimumHierarchicalOuterPolicyDualAboveHold(),
    ),
    STRATEGY_DMA_FGI_HIERARCHICAL_MINIMUM_CROSS_COOLDOWN: _variant(
        STRATEGY_DMA_FGI_HIERARCHICAL_MINIMUM_CROSS_COOLDOWN,
        description=(
            "Research variant for Phase D: suppress allocation increases during "
            "the 30-day period after each asset's DMA cross-down."
        ),
        outer_policy=MinimumHierarchicalOuterPolicyCrossCooldown(),
    ),
    STRATEGY_DMA_FGI_HIERARCHICAL_MINIMUM_BELOW_DMA_HOLD: _variant(
        STRATEGY_DMA_FGI_HIERARCHICAL_MINIMUM_BELOW_DMA_HOLD,
        description=(
            "Research variant for Phase D: do not increase SPY, BTC, or ETH "
            "while the asset is below its own DMA, except extreme-fear DCA."
        ),
        outer_policy=MinimumHierarchicalOuterPolicyBelowDmaHold(),
    ),
    STRATEGY_DMA_FGI_HIERARCHICAL_MINIMUM_DMA_DISCIPLINED: _variant(
        STRATEGY_DMA_FGI_HIERARCHICAL_MINIMUM_DMA_DISCIPLINED,
        description=(
            "Research variant for Phase D: combine cross-down cooldown and "
            "below-DMA hold with the extreme-fear DCA carve-out."
        ),
        outer_policy=MinimumHierarchicalOuterPolicyDmaDisciplined(),
    ),
    STRATEGY_DMA_FGI_ETH_BTC_MINIMUM_SURGICAL: _variant(
        STRATEGY_DMA_FGI_ETH_BTC_MINIMUM_SURGICAL,
        description=(
            "Research variant for the minimum hierarchical stack: route "
            "crypto cross-up and extreme-fear outer deltas to the triggering "
            "BTC/ETH asset while preserving the legacy composer otherwise."
        ),
        outer_policy=MinimumHierarchicalOuterPolicy(),
        composer=_compose_surgical,
    ),
    STRATEGY_DMA_FGI_ETH_BTC_MINIMUM_STRUCTURAL: _variant(
        STRATEGY_DMA_FGI_ETH_BTC_MINIMUM_STRUCTURAL,
        description=(
            "Research variant for the minimum hierarchical stack: compose "
            "outer sleeve changes as asset-level deltas before applying the "
            "inner ETH/BTC ratio to the residual crypto sleeve."
        ),
        outer_policy=MinimumHierarchicalOuterPolicy(),
        composer=_compose_structural,
    ),
}


__all__ = [
    "HierarchicalMinimumStrategy",
    "MINIMUM_HIERARCHICAL_VARIANTS",
    "MinimumHierarchicalVariant",
]
