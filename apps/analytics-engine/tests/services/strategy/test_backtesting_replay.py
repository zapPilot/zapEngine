"""BacktestingService.replay_model: the live suggestion's source of truth."""

from __future__ import annotations

import asyncio
from collections.abc import Callable
from datetime import date, timedelta
from typing import Any

import pytest

from scripts.attribution.sweep_production_window import (
    DEFAULT_TOTAL_CAPITAL,
    DEFAULT_WINDOW_DAYS,
    _window_start,
)
from src.config.strategy_presets import get_default_seed_strategy_config
from src.models.backtesting import BacktestCompareConfigV3, BacktestCompareRequestV3
from src.models.strategy_config import SavedStrategyConfig
from src.services.backtesting.constants import MODEL_TOTAL_CAPITAL, MODEL_WINDOW_DAYS
from src.services.backtesting.lab.synthetic import SyntheticMarket, synthetic_market
from src.services.exceptions import MarketDataUnavailableError
from src.services.strategy.backtesting_service import BacktestingService
from src.services.strategy.strategy_config_store import StrategyConfigStore
from tests.services.backtesting.support.synthetic_services import (
    SyntheticMarketServices,
)

CONFIG_ID = "dma_fgi_portfolio_rules_default"


@pytest.fixture(scope="module")
def market() -> SyntheticMarket:
    return synthetic_market(seed=2, scenario="stress", days=560)


def _counted_service(
    market: SyntheticMarket,
    *,
    store: StrategyConfigStore | None = None,
) -> tuple[BacktestingService, list[str]]:
    """A service over the synthetic market plus a log of price-history fetches."""
    services = SyntheticMarketServices(market)
    fetches: list[str] = []
    original: Callable[..., Any] = services.token_price_service.get_price_history

    def logged(**kwargs: Any) -> Any:
        fetches.append(str(kwargs["token_symbol"]))
        return original(**kwargs)

    services.token_price_service.get_price_history = logged  # type: ignore[assignment]
    service = services.build_backtesting_service()
    if store is not None:
        service.strategy_config_store = store  # type: ignore[assignment]
    return service, fetches


def _end(market: SyntheticMarket) -> date:
    return market.prices[-1]["date"]


def test_replay_covers_the_model_window_ending_on_the_requested_day(
    market: SyntheticMarket,
) -> None:
    service, _fetches = _counted_service(market)
    end = _end(market)

    replay = service.replay_model(CONFIG_ID, end)

    assert replay.config_id == CONFIG_ID
    assert replay.window.requested.end_date == end
    assert replay.window.requested.start_date == end - timedelta(
        days=MODEL_WINDOW_DAYS - 1
    )
    assert replay.window.requested.days == MODEL_WINDOW_DAYS - 1
    assert replay.window.truncated is False
    assert replay.market.date == end
    assert replay.data_freshness is not None
    assert replay.data_freshness.is_stale is False


def test_replay_window_is_the_one_the_published_snapshot_uses(
    market: SyntheticMarket,
) -> None:
    service, _fetches = _counted_service(market)
    end = _end(market)

    replay = service.replay_model(CONFIG_ID, end)

    assert DEFAULT_WINDOW_DAYS == MODEL_WINDOW_DAYS
    assert DEFAULT_TOTAL_CAPITAL == MODEL_TOTAL_CAPITAL
    assert replay.window.requested.start_date == _window_start(end, DEFAULT_WINDOW_DAYS)


def test_replay_is_the_last_bar_of_a_compare_over_the_same_window(
    market: SyntheticMarket,
) -> None:
    service, _fetches = _counted_service(market)
    end = _end(market)

    replay = service.replay_model(CONFIG_ID, end)
    compare = asyncio.run(
        service.run_compare_v3(
            BacktestCompareRequestV3(
                token_symbol="BTC",
                start_date=end - timedelta(days=MODEL_WINDOW_DAYS - 1),
                end_date=end,
                total_capital=MODEL_TOTAL_CAPITAL,
                configs=[
                    BacktestCompareConfigV3(
                        config_id=CONFIG_ID, saved_config_id=CONFIG_ID
                    )
                ],
            )
        )
    )

    last_bar = compare.timeline[-1]
    assert replay.market == last_bar.market
    assert replay.state == last_bar.strategies[CONFIG_ID]
    assert replay.traded == bool(last_bar.strategies[CONFIG_ID].execution.transfers)
    assert replay.window == compare.window


def test_replay_is_computed_once_and_shared_by_every_caller(
    market: SyntheticMarket,
) -> None:
    service, fetches = _counted_service(market)
    end = _end(market)

    first = service.replay_model(CONFIG_ID, end)
    fetched_once = len(fetches)
    second = service.replay_model(CONFIG_ID, end)

    assert fetched_once > 0
    assert len(fetches) == fetched_once
    assert second == first


def test_a_different_end_date_is_a_different_replay(market: SyntheticMarket) -> None:
    service, fetches = _counted_service(market)
    end = _end(market)

    service.replay_model(CONFIG_ID, end)
    fetched_once = len(fetches)
    earlier = service.replay_model(CONFIG_ID, end - timedelta(days=1))

    assert len(fetches) > fetched_once
    assert earlier.market.date == end - timedelta(days=1)


def test_changing_the_saved_config_invalidates_the_cached_replay(
    market: SyntheticMarket,
) -> None:
    class RelabeledStore(StrategyConfigStore):
        def resolve_config(self, config_id: str | None) -> SavedStrategyConfig:
            base = get_default_seed_strategy_config()
            return base.model_copy(update={"description": "tuned"})

    service, fetches = _counted_service(market)
    tuned_service, tuned_fetches = _counted_service(market, store=RelabeledStore())
    end = _end(market)

    service.replay_model(CONFIG_ID, end)
    fetched_by_default = len(fetches)
    tuned_service.replay_model(CONFIG_ID, end)

    assert fetched_by_default > 0
    assert len(tuned_fetches) > 0


def test_lagging_data_within_tolerance_is_served_and_flagged_stale(
    market: SyntheticMarket,
) -> None:
    service, _fetches = _counted_service(market)
    last_data_day = _end(market)

    replay = service.replay_model(CONFIG_ID, last_data_day + timedelta(days=3))

    assert replay.market.date == last_data_day
    assert replay.window.effective.end_date == last_data_day
    assert replay.data_freshness is not None
    assert replay.data_freshness.is_stale is True
    assert replay.data_freshness.max_lag_days == 3


def test_data_lagging_past_the_tolerance_is_unavailable(
    market: SyntheticMarket,
) -> None:
    service, _fetches = _counted_service(market)
    last_data_day = _end(market)

    with pytest.raises(MarketDataUnavailableError) as raised:
        service.replay_model(CONFIG_ID, last_data_day + timedelta(days=9))

    assert "7-day tolerance" in str(raised.value)
    assert raised.value.missing_assets == ["BTC"]
    assert raised.value.oldest_data_date == last_data_day


def test_an_unknown_config_is_rejected_before_any_data_is_fetched(
    market: SyntheticMarket,
) -> None:
    service, fetches = _counted_service(market)

    with pytest.raises(ValueError, match="Unknown config_id 'nope'"):
        service.replay_model("nope", _end(market))

    assert fetches == []
