"""Shared market feature loaders for compare and daily suggestion."""

from __future__ import annotations

from collections.abc import Collection
from datetime import date
from typing import Any

from src.services.backtesting.features import (
    DMA_200_FEATURE,
    ETH_BTC_RATIO_DMA_200_FEATURE,
    ETH_BTC_RATIO_FEATURE,
    ETH_BTC_RATIO_IS_ABOVE_DMA_FEATURE,
    ETH_BTC_RELATIVE_STRENGTH_AUX_SERIES,
    ETH_DMA_200_FEATURE,
    ETH_USD_PRICE_FEATURE,
    MarketDataRequirements,
)
from src.services.backtesting.utils import coerce_to_date
from src.services.interfaces.market import TokenPriceServiceProtocol

SUPPORTED_PRICE_FEATURES = frozenset({DMA_200_FEATURE})
SUPPORTED_AUX_SERIES = frozenset({ETH_BTC_RELATIVE_STRENGTH_AUX_SERIES})


def resolve_price_feature_history(
    *,
    token_price_service: TokenPriceServiceProtocol,
    token_symbol: str,
    start_date: date,
    end_date: date,
    market_data_requirements: MarketDataRequirements | None = None,
    required_price_features: Collection[str] | None = None,
) -> dict[str, dict[date, Any]]:
    declared_requirements = market_data_requirements or MarketDataRequirements()
    requested_features = frozenset(
        required_price_features or declared_requirements.required_price_features
    )
    unsupported_features = requested_features - SUPPORTED_PRICE_FEATURES
    if unsupported_features:
        joined = ", ".join(sorted(unsupported_features))
        raise ValueError(f"Unsupported required price features: {joined}")

    unsupported_aux_series = (
        declared_requirements.required_aux_series - SUPPORTED_AUX_SERIES
    )
    if unsupported_aux_series:
        joined = ", ".join(sorted(unsupported_aux_series))
        raise ValueError(f"Unsupported required auxiliary series: {joined}")

    feature_history: dict[str, dict[date, Any]] = {}
    if DMA_200_FEATURE in requested_features:
        feature_history[DMA_200_FEATURE] = token_price_service.get_dma_history(
            start_date=start_date,
            end_date=end_date,
            token_symbol=token_symbol,
        )
    if (
        ETH_BTC_RELATIVE_STRENGTH_AUX_SERIES
        in declared_requirements.required_aux_series
    ):
        days = max((end_date - start_date).days + 7, 1)
        ratio_history = token_price_service.get_pair_ratio_dma_history(
            start_date=start_date,
            end_date=end_date,
            base_token_symbol="ETH",
            quote_token_symbol="BTC",
        )
        feature_history[ETH_BTC_RATIO_FEATURE] = {
            snapshot_date: payload["ratio"]
            for snapshot_date, payload in ratio_history.items()
        }
        feature_history[ETH_BTC_RATIO_DMA_200_FEATURE] = {
            snapshot_date: payload["dma_200"]
            for snapshot_date, payload in ratio_history.items()
        }
        feature_history[ETH_BTC_RATIO_IS_ABOVE_DMA_FEATURE] = {
            snapshot_date: payload["is_above_dma"]
            for snapshot_date, payload in ratio_history.items()
        }
        eth_price_history = token_price_service.get_price_history(
            days=days,
            token_symbol="ETH",
            start_date=start_date,
            end_date=end_date,
        )
        feature_history[ETH_USD_PRICE_FEATURE] = {
            snapshot_date: float(price_value)
            for snapshot in eth_price_history
            if (snapshot_date := coerce_to_date(getattr(snapshot, "date", None)))
            is not None
            and (price_value := getattr(snapshot, "price_usd", None)) is not None
        }
        feature_history[ETH_DMA_200_FEATURE] = token_price_service.get_dma_history(
            start_date=start_date,
            end_date=end_date,
            token_symbol="ETH",
        )
    return feature_history


__all__ = [
    "SUPPORTED_AUX_SERIES",
    "SUPPORTED_PRICE_FEATURES",
    "resolve_price_feature_history",
]
