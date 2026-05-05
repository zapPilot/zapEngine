from __future__ import annotations

from datetime import date
from unittest.mock import AsyncMock, MagicMock

import pytest

from src.config.strategy_presets import resolve_seed_strategy_config
from src.models.backtesting import BacktestCompareConfigV3, BacktestResponse
from src.services.backtesting.constants import STRATEGY_DMA_FGI_FLAT_MINIMUM
from src.services.backtesting.features import (
    DMA_200_FEATURE,
    ETH_DMA_200_FEATURE,
    SPY_DMA_200_FEATURE,
)
from src.services.exceptions import MarketDataUnavailableError
from src.services.strategy.backtesting_service import (
    BacktestingService,
    _select_longest_dma_segment,
)
from tests.services.backtesting.support import (
    build_mock_composed_catalog,
    build_mock_saved_config,
    compare_request,
    price_row,
    price_series,
    register_mock_recipe,
    sentiment_map,
)


def _patch_compare_runner(monkeypatch: pytest.MonkeyPatch) -> MagicMock:
    mock_runner = MagicMock(return_value=BacktestResponse(strategies={}, timeline=[]))
    monkeypatch.setattr(
        "src.services.strategy.backtesting_service.run_compare_v3_on_data",
        mock_runner,
    )
    return mock_runner


@pytest.fixture
def service() -> BacktestingService:
    return BacktestingService(
        db=MagicMock(),
        token_price_service=MagicMock(),
        sentiment_service=MagicMock(),
    )


@pytest.mark.asyncio
async def test_run_compare_v3_enables_dma_and_shifts_effective_start_without_mutation(
    service: BacktestingService,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service.data_provider.fetch_token_prices = AsyncMock(
        return_value=price_series(days=5)
    )
    service.data_provider.fetch_sentiments = AsyncMock(
        return_value=sentiment_map(days=5, start_offset=2, label="greed", value=70)
    )
    mock_runner = _patch_compare_runner(monkeypatch)
    request = compare_request()

    await service.run_compare_v3(request)

    requirements = service.data_provider.fetch_token_prices.call_args.kwargs[
        "market_data_requirements"
    ]
    assert requirements.requires_sentiment is True
    assert requirements.required_price_features == frozenset({"dma_200"})
    service.data_provider.fetch_sentiments.assert_awaited_once()
    assert request.start_date == date(2025, 1, 1)
    assert [cfg.strategy_id for cfg in request.configs] == ["dma_gated_fgi"]
    assert [
        cfg.strategy_id for cfg in mock_runner.call_args.kwargs["request"].configs
    ] == [
        "dca_classic",
        "dma_gated_fgi",
    ]
    assert mock_runner.call_args.kwargs["user_start_date"] == date(2025, 1, 3)
    window = mock_runner.call_args.kwargs["window"]
    assert window.truncated is True
    assert window.requested.start_date == date(2025, 1, 1)
    assert window.requested.end_date == date(2025, 1, 5)
    assert window.effective.start_date == date(2025, 1, 3)
    assert window.effective.end_date == date(2025, 1, 5)


@pytest.mark.asyncio
async def test_run_compare_v3_baseline_only_skips_dma_fetch(
    service: BacktestingService,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service.data_provider.fetch_token_prices = AsyncMock(
        return_value=[
            price_row(date(2025, 1, 2), price=101.0),
            price_row(date(2025, 1, 3), price=102.0),
            price_row(date(2025, 1, 4), price=103.0),
        ]
    )
    service.data_provider.fetch_sentiments = AsyncMock(return_value={})
    mock_runner = _patch_compare_runner(monkeypatch)
    request = compare_request(
        configs=[
            BacktestCompareConfigV3(
                config_id="dca_classic",
                strategy_id="dca_classic",
                params={},
            )
        ]
    )

    await service.run_compare_v3(request)

    assert (
        service.data_provider.fetch_token_prices.call_args.kwargs[
            "market_data_requirements"
        ].required_price_features
        == frozenset()
    )
    assert (
        service.data_provider.fetch_token_prices.call_args.kwargs[
            "market_data_requirements"
        ].requires_sentiment
        is False
    )
    service.data_provider.fetch_sentiments.assert_not_called()
    assert mock_runner.call_args.kwargs["user_start_date"] == date(2025, 1, 2)
    assert mock_runner.call_args.kwargs["sentiments"] == {}
    assert [row["date"] for row in mock_runner.call_args.kwargs["prices"]] == [
        date(2025, 1, 2),
        date(2025, 1, 3),
        date(2025, 1, 4),
    ]
    window = mock_runner.call_args.kwargs["window"]
    assert window.truncated is True
    assert window.effective.start_date == date(2025, 1, 2)
    assert window.effective.end_date == date(2025, 1, 4)


@pytest.mark.asyncio
async def test_run_compare_v3_clamps_dma_start_and_end_to_usable_rows(
    service: BacktestingService,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service.data_provider.fetch_token_prices = AsyncMock(
        return_value=price_series(days=5, dma_offsets={2, 3})
    )
    service.data_provider.fetch_sentiments = AsyncMock(
        return_value=sentiment_map(days=5)
    )
    mock_runner = _patch_compare_runner(monkeypatch)
    request = compare_request()

    await service.run_compare_v3(request)

    assert mock_runner.call_args.kwargs["user_start_date"] == date(2025, 1, 3)
    assert [row["date"] for row in mock_runner.call_args.kwargs["prices"]] == [
        date(2025, 1, 1),
        date(2025, 1, 2),
        date(2025, 1, 3),
        date(2025, 1, 4),
    ]
    window = mock_runner.call_args.kwargs["window"]
    assert window.truncated is True
    assert window.effective.start_date == date(2025, 1, 3)
    assert window.effective.end_date == date(2025, 1, 4)


@pytest.mark.asyncio
async def test_run_compare_v3_returns_untruncated_window_when_data_is_fully_available(
    service: BacktestingService,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service.data_provider.fetch_token_prices = AsyncMock(
        return_value=price_series(days=3)
    )
    service.data_provider.fetch_sentiments = AsyncMock(
        return_value=sentiment_map(days=3, label="greed", value=70)
    )
    mock_runner = _patch_compare_runner(monkeypatch)

    await service.run_compare_v3(
        compare_request(
            start_date=date(2025, 1, 1),
            end_date=date(2025, 1, 3),
        )
    )

    window = mock_runner.call_args.kwargs["window"]
    assert window.truncated is False
    assert window.requested == window.effective


@pytest.mark.asyncio
async def test_run_compare_v3_raises_when_no_usable_overlap_remains(
    service: BacktestingService,
) -> None:
    service.data_provider.fetch_token_prices = AsyncMock(
        return_value=price_series(days=3, dma_offsets=set())
    )
    service.data_provider.fetch_sentiments = AsyncMock(
        return_value=sentiment_map(days=3)
    )

    # Data-availability gaps now raise MarketDataUnavailableError (HTTP 503)
    # rather than ValueError (HTTP 400) — the request itself is valid; the
    # data pipeline is what's missing.
    with pytest.raises(
        MarketDataUnavailableError, match="No usable backtest data available"
    ):
        await service.run_compare_v3(compare_request(end_date=date(2025, 1, 3)))


def test_select_longest_dma_segment_prefers_latest_segment_on_tie() -> None:
    prices = price_series(days=7, dma_offsets={0, 1, 4, 5})

    segment = _select_longest_dma_segment(prices)

    assert [row["date"] for row in segment] == [
        date(2025, 1, 5),
        date(2025, 1, 6),
    ]


@pytest.mark.asyncio
async def test_run_compare_v3_raises_when_no_prices(
    service: BacktestingService,
) -> None:
    service.data_provider.fetch_token_prices = AsyncMock(return_value=[])
    service.data_provider.fetch_sentiments = AsyncMock(return_value={})

    with pytest.raises(MarketDataUnavailableError, match="No price data available"):
        await service.run_compare_v3(compare_request())


@pytest.mark.asyncio
async def test_run_compare_v3_raises_when_sentiment_starts_after_end(
    service: BacktestingService,
) -> None:
    service.data_provider.fetch_token_prices = AsyncMock(
        return_value=[price_row(date(2025, 1, 1), dma_200=95.0)]
    )
    service.data_provider.fetch_sentiments = AsyncMock(
        return_value={date(2025, 1, 10): {"label": "greed", "value": 70}}
    )

    with pytest.raises(
        MarketDataUnavailableError,
        match="Sentiment data starts after the requested end date",
    ):
        await service.run_compare_v3(
            compare_request(
                start_date=date(2025, 1, 1),
                end_date=date(2025, 1, 2),
            )
        )


@pytest.mark.asyncio
async def test_run_compare_v3_rejects_token_symbol_mismatch_before_fetch(
    service: BacktestingService,
) -> None:
    service.data_provider.fetch_token_prices = AsyncMock(return_value=[])
    service.data_provider.fetch_sentiments = AsyncMock(return_value={})

    with pytest.raises(ValueError, match="expected 'BTC', got 'ETH'"):
        await service.run_compare_v3(compare_request(token_symbol="ETH"))

    service.data_provider.fetch_token_prices.assert_not_called()
    service.data_provider.fetch_sentiments.assert_not_called()


@pytest.mark.asyncio
async def test_run_compare_v3_rejects_mixed_primary_assets_before_fetch(
    service: BacktestingService,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    register_mock_recipe(
        monkeypatch,
        strategy_id="mock_eth_signal",
        primary_asset="ETH",
        requires_sentiment=False,
    )
    service.data_provider.fetch_token_prices = AsyncMock(return_value=[])
    service.data_provider.fetch_sentiments = AsyncMock(return_value={})

    with pytest.raises(
        ValueError,
        match="Compare currently supports a single primary asset; received recipes for: BTC, ETH",
    ):
        await service.run_compare_v3(
            compare_request(
                token_symbol="ETH",
                configs=[
                    BacktestCompareConfigV3(
                        config_id="mock_eth_signal",
                        strategy_id="mock_eth_signal",
                        params={},
                    )
                ],
            )
        )

    service.data_provider.fetch_token_prices.assert_not_called()
    service.data_provider.fetch_sentiments.assert_not_called()


@pytest.mark.asyncio
async def test_run_compare_v3_resolves_saved_config_with_injected_catalog(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    saved_config = build_mock_saved_config(config_id="mock_saved")
    catalog = build_mock_composed_catalog()
    service = BacktestingService(
        db=MagicMock(),
        token_price_service=MagicMock(),
        sentiment_service=MagicMock(),
        strategy_config_store=MagicMock(resolve_config=lambda _config_id: saved_config),
        composition_catalog=catalog,
    )
    service.data_provider.fetch_token_prices = AsyncMock(
        return_value=[
            price_row(date(2025, 1, 1), price=100.0),
            price_row(date(2025, 1, 2), price=101.0),
        ]
    )
    service.data_provider.fetch_sentiments = AsyncMock(return_value={})
    mock_runner = _patch_compare_runner(monkeypatch)

    await service.run_compare_v3(
        compare_request(
            configs=[
                BacktestCompareConfigV3(
                    config_id="mock_saved",
                    saved_config_id=saved_config.config_id,
                )
            ]
        )
    )

    assert (
        service.data_provider.fetch_token_prices.call_args.kwargs[
            "market_data_requirements"
        ].requires_sentiment
        is False
    )
    service.data_provider.fetch_sentiments.assert_not_called()
    resolved_configs = mock_runner.call_args.kwargs["resolved_configs"]
    assert [config.strategy_id for config in resolved_configs] == [
        "dca_classic",
        "mock_signal_family",
    ]


@pytest.mark.asyncio
async def test_run_compare_v3_only_auto_injects_dca_baseline_for_saved_configs(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    requested_saved = resolve_seed_strategy_config("eth_btc_rotation_default")
    service = BacktestingService(
        db=MagicMock(),
        token_price_service=MagicMock(),
        sentiment_service=MagicMock(),
        strategy_config_store=MagicMock(
            resolve_config=lambda _config_id: requested_saved,
            list_configs=lambda: [
                resolve_seed_strategy_config("dma_gated_fgi_default"),
                resolve_seed_strategy_config("eth_btc_rotation_default"),
                resolve_seed_strategy_config("dca_classic"),
            ],
        ),
    )
    service.data_provider.fetch_token_prices = AsyncMock(
        return_value=[
            price_row(date(2025, 1, 1), price=100.0, dma_200=95.0),
            price_row(date(2025, 1, 2), price=101.0, dma_200=95.0),
        ]
    )
    service.data_provider.fetch_sentiments = AsyncMock(
        return_value=sentiment_map(days=2)
    )
    mock_runner = _patch_compare_runner(monkeypatch)

    await service.run_compare_v3(
        compare_request(
            configs=[
                BacktestCompareConfigV3(
                    config_id="rotation_runtime",
                    saved_config_id="eth_btc_rotation_default",
                )
            ]
        )
    )

    resolved_configs = mock_runner.call_args.kwargs["resolved_configs"]
    assert [config.request_config_id for config in resolved_configs] == [
        "dca_classic",
        "rotation_runtime",
    ]
    assert all(
        config.request_config_id != "dma_gated_fgi_default"
        for config in resolved_configs
    )


@pytest.mark.asyncio
async def test_run_compare_v3_accepts_builtin_strategy_id_as_saved_config_alias(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service = BacktestingService(
        db=MagicMock(),
        token_price_service=MagicMock(),
        sentiment_service=MagicMock(),
        strategy_config_store=MagicMock(
            get_config=lambda _config_id: None,
            list_configs=lambda: [resolve_seed_strategy_config("dca_classic")],
        ),
    )
    service.data_provider.fetch_token_prices = AsyncMock(
        return_value=[
            {
                **price_row(date(2025, 1, 1), price=100.0, dma_200=95.0),
                "prices": {"btc": 100.0, "eth": 110.0, "spy": 500.0},
                "extra_data": {
                    DMA_200_FEATURE: 95.0,
                    ETH_DMA_200_FEATURE: 105.0,
                    SPY_DMA_200_FEATURE: 450.0,
                },
            },
            {
                **price_row(date(2025, 1, 2), price=101.0, dma_200=95.0),
                "prices": {"btc": 101.0, "eth": 111.0, "spy": 501.0},
                "extra_data": {
                    DMA_200_FEATURE: 95.0,
                    ETH_DMA_200_FEATURE: 105.0,
                    SPY_DMA_200_FEATURE: 450.0,
                },
            },
        ]
    )
    service.data_provider.fetch_sentiments = AsyncMock(
        return_value=sentiment_map(days=2)
    )
    mock_runner = _patch_compare_runner(monkeypatch)

    await service.run_compare_v3(
        compare_request(
            end_date=date(2025, 1, 2),
            configs=[
                BacktestCompareConfigV3(
                    config_id=STRATEGY_DMA_FGI_FLAT_MINIMUM,
                    saved_config_id=STRATEGY_DMA_FGI_FLAT_MINIMUM,
                )
            ],
        )
    )

    requirements = service.data_provider.fetch_token_prices.call_args.kwargs[
        "market_data_requirements"
    ]
    assert requirements.required_price_features == frozenset(
        {DMA_200_FEATURE, ETH_DMA_200_FEATURE, SPY_DMA_200_FEATURE}
    )
    resolved_configs = mock_runner.call_args.kwargs["resolved_configs"]
    assert [config.strategy_id for config in resolved_configs] == [
        "dca_classic",
        STRATEGY_DMA_FGI_FLAT_MINIMUM,
    ]


def test_has_composition_path_returns_false_for_none_strategy_id() -> None:
    """Cover line 193: strategy_id is None returns False."""
    from src.services.strategy.backtesting_service import _has_composition_path

    request_config = MagicMock()
    request_config.saved_config_id = None
    request_config.strategy_id = None

    catalog = build_mock_composed_catalog()
    assert _has_composition_path(request_config, catalog) is False
