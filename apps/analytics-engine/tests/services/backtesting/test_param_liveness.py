"""Every public strategy parameter must change a decision on some history.

Nine of the fifteen parameters this strategy once exposed changed nothing: any
value produced bit-identical backtests, and a search over them (and a log entry
about their "dose-response") was measuring sampler noise. This test makes that
impossible to repeat.

* ``LIVENESS_CASES`` must name every leaf of the public params model, so adding
  a parameter without proving it matters fails here.
* Each case perturbs one parameter away from its default and must change the
  per-day decision trace on at least one synthetic history.
"""

from __future__ import annotations

import copy
from functools import cache
from typing import Any

import pytest
from pydantic import BaseModel

from src.config.strategy_presets import resolve_seed_strategy_config
from src.services.backtesting.lab.synthetic import SyntheticMarket, synthetic_market
from src.services.backtesting.public_params import DmaGatedFgiPublicParams
from tests.services.backtesting.support.synthetic_runs import (
    DEFAULT_CONFIG_ID,
    golden_summary,
    run_synthetic_compare,
)

# Value to set at each leaf (dotted path into the nested public params).
LIVENESS_CASES: dict[str, Any] = {
    "trade_quota.min_trade_interval_days": 20,
    "trade_quota.max_trades_7d": 1,
    "trade_quota.max_trades_30d": 2,
    "top_escape.overextension_threshold_multiplier_greed": 1.0,
    "top_escape.overextension_threshold_multiplier_extreme_greed": 1.0,
    "disabled_rules": ["fgi_downshift_dca_sell"],
    "enabled_rules": ["cross_down_exit", "cross_up_equal_weight"],
}

HISTORIES = (("stress", 2), ("stress", 3), ("regimes", 1), ("regimes", 4))


def _leaf_paths(model: type[BaseModel], prefix: str = "") -> set[str]:
    paths: set[str] = set()
    for name, field in model.model_fields.items():
        annotation = field.annotation
        if isinstance(annotation, type) and issubclass(annotation, BaseModel):
            paths |= _leaf_paths(annotation, f"{prefix}{name}.")
        else:
            paths.add(f"{prefix}{name}")
    return paths


def _with_value(params: dict[str, Any], path: str, value: Any) -> dict[str, Any]:
    changed = copy.deepcopy(params)
    *sections, leaf = path.split(".")
    target = changed
    for section in sections:
        target = target[section]
    target[leaf] = value
    return changed


def _digest(market: SyntheticMarket, params: dict[str, Any]) -> str:
    response = run_synthetic_compare(market, params=params)
    return str(golden_summary(response, DEFAULT_CONFIG_ID)["digest"])


@cache
def _baseline_digest(scenario: str, seed: int) -> str:
    market = synthetic_market(seed=seed, scenario=scenario, days=400)  # type: ignore[arg-type]
    defaults = resolve_seed_strategy_config(DEFAULT_CONFIG_ID).params
    return _digest(market, defaults)


def test_every_public_parameter_has_a_liveness_case() -> None:
    assert set(LIVENESS_CASES) == _leaf_paths(DmaGatedFgiPublicParams)


@pytest.mark.parametrize("path", sorted(LIVENESS_CASES))
def test_parameter_changes_the_decision_trace(path: str) -> None:
    defaults = resolve_seed_strategy_config(DEFAULT_CONFIG_ID).params
    perturbed = _with_value(defaults, path, LIVENESS_CASES[path])

    for scenario, seed in HISTORIES:
        market = synthetic_market(seed=seed, scenario=scenario, days=400)  # type: ignore[arg-type]
        if _digest(market, perturbed) != _baseline_digest(scenario, seed):
            return

    pytest.fail(f"{path} changed no decision on any synthetic history")
