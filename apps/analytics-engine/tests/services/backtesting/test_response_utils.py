"""Tests for backtesting response_utils coercion helpers."""

from __future__ import annotations

from src.services.backtesting.response_utils import coerce_action, coerce_rule_group


def test_coerce_action_valid_buy() -> None:
    assert coerce_action("buy") == "buy"


def test_coerce_action_valid_sell() -> None:
    assert coerce_action("sell") == "sell"


def test_coerce_action_valid_hold() -> None:
    assert coerce_action("hold") == "hold"


def test_coerce_action_invalid_returns_hold() -> None:
    assert coerce_action("unknown") == "hold"


def test_coerce_rule_group_valid() -> None:
    result = coerce_rule_group("dma_fgi")
    assert result == "dma_fgi"


def test_coerce_rule_group_invalid_returns_none() -> None:
    assert coerce_rule_group("invalid_group") == "none"
