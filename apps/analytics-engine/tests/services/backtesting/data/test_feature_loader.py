from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Any

import pytest

from src.services.backtesting.data.feature_loader import (
    _compute_pair_ratio_with_dma,
    resolve_price_feature_history,
)
from src.services.backtesting.features import (
    ETH_BTC_RATIO_DMA_200_FEATURE,
    ETH_BTC_RATIO_FEATURE,
    ETH_BTC_RATIO_IS_ABOVE_DMA_FEATURE,
    ETH_BTC_RELATIVE_STRENGTH_AUX_SERIES,
    ETH_DMA_200_FEATURE,
    ETH_USD_PRICE_FEATURE,
    SPY_CRYPTO_RATIO_DMA_200_FEATURE,
    SPY_CRYPTO_RATIO_FEATURE,
    SPY_CRYPTO_RELATIVE_STRENGTH_AUX_SERIES,
    SPY_DMA_200_FEATURE,
    SPY_PRICE_FEATURE,
    MarketDataRequirements,
)


@dataclass(frozen=True)
class _PriceSnapshot:
    date: date
    price_usd: float


class _FakeTokenPriceService:
    def get_price_history(self, **kwargs: Any) -> list[_PriceSnapshot]:
        token_symbol = kwargs["token_symbol"]
        if token_symbol == "ETH":
            return [
                _PriceSnapshot(date(2025, 1, 4), 5_000.0),
                _PriceSnapshot(date(2025, 1, 5), 5_100.0),
                _PriceSnapshot(date(2025, 1, 6), 5_200.0),
            ]
        return [
            _PriceSnapshot(date(2025, 1, 4), 100_000.0),
            _PriceSnapshot(date(2025, 1, 5), 101_000.0),
            _PriceSnapshot(date(2025, 1, 6), 102_000.0),
        ]

    def get_dma_history(self, **kwargs: Any) -> dict[date, float]:
        token_symbol = kwargs["token_symbol"]
        if token_symbol == "ETH":
            return {
                date(2025, 1, 4): 4_800.0,
                date(2025, 1, 5): 4_850.0,
                date(2025, 1, 6): 4_900.0,
            }
        return {}

    def get_pair_ratio_dma_history(self, **kwargs: Any) -> dict[date, dict[str, Any]]:
        return {
            date(2025, 1, 4): {
                "ratio": 0.050,
                "dma_200": 0.045,
                "is_above_dma": True,
            },
            date(2025, 1, 5): {
                "ratio": 0.051,
                "dma_200": 0.046,
                "is_above_dma": True,
            },
        }


class _FakeStockPriceService:
    def get_dma_history(self, **kwargs: Any) -> dict[date, dict[str, float]]:
        start_date = kwargs["start_date"]
        end_date = kwargs["end_date"]
        rows = {
            date(2025, 1, 3): {"price_usd": 500.0, "dma_200": 490.0},
            date(2025, 1, 6): {"price_usd": 510.0, "dma_200": 495.0},
        }
        return {
            snapshot_date: payload
            for snapshot_date, payload in rows.items()
            if start_date <= snapshot_date <= end_date
        }


def test_resolve_price_feature_history_forward_fills_spy_price_and_dma() -> None:
    history = resolve_price_feature_history(
        token_price_service=_FakeTokenPriceService(),
        stock_price_service=_FakeStockPriceService(),
        token_symbol="BTC",
        start_date=date(2025, 1, 4),
        end_date=date(2025, 1, 6),
        market_data_requirements=MarketDataRequirements(
            required_price_features=frozenset({SPY_DMA_200_FEATURE}),
        ),
    )

    assert history[SPY_PRICE_FEATURE] == {
        date(2025, 1, 4): 500.0,
        date(2025, 1, 5): 500.0,
        date(2025, 1, 6): 510.0,
    }
    assert history[SPY_DMA_200_FEATURE] == {
        date(2025, 1, 4): 490.0,
        date(2025, 1, 5): 490.0,
        date(2025, 1, 6): 495.0,
    }


def test_resolve_price_feature_history_loads_eth_btc_ratio_aux_series() -> None:
    history = resolve_price_feature_history(
        token_price_service=_FakeTokenPriceService(),
        token_symbol="BTC",
        start_date=date(2025, 1, 4),
        end_date=date(2025, 1, 6),
        market_data_requirements=MarketDataRequirements(
            required_aux_series=frozenset({ETH_BTC_RELATIVE_STRENGTH_AUX_SERIES}),
        ),
    )

    assert history[ETH_BTC_RATIO_FEATURE][date(2025, 1, 4)] == pytest.approx(0.050)
    assert history[ETH_BTC_RATIO_DMA_200_FEATURE][date(2025, 1, 5)] == pytest.approx(
        0.046
    )
    assert history[ETH_BTC_RATIO_IS_ABOVE_DMA_FEATURE][date(2025, 1, 4)] is True
    assert history[ETH_USD_PRICE_FEATURE][date(2025, 1, 6)] == pytest.approx(5_200.0)
    assert history[ETH_DMA_200_FEATURE][date(2025, 1, 4)] == pytest.approx(4_800.0)


def test_resolve_price_feature_history_loads_eth_dma_without_ratio_aux() -> None:
    history = resolve_price_feature_history(
        token_price_service=_FakeTokenPriceService(),
        token_symbol="BTC",
        start_date=date(2025, 1, 4),
        end_date=date(2025, 1, 6),
        required_price_features=frozenset({ETH_DMA_200_FEATURE}),
    )

    assert history[ETH_USD_PRICE_FEATURE][date(2025, 1, 4)] == pytest.approx(5_000.0)
    assert history[ETH_DMA_200_FEATURE][date(2025, 1, 6)] == pytest.approx(4_900.0)


def test_resolve_price_feature_history_requires_stock_service_for_spy() -> None:
    with pytest.raises(ValueError, match="stock_price_service is required"):
        resolve_price_feature_history(
            token_price_service=_FakeTokenPriceService(),
            token_symbol="BTC",
            start_date=date(2025, 1, 4),
            end_date=date(2025, 1, 6),
            market_data_requirements=MarketDataRequirements(
                required_price_features=frozenset({SPY_DMA_200_FEATURE}),
            ),
        )


def test_resolve_price_feature_history_requires_stock_service_for_spy_crypto_ratio() -> (
    None
):
    with pytest.raises(ValueError, match="SPY/crypto relative strength"):
        resolve_price_feature_history(
            token_price_service=_FakeTokenPriceService(),
            token_symbol="BTC",
            start_date=date(2025, 1, 4),
            end_date=date(2025, 1, 6),
            market_data_requirements=MarketDataRequirements(
                required_aux_series=frozenset(
                    {SPY_CRYPTO_RELATIVE_STRENGTH_AUX_SERIES}
                ),
            ),
        )


def test_resolve_price_feature_history_computes_spy_crypto_ratio_without_spy_feature() -> (
    None
):
    history = resolve_price_feature_history(
        token_price_service=_FakeTokenPriceService(),
        stock_price_service=_FakeStockPriceService(),
        token_symbol="BTC",
        start_date=date(2025, 1, 4),
        end_date=date(2025, 1, 6),
        market_data_requirements=MarketDataRequirements(
            required_aux_series=frozenset({SPY_CRYPTO_RELATIVE_STRENGTH_AUX_SERIES}),
        ),
    )

    assert history[SPY_CRYPTO_RATIO_FEATURE][date(2025, 1, 4)] == pytest.approx(0.005)
    assert history[SPY_CRYPTO_RATIO_DMA_200_FEATURE][date(2025, 1, 6)] == pytest.approx(
        (0.005 + (500.0 / 101_000.0) + (510.0 / 102_000.0)) / 3.0
    )


def test_compute_pair_ratio_with_dma_skips_non_positive_values_and_rolls_window() -> (
    None
):
    history = _compute_pair_ratio_with_dma(
        numerator={
            date(2025, 1, 1): 10.0,
            date(2025, 1, 2): -1.0,
            date(2025, 1, 3): 30.0,
        },
        denominator={
            date(2025, 1, 1): 5.0,
            date(2025, 1, 2): 5.0,
            date(2025, 1, 3): 10.0,
        },
        window=1,
    )

    assert history["ratio"] == {
        date(2025, 1, 1): 2.0,
        date(2025, 1, 3): 3.0,
    }
    assert history["dma_200"][date(2025, 1, 3)] == pytest.approx(3.0)
