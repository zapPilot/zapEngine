"""Shared response coercion helpers for backtesting surfaces."""

from __future__ import annotations

from typing import Any, cast, get_args

from src.models.backtesting import ActionType
from src.services.backtesting.decision import RuleGroup

_VALID_RULE_GROUPS = frozenset(get_args(RuleGroup))


def coerce_action(value: Any) -> ActionType:
    if value in {"buy", "sell", "hold"}:
        return cast(ActionType, value)
    return "hold"


def coerce_rule_group(value: Any) -> RuleGroup:
    if value in _VALID_RULE_GROUPS:
        return cast(RuleGroup, value)
    return "none"


def optional_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None
