from __future__ import annotations

from datetime import UTC, date, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from src.services.backtesting.data.data_provider import BacktestDataProvider
from src.services.backtesting.data.feature_loader import resolve_price_feature_history
from src.services.backtesting.features import (
    DMA_200_FEATURE,
    ETH_BTC_RATIO_FEATURE,
    ETH_BTC_RATIO_IS_ABOVE_DMA_FEATURE,
    ETH_BTC_RELATIVE_STRENGTH_AUX_SERIES,
    ETH_USD_PRICE_FEATURE,
    MACRO_FEAR_GREED_FEATURE,
    SPY_CRYPTO_RATIO_DMA_200_FEATURE,
    SPY_CRYPTO_RATIO_FEATURE,
    SPY_CRYPTO_RELATIVE_STRENGTH_AUX_SERIES,
    MarketDataRequirements,
)


@pytest.mark.asyncio
async def test_fetch_token_prices_normalizes_filters_and_injects_dma() -> None:
    token_price_service = SimpleNamespace(
        get_price_history=lambda **kwargs: [
            SimpleNamespace(snapshot_date="2025-01-02", price=101.0),
            SimpleNamespace(date=date(2025, 1, 1), price_usd=100.0),
            SimpleNamespace(date=date(2024, 12, 31), price=99.0),
            SimpleNamespace(price=150.0),
            SimpleNamespace(date=date(2025, 1, 3)),
        ],
        get_dma_history=lambda **kwargs: {
            date(2025, 1, 1): 95.0,
            date(2025, 1, 2): 96.0,
        },
    )
    provider = BacktestDataProvider(
        token_price_service=token_price_service,
        sentiment_service=SimpleNamespace(),
    )

    rows = await provider.fetch_token_prices(
        token_symbol="BTC",
        start_date=date(2025, 1, 1),
        end_date=date(2025, 1, 2),
        market_data_requirements=MarketDataRequirements(
            required_price_features=frozenset({DMA_200_FEATURE})
        ),
    )

    assert rows == [
        {"date": date(2025, 1, 1), "price": 100.0, "extra_data": {"dma_200": 95.0}},
        {"date": date(2025, 1, 2), "price": 101.0, "extra_data": {"dma_200": 96.0}},
    ]


@pytest.mark.asyncio
async def test_fetch_token_prices_without_dma_skips_dma_lookup() -> None:
    calls: list[str] = []

    def _get_price_history(**kwargs):
        calls.append("prices")
        return [SimpleNamespace(date=date(2025, 1, 1), price=100.0)]

    def _get_dma_history(**kwargs):
        calls.append("dma")
        return {date(2025, 1, 1): 95.0}

    provider = BacktestDataProvider(
        token_price_service=SimpleNamespace(
            get_price_history=_get_price_history,
            get_dma_history=_get_dma_history,
        ),
        sentiment_service=SimpleNamespace(),
    )

    rows = await provider.fetch_token_prices(
        token_symbol="BTC",
        start_date=date(2025, 1, 1),
        end_date=date(2025, 1, 1),
    )

    assert rows == [{"date": date(2025, 1, 1), "price": 100.0}]
    assert calls == ["prices"]


@pytest.mark.asyncio
async def test_fetch_token_prices_injects_optional_macro_fear_greed() -> None:
    macro_fear_greed_service = SimpleNamespace(
        get_daily_macro_fear_greed=lambda **kwargs: {
            date(2025, 1, 1): {
                "score": 24.0,
                "label": "extreme_fear",
                "source": "cnn_fear_greed_unofficial",
                "updated_at": "2025-01-01T12:00:00+00:00",
                "raw_rating": "Extreme Fear",
            },
            date(2025, 1, 3): {
                "score": 76.0,
                "label": "greed",
                "source": "cnn_fear_greed_unofficial",
                "updated_at": "2025-01-03T12:00:00+00:00",
                "raw_rating": "Greed",
            },
        }
    )
    provider = BacktestDataProvider(
        token_price_service=SimpleNamespace(
            get_price_history=lambda **kwargs: [
                SimpleNamespace(date=date(2025, 1, 1), price=100.0),
                SimpleNamespace(date=date(2025, 1, 2), price=101.0),
                SimpleNamespace(date=date(2025, 1, 3), price=102.0),
            ],
            get_dma_history=lambda **kwargs: {},
        ),
        sentiment_service=SimpleNamespace(),
        macro_fear_greed_service=macro_fear_greed_service,
    )

    rows = await provider.fetch_token_prices(
        token_symbol="BTC",
        start_date=date(2025, 1, 1),
        end_date=date(2025, 1, 3),
    )

    assert rows[0]["extra_data"][MACRO_FEAR_GREED_FEATURE]["score"] == 24.0
    assert rows[1]["extra_data"][MACRO_FEAR_GREED_FEATURE]["score"] == 24.0
    assert rows[2]["extra_data"][MACRO_FEAR_GREED_FEATURE]["score"] == 76.0


@pytest.mark.asyncio
async def test_fetch_token_prices_omits_optional_macro_when_service_missing() -> None:
    provider = BacktestDataProvider(
        token_price_service=SimpleNamespace(
            get_price_history=lambda **kwargs: [
                SimpleNamespace(date=date(2025, 1, 1), price=100.0)
            ],
            get_dma_history=lambda **kwargs: {},
        ),
        sentiment_service=SimpleNamespace(),
    )

    rows = await provider.fetch_token_prices(
        token_symbol="BTC",
        start_date=date(2025, 1, 1),
        end_date=date(2025, 1, 1),
    )

    assert rows == [{"date": date(2025, 1, 1), "price": 100.0}]


@pytest.mark.asyncio
async def test_fetch_token_prices_requires_macro_service_when_declared() -> None:
    provider = BacktestDataProvider(
        token_price_service=SimpleNamespace(
            get_price_history=lambda **kwargs: [],
            get_dma_history=lambda **kwargs: {},
        ),
        sentiment_service=SimpleNamespace(),
    )

    with pytest.raises(ValueError, match="macro_fear_greed_service is required"):
        await provider.fetch_token_prices(
            token_symbol="BTC",
            start_date=date(2025, 1, 1),
            end_date=date(2025, 1, 1),
            market_data_requirements=MarketDataRequirements(
                requires_macro_fear_greed=True
            ),
        )


@pytest.mark.asyncio
async def test_fetch_token_prices_injects_eth_btc_relative_strength_aux_series() -> (
    None
):
    def _get_price_history(**kwargs):
        token_symbol = kwargs["token_symbol"]
        if token_symbol == "ETH":
            return [
                SimpleNamespace(date=date(2025, 1, 1), price_usd=5_000.0),
                SimpleNamespace(date=date(2025, 1, 2), price_usd=5_100.0),
            ]
        return [
            SimpleNamespace(date=date(2025, 1, 1), price_usd=100_000.0),
            SimpleNamespace(date=date(2025, 1, 2), price_usd=101_000.0),
        ]

    token_price_service = SimpleNamespace(
        get_price_history=_get_price_history,
        get_dma_history=lambda **kwargs: {},
        get_pair_ratio_dma_history=lambda **kwargs: {
            date(2025, 1, 1): {
                "ratio": 0.05,
                "dma_200": 0.04,
                "is_above_dma": True,
            },
            date(2025, 1, 2): {
                "ratio": 0.0505,
                "dma_200": 0.0405,
                "is_above_dma": None,
            },
        },
    )
    provider = BacktestDataProvider(
        token_price_service=token_price_service,
        sentiment_service=SimpleNamespace(),
    )

    rows = await provider.fetch_token_prices(
        token_symbol="BTC",
        start_date=date(2025, 1, 1),
        end_date=date(2025, 1, 2),
        market_data_requirements=MarketDataRequirements(
            required_aux_series=frozenset({ETH_BTC_RELATIVE_STRENGTH_AUX_SERIES})
        ),
    )

    assert rows[0]["extra_data"][ETH_BTC_RATIO_IS_ABOVE_DMA_FEATURE] is True
    assert rows[1]["extra_data"][ETH_BTC_RATIO_IS_ABOVE_DMA_FEATURE] is None
    assert rows[0]["extra_data"][ETH_USD_PRICE_FEATURE] == pytest.approx(5_000.0)
    assert rows[1]["extra_data"][ETH_USD_PRICE_FEATURE] == pytest.approx(5_100.0)
    assert rows[0]["prices"] == {"btc": 100_000.0, "eth": 5_000.0}


@pytest.mark.asyncio
async def test_fetch_token_prices_injects_spy_crypto_relative_strength_aux_series() -> (
    None
):
    token_price_service = SimpleNamespace(
        get_price_history=lambda **kwargs: [
            SimpleNamespace(date=date(2025, 1, 1), price_usd=100_000.0),
            SimpleNamespace(date=date(2025, 1, 2), price_usd=120_000.0),
        ],
        get_dma_history=lambda **kwargs: {},
    )
    stock_price_service = SimpleNamespace(
        get_dma_history=lambda **kwargs: {
            date(2025, 1, 1): {"price_usd": 500.0, "dma_200": 490.0},
            date(2025, 1, 2): {"price_usd": 600.0, "dma_200": 500.0},
        }
    )
    provider = BacktestDataProvider(
        token_price_service=token_price_service,
        sentiment_service=SimpleNamespace(),
        stock_price_service=stock_price_service,
    )

    rows = await provider.fetch_token_prices(
        token_symbol="BTC",
        start_date=date(2025, 1, 1),
        end_date=date(2025, 1, 2),
        market_data_requirements=MarketDataRequirements(
            required_aux_series=frozenset({SPY_CRYPTO_RELATIVE_STRENGTH_AUX_SERIES})
        ),
    )

    assert rows[0]["extra_data"][SPY_CRYPTO_RATIO_FEATURE] == pytest.approx(0.005)
    assert rows[0]["extra_data"][SPY_CRYPTO_RATIO_DMA_200_FEATURE] == pytest.approx(
        0.005
    )
    assert rows[1]["extra_data"][SPY_CRYPTO_RATIO_FEATURE] == pytest.approx(0.005)
    assert rows[1]["extra_data"][SPY_CRYPTO_RATIO_DMA_200_FEATURE] == pytest.approx(
        0.005
    )


@pytest.mark.asyncio
async def test_fetch_token_prices_rejects_unsupported_aux_series() -> None:
    provider = BacktestDataProvider(
        token_price_service=SimpleNamespace(
            get_price_history=lambda **kwargs: [],
            get_dma_history=lambda **kwargs: {},
        ),
        sentiment_service=SimpleNamespace(),
    )

    with pytest.raises(ValueError, match="Unsupported required auxiliary series"):
        await provider.fetch_token_prices(
            token_symbol="BTC",
            start_date=date(2025, 1, 1),
            end_date=date(2025, 1, 2),
            market_data_requirements=MarketDataRequirements(
                required_aux_series=frozenset({"onchain_velocity"})
            ),
        )


@pytest.mark.asyncio
async def test_fetch_token_prices_returns_empty_on_non_dma_error() -> None:
    provider = BacktestDataProvider(
        token_price_service=SimpleNamespace(
            get_price_history=lambda **kwargs: (_ for _ in ()).throw(
                RuntimeError("boom")
            ),
            get_dma_history=lambda **kwargs: {},
        ),
        sentiment_service=SimpleNamespace(),
    )

    rows = await provider.fetch_token_prices(
        token_symbol="ETH",
        start_date=date(2025, 1, 1),
        end_date=date(2025, 1, 2),
    )

    assert rows == []


@pytest.mark.asyncio
async def test_fetch_token_prices_reraises_on_strict_dma_error() -> None:
    provider = BacktestDataProvider(
        token_price_service=SimpleNamespace(
            get_price_history=lambda **kwargs: [
                SimpleNamespace(date=date(2025, 1, 1), price=100.0)
            ],
            get_dma_history=lambda **kwargs: (_ for _ in ()).throw(RuntimeError("dma")),
        ),
        sentiment_service=SimpleNamespace(),
    )

    with pytest.raises(RuntimeError, match="dma"):
        await provider.fetch_token_prices(
            token_symbol="BTC",
            start_date=date(2025, 1, 1),
            end_date=date(2025, 1, 2),
            required_price_features=frozenset({DMA_200_FEATURE}),
        )


@pytest.mark.asyncio
async def test_fetch_sentiments_dedupes_to_latest_row_per_day() -> None:
    sentiment_service = SimpleNamespace(
        get_sentiment_history=AsyncMock(
            return_value=[
                SimpleNamespace(
                    timestamp=datetime(2025, 1, 1, 8, 0, tzinfo=UTC),
                    value=20,
                    status="Fear",
                ),
                SimpleNamespace(
                    timestamp=datetime(2025, 1, 1, 12, 0, tzinfo=UTC),
                    value=25,
                    status="Extreme Fear",
                ),
                SimpleNamespace(
                    timestamp=datetime(2025, 1, 2, 9, 0, tzinfo=UTC),
                    value=70,
                    status="Greed",
                ),
                SimpleNamespace(
                    timestamp=datetime(2024, 12, 31, 23, 0, tzinfo=UTC),
                    value=50,
                    status="Neutral",
                ),
            ]
        )
    )
    provider = BacktestDataProvider(
        token_price_service=SimpleNamespace(),
        sentiment_service=sentiment_service,
    )

    result = await provider.fetch_sentiments(
        start_date=date(2025, 1, 1),
        end_date=date(2025, 1, 2),
    )

    assert result == {
        date(2025, 1, 1): {
            "date": date(2025, 1, 1),
            "value": 25,
            "label": "extreme_fear",
            "timestamp": datetime(2025, 1, 1, 12, 0, tzinfo=UTC),
        },
        date(2025, 1, 2): {
            "date": date(2025, 1, 2),
            "value": 70,
            "label": "greed",
            "timestamp": datetime(2025, 1, 2, 9, 0, tzinfo=UTC),
        },
    }


@pytest.mark.asyncio
async def test_fetch_sentiments_returns_empty_on_error() -> None:
    provider = BacktestDataProvider(
        token_price_service=SimpleNamespace(),
        sentiment_service=SimpleNamespace(
            get_sentiment_history=AsyncMock(side_effect=RuntimeError("sentiment down"))
        ),
    )

    result = await provider.fetch_sentiments(
        start_date=date(2025, 1, 1),
        end_date=date(2025, 1, 2),
    )

    assert result == {}


def test_build_price_entry_returns_none_when_price_is_none() -> None:
    """Line 100: _build_price_entry returns None when price_value is None."""
    snapshot = SimpleNamespace(date=date(2025, 1, 1))  # no price attribute
    result = BacktestDataProvider._build_price_entry(
        snapshot=snapshot,
        start_date=date(2025, 1, 1),
        end_date=date(2025, 1, 1),
        price_feature_history={},
    )
    assert result is None


def test_build_price_map_uses_ratio_branch_when_no_eth_usd_price() -> None:
    """Line 135: _build_price_map uses eth_btc_ratio when eth_price_usd absent."""
    prices = BacktestDataProvider._build_price_map(
        primary_price=100_000.0,
        extra_data={ETH_BTC_RATIO_FEATURE: 0.05},
    )
    assert prices == {"btc": 100_000.0, "eth": pytest.approx(5_000.0)}


@pytest.mark.asyncio
async def test_fetch_token_prices_reraises_when_feature_history_loaded() -> None:
    """Lines 234-239: reraise when feature_history is non-empty and error occurs."""

    def _boom(**kwargs) -> list:
        raise RuntimeError("price fetch failed after feature load")

    token_price_service = SimpleNamespace(
        get_price_history=_boom,
        get_dma_history=lambda **kwargs: {date(2025, 1, 1): 95.0},
    )
    provider = BacktestDataProvider(
        token_price_service=token_price_service,
        sentiment_service=SimpleNamespace(),
    )

    with pytest.raises(RuntimeError, match="price fetch failed"):
        await provider.fetch_token_prices(
            token_symbol="BTC",
            start_date=date(2025, 1, 1),
            end_date=date(2025, 1, 2),
            market_data_requirements=MarketDataRequirements(
                required_price_features=frozenset({DMA_200_FEATURE})
            ),
        )


@pytest.mark.asyncio
async def test_fetch_sentiments_skips_older_duplicate_for_same_day() -> None:
    """Line 278: _should_replace_sentiment returns False for older candidate."""
    sentiment_service = SimpleNamespace(
        get_sentiment_history=AsyncMock(
            return_value=[
                SimpleNamespace(
                    timestamp=datetime(2025, 1, 1, 12, 0, tzinfo=UTC),
                    value=25,
                    status="Fear",
                ),
                SimpleNamespace(
                    timestamp=datetime(2025, 1, 1, 8, 0, tzinfo=UTC),  # older → skip
                    value=10,
                    status="Extreme Fear",
                ),
            ]
        )
    )
    provider = BacktestDataProvider(
        token_price_service=SimpleNamespace(),
        sentiment_service=sentiment_service,
    )

    result = await provider.fetch_sentiments(
        start_date=date(2025, 1, 1),
        end_date=date(2025, 1, 1),
    )

    # The newer entry (value=25) should be kept, not the older (value=10)
    assert result[date(2025, 1, 1)]["value"] == 25


def test_feature_loader_raises_on_unsupported_price_feature() -> None:
    """Lines 40-41: feature_loader raises ValueError for unsupported features."""
    with pytest.raises(ValueError, match="Unsupported required price features"):
        resolve_price_feature_history(
            token_price_service=SimpleNamespace(),
            market_data_requirements=None,
            required_price_features=["unknown_feature_xyz"],
            start_date=date(2025, 1, 1),
            end_date=date(2025, 1, 2),
            token_symbol="BTC",
        )
