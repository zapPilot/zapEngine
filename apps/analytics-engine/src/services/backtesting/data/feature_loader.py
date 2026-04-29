"""Shared market feature loaders for compare and daily suggestion."""

from __future__ import annotations

from collections.abc import Collection
from datetime import date, timedelta
from typing import TYPE_CHECKING, Any

from src.services.backtesting.features import (
    DMA_200_FEATURE,
    ETH_BTC_RATIO_DMA_200_FEATURE,
    ETH_BTC_RATIO_FEATURE,
    ETH_BTC_RATIO_IS_ABOVE_DMA_FEATURE,
    ETH_BTC_RELATIVE_STRENGTH_AUX_SERIES,
    ETH_DMA_200_FEATURE,
    ETH_USD_PRICE_FEATURE,
    SPY_AUX_SERIES,
    SPY_CRYPTO_RATIO_DMA_200_FEATURE,
    SPY_CRYPTO_RATIO_FEATURE,
    SPY_CRYPTO_RELATIVE_STRENGTH_AUX_SERIES,
    SPY_DMA_200_FEATURE,
    SPY_PRICE_FEATURE,
    MarketDataRequirements,
)
from src.services.backtesting.utils import coerce_to_date

if TYPE_CHECKING:  # pragma: no cover
    from src.services.interfaces.market import (
        StockPriceServiceProtocol,
        TokenPriceServiceProtocol,
    )

SUPPORTED_PRICE_FEATURES = frozenset({DMA_200_FEATURE})
SUPPORTED_AUX_SERIES = frozenset(
    {
        ETH_BTC_RELATIVE_STRENGTH_AUX_SERIES,
        SPY_AUX_SERIES,
        SPY_CRYPTO_RELATIVE_STRENGTH_AUX_SERIES,
    }
)


def resolve_price_feature_history(
    *,
    token_price_service: TokenPriceServiceProtocol,
    token_symbol: str,
    start_date: date,
    end_date: date,
    market_data_requirements: MarketDataRequirements | None = None,
    required_price_features: Collection[str] | None = None,
    stock_price_service: StockPriceServiceProtocol | None = None,
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
    spy_price_filled: dict[date, float] | None = None
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
    if SPY_AUX_SERIES in declared_requirements.required_aux_series:
        if stock_price_service is None:
            raise ValueError(
                "stock_price_service is required when SPY_AUX_SERIES is requested"
            )
        spy_history = stock_price_service.get_dma_history(
            start_date=start_date,
            end_date=end_date,
            symbol="SPY",
        )
        spy_price_raw = {
            snapshot_date: float(point["price_usd"])
            for snapshot_date, point in spy_history.items()
        }
        # Forward-fill SPY price across calendar days. SPY trades on weekdays
        # only, but BTC/ETH (and the backtest engine's portfolio valuation) run
        # every calendar day. Without forward-fill, weekend days have no SPY
        # price → portfolio.rotate_spot_asset / total_value blow up with
        # "Missing price for spot asset 'SPY'" once any SPY balance exists.
        # Real-world equivalent: weekend SPY value = previous Friday close.
        spy_price_filled = _forward_fill_daily(
            spy_price_raw,
            start_date=start_date,
            end_date=end_date,
        )
        feature_history[SPY_PRICE_FEATURE] = spy_price_filled
        spy_dma_200_raw: dict[date, float] = {}
        for snapshot_date, point in spy_history.items():
            dma_value = point.get("dma_200")
            if dma_value is not None:
                spy_dma_200_raw[snapshot_date] = float(dma_value)
        feature_history[SPY_DMA_200_FEATURE] = _forward_fill_daily(
            spy_dma_200_raw,
            start_date=start_date,
            end_date=end_date,
        )
    if (
        SPY_CRYPTO_RELATIVE_STRENGTH_AUX_SERIES
        in declared_requirements.required_aux_series
    ):
        if stock_price_service is None:
            raise ValueError(
                "stock_price_service is required when SPY/crypto relative strength is requested"
            )
        if spy_price_filled is None:
            spy_history = stock_price_service.get_dma_history(
                start_date=start_date,
                end_date=end_date,
                symbol="SPY",
            )
            spy_price_filled = _forward_fill_daily(
                {
                    snapshot_date: float(point["price_usd"])
                    for snapshot_date, point in spy_history.items()
                },
                start_date=start_date,
                end_date=end_date,
            )
        days = max((end_date - start_date).days + 7, 1)
        btc_price_history = token_price_service.get_price_history(
            days=days,
            token_symbol="BTC",
            start_date=start_date,
            end_date=end_date,
        )
        btc_price_raw = {
            snapshot_date: float(price_value)
            for snapshot in btc_price_history
            if (
                snapshot_date := coerce_to_date(
                    getattr(snapshot, "date", None)
                    or getattr(snapshot, "snapshot_date", None)
                )
            )
            is not None
            and (price_value := getattr(snapshot, "price_usd", None)) is not None
        }
        btc_price_filled = _forward_fill_daily(
            btc_price_raw,
            start_date=start_date,
            end_date=end_date,
        )
        spy_crypto_ratio_history = _compute_pair_ratio_with_dma(
            numerator=spy_price_filled,
            denominator=btc_price_filled,
            window=200,
        )
        feature_history[SPY_CRYPTO_RATIO_FEATURE] = spy_crypto_ratio_history["ratio"]
        feature_history[SPY_CRYPTO_RATIO_DMA_200_FEATURE] = spy_crypto_ratio_history[
            "dma_200"
        ]
    return feature_history


def _compute_pair_ratio_with_dma(
    *,
    numerator: dict[date, float],
    denominator: dict[date, float],
    window: int,
) -> dict[str, dict[date, float]]:
    ratio: dict[date, float] = {}
    for snapshot_date in sorted(set(numerator) & set(denominator)):
        denominator_value = float(denominator[snapshot_date])
        numerator_value = float(numerator[snapshot_date])
        if numerator_value <= 0.0 or denominator_value <= 0.0:
            continue
        ratio[snapshot_date] = numerator_value / denominator_value

    dma_200: dict[date, float] = {}
    rolling_values: list[float] = []
    resolved_window = max(1, int(window))
    for snapshot_date in sorted(ratio):
        rolling_values.append(ratio[snapshot_date])
        if len(rolling_values) > resolved_window:
            rolling_values.pop(0)
        dma_200[snapshot_date] = sum(rolling_values) / float(len(rolling_values))
    return {"ratio": ratio, "dma_200": dma_200}


def _forward_fill_daily(
    sparse: dict[date, float],
    *,
    start_date: date,
    end_date: date,
) -> dict[date, float]:
    """Fill gaps by carrying the previous available value forward.

    Returns a dense dict over [start_date, end_date]. Days before the first
    available datum stay absent (no value to carry).
    """
    if not sparse:
        return dict(sparse)
    sorted_keys = sorted(sparse.keys())
    filled: dict[date, float] = {}
    last_value: float | None = None
    cur = start_date
    series_idx = 0
    while cur <= end_date:
        while series_idx < len(sorted_keys) and sorted_keys[series_idx] <= cur:
            last_value = sparse[sorted_keys[series_idx]]
            series_idx += 1
        if last_value is not None:
            filled[cur] = last_value
        cur += timedelta(days=1)
    return filled


__all__ = [
    "SUPPORTED_AUX_SERIES",
    "SUPPORTED_PRICE_FEATURES",
    "resolve_price_feature_history",
]
