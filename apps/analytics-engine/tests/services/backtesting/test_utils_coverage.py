"""Tests for backtesting utils coverage."""

from __future__ import annotations

from datetime import UTC, date, datetime
from unittest.mock import Mock

import pytest

from src.services.backtesting import utils
from src.services.backtesting.response_utils import coerce_action, coerce_rule_group
from src.services.backtesting.strategies.base import (
    BaseStrategy,
    StrategyContext,
)
from src.services.backtesting.utils.coercion import coerce_to_date


def test_utils_init():
    """Import utils to cover __init__.py."""
    assert utils.__all__ == [
        "calculate_runtime_allocation",
        "coerce_to_date",
        "normalize_runtime_allocation",
        "sanitize_runtime_allocation",
    ]


# --- targeted coverage tests for coercion.py ---


def test_coerce_to_date_returns_none_for_invalid_inputs() -> None:
    assert coerce_to_date("not-a-date") is None
    assert coerce_to_date(None) is None


def test_coerce_to_date_accepts_datetime() -> None:
    assert coerce_to_date(datetime(2025, 1, 1, 12, tzinfo=UTC)) == date(2025, 1, 1)


def test_coerce_to_date_preserves_timestamp_slice() -> None:
    assert coerce_to_date("2025-01-01T12:34:56Z") == date(2025, 1, 1)


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


def test_strategy_context_features_property() -> None:
    """Line 108: StrategyContext.features accesses MarketFeatureSet."""
    mock_portfolio = Mock()
    ctx = StrategyContext(
        date=date(2025, 1, 1),
        price=50_000.0,
        sentiment=None,
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
        portfolio=mock_portfolio,
    )
    with pytest.raises(NotImplementedError):
        strategy.on_day(ctx)
