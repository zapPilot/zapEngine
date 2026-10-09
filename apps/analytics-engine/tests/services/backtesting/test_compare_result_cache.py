"""Compare cache preserves exact results while rechecking current market inputs."""

import threading
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
from datetime import date, timedelta
from unittest.mock import AsyncMock, MagicMock

import pytest

from src.config.strategy_presets import resolve_seed_strategy_config
from src.core.config import settings
from src.models.backtesting import BacktestPeriodInfo, BacktestResponse
from src.models.strategy_config import SavedStrategyConfig
from src.services.backtesting.composition import resolve_saved_strategy_config
from src.services.backtesting.execution.compare import run_compare_v3_on_data
from src.services.backtesting.execution.config import RegimeConfig
from src.services.backtesting.execution.result_cache import (
    CompareResultCache,
    compare_result_key,
    compare_results,
)
from src.services.dependencies import build_backtesting_service
from src.services.strategy.backtesting_service import (
    BacktestingService,
    PreparedBacktestMarketData,
    _recipe_to_resolved_config,
)
from src.services.strategy.strategy_config_store import SeedStrategyConfigStore
from tests.services.backtesting.support import compare_request, make_mock_recipe


@pytest.fixture
def setup_cache(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "analytics_cache_enabled", True)
    service = BacktestingService(
        db=MagicMock(),
        token_price_service=MagicMock(),
        sentiment_service=MagicMock(),
        strategy_config_store=SeedStrategyConfigStore(),
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
    service._prepare_market_data = AsyncMock(return_value=prepared)
    resolved = _recipe_to_resolved_config(
        make_mock_recipe(strategy_id="reference"),
        saved_config_id="reference",
        request_config_id="reference",
        display_name="Reference",
        public_params={"signal": {"threshold": 1, "k": 2}},
    )
    runner = MagicMock(return_value=BacktestResponse(strategies={}, timeline=[]))
    return service, prepared, resolved, runner


async def run(service, resolved, runner, request=None):
    return await service._run_with_prepared_data(
        request=request or compare_request(),
        resolved_configs=[resolved],
        runner=runner,
        config=None,
    )


@pytest.mark.asyncio
async def test_compare_reuses_result_and_defends_against_response_mutation(setup_cache):
    service, _, resolved, runner = setup_cache

    first = await run(service, resolved, runner)
    first.decision_log_path = "caller-mutated"
    second = await run(service, resolved, runner)
    second.decision_log_path = "also-mutated"
    third = await run(service, resolved, runner)

    assert third.decision_log_path is None
    assert runner.call_count == 1
    assert service._prepare_market_data.call_count == 3


@pytest.mark.asyncio
async def test_compare_hit_equals_miss_for_a_real_engine_run(setup_cache):
    service, prepared, resolved, _ = setup_cache
    service._prepare_market_data.return_value = replace(
        prepared,
        prices=[
            {"date": date(2026, 1, 1) + timedelta(days=offset), "price": 100.0 + offset}
            for offset in range(3)
        ],
    )
    runner = MagicMock(wraps=run_compare_v3_on_data)

    miss = await run(service, resolved, runner)
    hit = await run(service, resolved, runner)

    assert runner.call_count == 1
    assert len(miss.timeline) == 3
    assert set(miss.strategies) == {"reference"}
    assert hit is not miss
    assert hit == miss
    assert hit.model_dump_json() == miss.model_dump_json()


@pytest.mark.asyncio
async def test_compare_recomputes_when_data_date_or_same_day_prices_change(setup_cache):
    service, prepared, resolved, runner = setup_cache
    runner.side_effect = lambda **kwargs: BacktestResponse(
        strategies={}, timeline=[], window=kwargs["window"]
    )

    await run(service, resolved, runner)
    service._prepare_market_data.return_value = replace(
        prepared, prices=[{"date": date(2026, 1, 3), "price": 101.0}]
    )
    await run(service, resolved, runner)
    next_period = prepared.effective_window.model_copy(
        update={"end_date": date(2026, 1, 4)}
    )
    service._prepare_market_data.return_value = replace(
        prepared, effective_window=next_period
    )
    refreshed = await run(service, resolved, runner)

    assert runner.call_count == 3
    assert refreshed.window.effective.end_date == date(2026, 1, 4)


@pytest.mark.asyncio
async def test_compare_entries_expire_after_the_ttl(setup_cache):
    service, _, resolved, runner = setup_cache
    service.result_cache = CompareResultCache(ttl=timedelta(seconds=-1))

    for _ in range(2):
        await run(service, resolved, runner)

    assert runner.call_count == 2


@pytest.mark.asyncio
async def test_artifact_requests_neither_read_nor_populate_the_cache(setup_cache):
    service, _, resolved, runner = setup_cache
    artifact = compare_request().model_copy(update={"emit_decision_log": True})

    for _ in range(2):
        await run(service, resolved, runner, artifact)
    assert runner.call_count == 2

    await run(service, resolved, runner)
    await run(service, resolved, runner)
    assert runner.call_count == 3

    await run(service, resolved, runner, artifact)
    assert runner.call_count == 4


@pytest.mark.asyncio
async def test_compare_cache_evicts_the_least_recently_used_entry(setup_cache):
    service, prepared, resolved, runner = setup_cache

    async def run_at(price: float):
        service._prepare_market_data.return_value = replace(
            prepared, prices=[{"date": date(2026, 1, 3), "price": price}]
        )
        await run(service, resolved, runner)

    for price in (101.0, 102.0, 103.0):
        await run_at(price)
    assert runner.call_count == 3

    await run_at(103.0)
    await run_at(102.0)
    assert runner.call_count == 3

    await run_at(101.0)
    assert runner.call_count == 4


@pytest.mark.asyncio
async def test_compare_cache_skips_results_over_the_entry_size_cap(setup_cache):
    service, _, resolved, runner = setup_cache
    service.result_cache = CompareResultCache(max_entry_bytes=1)

    for _ in range(2):
        assert await run(service, resolved, runner) == runner.return_value

    assert runner.call_count == 2


@pytest.mark.asyncio
async def test_disabled_analytics_cache_restores_the_uncached_path(
    setup_cache, monkeypatch
):
    service, _, resolved, runner = setup_cache
    monkeypatch.setattr(settings, "analytics_cache_enabled", False)

    responses = [await run(service, resolved, runner) for _ in range(2)]

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
        return BacktestResponse(strategies={}, timeline=[])

    def request() -> BacktestResponse:
        started.wait(timeout=10)
        return cache.get_or_compute("shared-key", compute)

    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = [pool.submit(request) for _ in range(workers)]
        responses = [future.result(timeout=30) for future in futures]

    assert len(computed) == 1
    assert len({id(response) for response in responses}) == workers
    assert all(response == responses[0] for response in responses)


def test_dependency_factory_shares_the_process_wide_compare_cache():
    assert build_backtesting_service(MagicMock()).result_cache is compare_results


def test_cache_key_normalizes_mapping_order_and_tracks_request_config_and_engine(
    setup_cache,
):
    _, prepared, resolved, _ = setup_cache
    request = compare_request()

    def key(req=request, item=resolved, config=None):
        return compare_result_key(
            req, [item], prepared.prices, prepared.sentiments, prepared.window, config
        )

    original = key()
    assert original == key(
        item=replace(resolved, public_params={"signal": {"k": 2, "threshold": 1}})
    )
    assert original != key(req=request.model_copy(update={"total_capital": 20000}))
    assert original != key(req=compare_request(token_symbol="ETH"))
    assert original != key(
        item=replace(resolved, cache_identity={"composition": "new"})
    )
    assert original != key(
        item=replace(resolved, public_params={"signal": {"threshold": 2}})
    )
    assert original != key(config=RegimeConfig(trading_slippage_percent=0.02))


def test_cache_key_ignores_fields_that_cannot_change_the_result(setup_cache):
    _, prepared, resolved, _ = setup_cache

    def key(request):
        return compare_result_key(
            request,
            [resolved],
            prepared.prices,
            prepared.sentiments,
            prepared.window,
            None,
        )

    original = key(compare_request())
    # The window resolved from start/end/days is keyed, not the raw request fields.
    assert original == key(compare_request(days=5))
    assert original == key(
        compare_request(start_date=date(2024, 1, 1), end_date=date(2024, 2, 1))
    )
    # An output directory only matters when a decision log is written.
    assert original == key(
        compare_request().model_copy(update={"decision_log_dir": "/tmp/artifacts"})
    )


def test_cache_key_tracks_market_inputs_and_saved_config_edits(setup_cache):
    _, prepared, resolved, _ = setup_cache
    request = compare_request()

    def key(item=resolved, prices=prepared.prices, sentiments=prepared.sentiments):
        return compare_result_key(
            request, [item], prices, sentiments, prepared.window, None
        )

    original = key()
    assert original == key(prices=list(prepared.prices))
    assert original != key(prices=[{"date": date(2026, 1, 3), "price": 100.5}])
    assert original != key(sentiments={date(2026, 1, 3): {"value": 51}})
    assert original != key(sentiments={})

    saved = resolve_seed_strategy_config("dma_fgi_portfolio_rules_default")
    edited = SavedStrategyConfig.model_validate(
        {**saved.model_dump(), "params": {**saved.params, "pacing": {"k": 6.0}}}
    )
    unchanged = key(item=resolve_saved_strategy_config(saved))
    assert unchanged == key(item=resolve_saved_strategy_config(saved))
    assert unchanged != key(item=resolve_saved_strategy_config(edited))
