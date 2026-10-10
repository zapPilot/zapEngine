"""DSN-free golden test: pins compare-engine behavior on synthetic markets.

The snapshot gate (`sweep_production_window.py --check`) needs production data
and a read-only DSN, so a refactor that is meant to be behavior-neutral cannot
be proven neutral without them. This test pins the same engine path on
deterministic synthetic histories instead: per-day decisions, targets,
transfers and equity are hashed, so any drift in a rule, a cooldown or the
executor changes a digest.

The rule strategy is pinned in the golden file
(``tests/fixtures/strategy_specs/golden_traces.json``, written and checked by
``pnpm strategy-lab golden``), next to a spec that uses every kind the reference
does not. This test runs it the way the API does (inline strategy id, empty
params, through the backtesting service) and requires the same digests, so the
file the lab checks and the path production runs cannot disagree. The classic DCA
baseline is not spec-backed and keeps its pin here.

An intentional behavior change (a new rule parameter default, honest fill
timing, ...) must update the pins in the same commit, with the reason in the
commit message. Never edit a digest to silence a refactor.

History: 2026-10-09, honest defaults. Orders fill on the bar after the decision,
stablecoins earn a fixed 3% and crypto nothing (was the FGI-label table), so
every digest and final value moved while decisions kept their shape (trade
counts within 3 of the old ones, every default rule still fires).

To regenerate the DCA pin after an intentional change, run the loop at the
bottom of this module (``uv run python -m tests.services.backtesting.test_engine_golden``)
and paste the printed dictionary.
"""

from __future__ import annotations

import pprint
from typing import Any

import pytest

from src.models.backtesting import (
    BacktestCompareConfigV3,
    BacktestCompareRequestV3,
    BacktestResponse,
)
from src.services.backtesting.lab import golden
from src.services.backtesting.lab.synthetic import (
    Scenario,
    SyntheticMarket,
    synthetic_market,
)
from tests.services.backtesting.support.synthetic_runs import (
    TOTAL_CAPITAL,
    golden_summary,
)
from tests.services.backtesting.support.synthetic_services import (
    SyntheticMarketServices,
)

RULES = "dma_fgi_portfolio_rules"
DCA = "dca_classic"
DAYS = golden.DAYS
REFERENCE = "reference/dma_fgi"
RULES_GOLDEN: dict[str, dict[str, Any]] = golden.read(golden.GOLDEN_PATH)[REFERENCE][
    "scenarios"
]

# The classic DCA baseline is not spec-backed, so its pin stays here. The rule
# strategy's pin is the golden file (`pnpm strategy-lab golden`).
DCA_GOLDEN: dict[tuple[str, int], dict[str, Any]] = {
    ("regimes", 1): {
        "trade_count": 400,
        "final_value": 8387.9753,
        "rule_counts": {"None": 400},
        "digest": "3d0a53b4e4c7d56f1e25ba2ebacd71d6d0112dd31909cc1cd171b533c1888c43",
    },
    ("regimes", 2): {
        "trade_count": 400,
        "final_value": 5041.7204,
        "rule_counts": {"None": 400},
        "digest": "1ef43e63128072ef9c5461504e4f885c8d402fed40322dd125fe64c430a76846",
    },
    ("regimes", 3): {
        "trade_count": 400,
        "final_value": 8139.0103,
        "rule_counts": {"None": 400},
        "digest": "0d465a460295181a2d8035af250952d1f306ba1dfc651195a3cbd018a2728f91",
    },
    ("stress", 1): {
        "trade_count": 400,
        "final_value": 7603.2193,
        "rule_counts": {"None": 400},
        "digest": "93c28e2ac97cac7784dcaf925d139952ec98e1ef11f85dc0962e3a022d72f441",
    },
    ("stress", 2): {
        "trade_count": 400,
        "final_value": 4611.7927,
        "rule_counts": {"None": 400},
        "digest": "431fff92faed6afb5de25a41e910203deca3552256777db7566eec5caa4b9f51",
    },
    ("stress", 3): {
        "trade_count": 400,
        "final_value": 7545.3146,
        "rule_counts": {"None": 400},
        "digest": "5024c35fde3f760feb9a9b4e1bbd687581345d838ce0f55fab795654dae0eadd",
    },
}


def _compare_like_the_snapshot(market: SyntheticMarket) -> BacktestResponse:
    """Same request shape as the snapshot: inline strategy ids, empty params."""
    service = SyntheticMarketServices(market).build_backtesting_service()
    return service.run_compare_v3(
        BacktestCompareRequestV3(
            token_symbol="BTC",
            start_date=market.user_start_date,
            end_date=market.prices[-1]["date"],
            total_capital=TOTAL_CAPITAL,
            configs=[
                BacktestCompareConfigV3(config_id=strategy, strategy_id=strategy)
                for strategy in (RULES, DCA)
            ],
        )
    )


def _summaries(scenario: Scenario, seed: int) -> dict[str, dict[str, Any]]:
    market = synthetic_market(seed=seed, scenario=scenario, days=DAYS)
    response = _compare_like_the_snapshot(market)
    return {strategy: golden_summary(response, strategy) for strategy in (RULES, DCA)}


@pytest.mark.parametrize(("scenario", "seed"), sorted(DCA_GOLDEN))
def test_compare_engine_matches_golden(scenario: Scenario, seed: int) -> None:
    summaries = _summaries(scenario, seed)

    assert summaries[RULES] == RULES_GOLDEN[golden.scenario_key(scenario, seed)]
    assert summaries[DCA] == DCA_GOLDEN[(scenario, seed)]


def test_the_golden_file_pins_the_reference_as_it_stands() -> None:
    from src.services.backtesting.spec import behavior_hash, load_spec

    recorded = golden.read(golden.GOLDEN_PATH)[REFERENCE]

    assert recorded["behavior_hash"] == behavior_hash(load_spec(REFERENCE))
    assert sorted(RULES_GOLDEN) == [
        golden.scenario_key(scenario, seed) for scenario, seed in sorted(DCA_GOLDEN)
    ]


def test_golden_runs_exercise_every_default_rule() -> None:
    """A golden that never fires a rule would pin nothing about that rule."""
    fired = {
        name for expected in RULES_GOLDEN.values() for name in expected["rule_counts"]
    }
    assert fired == {
        "cross_down_exit",
        "cross_up_equal_weight",
        "dma_overextension_dca_sell",
        "eth_btc_deviation_dca",
        "eth_btc_ratio_rotation",
        "fgi_downshift_dca_sell",
        "regime_no_signal_hold",
    }


if __name__ == "__main__":  # pragma: no cover - regeneration helper
    refreshed = {
        (scenario, seed): _summaries(scenario, seed)[DCA]
        for scenario, seed in sorted(DCA_GOLDEN)
    }
    pprint.pprint(refreshed, width=100, sort_dicts=False)
