"""Compare cache preserves exact results while rechecking current market inputs."""

import threading
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
from datetime import date, timedelta
from unittest.mock import MagicMock

import pytest

from src.config.strategy_presets import resolve_seed_strategy_config
from src.core.config import settings
from src.models.backtesting import (
    BacktestAssumptions,
    BacktestPeriodInfo,
    BacktestResponse,
)
from src.services.backtesting.execution.compare import run_compare_v3_on_data
from src.services.backtesting.execution.result_cache import (
    CompareResultCache,
    compare_result_key,
    compare_results,
)
from src.services.backtesting.spec import parse_spec
from src.services.backtesting.strategy_registry import (
    _resolve_recipe_config,
    resolve_saved_strategy_config,
    resolve_spec_strategy_config,
)
from src.services.dependencies import get_backtesting_service
from src.services.strategy.backtesting_service import (
    BacktestingService,
    PreparedBacktestMarketData,
)
from src.services.strategy.strategy_config_store import StrategyConfigStore
from tests.services.backtesting.spec.helpers import reference_raw, with_value
from tests.services.backtesting.support import compare_request, make_mock_recipe


def make_response(**fields) -> BacktestResponse:
    return BacktestResponse(
        strategies={}, timeline=[], assumptions=BacktestAssumptions(), **fields
    )


@pytest.fixture
def setup_cache(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "analytics_cache_enabled", True)
    service = BacktestingService(
        token_price_service=MagicMock(),
        sentiment_service=MagicMock(),
        strategy_config_store=StrategyConfigStore(),
        result_cache=CompareResultCache(max_entries=2),
    )
    period = BacktestPeriodInfo(
        start_date=date(2026, 1, 1), end_date=date(2026, 1, 3), days=3
    )
    prepared = PreparedBacktestMarketData(
        prices=[{"date": period.end_date, "price": 100.0}],
        sentiments={period.end_date: {"value": 50}},
        requested_window=period,
        effective_window=period,
        user_start_date=period.start_date,
    )
    service.prepare_market_window = MagicMock(return_value=prepared)  # type: ignore[method-assign]
    resolved = _resolve_recipe_config(
        make_mock_recipe(strategy_id="reference"),
        saved_config_id="reference",
        request_config_id="reference",
        display_name="Reference",
        description=None,
        primary_asset="BTC",
        supports_daily_suggestion=False,
    )
    runner = MagicMock(return_value=make_response())
    return service, prepared, resolved, runner


def run(service, resolved, runner, request=None):
    return service._run_with_prepared_data(
        request=request or compare_request(),
        resolved_configs=[resolved],
        runner=runner,
    )


def test_compare_reuses_result_and_defends_against_response_mutation(setup_cache):
    service, _, resolved, runner = setup_cache
    runner.side_effect = lambda **kwargs: make_response(window=kwargs["window"])

    first = run(service, resolved, runner)
    assert first.window is not None
    first.window = None
    second = run(service, resolved, runner)
    assert second.window is not None
    second.window = None
    third = run(service, resolved, runner)

    assert third.window is not None
    assert runner.call_count == 1
    assert service.prepare_market_window.call_count == 3


def test_compare_hit_equals_miss_for_a_real_engine_run(setup_cache):
    service, prepared, resolved, _ = setup_cache
    service.prepare_market_window.return_value = replace(
        prepared,
        prices=[
            {"date": date(2026, 1, 1) + timedelta(days=offset), "price": 100.0 + offset}
            for offset in range(3)
        ],
    )
    runner = MagicMock(wraps=run_compare_v3_on_data)

    miss = run(service, resolved, runner)
    hit = run(service, resolved, runner)

    assert runner.call_count == 1
    assert len(miss.timeline) == 3
    assert set(miss.strategies) == {"reference"}
    assert hit is not miss
    assert hit == miss
    assert hit.model_dump_json() == miss.model_dump_json()


def test_compare_recomputes_when_data_date_or_same_day_prices_change(setup_cache):
    service, prepared, resolved, runner = setup_cache
    runner.side_effect = lambda **kwargs: make_response(window=kwargs["window"])

    run(service, resolved, runner)
    service.prepare_market_window.return_value = replace(
        prepared, prices=[{"date": date(2026, 1, 3), "price": 101.0}]
    )
    run(service, resolved, runner)
    next_period = prepared.effective_window.model_copy(
        update={"end_date": date(2026, 1, 4)}
    )
    service.prepare_market_window.return_value = replace(
        prepared, effective_window=next_period
    )
    refreshed = run(service, resolved, runner)

    assert runner.call_count == 3
    assert refreshed.window.effective.end_date == date(2026, 1, 4)


def test_compare_entries_expire_after_the_ttl(setup_cache):
    service, _, resolved, runner = setup_cache
    service.result_cache = CompareResultCache(ttl=timedelta(seconds=-1))

    for _ in range(2):
        run(service, resolved, runner)

    assert runner.call_count == 2


def test_compare_cache_evicts_the_least_recently_used_entry(setup_cache):
    service, prepared, resolved, runner = setup_cache

    def run_at(price: float):
        service.prepare_market_window.return_value = replace(
            prepared, prices=[{"date": date(2026, 1, 3), "price": price}]
        )
        run(service, resolved, runner)

    for price in (101.0, 102.0, 103.0):
        run_at(price)
    assert runner.call_count == 3

    run_at(103.0)
    run_at(102.0)
    assert runner.call_count == 3

    run_at(101.0)
    assert runner.call_count == 4


def test_compare_cache_skips_results_over_the_entry_size_cap(setup_cache):
    service, _, resolved, runner = setup_cache
    service.result_cache = CompareResultCache(max_entry_bytes=1)

    for _ in range(2):
        assert run(service, resolved, runner) == runner.return_value

    assert runner.call_count == 2


def test_disabled_analytics_cache_restores_the_uncached_path(setup_cache, monkeypatch):
    service, _, resolved, runner = setup_cache
    monkeypatch.setattr(settings, "analytics_cache_enabled", False)

    responses = [run(service, resolved, runner) for _ in range(2)]

    assert runner.call_count == 2
    assert all(response is runner.return_value for response in responses)


def test_concurrent_identical_requests_compute_once_without_sharing_responses():
    cache = CompareResultCache()
    workers = 8
    started = threading.Barrier(workers)
    computed = []

    def compute() -> BacktestResponse:
        computed.append(threading.get_ident())
        # Keep the leader busy until every follower has reached the cache.
        time.sleep(0.3)
        return make_response()

    def request() -> BacktestResponse:
        started.wait(timeout=10)
        return cache.get_or_compute("shared-key", compute)

    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = [pool.submit(request) for _ in range(workers)]
        responses = [future.result(timeout=30) for future in futures]

    assert len(computed) == 1
    assert len({id(response) for response in responses}) == workers
    assert all(response == responses[0] for response in responses)


def test_dependency_provider_shares_the_process_wide_compare_cache():
    service = get_backtesting_service(
        token_price_service=MagicMock(),
        sentiment_service=MagicMock(),
        stock_price_service=MagicMock(),
        macro_fear_greed_service=MagicMock(),
    )

    assert isinstance(service, BacktestingService)
    assert service.result_cache is compare_results


def test_cache_key_tracks_the_request_its_assumptions_and_the_resolved_config(
    setup_cache,
):
    _, prepared, resolved, _ = setup_cache
    request = compare_request()

    def key(req=request, item=resolved):
        return compare_result_key(
            req, [item], prepared.prices, prepared.sentiments, prepared.window
        )

    original = key()
    assert original == key()
    assert original != key(req=request.model_copy(update={"total_capital": 20000}))
    assert original != key(req=compare_request(token_symbol="ETH"))
    assert original != key(
        req=request.model_copy(
            update={"assumptions": BacktestAssumptions(fill_lag_days=0)}
        )
    )
    assert original != key(
        item=replace(resolved, spec_ref="reference/other@1#0123456789ab")
    )
    assert original != key(item=replace(resolved, saved_config_id="other"))
    assert original != key(item=replace(resolved, display_name="Renamed"))
    assert original != key(item=replace(resolved, description="Edited"))


def test_cache_key_ignores_fields_that_cannot_change_the_result(setup_cache):
    _, prepared, resolved, _ = setup_cache

    def key(request):
        return compare_result_key(
            request, [resolved], prepared.prices, prepared.sentiments, prepared.window
        )

    original = key(compare_request())
    # The window resolved from start/end/days is keyed, not the raw request fields.
    assert original == key(compare_request(days=5))
    assert original == key(
        compare_request(start_date=date(2024, 1, 1), end_date=date(2024, 2, 1))
    )


def test_cache_key_tracks_market_inputs_and_spec_edits(setup_cache):
    _, prepared, resolved, _ = setup_cache
    request = compare_request()

    def key(item=resolved, prices=prepared.prices, sentiments=prepared.sentiments):
        return compare_result_key(request, [item], prices, sentiments, prepared.window)

    original = key()
    assert original == key(prices=list(prepared.prices))
    assert original != key(prices=[{"date": date(2026, 1, 3), "price": 100.5}])
    assert original != key(sentiments={date(2026, 1, 3): {"value": 51}})
    assert original != key(sentiments={})

    saved = resolve_seed_strategy_config("dma_fgi_portfolio_rules_default")
    unchanged = key(item=resolve_saved_strategy_config(saved))
    assert unchanged == key(item=resolve_saved_strategy_config(saved))

    def spec_key(raw):
        return key(
            item=resolve_spec_strategy_config(parse_spec(raw), config_id="candidate")
        )

    reference = spec_key(reference_raw())
    assert reference == spec_key(reference_raw())
    # A behavior edit moves the spec's hash, so a candidate never reads an older run.
    edited = with_value(reference_raw(), ("rules", 0, "cooldown_days"), 31)
    assert reference != spec_key(edited)
