from __future__ import annotations

import math

from src.services.backtesting.signals.dma_gated_fgi.utils import (
    extract_fgi_value,
    extract_non_negative_numeric,
)


def test_extract_non_negative_numeric_returns_none_when_missing() -> None:
    assert extract_non_negative_numeric({}, "dma_200") is None


def test_extract_non_negative_numeric_returns_none_for_non_numeric_value() -> None:
    assert extract_non_negative_numeric({"dma_200": "oops"}, "dma_200") is None


def test_extract_non_negative_numeric_returns_none_for_nan_value() -> None:
    assert extract_non_negative_numeric({"dma_200": math.nan}, "dma_200") is None


def test_extract_non_negative_numeric_returns_none_for_infinite_value() -> None:
    assert extract_non_negative_numeric({"dma_200": math.inf}, "dma_200") is None


def test_extract_non_negative_numeric_clamps_negative_value_to_zero() -> None:
    assert extract_non_negative_numeric({"dma_200": -1.0}, "dma_200") == 0.0


def test_extract_non_negative_numeric_returns_float_for_valid_value() -> None:
    assert extract_non_negative_numeric({"dma_200": 42}, "dma_200") == 42.0


def test_extract_fgi_value_returns_none_when_sentiment_missing() -> None:
    assert extract_fgi_value(None) is None


def test_extract_fgi_value_returns_none_when_value_missing() -> None:
    assert extract_fgi_value({"label": "fear"}) is None


def test_extract_fgi_value_returns_none_for_invalid_numeric_value() -> None:
    assert extract_fgi_value({"value": "invalid"}) is None


def test_extract_fgi_value_returns_none_for_nan_or_inf() -> None:
    assert extract_fgi_value({"value": math.nan}) is None
    assert extract_fgi_value({"value": math.inf}) is None


def test_extract_fgi_value_clamps_to_valid_range() -> None:
    assert extract_fgi_value({"value": -10}) == 0.0
    assert extract_fgi_value({"value": 110}) == 100.0
