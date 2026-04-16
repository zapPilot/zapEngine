"""Tests for backtesting utils coverage."""

from __future__ import annotations

from datetime import date
from unittest.mock import Mock

import pytest

from src.services.backtesting import utils
from src.services.backtesting.response_utils import coerce_action, coerce_rule_group
from src.services.backtesting.strategies.base import (
    BaseStrategy,
    DailyRecommendationInput,
    StrategyContext,
)
from src.services.backtesting.utils.coercion import (
    coerce_bool,
    coerce_float,
    coerce_int,
)


def test_utils_init():
    """Import utils to cover __init__.py."""
    assert utils.__all__ == [
        "calculate_runtime_allocation",
        "coerce_bool",
        "coerce_float",
        "coerce_float_list",
        "coerce_int",
        "coerce_nullable_int",
        "coerce_params",
        "coerce_to_date",
        "normalize_regime_label",
        "normalize_runtime_allocation",
        "sanitize_runtime_allocation",
    ]


# --- targeted coverage tests for coercion.py ---


def test_coerce_int_accepts_integer_valued_float() -> None:
    assert coerce_int(3.0, field_name="x") == 3


def test_coerce_int_rejects_non_integer_float() -> None:
    with pytest.raises(ValueError, match="must be an integer"):
        coerce_int(3.5, field_name="x")


def test_coerce_float_rejects_bool() -> None:
    with pytest.raises(ValueError, match="must be a number"):
        coerce_float(True, field_name="x")


def test_coerce_bool_rejects_non_bool() -> None:
    with pytest.raises(ValueError, match="must be a boolean"):
        coerce_bool(1, field_name="x")


# --- response_utils.py coverage (lines 13, 19) ---


def test_coerce_action_falls_back_to_hold_for_unknown_value() -> None:
    """Line 13: coerce_action returns 'hold' for unrecognised values."""
    assert coerce_action("unknown") == "hold"
    assert coerce_action(None) == "hold"
    assert coerce_action(42) == "hold"


def test_coerce_rule_group_falls_back_to_none_for_unknown_value() -> None:
    """Line 19: coerce_rule_group returns 'none' for unrecognised values."""
    assert coerce_rule_group("unknown") == "none"
    assert coerce_rule_group(None) == "none"


# --- strategies/base.py coverage (lines 80, 108, 133, 145) ---


def test_daily_recommendation_input_features_property() -> None:
    """Line 80: DailyRecommendationInput.features accesses MarketFeatureSet."""
    mock_portfolio = Mock()
    inp = DailyRecommendationInput(
        current_date=date(2025, 1, 1),
        price=50_000.0,
        portfolio=mock_portfolio,
        price_history=[50_000.0],
        sentiment_aggregates=[],
        current_sentiment=None,
        extra_data={"dma_200": 48_000.0},
    )
    features = inp.features
    assert features.indicators.dma_200 == pytest.approx(48_000.0)


def test_strategy_context_features_property() -> None:
    """Line 108: StrategyContext.features accesses MarketFeatureSet."""
    mock_portfolio = Mock()
    ctx = StrategyContext(
        date=date(2025, 1, 1),
        price=50_000.0,
        sentiment=None,
        price_history=[50_000.0],
        portfolio=mock_portfolio,
        extra_data={"dma_200": 47_000.0},
    )
    features = ctx.features
    assert features.indicators.dma_200 == pytest.approx(47_000.0)


def test_base_strategy_on_day_raises_not_implemented() -> None:
    """Line 133: BaseStrategy.on_day raises NotImplementedError."""
    strategy = BaseStrategy()
    mock_portfolio = Mock()
    ctx = StrategyContext(
        date=date(2025, 1, 1),
        price=50_000.0,
        sentiment=None,
        price_history=[],
        portfolio=mock_portfolio,
    )
    with pytest.raises(NotImplementedError):
        strategy.on_day(ctx)


def test_base_strategy_get_daily_recommendation_raises_not_implemented() -> None:
    """Line 145: BaseStrategy.get_daily_recommendation raises NotImplementedError."""
    strategy = BaseStrategy()
    mock_portfolio = Mock()
    inp = DailyRecommendationInput(
        current_date=date(2025, 1, 1),
        price=50_000.0,
        portfolio=mock_portfolio,
        price_history=[],
        sentiment_aggregates=[],
        current_sentiment=None,
    )
    with pytest.raises(NotImplementedError):
        strategy.get_daily_recommendation(inp)
