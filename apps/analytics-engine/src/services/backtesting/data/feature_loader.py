"""Shared market feature loaders for compare and daily suggestion."""

from __future__ import annotations

from collections.abc import Collection, Mapping
from datetime import date, timedelta
from typing import TYPE_CHECKING, Any

from src.services.backtesting.data.forward_fill import forward_fill_daily
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
        StockPriceDmaPoint,
        StockPriceServiceProtocol,
        TokenPriceServiceProtocol,
    )

SUPPORTED_PRICE_FEATURES = frozenset(
    {DMA_200_FEATURE, ETH_DMA_200_FEATURE, SPY_DMA_200_FEATURE}
)
SUPPORTED_AUX_SERIES = frozenset(
    {
        ETH_BTC_RELATIVE_STRENGTH_AUX_SERIES,
        SPY_AUX_SERIES,
        SPY_CRYPTO_RELATIVE_STRENGTH_AUX_SERIES,
    }
)
SPY_FORWARD_FILL_SEED_DAYS = 7


def _load_eth_usd_features(
    feature_history: dict[str, dict[date, Any]],
    *,
    token_price_service: TokenPriceServiceProtocol,
    days: int,
    start_date: date,
    end_date: date,
) -> None:
    feature_history[ETH_USD_PRICE_FEATURE] = _load_token_price_history(
        token_price_service=token_price_service,
        token_symbol="ETH",
        days=days,
        start_date=start_date,
        end_date=end_date,
    )
    feature_history[ETH_DMA_200_FEATURE] = token_price_service.get_dma_history(
        start_date=start_date,
        end_date=end_date,
        token_symbol="ETH",
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
        ETH_DMA_200_FEATURE in requested_features
        and ETH_BTC_RELATIVE_STRENGTH_AUX_SERIES
        not in declared_requirements.required_aux_series
    ):
        days = max((end_date - start_date).days + 7, 1)
        _load_eth_usd_features(
            feature_history,
            token_price_service=token_price_service,
            days=days,
            start_date=start_date,
            end_date=end_date,
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
        _load_eth_usd_features(
            feature_history,
            token_price_service=token_price_service,
            days=days,
            start_date=start_date,
            end_date=end_date,
        )
    if (
        SPY_AUX_SERIES in declared_requirements.required_aux_series
        or SPY_DMA_200_FEATURE in requested_features
    ):
        if stock_price_service is None:
            raise ValueError(
                "stock_price_service is required when SPY market data is requested"
            )
        spy_history, spy_seed_start_date = _load_spy_dma_history(
            stock_price_service=stock_price_service,
            start_date=start_date,
            end_date=end_date,
        )
        spy_price_filled = _forward_fill_spy_price_history(
            spy_history=spy_history,
            seed_start_date=spy_seed_start_date,
            start_date=start_date,
            end_date=end_date,
        )
        feature_history[SPY_PRICE_FEATURE] = spy_price_filled
        spy_dma_raw = _extract_spy_dma_values(spy_history)
        feature_history[SPY_DMA_200_FEATURE] = _forward_fill_and_filter(
            spy_dma_raw,
            seed_start_date=spy_seed_start_date,
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
            spy_history, spy_seed_start_date = _load_spy_dma_history(
                stock_price_service=stock_price_service,
                start_date=start_date,
                end_date=end_date,
            )
            spy_price_filled = _forward_fill_spy_price_history(
                spy_history=spy_history,
                seed_start_date=spy_seed_start_date,
                start_date=start_date,
                end_date=end_date,
            )
            feature_history[SPY_PRICE_FEATURE] = spy_price_filled
        days = max((end_date - start_date).days + 7, 1)
        btc_price_raw = _load_token_price_history(
            token_price_service=token_price_service,
            token_symbol="BTC",
            days=days,
            start_date=start_date,
            end_date=end_date,
        )
        btc_price_filled = forward_fill_daily(
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


def _load_spy_dma_history(
    *,
    stock_price_service: StockPriceServiceProtocol,
    start_date: date,
    end_date: date,
) -> tuple[dict[date, StockPriceDmaPoint], date]:
    seed_start_date = start_date - timedelta(days=SPY_FORWARD_FILL_SEED_DAYS)
    return (
        stock_price_service.get_dma_history(
            start_date=seed_start_date,
            end_date=end_date,
            symbol="SPY",
        ),
        seed_start_date,
    )


def _forward_fill_spy_price_history(
    *,
    spy_history: Mapping[date, StockPriceDmaPoint],
    seed_start_date: date,
    start_date: date,
    end_date: date,
) -> dict[date, float]:
    """Forward-fill SPY price across calendar days.

    SPY trades on weekdays only, while crypto backtests value portfolios every
    calendar day. Weekend SPY value therefore uses the previous market close.
    """
    return _forward_fill_and_filter(
        _extract_spy_price_values(spy_history),
        seed_start_date=seed_start_date,
        start_date=start_date,
        end_date=end_date,
    )


def _extract_spy_price_values(
    spy_history: Mapping[date, StockPriceDmaPoint],
) -> dict[date, float]:
    return {
        snapshot_date: float(point["price_usd"])
        for snapshot_date, point in spy_history.items()
    }


def _extract_spy_dma_values(
    spy_history: Mapping[date, StockPriceDmaPoint],
) -> dict[date, float]:
    raw_values: dict[date, float] = {}
    for snapshot_date, point in spy_history.items():
        dma_value = point.get("dma_200")
        if dma_value is not None:
            raw_values[snapshot_date] = float(dma_value)
    return raw_values


def _forward_fill_and_filter(
    values: dict[date, float],
    *,
    seed_start_date: date,
    start_date: date,
    end_date: date,
) -> dict[date, float]:
    seeded = forward_fill_daily(
        values,
        start_date=seed_start_date,
        end_date=end_date,
    )
    return _filter_to_date_range(seeded, start_date=start_date, end_date=end_date)


def _filter_to_date_range(
    values: Mapping[date, float],
    *,
    start_date: date,
    end_date: date,
) -> dict[date, float]:
    return {
        snapshot_date: value
        for snapshot_date, value in values.items()
        if start_date <= snapshot_date <= end_date
    }


def _load_token_price_history(
    *,
    token_price_service: TokenPriceServiceProtocol,
    token_symbol: str,
    days: int,
    start_date: date,
    end_date: date,
) -> dict[date, float]:
    price_history = token_price_service.get_price_history(
        days=days,
        token_symbol=token_symbol,
        start_date=start_date,
        end_date=end_date,
    )
    return {
        snapshot_date: float(price_value)
        for snapshot in price_history
        if (
            snapshot_date := coerce_to_date(
                getattr(snapshot, "date", None)
                or getattr(snapshot, "snapshot_date", None)
            )
        )
        is not None
        and (price_value := getattr(snapshot, "price_usd", None)) is not None
    }


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


__all__ = [
    "SUPPORTED_AUX_SERIES",
    "SUPPORTED_PRICE_FEATURES",
    "resolve_price_feature_history",
]
