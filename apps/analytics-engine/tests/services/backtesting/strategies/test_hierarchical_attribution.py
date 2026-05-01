from __future__ import annotations

from datetime import date

from src.services.backtesting.constants import (
    STRATEGY_DMA_FGI_HIERARCHICAL_CONTROL,
    STRATEGY_DMA_FGI_HIERARCHICAL_FULL,
    STRATEGY_DMA_FGI_HIERARCHICAL_FULL_MINUS_ADAPTIVE_DMA,
    STRATEGY_DMA_FGI_HIERARCHICAL_NODMA_FULL_MINUS_BUY_FLOOR,
    STRATEGY_DMA_FGI_HIERARCHICAL_NODMA_FULL_MINUS_FEAR_RECOVERY_BUY,
    STRATEGY_DMA_FGI_HIERARCHICAL_NODMA_FULL_MINUS_GREED_SELL_SUPPRESSION,
    STRATEGY_DMA_FGI_HIERARCHICAL_NODMA_FULL_MINUS_SPY_LATCH,
    STRATEGY_DMA_FGI_HIERARCHICAL_PROD,
)
from src.services.backtesting.strategies.hierarchical_attribution import (
    CURRENT_DMA_BUY_STRENGTH_FLOOR,
    FEAR_RECOVERY_BUY_RULE,
    FULL_DISABLED_RULES,
    HIERARCHICAL_ATTRIBUTION_VARIANTS,
    LEGACY_DMA_BUY_STRENGTH_FLOOR,
)
from src.services.backtesting.strategies.spy_crypto_hierarchical_rotation import (
    HierarchicalSpyCryptoRotationStrategy,
)
from src.services.backtesting.strategy_registry import (
    StrategyBuildRequest,
    get_strategy_recipe,
)


def _build_variant_strategy(strategy_id: str) -> HierarchicalSpyCryptoRotationStrategy:
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
    assert isinstance(strategy, HierarchicalSpyCryptoRotationStrategy)
    return strategy


def test_variant_registry_complete() -> None:
    assert len(HIERARCHICAL_ATTRIBUTION_VARIANTS) == 17
    for strategy_id, variant in HIERARCHICAL_ATTRIBUTION_VARIANTS.items():
        recipe = get_strategy_recipe(strategy_id)
        assert recipe.strategy_id == strategy_id
        assert recipe.display_name == variant.display_name
        assert recipe.runtime_portfolio_mode == "asset"


def test_control_variant_uses_legacy_tactic_surface() -> None:
    strategy = _build_variant_strategy(STRATEGY_DMA_FGI_HIERARCHICAL_CONTROL)

    assert strategy.adaptive_crypto_dma_reference is False
    assert strategy.spy_cross_up_latch is False
    assert strategy.outer_disabled_rules == frozenset()
    assert strategy.inner_disabled_rules == frozenset()
    assert strategy.dma_buy_strength_floor == LEGACY_DMA_BUY_STRENGTH_FLOOR


def test_full_variant_uses_post_fix_tactic_surface() -> None:
    strategy = _build_variant_strategy(STRATEGY_DMA_FGI_HIERARCHICAL_FULL)

    assert strategy.adaptive_crypto_dma_reference is True
    assert strategy.spy_cross_up_latch is True
    assert strategy.outer_disabled_rules == FULL_DISABLED_RULES
    assert strategy.inner_disabled_rules == frozenset()
    assert strategy.dma_buy_strength_floor == CURRENT_DMA_BUY_STRENGTH_FLOOR


def test_phase2_nodma_variants_use_nodma_baseline_surface() -> None:
    baseline = _build_variant_strategy(
        STRATEGY_DMA_FGI_HIERARCHICAL_FULL_MINUS_ADAPTIVE_DMA
    )
    no_spy_latch = _build_variant_strategy(
        STRATEGY_DMA_FGI_HIERARCHICAL_NODMA_FULL_MINUS_SPY_LATCH
    )
    no_greed_suppression = _build_variant_strategy(
        STRATEGY_DMA_FGI_HIERARCHICAL_NODMA_FULL_MINUS_GREED_SELL_SUPPRESSION
    )
    legacy_buy_floor = _build_variant_strategy(
        STRATEGY_DMA_FGI_HIERARCHICAL_NODMA_FULL_MINUS_BUY_FLOOR
    )
    no_fear_recovery = _build_variant_strategy(
        STRATEGY_DMA_FGI_HIERARCHICAL_NODMA_FULL_MINUS_FEAR_RECOVERY_BUY
    )

    assert baseline.adaptive_crypto_dma_reference is False
    assert no_spy_latch.adaptive_crypto_dma_reference is False
    assert no_spy_latch.spy_cross_up_latch is False
    assert no_spy_latch.outer_disabled_rules == FULL_DISABLED_RULES
    assert no_greed_suppression.adaptive_crypto_dma_reference is False
    assert no_greed_suppression.spy_cross_up_latch is True
    assert no_greed_suppression.outer_disabled_rules == frozenset()
    assert legacy_buy_floor.adaptive_crypto_dma_reference is False
    assert legacy_buy_floor.dma_buy_strength_floor == LEGACY_DMA_BUY_STRENGTH_FLOOR
    assert no_fear_recovery.adaptive_crypto_dma_reference is False
    assert FEAR_RECOVERY_BUY_RULE in no_fear_recovery.outer_disabled_rules


def test_prod_variant_is_full_alias() -> None:
    full = HIERARCHICAL_ATTRIBUTION_VARIANTS[STRATEGY_DMA_FGI_HIERARCHICAL_FULL]
    prod = HIERARCHICAL_ATTRIBUTION_VARIANTS[STRATEGY_DMA_FGI_HIERARCHICAL_PROD]

    assert prod.adaptive_crypto_dma_reference == full.adaptive_crypto_dma_reference
    assert prod.spy_cross_up_latch == full.spy_cross_up_latch
    assert prod.disabled_rules == full.disabled_rules
    assert prod.dma_buy_strength_floor == full.dma_buy_strength_floor
