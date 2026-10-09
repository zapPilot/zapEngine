from __future__ import annotations

from datetime import date

import pytest

from src.services.backtesting.constants import (
    STRATEGY_DCA_CLASSIC,
    STRATEGY_DMA_FGI_PORTFOLIO_RULES,
)
from src.services.backtesting.features import (
    DMA_200_FEATURE,
    ETH_BTC_RELATIVE_STRENGTH_AUX_SERIES,
    ETH_DMA_200_FEATURE,
    SPY_DMA_200_FEATURE,
)
from src.services.backtesting.spec import load_spec, parse_spec, spec_ref
from src.services.backtesting.strategies.rule_based_portfolio import (
    RuleBasedPortfolioStrategy,
)
from src.services.backtesting.strategy_catalog import get_strategy_catalog_v3
from src.services.backtesting.strategy_registry import (
    StrategyBuildRequest,
    get_strategy_recipe,
    list_strategy_recipes,
    resolve_inline_strategy_config,
    resolve_spec_strategy_config,
)


def test_strategy_registry_exposes_portfolio_rules_recipe_with_macro_requirements() -> (
    None
):
    recipe = get_strategy_recipe(STRATEGY_DMA_FGI_PORTFOLIO_RULES)

    assert recipe.supports_daily_suggestion is True
    assert recipe.signal_id == "dma_fgi_portfolio_rules_signal"
    assert recipe.primary_asset == "BTC"
    assert recipe.market_data_requirements.requires_sentiment is True
    assert recipe.market_data_requirements.requires_macro_fear_greed is True
    assert recipe.market_data_requirements.required_aux_series == frozenset(
        {ETH_BTC_RELATIVE_STRENGTH_AUX_SERIES}
    )


def test_catalog_is_derived_from_strategy_registry() -> None:
    catalog = get_strategy_catalog_v3()
    recipe_ids = {recipe.strategy_id for recipe in list_strategy_recipes()}

    assert {entry.strategy_id for entry in catalog.strategies} == recipe_ids
    assert recipe_ids == {
        STRATEGY_DCA_CLASSIC,
        STRATEGY_DMA_FGI_PORTFOLIO_RULES,
    }


def test_no_recipe_accepts_params() -> None:
    """What a strategy does is stated by its spec, so no recipe takes params.

    The rule-based strategy used to accept rule filters and thresholds; a future
    strategy that accepts params again trips this.
    """
    for recipe in list_strategy_recipes():
        with pytest.raises(ValueError, match="does not accept params"):
            resolve_inline_strategy_config(
                config_id="adhoc",
                strategy_id=recipe.strategy_id,
                params={"enabled_rules": ["cross_down_exit"]},
            )


def test_portfolio_rules_recipe_builds_compare_strategy() -> None:
    recipe = get_strategy_recipe(STRATEGY_DMA_FGI_PORTFOLIO_RULES)

    strategy = recipe.build_strategy(
        StrategyBuildRequest(
            config_id="portfolio-rules-test",
            total_capital=10_000.0,
            user_prices=[
                {
                    "date": date(2025, 1, 1),
                    "price": 100.0,
                    "prices": {"btc": 100.0, "eth": 120.0, "spy": 500.0},
                    "extra_data": {
                        DMA_200_FEATURE: 90.0,
                        ETH_DMA_200_FEATURE: 100.0,
                        SPY_DMA_200_FEATURE: 450.0,
                    },
                }
            ],
            initial_allocation={"spot": 1.0, "stable": 0.0},
            user_start_date=date(2025, 1, 1),
        )
    )

    assert isinstance(strategy, RuleBasedPortfolioStrategy)
    assert strategy.strategy_id == "portfolio-rules-test"
    assert strategy.initial_asset_allocation == {
        "btc": 1 / 3,
        "eth": 1 / 3,
        "spy": 1 / 3,
        "stable": 0.0,
        "alt": 0.0,
    }


def _build_request() -> StrategyBuildRequest:
    return StrategyBuildRequest(
        config_id="spec-test",
        total_capital=10_000.0,
        user_prices=[
            {
                "date": date(2025, 1, 1),
                "price": 100.0,
                "prices": {"btc": 100.0, "eth": 120.0, "spy": 500.0},
                "extra_data": {
                    DMA_200_FEATURE: 90.0,
                    ETH_DMA_200_FEATURE: 100.0,
                    SPY_DMA_200_FEATURE: 450.0,
                },
            }
        ],
        initial_allocation={"spot": 1.0, "stable": 0.0},
        user_start_date=date(2025, 1, 1),
    )


def test_a_spec_binds_to_the_rule_based_recipe() -> None:
    spec = load_spec("reference/dma_fgi")

    resolved = resolve_spec_strategy_config(spec, config_id="spec-test")

    recipe = get_strategy_recipe(STRATEGY_DMA_FGI_PORTFOLIO_RULES)
    assert resolved.strategy_id == STRATEGY_DMA_FGI_PORTFOLIO_RULES
    assert resolved.saved_config_id == resolved.request_config_id == "spec-test"
    assert resolved.description == spec.description
    assert resolved.spec_ref == spec_ref(spec)
    assert resolved.supports_daily_suggestion is False
    assert resolved.market_data_requirements == recipe.market_data_requirements
    assert resolved.portfolio_bucket_mapper is recipe.portfolio_bucket_mapper


def test_a_spec_decides_the_warmup_window() -> None:
    raw = load_spec("reference/dma_fgi").model_dump(mode="json")
    raw["signals"]["warmup_days"] = 21

    resolved = resolve_spec_strategy_config(parse_spec(raw), config_id="spec-test")

    assert resolved.warmup_lookback_days == 21


def test_a_spec_strategy_runs_on_the_compiled_spec_with_fresh_rules() -> None:
    raw = load_spec("reference/dma_fgi").model_dump(mode="json")
    raw["overlays"] = [
        {"kind": "spy_latch", "id": "spy_latch", "follow_through_days": 14}
    ]
    resolved = resolve_spec_strategy_config(parse_spec(raw), config_id="spec-test")

    first = resolved.build_strategy(_build_request())
    second = resolved.build_strategy(_build_request())

    assert isinstance(first, RuleBasedPortfolioStrategy)
    assert isinstance(second, RuleBasedPortfolioStrategy)
    assert first.strategy_id == "spec-test"
    assert [rule.name for rule in first.decision_policy.rules][-1] == "spy_latch"
    assert first.decision_policy.rules[-1] is not second.decision_policy.rules[-1]
