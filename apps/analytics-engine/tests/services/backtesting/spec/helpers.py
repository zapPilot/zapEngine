"""Shared fixtures-as-functions for the strategy spec tests."""

from __future__ import annotations

import copy
import json
from collections.abc import Mapping
from typing import Any

from src.services.backtesting.portfolio_rules import DEFAULT_PORTFOLIO_RULE_NAMES
from src.services.backtesting.spec import StrategySpec
from src.services.backtesting.spec.loader import STRATEGIES_DIR
from src.services.backtesting.spec.validation import (
    SpecError,
    SpecIssue,
    parse_spec,
)

REFERENCE_REF = "reference/dma_fgi"
REFERENCE_PATH = STRATEGIES_DIR / f"{REFERENCE_REF}.json"
Path = tuple[str | int, ...]


def reference_raw() -> dict[str, Any]:
    """The committed reference spec as plain JSON, safe to mutate."""
    raw: dict[str, Any] = json.loads(REFERENCE_PATH.read_text())
    return copy.deepcopy(raw)


def with_value(raw: dict[str, Any], path: Path, value: Any) -> dict[str, Any]:
    """``raw`` with the value at ``path`` replaced."""
    target: Any = raw
    for part in path[:-1]:
        target = target[part]
    target[path[-1]] = value
    return raw


def without(raw: dict[str, Any], path: Path) -> dict[str, Any]:
    """``raw`` with the key at ``path`` removed."""
    target: Any = raw
    for part in path[:-1]:
        target = target[part]
    del target[path[-1]]
    return raw


def issues_for(raw: dict[str, Any]) -> list[SpecIssue]:
    try:
        parse_spec(raw)
    except SpecError as error:
        return list(error.issues)
    return []


def rule_index(raw: dict[str, Any], kind: str) -> int:
    return next(
        index for index, rule in enumerate(raw["rules"]) if rule["kind"] == kind
    )


def _research_trim(signal: dict[str, Any]) -> dict[str, Any]:
    return {
        "kind": "technical_trim",
        "cooldown_days": 7,
        "sell_step": 0.05,
        "trigger": signal,
        "proceeds": {"to": [{"asset": "SPY", "share": 0.5}]},
    }


def _research_add(signal: dict[str, Any]) -> dict[str, Any]:
    return {
        "kind": "technical_add",
        "cooldown_days": 7,
        "buy_step": 0.05,
        "trigger": signal,
    }


# The twelve research rules of the old ``enabled_rules`` universe, as specs, in
# the order their priorities ranked them (after every default rule). Private: a
# test that mutated the shared dicts would break every test that ran after it.
_TECHNICAL_RULES: dict[str, dict[str, Any]] = {
    name: {"id": name, **rule}
    for name, rule in {
        "rsi_bearish_divergence_dca_sell": _research_trim(
            {"signal": "rsi_bearish_divergence"}
        ),
        "rsi_overbought_dca_sell": _research_trim(
            {"signal": "rsi_overbought_turning_down", "rsi_at_least": 70.0}
        ),
        "momentum_breakdown_dca_sell": _research_trim(
            {
                "signal": "momentum_breakdown",
                "short_momentum_below": 0.0,
                "long_momentum_above": 0.0,
            }
        ),
        "volatility_spike_dca_sell": _research_trim(
            {
                "signal": "volatility_spike",
                "thresholds": {"SPY": 0.30, "BTC": 0.80, "ETH": 1.00},
            }
        ),
        "rsi_bullish_divergence_dca_buy": _research_add(
            {"signal": "rsi_bullish_divergence"}
        ),
        "rsi_oversold_recovery_dca_buy": _research_add(
            {"signal": "rsi_oversold_recovering", "rsi_at_most": 35.0}
        ),
        "macd_bearish_cross_dca_sell": _research_trim({"signal": "macd_bearish_cross"}),
        "macd_bullish_cross_dca_buy": _research_add({"signal": "macd_bullish_cross"}),
        "bollinger_upper_band_dca_sell": _research_trim(
            {"signal": "bollinger_upper_band", "zscore_at_least": 2.0}
        ),
        "bollinger_lower_band_dca_buy": _research_add(
            {"signal": "bollinger_lower_band", "zscore_at_most": -2.0}
        ),
        "breakout_20d_dca_buy": _research_add({"signal": "breakout_20d"}),
        "breakdown_20d_dca_sell": _research_trim({"signal": "breakdown_20d"}),
    }.items()
}
SPY_LATCH = {"kind": "spy_latch", "id": "spy_latch", "follow_through_days": 14}


def technical_rules() -> dict[str, dict[str, Any]]:
    """The twelve research rules as spec JSON, a fresh copy safe to mutate."""
    return copy.deepcopy(_TECHNICAL_RULES)


def spec_for_params(params: Mapping[str, Any]) -> StrategySpec:
    """The spec equivalent to a saved config's public params.

    The old composition: ``enabled_rules`` (default rules when unset) minus
    ``disabled_rules`` picks rules out of the default and research universe, the
    trade quota limits become a guard, and the two greed multipliers become the
    trim rule's regime multipliers.
    """
    raw = reference_raw()
    enabled = params["enabled_rules"]
    active = set(DEFAULT_PORTFOLIO_RULE_NAMES if enabled is None else enabled)
    active -= set(params["disabled_rules"])
    universe = {rule["id"]: rule for rule in raw["rules"]} | technical_rules()
    raw["rules"] = [rule for name, rule in universe.items() if name in active]
    raw["overlays"] = [dict(SPY_LATCH)] if "spy_latch" in active else []
    quota = params["trade_quota"]
    if any(limit is not None for limit in quota.values()):
        raw["guards"] = [{"kind": "trade_quota", **quota}]
    greed = params["top_escape"]
    for rule in raw["rules"]:
        if rule["kind"] == "dma_overextension_trim":
            rule["fgi_multipliers"].update(
                greed=greed["overextension_threshold_multiplier_greed"],
                extreme_greed=greed["overextension_threshold_multiplier_extreme_greed"],
            )
    return parse_spec(raw)
