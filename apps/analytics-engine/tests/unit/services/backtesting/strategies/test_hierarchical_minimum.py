from __future__ import annotations

from datetime import date

from src.services.backtesting.constants import (
    STRATEGY_DMA_FGI_HIERARCHICAL_MINIMUM,
    STRATEGY_DMA_FGI_HIERARCHICAL_MINIMUM_MINUS_BUY_FLOOR,
    STRATEGY_DMA_FGI_HIERARCHICAL_MINIMUM_MINUS_DMA_GATING,
    STRATEGY_DMA_FGI_HIERARCHICAL_MINIMUM_MINUS_GREED_SUPPRESSION,
)
from src.services.backtesting.strategies.hierarchical_attribution import (
    CURRENT_DMA_BUY_STRENGTH_FLOOR,
    LEGACY_DMA_BUY_STRENGTH_FLOOR,
)
from src.services.backtesting.strategies.hierarchical_minimum import (
    MINIMUM_HIERARCHICAL_VARIANTS,
    HierarchicalMinimumStrategy,
)
from src.services.backtesting.strategies.hierarchical_outer_policy import (
    MinimumHierarchicalOuterPolicy,
)
from src.services.backtesting.strategy_registry import (
    StrategyBuildRequest,
    get_strategy_recipe,
)


def _build_strategy(strategy_id: str) -> HierarchicalMinimumStrategy:
    recipe = get_strategy_recipe(strategy_id)
    strategy = recipe.build_strategy(
        StrategyBuildRequest(
            mode="compare",
            total_capital=10_000.0,
            params={"cross_cooldown_days": 0},
            initial_allocation={"spot": 1.0, "stable": 0.0},
            user_start_date=date(2025, 1, 1),
            user_prices=[],
        )
    )
    assert isinstance(strategy, HierarchicalMinimumStrategy)
    return strategy


def test_minimum_variant_registry_complete() -> None:
    expected = {
        STRATEGY_DMA_FGI_HIERARCHICAL_MINIMUM,
        STRATEGY_DMA_FGI_HIERARCHICAL_MINIMUM_MINUS_GREED_SUPPRESSION,
        STRATEGY_DMA_FGI_HIERARCHICAL_MINIMUM_MINUS_BUY_FLOOR,
        STRATEGY_DMA_FGI_HIERARCHICAL_MINIMUM_MINUS_DMA_GATING,
    }

    assert set(MINIMUM_HIERARCHICAL_VARIANTS) == expected
    for strategy_id, variant in MINIMUM_HIERARCHICAL_VARIANTS.items():
        recipe = get_strategy_recipe(strategy_id)
        assert recipe.strategy_id == strategy_id
        assert recipe.display_name == variant.display_name
        assert recipe.runtime_portfolio_mode == "asset"


def test_minimum_strategy_uses_minimum_outer_policy() -> None:
    strategy = _build_strategy(STRATEGY_DMA_FGI_HIERARCHICAL_MINIMUM)

    assert isinstance(strategy.outer_policy, MinimumHierarchicalOuterPolicy)
    assert strategy.adaptive_crypto_dma_reference is False
    assert strategy.spy_cross_up_latch is False
    assert strategy.outer_policy.greed_sell_suppression_enabled is True
    assert strategy.outer_policy.dma_stable_gating_enabled is True
    assert strategy.dma_buy_strength_floor == CURRENT_DMA_BUY_STRENGTH_FLOOR


def test_minimum_policy_type_omits_removed_feature_knobs() -> None:
    policy = MinimumHierarchicalOuterPolicy()

    assert not hasattr(policy, "adaptive_crypto_dma_reference")
    assert not hasattr(policy, "spy_cross_up_latch")
    assert not hasattr(policy, "fear_recovery_buy_rule")


def test_minimum_leave_one_out_variants_change_only_their_policy_surface() -> None:
    no_greed_suppression = _build_strategy(
        STRATEGY_DMA_FGI_HIERARCHICAL_MINIMUM_MINUS_GREED_SUPPRESSION
    )
    legacy_buy_floor = _build_strategy(
        STRATEGY_DMA_FGI_HIERARCHICAL_MINIMUM_MINUS_BUY_FLOOR
    )
    no_dma_gating = _build_strategy(
        STRATEGY_DMA_FGI_HIERARCHICAL_MINIMUM_MINUS_DMA_GATING
    )

    assert no_greed_suppression.outer_policy.greed_sell_suppression_enabled is False
    assert no_greed_suppression.outer_policy.dma_stable_gating_enabled is True
    assert legacy_buy_floor.outer_policy.dma_buy_strength_floor == (
        LEGACY_DMA_BUY_STRENGTH_FLOOR
    )
    assert no_dma_gating.outer_policy.dma_stable_gating_enabled is False
