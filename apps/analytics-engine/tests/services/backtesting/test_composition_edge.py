"""Tests for composition.py edge cases."""

from __future__ import annotations

import pytest

from src.models.strategy_config import SavedStrategyConfig, StrategyComposition
from src.services.backtesting.composition import (
    _require_component_ref,
    resolve_saved_strategy_config,
)
from src.services.backtesting.composition_catalog import (
    StrategyFamilySpec,
    get_default_composition_catalog,
)


def test_require_component_ref_none_raises() -> None:
    """Line 56: None ref raises ValueError."""
    with pytest.raises(ValueError, match="Saved config is missing signal"):
        _require_component_ref(None, field_name="signal")


def test_resolve_saved_strategy_config_benchmark_missing_builder() -> None:
    """Line 113: benchmark family with no builder raises ValueError."""
    family = StrategyFamilySpec(
        strategy_id="test_bench",
        composition_kind="benchmark",
        mutable_via_admin=False,
        benchmark_strategy_builder_factory=None,
    )
    catalog = get_default_composition_catalog().with_extensions(
        strategy_families={"test_bench": family},
    )
    saved_config = SavedStrategyConfig(
        config_id="test_bench_config",
        display_name="Test Bench",
        strategy_id="test_bench",
        composition=StrategyComposition(kind="benchmark"),
    )
    with pytest.raises(ValueError, match="missing a benchmark builder"):
        resolve_saved_strategy_config(saved_config, catalog=catalog)
