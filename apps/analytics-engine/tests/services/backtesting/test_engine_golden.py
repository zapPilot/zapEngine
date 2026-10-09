"""DSN-free golden test: pins compare-engine behavior on synthetic markets.

The snapshot gate (`sweep_production_window.py --check`) needs production data
and a read-only DSN, so a refactor that is meant to be behavior-neutral cannot
be proven neutral without them. This test pins the same engine path on
deterministic synthetic histories instead: per-day decisions, targets,
transfers and equity are hashed, so any drift in a rule, a cooldown or the
executor changes a digest.

An intentional behavior change (a new rule parameter default, honest fill
timing, ...) must update these values in the same commit, with the reason in
the commit message. Never edit a digest to silence a refactor.

To regenerate after an intentional change, run the loop at the bottom of this
module (``uv run python -m tests.services.backtesting.test_engine_golden``)
and paste the printed dictionary.
"""

from __future__ import annotations

import asyncio
import pprint
from typing import Any

import pytest

from src.models.backtesting import (
    BacktestCompareConfigV3,
    BacktestCompareRequestV3,
    BacktestResponse,
)
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
DAYS = 400

GOLDEN: dict[tuple[str, int], dict[str, dict[str, Any]]] = {
    ("regimes", 1): {
        RULES: {
            "trade_count": 38,
            "final_value": 9507.1248,
            "rule_counts": {
                "cross_down_exit": 2,
                "cross_up_equal_weight": 7,
                "dma_overextension_dca_sell": 28,
                "eth_btc_ratio_rotation": 1,
                "fgi_downshift_dca_sell": 16,
                "regime_no_signal_hold": 346,
            },
            "digest": "db40aa0463404a238c7a037fca4dd7bf0e0c39f884f887713d3993bf70bc2499",
        },
        DCA: {
            "trade_count": 400,
            "final_value": 8932.3122,
            "rule_counts": {"None": 400},
            "digest": "0e5c8333f23c59c4fe2a773e20ccb1a82418c486135383a7902f43902aba2d78",
        },
    },
    ("regimes", 2): {
        RULES: {
            "trade_count": 60,
            "final_value": 8940.1224,
            "rule_counts": {
                "cross_down_exit": 7,
                "cross_up_equal_weight": 8,
                "dma_overextension_dca_sell": 66,
                "eth_btc_ratio_rotation": 1,
                "fgi_downshift_dca_sell": 29,
                "regime_no_signal_hold": 289,
            },
            "digest": "795d2e9f6719ec2d29b3addc9c634a8ac8204a7e5e77f6e797d386c28c82143a",
        },
        DCA: {
            "trade_count": 400,
            "final_value": 5465.1352,
            "rule_counts": {"None": 400},
            "digest": "a8b29ec341f49f21e9ca0d26e993577f0f6bd9913161387fe737f3e652f67872",
        },
    },
    ("regimes", 3): {
        RULES: {
            "trade_count": 54,
            "final_value": 14743.3102,
            "rule_counts": {
                "cross_down_exit": 4,
                "cross_up_equal_weight": 5,
                "dma_overextension_dca_sell": 27,
                "eth_btc_ratio_rotation": 3,
                "fgi_downshift_dca_sell": 22,
                "regime_no_signal_hold": 339,
            },
            "digest": "6a6e58278ba196e3ff5d9ebaf4019b4d71f705a3fed815eb9484986466b64fc1",
        },
        DCA: {
            "trade_count": 400,
            "final_value": 8561.5339,
            "rule_counts": {"None": 400},
            "digest": "d23e84a20cc929c988a855987afbaafab182294c001726067667b256ce76af0b",
        },
    },
    ("stress", 1): {
        RULES: {
            "trade_count": 46,
            "final_value": 10433.1729,
            "rule_counts": {
                "cross_down_exit": 2,
                "cross_up_equal_weight": 7,
                "dma_overextension_dca_sell": 22,
                "eth_btc_deviation_dca": 7,
                "eth_btc_ratio_rotation": 3,
                "fgi_downshift_dca_sell": 13,
                "regime_no_signal_hold": 346,
            },
            "digest": "fc326fe6f55eff0954a2e84ce42facbe1687d7ed0077ff050bfe1c85187ef9e2",
        },
        DCA: {
            "trade_count": 400,
            "final_value": 8081.523,
            "rule_counts": {"None": 400},
            "digest": "830bb18aee130733bc134083805a321ce3335bb1f52a11ffc787800bc99b99fc",
        },
    },
    ("stress", 2): {
        RULES: {
            "trade_count": 74,
            "final_value": 13708.6201,
            "rule_counts": {
                "cross_down_exit": 5,
                "cross_up_equal_weight": 7,
                "dma_overextension_dca_sell": 71,
                "eth_btc_deviation_dca": 16,
                "eth_btc_ratio_rotation": 3,
                "fgi_downshift_dca_sell": 26,
                "regime_no_signal_hold": 272,
            },
            "digest": "c013f2a30327ad3197ac376eea9acb4ea48ba5a629b0aa3aa39a5bd2efd4ad1f",
        },
        DCA: {
            "trade_count": 400,
            "final_value": 5030.4434,
            "rule_counts": {"None": 400},
            "digest": "9cec120eb8e5f72a396c8881d43e0f7edb27e9b69c621ba79b49db466b429736",
        },
    },
    ("stress", 3): {
        RULES: {
            "trade_count": 43,
            "final_value": 8587.208,
            "rule_counts": {
                "cross_down_exit": 5,
                "cross_up_equal_weight": 7,
                "dma_overextension_dca_sell": 64,
                "eth_btc_deviation_dca": 5,
                "eth_btc_ratio_rotation": 3,
                "fgi_downshift_dca_sell": 18,
                "regime_no_signal_hold": 298,
            },
            "digest": "063248e197f95eafbb519612cb961a72d58b013b03fa78f500238e03ba233e32",
        },
        DCA: {
            "trade_count": 400,
            "final_value": 7952.3646,
            "rule_counts": {"None": 400},
            "digest": "8f8f05a4c1065c73310df82afbccaeab538ae730c4b27eb6d4a21a71e86a1888",
        },
    },
}


async def _compare_like_the_snapshot(market: SyntheticMarket) -> BacktestResponse:
    """Same request shape as the snapshot: inline strategy ids, empty params."""
    service = SyntheticMarketServices(market).build_backtesting_service()
    return await service.run_compare_v3(
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


async def _summaries(scenario: Scenario, seed: int) -> dict[str, dict[str, Any]]:
    market = synthetic_market(seed=seed, scenario=scenario, days=DAYS)
    response = await _compare_like_the_snapshot(market)
    return {strategy: golden_summary(response, strategy) for strategy in (RULES, DCA)}


@pytest.mark.parametrize(("scenario", "seed"), sorted(GOLDEN))
async def test_compare_engine_matches_golden(scenario: Scenario, seed: int) -> None:
    assert await _summaries(scenario, seed) == GOLDEN[(scenario, seed)]


def test_golden_runs_exercise_every_default_rule() -> None:
    """A golden that never fires a rule would pin nothing about that rule."""
    fired = {
        name for expected in GOLDEN.values() for name in expected[RULES]["rule_counts"]
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
        (scenario, seed): asyncio.run(_summaries(scenario, seed))
        for scenario, seed in sorted(GOLDEN)
    }
    pprint.pprint(refreshed, width=100, sort_dicts=False)
