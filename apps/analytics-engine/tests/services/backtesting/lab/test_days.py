from __future__ import annotations

from datetime import date

import pytest

from src.services.backtesting.lab.days import RISK_ASSETS, day_views, zones_for
from src.services.backtesting.lab.synthetic import synthetic_market
from tests.services.backtesting.support.synthetic_runs import run_synthetic_compare


def _row(**overrides):
    row = {
        "date": date(2025, 1, 1),
        "price": 100.0,
        "prices": {"btc": 100.0, "eth": 50.0, "spy": 400.0},
        "extra_data": {"dma_200": 90.0, "eth_dma_200": 60.0, "spy_dma_200": 400.0},
    }
    row.update(overrides)
    return row


def test_zones_compare_each_price_with_its_own_average() -> None:
    assert zones_for(_row()) == {"spy": "at", "btc": "above", "eth": "below"}


def test_the_btc_price_falls_back_to_the_rows_primary_price() -> None:
    row = _row(prices={"eth": 50.0, "spy": 400.0})

    assert zones_for(row)["btc"] == "above"


@pytest.mark.parametrize(
    "extra",
    [
        {"dma_200": None, "eth_dma_200": 60.0, "spy_dma_200": 400.0},
        {"dma_200": 0.0, "eth_dma_200": 60.0, "spy_dma_200": 400.0},
        {"dma_200": True, "eth_dma_200": 60.0, "spy_dma_200": 400.0},
        {"eth_dma_200": 60.0, "spy_dma_200": 400.0},
    ],
)
def test_a_missing_or_unusable_average_has_no_zone(extra: dict) -> None:
    assert zones_for(_row(extra_data=extra))["btc"] is None


def test_a_row_with_nothing_has_no_zones() -> None:
    assert zones_for({}) == dict.fromkeys(RISK_ASSETS)


def test_a_response_becomes_one_view_per_recorded_day() -> None:
    market = synthetic_market(seed=1, days=120)
    response = run_synthetic_compare(market)
    strategy_id = next(iter(response.strategies))

    views = day_views(response, strategy_id, market.prices)

    assert len(views) == len(response.timeline) == 120
    first = views[0]
    assert first.date == response.timeline[0].market.date
    assert set(first.weights) == {"btc", "eth", "spy", "stable", "alt"}
    assert abs(sum(first.weights.values()) - 1.0) < 1e-9
    assert set(first.zones) == set(RISK_ASSETS)
    assert any(view.transfers for view in views)
    assert all(isinstance(view.details, dict) for view in views)
