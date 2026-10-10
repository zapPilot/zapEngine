"""A saved config resolves to the recipe its ``strategy_id`` names."""

from __future__ import annotations

from dataclasses import replace
from datetime import date

import pytest

from src.config.strategy_presets import (
    DMA_FGI_PORTFOLIO_RULES_CONFIG_ID,
    resolve_seed_strategy_config,
)
from src.models.backtesting import BacktestCompareConfigV3, BacktestCompareRequestV3
from src.models.strategy_config import SavedStrategyConfig
from src.services.backtesting.constants import STRATEGY_DCA_CLASSIC
from src.services.backtesting.execution.compare import run_compare_v3_on_data
from src.services.backtesting.features import DMA_200_FEATURE, ETH_DMA_200_FEATURE
from src.services.backtesting.strategies.rule_based_portfolio import (
    RuleBasedPortfolioStrategy,
)
from src.services.backtesting.strategy_registry import (
    StrategyBuildRequest,
    reference_identity,
    resolve_inline_strategy_config,
    resolve_saved_strategy_config,
)
from tests.services.backtesting.support import register_mock_recipe


def test_resolve_seed_saved_config_builds_portfolio_rules_runtime() -> None:
    resolved = resolve_saved_strategy_config(
        resolve_seed_strategy_config(DMA_FGI_PORTFOLIO_RULES_CONFIG_ID)
    )

    assert resolved.saved_config_id == DMA_FGI_PORTFOLIO_RULES_CONFIG_ID
    assert resolved.strategy_id == "dma_fgi_portfolio_rules"
    assert resolved.summary_signal_id == "dma_fgi_portfolio_rules_signal"
    assert resolved.primary_asset == "BTC"
    assert resolved.supports_daily_suggestion is True
    assert resolved.spec_ref == reference_identity("reference/dma_fgi")
    assert resolved.market_data_requirements.requires_sentiment is True
    assert DMA_200_FEATURE in resolved.market_data_requirements.required_price_features


def test_resolved_seed_portfolio_rules_strategy_uses_rule_based_builder() -> None:
    resolved = resolve_saved_strategy_config(
        resolve_seed_strategy_config(DMA_FGI_PORTFOLIO_RULES_CONFIG_ID)
    )

    strategy = resolved.build_strategy(
        StrategyBuildRequest(
            total_capital=10_000.0,
            config_id=resolved.request_config_id,
            user_prices=[
                {
                    "date": "2025-01-01",
                    "price": 100.0,
                    "prices": {"btc": 100.0, "eth": 120.0, "spy": 500.0},
                    "extra_data": {
                        DMA_200_FEATURE: 90.0,
                        ETH_DMA_200_FEATURE: 100.0,
                    },
                }
            ],
            initial_allocation={"spot": 1.0, "stable": 0.0},
            user_start_date=date(2025, 1, 1),
        )
    )

    assert isinstance(strategy, RuleBasedPortfolioStrategy)
    assert strategy.signal_component.ratio_cross_cooldown_days == 30


def test_the_benchmark_seed_resolves_through_its_recipe() -> None:
    """``saved_config_id: dca_classic`` used to be rejected as an unknown family."""
    saved_config = resolve_seed_strategy_config(STRATEGY_DCA_CLASSIC)

    resolved = resolve_saved_strategy_config(saved_config)

    assert resolved.saved_config_id == STRATEGY_DCA_CLASSIC
    assert resolved.strategy_id == STRATEGY_DCA_CLASSIC
    assert resolved.summary_signal_id is None
    assert resolved.spec_ref is None
    assert resolved.supports_daily_suggestion is False
    assert resolved.runtime_portfolio_mode == "aggregate"


def test_a_saved_config_without_a_spec_ref_runs_the_recipes_own_reference() -> None:
    saved_config = resolve_seed_strategy_config(
        DMA_FGI_PORTFOLIO_RULES_CONFIG_ID
    ).model_copy(update={"spec_ref": None})

    resolved = resolve_saved_strategy_config(saved_config)

    assert resolved.spec_ref == reference_identity("reference/dma_fgi")


def test_a_benchmark_has_no_spec_to_name() -> None:
    saved_config = resolve_seed_strategy_config(STRATEGY_DCA_CLASSIC).model_copy(
        update={"spec_ref": "reference/dma_fgi"}
    )

    with pytest.raises(ValueError, match="dca_classic is not spec-backed"):
        resolve_saved_strategy_config(saved_config)


def test_a_saved_config_naming_an_unknown_strategy_cannot_be_resolved() -> None:
    saved_config = SavedStrategyConfig(
        config_id="orphan",
        display_name="Orphan",
        strategy_id="no_such_strategy",
    )

    with pytest.raises(ValueError, match="Unknown strategy_id 'no_such_strategy'"):
        resolve_saved_strategy_config(saved_config)


def test_inline_configs_take_their_metadata_from_the_recipe() -> None:
    resolved = resolve_inline_strategy_config(
        config_id="adhoc",
        strategy_id=STRATEGY_DCA_CLASSIC,
        params={},
    )

    assert resolved.saved_config_id == "adhoc"
    assert resolved.request_config_id == "adhoc"
    assert resolved.display_name == "adhoc"
    assert resolved.description is not None
    assert resolved.primary_asset == "BTC"
    assert resolved.supports_daily_suggestion is False


def test_a_registered_recipe_saved_config_runs_through_the_compare_engine(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    register_mock_recipe(monkeypatch, strategy_id="mock_recipe_family")
    saved_config = SavedStrategyConfig(
        config_id="mock_recipe_saved",
        display_name="Mock Recipe",
        strategy_id="mock_recipe_family",
    )
    resolved = replace(
        resolve_saved_strategy_config(saved_config),
        request_config_id="mock_recipe_saved",
    )
    day = date(2025, 1, 10)
    request = BacktestCompareRequestV3(
        token_symbol="BTC",
        start_date=day,
        end_date=day,
        total_capital=10_000.0,
        configs=[
            BacktestCompareConfigV3(
                config_id="mock_recipe_saved",
                saved_config_id=saved_config.config_id,
            )
        ],
    )

    response = run_compare_v3_on_data(
        prices=[
            {"date": date(2025, 1, 9), "price": 99_500.0},
            {"date": day, "price": 100_000.0},
        ],
        sentiments={},
        request=request,
        user_start_date=day,
        resolved_configs=[resolved],
    )

    state = response.timeline[0].strategies["mock_recipe_saved"]
    assert state.decision.reason == "mock_hold"
    assert response.strategies["mock_recipe_saved"].parameters == {}
