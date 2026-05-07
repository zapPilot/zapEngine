from __future__ import annotations

from datetime import date

from src.services.backtesting.constants import STRATEGY_DMA_FGI_HIERARCHICAL_CONTROL
from src.services.backtesting.strategies.hierarchical_attribution import (
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
    assert set(HIERARCHICAL_ATTRIBUTION_VARIANTS) == {
        STRATEGY_DMA_FGI_HIERARCHICAL_CONTROL,
    }
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
