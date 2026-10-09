from __future__ import annotations

from datetime import date, timedelta

import pytest

from src.services.backtesting.features import (
    DMA_200_FEATURE,
    ETH_DMA_200_FEATURE,
    MACRO_FEAR_GREED_FEATURE,
    SPY_DMA_200_FEATURE,
)
from src.services.backtesting.lab.synthetic import (
    DMA_WINDOW,
    SCENARIOS,
    WARMUP_ROWS,
    synthetic_market,
)


def test_same_seed_is_bit_identical_and_other_seeds_differ() -> None:
    first = synthetic_market(seed=7, days=60)
    again = synthetic_market(seed=7, days=60)
    other = synthetic_market(seed=8, days=60)

    assert first.prices == again.prices
    assert first.sentiments == again.sentiments
    assert first.prices != other.prices


@pytest.mark.parametrize("scenario", SCENARIOS)
def test_rows_have_the_engine_input_shape(scenario: str) -> None:
    market = synthetic_market(seed=1, days=50, scenario=scenario)  # type: ignore[arg-type]

    assert len(market.prices) == WARMUP_ROWS + 50
    assert market.prices[WARMUP_ROWS]["date"] == market.user_start_date
    dates = [row["date"] for row in market.prices]
    assert dates == [dates[0] + timedelta(days=i) for i in range(len(dates))]
    assert set(market.sentiments) == set(dates)
    for row in market.prices:
        assert row["price"] == row["prices"]["btc"]
        assert set(row["prices"]) == {"btc", "eth", "spy"}
        assert all(price > 0 for price in row["prices"].values())
        assert MACRO_FEAR_GREED_FEATURE in row["extra_data"]


def test_dma_features_are_trailing_200_row_means() -> None:
    market = synthetic_market(seed=3, days=260)
    last = len(market.prices) - 1
    window = slice(last - DMA_WINDOW + 1, last + 1)

    def trailing_mean(values: list[float]) -> float:
        return sum(values[window]) / DMA_WINDOW

    rows = market.prices
    assert rows[last]["extra_data"][DMA_200_FEATURE] == pytest.approx(
        trailing_mean([row["price"] for row in rows]), rel=1e-9
    )
    assert rows[last]["extra_data"][ETH_DMA_200_FEATURE] == pytest.approx(
        trailing_mean([row["prices"]["eth"] for row in rows]), rel=1e-9
    )
    assert rows[last]["extra_data"][SPY_DMA_200_FEATURE] == pytest.approx(
        trailing_mean([row["prices"]["spy"] for row in rows]), rel=1e-9
    )


def test_spy_does_not_move_on_weekends() -> None:
    market = synthetic_market(seed=5, days=60)
    rows = {row["date"]: row for row in market.prices}
    weekend = [d for d in rows if d.weekday() >= 5 and d - timedelta(days=1) in rows]

    assert weekend
    for day in weekend:
        previous = rows[day - timedelta(days=1)]
        assert rows[day]["prices"]["spy"] == previous["prices"]["spy"]


def test_sentiment_labels_follow_value_buckets() -> None:
    market = synthetic_market(seed=2, days=400)
    seen = {entry["label"] for entry in market.sentiments.values()}
    value_ranges = {
        "extreme_fear": (0, 24),
        "fear": (25, 46),
        "neutral": (47, 53),
        "greed": (54, 74),
        "extreme_greed": (75, 100),
    }

    assert len(seen) >= 4
    for entry in market.sentiments.values():
        low, high = value_ranges[entry["label"]]
        assert low <= entry["value"] <= high


def test_stress_scenario_adds_scripted_shocks_and_data_gaps() -> None:
    plain = synthetic_market(seed=1, days=400, scenario="regimes")
    stress = synthetic_market(seed=1, days=400, scenario="stress")
    user_rows = {row["date"]: row for row in stress.prices}

    assert plain.prices != stress.prices
    touch_row = user_rows[stress.user_start_date + timedelta(days=45)]
    assert touch_row["extra_data"][DMA_200_FEATURE] == touch_row["price"]
    gap_row = user_rows[stress.user_start_date + timedelta(days=22)]
    assert ETH_DMA_200_FEATURE not in gap_row["extra_data"]
    after_gap = user_rows[stress.user_start_date + timedelta(days=30)]
    assert ETH_DMA_200_FEATURE in after_gap["extra_data"]


def test_stress_overlays_are_clipped_to_short_windows() -> None:
    market = synthetic_market(seed=4, days=10, scenario="stress")

    assert len(market.prices) == WARMUP_ROWS + 10


def test_custom_start_date_is_the_first_user_day() -> None:
    market = synthetic_market(seed=1, days=5, start=date(2030, 6, 1))

    assert market.user_start_date == date(2030, 6, 1)
    assert market.prices[WARMUP_ROWS]["date"] == date(2030, 6, 1)


def test_invalid_arguments_are_rejected() -> None:
    with pytest.raises(ValueError, match="days must be >= 1"):
        synthetic_market(seed=1, days=0)
    with pytest.raises(ValueError, match="unknown scenario"):
        synthetic_market(seed=1, scenario="chaos")  # type: ignore[arg-type]
