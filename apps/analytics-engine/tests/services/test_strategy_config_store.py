from __future__ import annotations

import pytest

from src.services.strategy.strategy_config_store import StrategyConfigStore


def test_list_configs_returns_the_code_owned_seeds() -> None:
    configs = StrategyConfigStore().list_configs()

    assert [config.config_id for config in configs] == [
        "dma_fgi_portfolio_rules_default",
        "dca_classic",
    ]


def test_resolve_config_without_an_id_returns_the_default() -> None:
    store = StrategyConfigStore()

    assert store.resolve_config(None).config_id == "dma_fgi_portfolio_rules_default"
    assert store.resolve_config("  ").config_id == "dma_fgi_portfolio_rules_default"


def test_resolve_config_by_id() -> None:
    config = StrategyConfigStore().resolve_config("dma_fgi_portfolio_rules_default")

    assert config.config_id == "dma_fgi_portfolio_rules_default"
    assert config.is_default is True


def test_resolve_config_tolerates_surrounding_whitespace() -> None:
    config = StrategyConfigStore().resolve_config(" dca_classic ")

    assert config.config_id == "dca_classic"


def test_resolve_config_raises_on_unknown_config_id() -> None:
    with pytest.raises(
        ValueError,
        match=(
            "Unknown config_id 'nonexistent'. Valid values: "
            "dca_classic, dma_fgi_portfolio_rules_default"
        ),
    ):
        StrategyConfigStore().resolve_config("nonexistent")


def test_the_store_serves_copies_so_callers_cannot_mutate_the_seeds() -> None:
    store = StrategyConfigStore()
    first = store.resolve_config(None)
    first.params["top_escape"]["overextension_threshold_multiplier_greed"] = 99.0

    again = store.resolve_config(None)

    assert again.params["top_escape"]["overextension_threshold_multiplier_greed"] == 0.5
