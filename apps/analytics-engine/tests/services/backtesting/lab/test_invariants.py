from __future__ import annotations

from src.services.backtesting.lab.invariants import (
    MAX_EXAMPLES,
    STUCK_MIN_DAYS,
    check_invariants,
)
from tests.services.backtesting.lab.views import day, run

EXIT_RULES = {"cross_down_exit"}


def _by_name(days, lag=1):
    return {
        item.name: item
        for item in check_invariants(
            days, fill_lag_days=lag, cross_down_rule_ids=EXIT_RULES
        )
    }


def test_a_clean_history_breaks_nothing() -> None:
    results = _by_name(run(10, btc=0.5, stable=0.5))

    assert [item.count for item in results.values()] == [0] * 6
    assert [item.name for item in results.values()] == [
        "held_below_dma_days",
        "buys_below_dma",
        "proceeds_into_downtrend",
        "cooldown_blocked_exits",
        "stuck_in_stable",
        "weights_valid",
    ]


def test_only_a_broken_allocation_is_a_hard_failure() -> None:
    results = _by_name(run(3, btc=0.5, stable=0.5))

    assert {name for name, item in results.items() if item.hard} == {"weights_valid"}


def test_holding_below_the_average_is_counted_after_the_fill_lag() -> None:
    days = [
        day(0, btc=0.5, zones={"btc": "below"}),
        day(1, btc=0.5, zones={"btc": "below"}),
        day(2, btc=0.5, zones={"btc": "below"}),
    ]

    lag_one = _by_name(days, lag=1)["held_below_dma_days"]
    lag_zero = _by_name(days, lag=0)["held_below_dma_days"]

    # The first below-average day is the decision day; the fill is one day away.
    assert lag_one.count == 2
    assert lag_one.examples[0] == {"date": "2025-01-02", "assets": ["btc"]}
    assert lag_one.detail == {
        "by_asset": {"spy": 0, "btc": 2, "eth": 0},
        "fill_lag_days": 1,
    }
    assert lag_zero.count == 3


def test_a_recovery_restarts_the_below_streak() -> None:
    days = [
        day(0, btc=0.5, zones={"btc": "below"}),
        day(1, btc=0.5, zones={"btc": "above"}),
        day(2, btc=0.5, zones={"btc": "below"}),
    ]

    assert _by_name(days)["held_below_dma_days"].count == 0


def test_a_small_position_is_not_holding() -> None:
    days = run(4, btc=0.005, zones={"btc": "below"})

    assert _by_name(days)["held_below_dma_days"].count == 0


def test_examples_are_capped() -> None:
    days = run(30, btc=0.5, zones={"btc": "below"})

    result = _by_name(days)["held_below_dma_days"]

    assert result.count == 29
    assert len(result.examples) == MAX_EXAMPLES


def test_buying_an_asset_that_is_below_its_average() -> None:
    days = [
        day(0, transfers=(("stable", "btc", 100.0),), zones={"btc": "below"}),
        day(1, transfers=(("stable", "eth", 100.0),), zones={"btc": "below"}),
        day(2, transfers=(("btc", "stable", 100.0),), zones={"btc": "below"}),
    ]

    result = _by_name(days)["buys_below_dma"]

    assert result.count == 1
    assert result.examples == ({"date": "2025-01-01", "into": ["btc"]},)


def test_funding_a_downtrend_buy_by_selling_another_risk_asset() -> None:
    days = [
        day(0, transfers=(("btc", "spy", 50.0),), zones={"spy": "below"}),
        day(1, transfers=(("stable", "spy", 50.0),), zones={"spy": "below"}),
    ]

    funded = _by_name(days)["proceeds_into_downtrend"]

    assert funded.count == 1
    assert funded.examples == ({"date": "2025-01-01", "moves": ["btc->spy"]},)
    assert _by_name(days)["buys_below_dma"].count == 2


def test_a_cooldown_that_held_back_an_exit() -> None:
    skip = {"cooldown_skipped_rules": [{"rule": "cross_down_exit"}]}
    other = {"cooldown_skipped_rules": [{"rule": "dma_overextension_dca_sell"}]}
    days = [
        day(0, details=skip),
        day(1, details=other),
        day(2, details={"cooldown_skipped_rules": ["not-an-entry"]}),
        day(3),
    ]

    result = _by_name(days)["cooldown_blocked_exits"]

    assert result.count == 1
    assert result.examples == ({"date": "2025-01-01", "rules": ["cross_down_exit"]},)


def test_sitting_in_cash_while_an_asset_is_above_its_average() -> None:
    long_run = run(STUCK_MIN_DAYS, stable=1.0)
    short_run = run(STUCK_MIN_DAYS - 1, start=STUCK_MIN_DAYS + 1, stable=1.0)
    days = [*long_run, day(STUCK_MIN_DAYS, btc=0.5), *short_run]

    result = _by_name(days)["stuck_in_stable"]

    assert result.count == STUCK_MIN_DAYS
    assert result.examples == (
        {"start": "2025-01-01", "end": "2025-01-30", "days": STUCK_MIN_DAYS},
    )
    assert result.detail == {"longest_run": STUCK_MIN_DAYS, "min_days": STUCK_MIN_DAYS}


def test_cash_while_everything_is_below_its_average_is_not_stuck() -> None:
    days = run(
        60,
        stable=1.0,
        zones={"spy": "below", "btc": "below", "eth": "below"},
    )

    assert _by_name(days)["stuck_in_stable"].count == 0


def test_no_days_means_no_findings() -> None:
    result = _by_name([])

    assert result["stuck_in_stable"].detail["longest_run"] == 0
    assert all(item.count == 0 for item in result.values())


def test_a_broken_allocation_is_reported() -> None:
    days = [
        day(0, btc=0.5, stable=0.5),
        day(1, btc=0.7, stable=0.5),
        day(2, btc=1.2, stable=-0.2),
    ]

    result = _by_name(days)["weights_valid"]

    assert result.count == 2
    assert result.examples[0] == {"date": "2025-01-02", "sum": 1.2}


def test_results_serialize_with_their_detail() -> None:
    result = _by_name(run(3, btc=0.5, zones={"btc": "below"}))["held_below_dma_days"]

    dumped = result.as_dict()

    assert dumped["name"] == "held_below_dma_days"
    assert dumped["hard"] is False
    assert dumped["count"] == result.count
    assert dumped["examples"] == list(result.examples)
    assert dumped["fill_lag_days"] == 1
