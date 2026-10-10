"""The review's queue (``ITERATION_PLAYBOOK.md``) stays writable.

The playbook lists seven edits to the reference as candidates. They are
hypotheses, and nothing here says any of them is good; what this pins is that
each one is a valid spec in today's vocabulary and runs, so a change to the
vocabulary cannot silently strand the queue.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

import pytest

from src.services.backtesting.lab.bundle import synthetic_bundle
from src.services.backtesting.lab.evaluate import EvalConfig, evaluate
from src.services.backtesting.spec import behavior_hash, load_spec, parse_spec
from tests.services.backtesting.spec.helpers import reference_raw, rule_index

Edit = Callable[[dict[str, Any]], None]


def _rule(raw: dict[str, Any], rule_id: str) -> dict[str, Any]:
    return next(rule for rule in raw["rules"] if rule["id"] == rule_id)


def _trend_guard(raw: dict[str, Any]) -> None:
    raw["overlays"].append(
        {
            "kind": "trend_guard",
            "id": "trend_guard",
            "mode": "force_exit",
            "below_dma_buffer": 0.02,
            "confirm_days": 3,
        }
    )


def _drop_fgi_downshift(raw: dict[str, Any]) -> None:
    raw["rules"] = [r for r in raw["rules"] if r["id"] != "fgi_downshift_dca_sell"]


def _one_ratio_rule(raw: dict[str, Any]) -> None:
    raw["rules"] = [r for r in raw["rules"] if r["id"] != "eth_btc_deviation_dca"]


def _no_stable_sweep(raw: dict[str, Any]) -> None:
    _rule(raw, "eth_btc_ratio_rotation")["cross_up"]["sources"] = ["BTC"]


def _proceeds_to_stable(raw: dict[str, Any]) -> None:
    _rule(raw, "dma_overextension_dca_sell")["proceeds"] = {"to": []}


def _relative_trims_with_a_rebuy(raw: dict[str, Any]) -> None:
    for rule_id in ("dma_overextension_dca_sell", "fgi_downshift_dca_sell"):
        _rule(raw, rule_id)["sizing"] = {"mode": "relative", "floor_weight": 0.1}
    raw["rules"].append(
        {
            "kind": "trend_dca_entry",
            "id": "trend_dca_entry",
            "cooldown_days": 7,
            "buy_step": 0.1,
            "max_weight": 0.34,
        }
    )


def _staged_entry(raw: dict[str, Any]) -> None:
    raw["rules"][rule_index(raw, "dma_cross_up_rebalance")] = {
        "kind": "trend_dca_entry",
        "id": "trend_dca_entry",
        "cooldown_days": 7,
        "buy_step": 0.1,
        "max_weight": 0.34,
    }


def _deploy_stable_on_cross_up(raw: dict[str, Any]) -> None:
    _rule(raw, "cross_up_equal_weight")["allocation"] = "deploy_stable"


def _per_asset_exit_cooldown(raw: dict[str, Any]) -> None:
    _rule(raw, "cross_down_exit")["cooldown_scope"] = "trigger_symbol"


QUEUE: dict[str, Edit] = {
    "trend_guard": _trend_guard,
    "drop_fgi_downshift": _drop_fgi_downshift,
    "one_ratio_rule": _one_ratio_rule,
    "no_stable_sweep": _no_stable_sweep,
    "proceeds_to_stable": _proceeds_to_stable,
    "relative_trims_with_a_rebuy": _relative_trims_with_a_rebuy,
    "staged_entry": _staged_entry,
    "deploy_stable_on_cross_up": _deploy_stable_on_cross_up,
    "per_asset_exit_cooldown": _per_asset_exit_cooldown,
}


@pytest.mark.parametrize("name", sorted(QUEUE))
def test_each_edit_of_the_queue_is_a_different_valid_strategy(name: str) -> None:
    raw = reference_raw()
    raw["id"] = name
    QUEUE[name](raw)

    candidate = parse_spec(raw)

    assert behavior_hash(candidate) != behavior_hash(load_spec("reference/dma_fgi"))


@pytest.mark.parametrize("name", sorted(QUEUE))
def test_each_edit_of_the_queue_runs(name: str) -> None:
    raw = reference_raw()
    raw["id"] = name
    QUEUE[name](raw)

    report = evaluate(
        parse_spec(raw),
        synthetic_bundle("synthetic:regimes?seed=1&days=200"),
        EvalConfig(leave_one_out=False, benchmarks=()),
        git=None,
    )

    assert report.body["strategies"]["strategy"]["final_value"] > 0
