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

History: 2026-10-09, honest defaults. Orders fill on the bar after the decision,
stablecoins earn a fixed 3% and crypto nothing (was the FGI-label table), so
every digest and final value moved while decisions kept their shape (trade
counts within 3 of the old ones, every default rule still fires).

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
            "final_value": 8851.4452,
            "rule_counts": {
                "cross_down_exit": 2,
                "cross_up_equal_weight": 7,
                "dma_overextension_dca_sell": 28,
                "eth_btc_ratio_rotation": 1,
                "fgi_downshift_dca_sell": 16,
                "regime_no_signal_hold": 346,
            },
            "digest": "e3ece577090216ddd9523a809e6c3f29d3b2f91bfac00663bc6c6c1d7e1b9afd",
        },
        DCA: {
            "trade_count": 400,
            "final_value": 8387.9753,
            "rule_counts": {"None": 400},
            "digest": "3d0a53b4e4c7d56f1e25ba2ebacd71d6d0112dd31909cc1cd171b533c1888c43",
        },
    },
    ("regimes", 2): {
        RULES: {
            "trade_count": 60,
            "final_value": 8396.7621,
            "rule_counts": {
                "cross_down_exit": 7,
                "cross_up_equal_weight": 8,
                "dma_overextension_dca_sell": 66,
                "eth_btc_ratio_rotation": 1,
                "fgi_downshift_dca_sell": 29,
                "regime_no_signal_hold": 289,
            },
            "digest": "491a121890186a70762b81e40ba0b28bc81be1f32b0935953d4e09bc66f88af8",
        },
        DCA: {
            "trade_count": 400,
            "final_value": 5041.7204,
            "rule_counts": {"None": 400},
            "digest": "1ef43e63128072ef9c5461504e4f885c8d402fed40322dd125fe64c430a76846",
        },
    },
    ("regimes", 3): {
        RULES: {
            "trade_count": 53,
            "final_value": 13300.7642,
            "rule_counts": {
                "cross_down_exit": 4,
                "cross_up_equal_weight": 5,
                "dma_overextension_dca_sell": 27,
                "eth_btc_ratio_rotation": 3,
                "fgi_downshift_dca_sell": 23,
                "regime_no_signal_hold": 338,
            },
            "digest": "f580bb48a619778af1261342770da1b3a4dd5f2c517251d67c6eeda7b5a144aa",
        },
        DCA: {
            "trade_count": 400,
            "final_value": 8139.0103,
            "rule_counts": {"None": 400},
            "digest": "0d465a460295181a2d8035af250952d1f306ba1dfc651195a3cbd018a2728f91",
        },
    },
    ("stress", 1): {
        RULES: {
            "trade_count": 46,
            "final_value": 9324.0633,
            "rule_counts": {
                "cross_down_exit": 2,
                "cross_up_equal_weight": 7,
                "dma_overextension_dca_sell": 22,
                "eth_btc_deviation_dca": 7,
                "eth_btc_ratio_rotation": 3,
                "fgi_downshift_dca_sell": 13,
                "regime_no_signal_hold": 346,
            },
            "digest": "138943ca3e07723b9c0a7e5d481750144ec603c083a8a70193a024222dd63740",
        },
        DCA: {
            "trade_count": 400,
            "final_value": 7603.2193,
            "rule_counts": {"None": 400},
            "digest": "93c28e2ac97cac7784dcaf925d139952ec98e1ef11f85dc0962e3a022d72f441",
        },
    },
    ("stress", 2): {
        RULES: {
            "trade_count": 71,
            "final_value": 12723.2733,
            "rule_counts": {
                "cross_down_exit": 5,
                "cross_up_equal_weight": 7,
                "dma_overextension_dca_sell": 69,
                "eth_btc_deviation_dca": 27,
                "eth_btc_ratio_rotation": 3,
                "fgi_downshift_dca_sell": 25,
                "regime_no_signal_hold": 264,
            },
            "digest": "b5e3382f2ebe3e0adb46bcbe71e98c7c122d5a0db52d780a78aff0b600338918",
        },
        DCA: {
            "trade_count": 400,
            "final_value": 4611.7927,
            "rule_counts": {"None": 400},
            "digest": "431fff92faed6afb5de25a41e910203deca3552256777db7566eec5caa4b9f51",
        },
    },
    ("stress", 3): {
        RULES: {
            "trade_count": 43,
            "final_value": 8933.2073,
            "rule_counts": {
                "cross_down_exit": 5,
                "cross_up_equal_weight": 7,
                "dma_overextension_dca_sell": 64,
                "eth_btc_deviation_dca": 5,
                "eth_btc_ratio_rotation": 3,
                "fgi_downshift_dca_sell": 18,
                "regime_no_signal_hold": 298,
            },
            "digest": "b8306ac427b99a4f5ce6fe478582531e0559ae620997ed668c5b5ae69fc0da36",
        },
        DCA: {
            "trade_count": 400,
            "final_value": 7545.3146,
            "rule_counts": {"None": 400},
            "digest": "5024c35fde3f760feb9a9b4e1bbd687581345d838ce0f55fab795654dae0eadd",
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
