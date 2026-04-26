"""Typed market-data contracts for backtesting inputs."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Any

DMA_200_FEATURE = "dma_200"
ETH_BTC_RELATIVE_STRENGTH_AUX_SERIES = "eth_btc_relative_strength"
ETH_BTC_RATIO_FEATURE = "eth_btc_ratio"
ETH_BTC_RATIO_DMA_200_FEATURE = "eth_btc_ratio_dma_200"
ETH_BTC_RATIO_IS_ABOVE_DMA_FEATURE = "eth_btc_ratio_is_above_dma"
ETH_USD_PRICE_FEATURE = "eth_price_usd"
ETH_DMA_200_FEATURE = "eth_dma_200"


@dataclass(frozen=True, slots=True)
class IndicatorSnapshot:
    """Typed indicator payload derived from raw market feature data."""

    dma_200: float | None = None
    extra: dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_extra_data(cls, extra_data: Mapping[str, Any] | None) -> IndicatorSnapshot:
        if not isinstance(extra_data, Mapping):
            return cls()
        dma_value = extra_data.get("dma_200")
        dma_200 = float(dma_value) if isinstance(dma_value, int | float) else None
        if dma_200 is not None and dma_200 < 0.0:
            dma_200 = None
        extra = {
            str(key): value for key, value in extra_data.items() if key != "dma_200"
        }
        return cls(dma_200=dma_200, extra=extra)

    def to_extra_data(self) -> dict[str, Any]:
        data = dict(self.extra)
        if self.dma_200 is not None:
            data["dma_200"] = self.dma_200
        return data


@dataclass(frozen=True, slots=True)
class MarketFeatureSet:
    """Typed feature bundle passed through the backtesting pipeline."""

    indicators: IndicatorSnapshot = field(default_factory=IndicatorSnapshot)

    @classmethod
    def from_extra_data(cls, extra_data: Mapping[str, Any] | None) -> MarketFeatureSet:
        return cls(indicators=IndicatorSnapshot.from_extra_data(extra_data))

    def to_extra_data(self) -> dict[str, Any]:
        return self.indicators.to_extra_data()


@dataclass(frozen=True, slots=True)
class MarketDataRequirements:
    """Declared market-data requirements for a strategy recipe."""

    price_history_days: int = 0
    sentiment_history_days: int = 0
    requires_sentiment: bool = False
    required_price_features: frozenset[str] = frozenset()
    required_aux_series: frozenset[str] = frozenset()
    max_lag_days: int = 7

    def merge(self, other: MarketDataRequirements) -> MarketDataRequirements:
        return MarketDataRequirements(
            price_history_days=max(self.price_history_days, other.price_history_days),
            sentiment_history_days=max(
                self.sentiment_history_days,
                other.sentiment_history_days,
            ),
            requires_sentiment=self.requires_sentiment or other.requires_sentiment,
            required_price_features=(
                self.required_price_features | other.required_price_features
            ),
            required_aux_series=self.required_aux_series | other.required_aux_series,
            max_lag_days=max(self.max_lag_days, other.max_lag_days),
        )

    def requires_price_feature(self, feature_name: str) -> bool:
        return feature_name in self.required_price_features

    @property
    def require_dma_200(self) -> bool:
        return self.requires_price_feature(DMA_200_FEATURE)
