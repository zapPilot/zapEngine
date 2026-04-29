"""Integration tests for DMA-first compare wiring."""

from __future__ import annotations

from datetime import date, timedelta

import pytest

from src.models.backtesting import (
    BacktestCompareConfigV3,
    BacktestCompareRequestV3,
    BacktestPeriodInfo,
    BacktestWindowInfo,
)
from src.services.backtesting.execution.compare import (
    materialize_compare_request,
    run_compare_v3_on_data,
)
from src.services.backtesting.execution.config import RegimeConfig
from src.services.backtesting.features import (
    ETH_BTC_RATIO_DMA_200_FEATURE,
    ETH_BTC_RATIO_FEATURE,
)
from tests.services.backtesting.support import register_mock_recipe


def _dma_public_params(
    *,
    cross_cooldown_days: int = 30,
    cross_on_touch: bool = True,
    pacing_k: float = 5.0,
    pacing_r_max: float = 1.0,
    buy_sideways_window_days: int = 5,
    buy_sideways_max_range: float = 0.04,
    buy_leg_caps: list[float] | None = None,
    min_trade_interval_days: int | None = None,
    max_trades_7d: int | None = None,
    max_trades_30d: int | None = None,
) -> dict[str, object]:
    return {
        "signal": {
            "cross_cooldown_days": cross_cooldown_days,
            "cross_on_touch": cross_on_touch,
        },
        "pacing": {
            "k": pacing_k,
            "r_max": pacing_r_max,
        },
        "buy_gate": {
            "window_days": buy_sideways_window_days,
            "sideways_max_range": buy_sideways_max_range,
            "leg_caps": [0.05, 0.10, 0.20] if buy_leg_caps is None else buy_leg_caps,
        },
        "trade_quota": {
            "min_trade_interval_days": min_trade_interval_days,
            "max_trades_7d": max_trades_7d,
            "max_trades_30d": max_trades_30d,
        },
    }


def _eth_btc_public_params(
    *,
    cross_cooldown_days: int = 30,
    cross_on_touch: bool = True,
    ratio_cross_cooldown_days: int = 30,
    pacing_k: float = 5.0,
    pacing_r_max: float = 1.0,
    buy_sideways_window_days: int = 5,
    buy_sideways_max_range: float = 0.04,
    buy_leg_caps: list[float] | None = None,
    min_trade_interval_days: int | None = None,
    max_trades_7d: int | None = None,
    max_trades_30d: int | None = None,
    rotation_neutral_band: float = 0.05,
    rotation_max_deviation: float = 0.20,
    rotation_drift_threshold: float = 0.03,
    rotation_cooldown_days: int = 7,
) -> dict[str, object]:
    params = _dma_public_params(
        cross_cooldown_days=cross_cooldown_days,
        cross_on_touch=cross_on_touch,
        pacing_k=pacing_k,
        pacing_r_max=pacing_r_max,
        buy_sideways_window_days=buy_sideways_window_days,
        buy_sideways_max_range=buy_sideways_max_range,
        buy_leg_caps=buy_leg_caps,
        min_trade_interval_days=min_trade_interval_days,
        max_trades_7d=max_trades_7d,
        max_trades_30d=max_trades_30d,
    )
    signal = dict(params["signal"])
    signal["ratio_cross_cooldown_days"] = ratio_cross_cooldown_days
    signal["rotation_neutral_band"] = rotation_neutral_band
    signal["rotation_max_deviation"] = rotation_max_deviation
    params["signal"] = signal
    params["rotation"] = {
        "drift_threshold": rotation_drift_threshold,
        "cooldown_days": rotation_cooldown_days,
    }
    return params


def _build_dma_long_run_inputs(
    days: int,
) -> tuple[
    list[dict[str, object]],
    dict[date, dict[str, object]],
    BacktestCompareRequestV3,
]:
    start = date(2025, 1, 1)
    price_cycle = [110_000.0, 90_000.0, 111_000.0, 89_000.0]
    sentiment_cycle = [
        {"label": "greed", "value": 70},
        {"label": "extreme_fear", "value": 10},
        {"label": "greed", "value": 75},
        {"label": "fear", "value": 20},
    ]

    prices: list[dict[str, object]] = []
    sentiments: dict[date, dict[str, object]] = {}
    for offset in range(days):
        snapshot_date = start + timedelta(days=offset)
        prices.append(
            {
                "date": snapshot_date,
                "price": price_cycle[offset % len(price_cycle)],
                "extra_data": {"dma_200": 100_000.0},
            }
        )
        sentiments[snapshot_date] = sentiment_cycle[offset % len(sentiment_cycle)]

    request = BacktestCompareRequestV3(
        token_symbol="BTC",
        start_date=start,
        end_date=start + timedelta(days=days - 1),
        total_capital=10_000.0,
        configs=[
            BacktestCompareConfigV3(
                config_id="dma_gated_fgi_default",
                strategy_id="dma_gated_fgi",
                params=_dma_public_params(),
            )
        ],
    )
    return prices, sentiments, request


def _build_eth_btc_rotation_inputs(
    days: int = 3,
) -> tuple[
    list[dict[str, object]],
    dict[date, dict[str, object]],
    BacktestCompareRequestV3,
]:
    assert days == 3
    start = date(2025, 1, 1)
    prices = [
        {
            "date": start,
            "price": 99_000.0,
            "prices": {"btc": 99_000.0, "eth": 4_950.0},
            "extra_data": {
                "dma_200": 100_000.0,
                ETH_BTC_RATIO_FEATURE: 0.050,
                ETH_BTC_RATIO_DMA_200_FEATURE: 0.050,
            },
        },
        {
            "date": start + timedelta(days=1),
            "price": 98_000.0,
            "prices": {"btc": 98_000.0, "eth": 4_900.0},
            "extra_data": {
                "dma_200": 100_000.0,
                ETH_BTC_RATIO_FEATURE: 0.040,
                ETH_BTC_RATIO_DMA_200_FEATURE: 0.050,
            },
        },
        {
            "date": start + timedelta(days=2),
            "price": 101_000.0,
            "prices": {"btc": 101_000.0, "eth": 5_050.0},
            "extra_data": {
                "dma_200": 100_000.0,
                ETH_BTC_RATIO_FEATURE: 0.060,
                ETH_BTC_RATIO_DMA_200_FEATURE: 0.050,
            },
        },
    ]
    sentiments = {
        start: {"label": "neutral", "value": 50},
        start + timedelta(days=1): {"label": "extreme_fear", "value": 10},
        start + timedelta(days=2): {"label": "neutral", "value": 50},
    }
    request = BacktestCompareRequestV3(
        token_symbol="BTC",
        start_date=start,
        end_date=start + timedelta(days=days - 1),
        total_capital=10_000.0,
        configs=[
            BacktestCompareConfigV3(
                config_id="eth_rotation_runtime",
                strategy_id="eth_btc_rotation",
                params=_eth_btc_public_params(cross_cooldown_days=0),
            )
        ],
    )
    return prices, sentiments, request


def _build_eth_btc_non_cross_buy_guard_inputs() -> tuple[
    list[dict[str, object]],
    dict[date, dict[str, object]],
    BacktestCompareRequestV3,
]:
    start = date(2025, 11, 15)
    ratios = [0.040, 0.040, 0.040, 0.040, 0.060]
    sentiments = {
        start + timedelta(days=offset): (
            {"label": "extreme_fear", "value": 0}
            if offset == 4
            else {"label": "fear", "value": 25}
        )
        for offset in range(len(ratios))
    }
    prices = [
        {
            "date": start + timedelta(days=offset),
            "price": 60_000.0,
            "prices": {
                "btc": 60_000.0,
                "eth": 60_000.0 * ratios[offset],
            },
            "extra_data": {
                "dma_200": 100_000.0,
                ETH_BTC_RATIO_FEATURE: ratios[offset],
                ETH_BTC_RATIO_DMA_200_FEATURE: 0.050,
            },
        }
        for offset in range(len(ratios))
    ]
    request = BacktestCompareRequestV3(
        token_symbol="BTC",
        start_date=start,
        end_date=start + timedelta(days=len(ratios) - 1),
        total_capital=10_000.0,
        configs=[
            BacktestCompareConfigV3(
                config_id="eth_rotation_non_cross_buy_guard",
                strategy_id="eth_btc_rotation",
                params=_eth_btc_public_params(
                    cross_cooldown_days=0,
                    ratio_cross_cooldown_days=0,
                    rotation_cooldown_days=0,
                ),
            )
        ],
    )
    return prices, sentiments, request


def _build_eth_btc_rotation_cooldown_inputs(
    days: int = 6,
) -> tuple[
    list[dict[str, object]],
    dict[date, dict[str, object]],
    BacktestCompareRequestV3,
]:
    assert days == 6
    start = date(2025, 1, 1)
    ratios = [0.050, 0.045, 0.045, 0.045, 0.045, 0.040]
    prices = [
        {
            "date": start + timedelta(days=offset),
            "price": 99_000.0,
            "prices": {"btc": 99_000.0, "eth": 4_950.0},
            "extra_data": {
                "dma_200": 100_000.0,
                ETH_BTC_RATIO_FEATURE: ratios[offset],
                ETH_BTC_RATIO_DMA_200_FEATURE: 0.050,
            },
        }
        for offset in range(days)
    ]
    sentiments = {
        start + timedelta(days=offset): {"label": "fear", "value": 22}
        for offset in range(days)
    }
    request = BacktestCompareRequestV3(
        token_symbol="BTC",
        start_date=start,
        end_date=start + timedelta(days=days - 1),
        total_capital=10_000.0,
        configs=[
            BacktestCompareConfigV3(
                config_id="eth_rotation_cooldown",
                strategy_id="eth_btc_rotation",
                params=_eth_btc_public_params(rotation_cooldown_days=14),
            )
        ],
    )
    return prices, sentiments, request


def _build_eth_btc_outer_dma_btc_price_regression_inputs() -> tuple[
    list[dict[str, object]],
    dict[date, dict[str, object]],
    BacktestCompareRequestV3,
]:
    start = date(2025, 1, 1)
    prices = [
        {
            "date": start,
            "price": 99_000.0,
            "prices": {"btc": 99_000.0, "eth": 4_950.0},
            "extra_data": {
                "dma_200": 100_000.0,
                "eth_dma_200": 1_800.0,
                ETH_BTC_RATIO_FEATURE: 0.050,
                ETH_BTC_RATIO_DMA_200_FEATURE: 0.050,
            },
        },
        {
            "date": start + timedelta(days=1),
            "price": 105_000.0,
            "prices": {"btc": 105_000.0, "eth": 3_150.0},
            "extra_data": {
                "dma_200": 100_000.0,
                "eth_dma_200": 1_800.0,
                ETH_BTC_RATIO_FEATURE: 0.030,
                ETH_BTC_RATIO_DMA_200_FEATURE: 0.050,
            },
        },
        {
            "date": start + timedelta(days=2),
            "price": 106_000.0,
            "prices": {"btc": 106_000.0, "eth": 1_908.0},
            "extra_data": {
                "dma_200": 100_000.0,
                "eth_dma_200": 1_800.0,
                ETH_BTC_RATIO_FEATURE: 0.018,
                ETH_BTC_RATIO_DMA_200_FEATURE: 0.050,
            },
        },
    ]
    sentiments = {
        start: {"label": "neutral", "value": 50},
        start + timedelta(days=1): {"label": "neutral", "value": 51},
        start + timedelta(days=2): {"label": "neutral", "value": 52},
    }
    request = BacktestCompareRequestV3(
        token_symbol="BTC",
        start_date=start,
        end_date=start + timedelta(days=2),
        total_capital=10_000.0,
        configs=[
            BacktestCompareConfigV3(
                config_id="eth_rotation_outer_dma_btc",
                strategy_id="eth_btc_rotation",
                params=_eth_btc_public_params(cross_cooldown_days=0),
            )
        ],
    )
    return prices, sentiments, request


def _build_eth_btc_ath_sell_suppression_inputs() -> tuple[
    list[dict[str, object]],
    dict[date, dict[str, object]],
    BacktestCompareRequestV3,
]:
    dates = (
        date(2025, 4, 23),
        date(2025, 4, 24),
        date(2025, 4, 28),
        date(2025, 5, 2),
        date(2025, 5, 7),
    )
    btc_prices = (99_000.0, 101_000.0, 103_000.0, 105_000.0, 106_000.0)
    eth_prices = (2_200.0, 2_000.0, 1_920.0, 1_940.0, 1_950.0)

    prices = [
        {
            "date": snapshot_date,
            "price": btc_price,
            "prices": {"btc": btc_price, "eth": eth_price},
            "extra_data": {
                "dma_200": 100_000.0,
                "eth_dma_200": 1_800.0,
                ETH_BTC_RATIO_FEATURE: eth_price / btc_price,
                ETH_BTC_RATIO_DMA_200_FEATURE: 0.050,
            },
        }
        for snapshot_date, btc_price, eth_price in zip(
            dates, btc_prices, eth_prices, strict=True
        )
    ]
    sentiments = {
        snapshot_date: {"label": "neutral", "value": 50} for snapshot_date in dates
    }
    request = BacktestCompareRequestV3(
        token_symbol="BTC",
        start_date=dates[0],
        end_date=dates[-1],
        total_capital=10_000.0,
        configs=[
            BacktestCompareConfigV3(
                config_id="eth_rotation_no_ath_sell",
                strategy_id="eth_btc_rotation",
                params=_eth_btc_public_params(cross_cooldown_days=0),
            )
        ],
    )
    return prices, sentiments, request


def _build_eth_btc_post_july_above_ratio_inputs() -> tuple[
    list[dict[str, object]],
    dict[date, dict[str, object]],
    BacktestCompareRequestV3,
]:
    start = date(2025, 7, 1)
    ratios = [0.040, 0.041, 0.060, 0.061, 0.062, 0.063, 0.064]
    btc_prices = [
        99_000.0,
        101_000.0,
        102_000.0,
        103_000.0,
        104_000.0,
        105_000.0,
        106_000.0,
    ]
    prices = [
        {
            "date": start + timedelta(days=offset),
            "price": btc_prices[offset],
            "prices": {
                "btc": btc_prices[offset],
                "eth": btc_prices[offset] * ratios[offset],
            },
            "extra_data": {
                "dma_200": 100_000.0,
                "eth_dma_200": 5_500.0,
                ETH_BTC_RATIO_FEATURE: ratios[offset],
                ETH_BTC_RATIO_DMA_200_FEATURE: 0.050,
            },
        }
        for offset in range(len(ratios))
    ]
    sentiments = {
        start + timedelta(days=offset): {"label": "neutral", "value": 50}
        for offset in range(len(ratios))
    }
    request = BacktestCompareRequestV3(
        token_symbol="BTC",
        start_date=start,
        end_date=start + timedelta(days=len(ratios) - 1),
        total_capital=10_000.0,
        configs=[
            BacktestCompareConfigV3(
                config_id="eth_rotation_post_july_above",
                strategy_id="eth_btc_rotation",
                params=_eth_btc_public_params(
                    cross_cooldown_days=0,
                    ratio_cross_cooldown_days=0,
                    rotation_cooldown_days=0,
                ),
            )
        ],
    )
    return prices, sentiments, request


def _build_eth_btc_ratio_cross_up_cooldown_compare_inputs() -> tuple[
    list[dict[str, object]],
    dict[date, dict[str, object]],
    BacktestCompareRequestV3,
]:
    start = date(2025, 8, 1)
    ratios = [0.050, 0.040, 0.060, 0.061, 0.062]
    btc_prices = [101_000.0, 102_000.0, 103_000.0, 104_000.0, 105_000.0]
    prices = [
        {
            "date": start + timedelta(days=offset),
            "price": btc_prices[offset],
            "prices": {
                "btc": btc_prices[offset],
                "eth": btc_prices[offset] * ratios[offset],
            },
            "extra_data": {
                "dma_200": 100_000.0,
                "eth_dma_200": 5_500.0,
                ETH_BTC_RATIO_FEATURE: ratios[offset],
                ETH_BTC_RATIO_DMA_200_FEATURE: 0.050,
            },
        }
        for offset in range(len(ratios))
    ]
    sentiments = {
        start + timedelta(days=offset): {"label": "neutral", "value": 50}
        for offset in range(len(ratios))
    }
    request = BacktestCompareRequestV3(
        token_symbol="BTC",
        start_date=start,
        end_date=start + timedelta(days=len(ratios) - 1),
        total_capital=10_000.0,
        configs=[
            BacktestCompareConfigV3(
                config_id="eth_rotation_ratio_cross_up_cooldown",
                strategy_id="eth_btc_rotation",
                params=_eth_btc_public_params(
                    cross_cooldown_days=0,
                    ratio_cross_cooldown_days=30,
                    rotation_cooldown_days=0,
                ),
            )
        ],
    )
    return prices, sentiments, request


def _build_eth_btc_ratio_cross_down_cooldown_compare_inputs() -> tuple[
    list[dict[str, object]],
    dict[date, dict[str, object]],
    BacktestCompareRequestV3,
]:
    start = date(2025, 8, 1)
    ratios = [0.050, 0.060, 0.040, 0.039, 0.038]
    btc_prices = [101_000.0, 102_000.0, 103_000.0, 104_000.0, 105_000.0]
    prices = [
        {
            "date": start + timedelta(days=offset),
            "price": btc_prices[offset],
            "prices": {
                "btc": btc_prices[offset],
                "eth": btc_prices[offset] * ratios[offset],
            },
            "extra_data": {
                "dma_200": 100_000.0,
                ETH_BTC_RATIO_FEATURE: ratios[offset],
                ETH_BTC_RATIO_DMA_200_FEATURE: 0.050,
            },
        }
        for offset in range(len(ratios))
    ]
    sentiments = {
        start + timedelta(days=offset): {"label": "neutral", "value": 50}
        for offset in range(len(ratios))
    }
    request = BacktestCompareRequestV3(
        token_symbol="BTC",
        start_date=start,
        end_date=start + timedelta(days=len(ratios) - 1),
        total_capital=10_000.0,
        configs=[
            BacktestCompareConfigV3(
                config_id="eth_rotation_ratio_cross_down_cooldown",
                strategy_id="eth_btc_rotation",
                params=_eth_btc_public_params(
                    cross_cooldown_days=0,
                    ratio_cross_cooldown_days=30,
                    rotation_cooldown_days=0,
                ),
            )
        ],
    )
    return prices, sentiments, request


def test_materialize_compare_request_adds_dca_when_missing() -> None:
    request = BacktestCompareRequestV3(
        token_symbol="BTC",
        total_capital=10_000.0,
        configs=[
            BacktestCompareConfigV3(
                config_id="dma_only",
                strategy_id="dma_gated_fgi",
                params={},
            )
        ],
    )

    materialized = materialize_compare_request(request)

    assert [cfg.strategy_id for cfg in materialized.configs] == [
        "dca_classic",
        "dma_gated_fgi",
    ]
    assert materialized.configs[1].config_id == "dma_only"


def test_run_compare_v3_on_data_supports_dma_signal_mode() -> None:
    request = materialize_compare_request(
        BacktestCompareRequestV3(
            token_symbol="BTC",
            start_date=date(2025, 1, 1),
            end_date=date(2025, 1, 2),
            total_capital=10_000.0,
            configs=[
                BacktestCompareConfigV3(
                    config_id="dma_runtime",
                    strategy_id="dma_gated_fgi",
                    params=_dma_public_params(),
                )
            ],
        )
    )

    result = run_compare_v3_on_data(
        prices=[
            {
                "date": date(2025, 1, 1),
                "price": 110_000.0,
                "extra_data": {"dma_200": 100_000.0},
            },
            {
                "date": date(2025, 1, 2),
                "price": 111_000.0,
                "extra_data": {"dma_200": 100_000.0},
            },
        ],
        sentiments={
            date(2025, 1, 1): {"label": "greed", "value": 72},
            date(2025, 1, 2): {"label": "greed", "value": 74},
        },
        request=request,
        user_start_date=date(2025, 1, 1),
        config=RegimeConfig.default(),
    )

    assert set(result.strategies) == {"dca_classic", "dma_runtime"}
    baseline_summary = result.strategies["dca_classic"]
    dma_summary = result.strategies["dma_runtime"]
    assert isinstance(baseline_summary.calmar_ratio, float)
    assert isinstance(baseline_summary.max_drawdown_percent, float)
    assert dma_summary.strategy_id == "dma_gated_fgi"
    assert dma_summary.signal_id == "dma_gated_fgi"
    assert isinstance(dma_summary.calmar_ratio, float)
    assert isinstance(dma_summary.max_drawdown_percent, float)
    assert baseline_summary.final_asset_allocation.btc == pytest.approx(
        baseline_summary.final_allocation.spot
    )
    assert baseline_summary.final_asset_allocation.eth == pytest.approx(0.0)
    assert baseline_summary.final_asset_allocation.alt == pytest.approx(0.0)
    assert dma_summary.final_asset_allocation.alt == pytest.approx(0.0)
    dma_point = result.timeline[0].strategies["dma_runtime"]
    assert dma_point.signal is not None
    assert dma_point.signal.id == "dma_gated_fgi"
    assert result.timeline[0].strategies["dca_classic"].portfolio.spot_asset == "BTC"
    assert dma_point.portfolio.spot_asset == "BTC"
    assert result.timeline[0].strategies[
        "dca_classic"
    ].decision.target_allocation.btc == pytest.approx(
        1.0
        - result.timeline[0].strategies["dca_classic"].decision.target_allocation.stable
    )
    assert result.timeline[0].strategies[
        "dca_classic"
    ].decision.target_allocation.alt == pytest.approx(0.0)
    assert dma_point.decision.target_allocation.btc == pytest.approx(
        1.0 - dma_point.decision.target_allocation.stable
    )
    assert dma_point.decision.target_allocation.eth == pytest.approx(0.0)
    assert dma_point.decision.target_allocation.alt == pytest.approx(0.0)
    assert all(
        point.strategies["dma_runtime"].portfolio.spot_asset is None
        for point in result.timeline
        if point.strategies["dma_runtime"].portfolio.allocation.spot
        == pytest.approx(0.0)
    )
    assert dma_point.decision.rule_group in {
        "dma_fgi",
        "ath",
        "cross",
        "cooldown",
        "none",
    }


def test_run_compare_v3_on_data_trade_quota_reduces_trade_count() -> None:
    request = materialize_compare_request(
        BacktestCompareRequestV3(
            token_symbol="BTC",
            start_date=date(2025, 1, 1),
            end_date=date(2025, 1, 3),
            total_capital=10_000.0,
            configs=[
                BacktestCompareConfigV3(
                    config_id="dma_unbounded",
                    strategy_id="dma_gated_fgi",
                    params=_dma_public_params(cross_cooldown_days=0),
                ),
                BacktestCompareConfigV3(
                    config_id="dma_quota",
                    strategy_id="dma_gated_fgi",
                    params=_dma_public_params(
                        cross_cooldown_days=0,
                        min_trade_interval_days=7,
                    ),
                ),
            ],
        )
    )

    result = run_compare_v3_on_data(
        prices=[
            {
                "date": date(2025, 1, 1),
                "price": 90_000.0,
                "extra_data": {"dma_200": 100_000.0},
            },
            {
                "date": date(2025, 1, 2),
                "price": 110_000.0,
                "extra_data": {"dma_200": 100_000.0},
            },
            {
                "date": date(2025, 1, 3),
                "price": 90_000.0,
                "extra_data": {"dma_200": 100_000.0},
            },
        ],
        sentiments={
            date(2025, 1, 1): {"label": "extreme_fear", "value": 10},
            date(2025, 1, 2): {"label": "greed", "value": 72},
            date(2025, 1, 3): {"label": "extreme_fear", "value": 12},
        },
        request=request,
        user_start_date=date(2025, 1, 1),
        config=RegimeConfig.default(),
    )

    assert (
        result.strategies["dma_unbounded"].trade_count
        > result.strategies["dma_quota"].trade_count
    )
    quota_state = result.timeline[2].strategies["dma_quota"]
    assert quota_state.execution.blocked_reason == "trade_quota_min_interval_active"
    assert (
        quota_state.execution.diagnostics.plugins["trade_quota_guard"][
            "next_trade_date"
        ]
        == "2025-01-09"
    )


def test_run_compare_v3_on_data_emits_eth_btc_rotation_asset_timeline() -> None:
    prices, sentiments, request = _build_eth_btc_rotation_inputs()
    request = materialize_compare_request(request)

    result = run_compare_v3_on_data(
        prices=prices,
        sentiments=sentiments,
        request=request,
        user_start_date=date(2025, 1, 1),
        config=RegimeConfig.default(),
    )

    assert set(result.strategies) == {"dca_classic", "eth_rotation_runtime"}
    assert [point.market.date for point in result.timeline] == [
        date(2025, 1, 1),
        date(2025, 1, 2),
        date(2025, 1, 3),
    ]

    eth_rotation_points = [
        point.strategies["eth_rotation_runtime"] for point in result.timeline
    ]
    assert eth_rotation_points[0].decision.target_allocation is not None
    assert eth_rotation_points[0].decision.target_allocation.btc == pytest.approx(0.25)
    assert eth_rotation_points[0].decision.target_allocation.eth == pytest.approx(0.25)
    assert eth_rotation_points[1].decision.target_allocation is not None
    assert (
        eth_rotation_points[1].decision.target_allocation.eth
        > eth_rotation_points[1].decision.target_allocation.btc
    )
    assert eth_rotation_points[1].execution.transfers is not None
    assert all(
        not (transfer.from_bucket == "eth" and transfer.to_bucket == "btc")
        for transfer in eth_rotation_points[1].execution.transfers
    )
    assert eth_rotation_points[2].decision.target_allocation is not None
    assert (
        eth_rotation_points[2].decision.target_allocation.btc
        > eth_rotation_points[2].decision.target_allocation.eth
    )


def test_run_compare_v3_on_data_caps_non_cross_eth_btc_stable_buy() -> None:
    prices, sentiments, request = _build_eth_btc_non_cross_buy_guard_inputs()
    request = materialize_compare_request(request)

    result = run_compare_v3_on_data(
        prices=prices,
        sentiments=sentiments,
        request=request,
        user_start_date=date(2025, 11, 15),
        config=RegimeConfig.default(),
    )

    buy_day = result.timeline[-1].strategies["eth_rotation_non_cross_buy_guard"]
    stable_buy = sum(
        transfer.amount_usd
        for transfer in buy_day.execution.transfers
        if transfer.from_bucket == "stable" and transfer.to_bucket != "stable"
    )
    buy_gate = buy_day.execution.diagnostics.plugins["dma_buy_gate"]

    assert buy_day.decision.reason == "below_extreme_fear_buy"
    assert buy_day.decision.immediate is False
    assert buy_day.decision.target_allocation.stable == pytest.approx(0.0)
    assert buy_day.portfolio.stable_usd > 0.0
    assert buy_gate is not None
    assert buy_gate["sideways_confirmed"] is True
    assert buy_gate["leg_cap_pct"] == pytest.approx(0.05)
    assert buy_gate["leg_cap_usd"] == pytest.approx(stable_buy)
    assert buy_gate["leg_spent_usd"] == pytest.approx(stable_buy)


def test_run_compare_v3_on_data_blocks_above_zone_revert_after_ratio_cross_up() -> None:
    prices, sentiments, request = (
        _build_eth_btc_ratio_cross_up_cooldown_compare_inputs()
    )
    request = materialize_compare_request(request)

    result = run_compare_v3_on_data(
        prices=prices,
        sentiments=sentiments,
        request=request,
        user_start_date=date(2025, 8, 1),
        config=RegimeConfig.default(),
    )

    eth_rotation_points = {
        point.market.date: point.strategies["eth_rotation_ratio_cross_up_cooldown"]
        for point in result.timeline
    }

    cross_day = eth_rotation_points[date(2025, 8, 3)]
    assert cross_day.decision.reason == "eth_btc_ratio_cross_up"
    assert cross_day.decision.target_allocation is not None
    assert cross_day.decision.target_allocation.btc > (
        cross_day.decision.target_allocation.eth
    )
    assert cross_day.signal is not None
    assert cross_day.signal.details["ratio"]["cooldown_active"] is True
    assert cross_day.signal.details["ratio"]["cooldown_blocked_zone"] == "above"

    for blocked_date in (date(2025, 8, 4), date(2025, 8, 5)):
        state = eth_rotation_points[blocked_date]
        assert state.signal is not None
        assert state.signal.details["ratio"]["zone"] == "above"
        assert state.signal.details["ratio"]["cooldown_active"] is True
        assert state.signal.details["ratio"]["cooldown_blocked_zone"] == "above"
        assert state.decision.reason == "eth_btc_ratio_above_side_cooldown_active"
        assert state.execution.event is None
        assert state.execution.transfers == []
        assert state.decision.target_allocation is not None
        assert state.decision.target_allocation.btc >= (
            state.decision.target_allocation.eth
        )


def test_run_compare_v3_on_data_blocks_below_zone_revert_after_ratio_cross_down() -> (
    None
):
    prices, sentiments, request = (
        _build_eth_btc_ratio_cross_down_cooldown_compare_inputs()
    )
    request = materialize_compare_request(request)

    result = run_compare_v3_on_data(
        prices=prices,
        sentiments=sentiments,
        request=request,
        user_start_date=date(2025, 8, 1),
        config=RegimeConfig.default(),
    )

    eth_rotation_points = {
        point.market.date: point.strategies["eth_rotation_ratio_cross_down_cooldown"]
        for point in result.timeline
    }

    cross_day = eth_rotation_points[date(2025, 8, 3)]
    assert cross_day.decision.reason == "eth_btc_ratio_cross_down"
    assert cross_day.decision.target_allocation is not None
    assert cross_day.decision.target_allocation.eth > (
        cross_day.decision.target_allocation.btc
    )
    assert cross_day.signal is not None
    assert cross_day.signal.details["ratio"]["cooldown_active"] is True
    assert cross_day.signal.details["ratio"]["cooldown_blocked_zone"] == "below"

    for blocked_date in (date(2025, 8, 4), date(2025, 8, 5)):
        state = eth_rotation_points[blocked_date]
        assert state.signal is not None
        assert state.signal.details["ratio"]["zone"] == "below"
        assert state.signal.details["ratio"]["cooldown_active"] is True
        assert state.signal.details["ratio"]["cooldown_blocked_zone"] == "below"
        assert state.decision.reason in {
            "eth_btc_ratio_below_side_cooldown_active",
            "dma_cross_down",
            "dma_cross_up",
        }
        assert state.decision.target_allocation is not None
        if state.decision.reason == "eth_btc_ratio_below_side_cooldown_active":
            assert state.execution.event is None
            assert state.execution.transfers == []
            assert state.decision.target_allocation.eth >= (
                state.decision.target_allocation.btc
            )
        elif state.decision.reason == "dma_cross_down":
            assert state.execution.event == "rebalance"
            assert state.decision.target_allocation.stable == pytest.approx(1.0)
        else:
            assert state.execution.event == "rebalance"
            assert state.decision.target_allocation.btc == pytest.approx(1.0)


def test_run_compare_v3_on_data_blocks_eth_btc_rotation_during_cooldown() -> None:
    prices, sentiments, request = _build_eth_btc_rotation_cooldown_inputs()
    request = materialize_compare_request(request)

    result = run_compare_v3_on_data(
        prices=prices,
        sentiments=sentiments,
        request=request,
        user_start_date=date(2025, 1, 1),
        config=RegimeConfig.default(),
    )

    eth_rotation_points = [
        point.strategies["eth_rotation_cooldown"] for point in result.timeline
    ]
    first_rotation_day = eth_rotation_points[4]
    blocked_rotation_day = eth_rotation_points[5]

    assert first_rotation_day.decision.rule_group == "rotation"
    assert first_rotation_day.execution.transfers is not None
    assert any(
        transfer.from_bucket == "btc" and transfer.to_bucket == "eth"
        for transfer in first_rotation_day.execution.transfers
    )
    assert blocked_rotation_day.decision.rule_group == "rotation"
    assert blocked_rotation_day.execution.transfers == []
    assert blocked_rotation_day.execution.event is None
    assert blocked_rotation_day.execution.blocked_reason is None
    assert blocked_rotation_day.decision.target_allocation is not None
    assert (
        blocked_rotation_day.decision.target_allocation.eth
        > blocked_rotation_day.decision.target_allocation.btc
    )


def test_run_compare_v3_on_data_outer_dma_follows_majority_spot_asset() -> None:
    prices, sentiments, request = _build_eth_btc_outer_dma_btc_price_regression_inputs()
    request = materialize_compare_request(request)

    result = run_compare_v3_on_data(
        prices=prices,
        sentiments=sentiments,
        request=request,
        user_start_date=date(2025, 1, 1),
        config=RegimeConfig.default(),
    )

    eth_rotation_points = [
        point.strategies["eth_rotation_outer_dma_btc"] for point in result.timeline
    ]
    cross_up_day = eth_rotation_points[1]
    post_rotation_day = eth_rotation_points[2]

    assert cross_up_day.portfolio.spot_asset == "ETH"
    assert cross_up_day.decision.reason == "dma_cross_up"
    assert cross_up_day.decision.immediate is True
    assert cross_up_day.decision.target_allocation.stable == pytest.approx(0.0)
    assert cross_up_day.portfolio.stable_usd == pytest.approx(0.0)
    assert any(
        transfer.from_bucket == "stable" and transfer.to_bucket == "eth"
        for transfer in cross_up_day.execution.transfers
    )
    assert post_rotation_day.signal is not None
    assert post_rotation_day.portfolio.spot_asset == "ETH"
    assert post_rotation_day.signal.details["dma"]["distance"] == pytest.approx(0.06)
    assert post_rotation_day.signal.details["dma"]["zone"] == "above"
    assert post_rotation_day.signal.details["dma"]["cross_event"] is None


def test_run_compare_v3_on_data_does_not_sell_eth_btc_rotation_on_ath_only_days() -> (
    None
):
    prices, sentiments, request = _build_eth_btc_ath_sell_suppression_inputs()
    request = materialize_compare_request(request)

    result = run_compare_v3_on_data(
        prices=prices,
        sentiments=sentiments,
        request=request,
        user_start_date=date(2025, 4, 23),
        config=RegimeConfig.default(),
    )

    eth_rotation_points = {
        point.market.date: point.strategies["eth_rotation_no_ath_sell"]
        for point in result.timeline
    }

    # With dynamic outer DMA, the initial portfolio already holds ETH (ratio below DMA),
    # and ETH is above its own DMA from the start — no dma_cross_up occurs.
    assert eth_rotation_points[date(2025, 4, 24)].portfolio.spot_asset == "ETH"
    assert eth_rotation_points[date(2025, 4, 24)].decision.action == "hold"

    for sell_date in (date(2025, 4, 28), date(2025, 5, 2), date(2025, 5, 7)):
        state = eth_rotation_points[sell_date]
        assert state.signal is not None
        assert state.signal.details["dma"]["zone"] == "above"
        assert state.decision.reason != "ath_sell"
        assert state.decision.action == "hold"
        assert state.decision.target_allocation is not None
        assert (
            state.decision.target_allocation.eth >= state.decision.target_allocation.btc
        )
        assert state.execution.event is None
        assert state.execution.transfers == []
        assert state.portfolio.spot_asset == "ETH"


def test_run_compare_v3_on_data_only_rotates_back_to_btc_after_ratio_moves_above_dma() -> (
    None
):
    prices, sentiments, request = _build_eth_btc_post_july_above_ratio_inputs()
    request = materialize_compare_request(request)

    result = run_compare_v3_on_data(
        prices=prices,
        sentiments=sentiments,
        request=request,
        user_start_date=date(2025, 7, 1),
        config=RegimeConfig.default(),
    )

    eth_rotation_points = {
        point.market.date: point.strategies["eth_rotation_post_july_above"]
        for point in result.timeline
    }

    # With dynamic outer DMA, the portfolio initially favors ETH while the ratio
    # is below DMA, then progressively rotates toward BTC once the ratio moves
    # above DMA.
    assert (
        eth_rotation_points[date(2025, 7, 2)].portfolio.asset_allocation.eth
        > eth_rotation_points[date(2025, 7, 2)].portfolio.asset_allocation.btc
    )
    assert (
        eth_rotation_points[date(2025, 7, 3)].portfolio.asset_allocation.btc
        > eth_rotation_points[date(2025, 7, 3)].portfolio.asset_allocation.eth
    )

    post_cross_states = [
        eth_rotation_points[date(2025, 7, day)] for day in (3, 4, 5, 6, 7)
    ]
    assert any(
        state.execution.transfers
        and any(
            transfer.from_bucket == "eth" and transfer.to_bucket == "btc"
            for transfer in state.execution.transfers
        )
        for state in post_cross_states
    )
    assert all(
        not (
            state.execution.transfers
            and any(
                transfer.from_bucket == "btc" and transfer.to_bucket == "eth"
                for transfer in state.execution.transfers
            )
        )
        for state in post_cross_states
    )


def test_run_compare_v3_on_data_supports_mock_recipe_without_sentiment(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    register_mock_recipe(
        monkeypatch,
        strategy_id="mock_no_sentiment",
        primary_asset="BTC",
        requires_sentiment=False,
    )
    request = materialize_compare_request(
        BacktestCompareRequestV3(
            token_symbol="BTC",
            start_date=date(2025, 1, 1),
            end_date=date(2025, 1, 2),
            total_capital=10_000.0,
            configs=[
                BacktestCompareConfigV3(
                    config_id="mock_no_sentiment",
                    strategy_id="mock_no_sentiment",
                    params={},
                )
            ],
        )
    )

    result = run_compare_v3_on_data(
        prices=[
            {"date": date(2025, 1, 1), "price": 100_000.0},
            {"date": date(2025, 1, 2), "price": 101_000.0},
        ],
        sentiments={},
        request=request,
        user_start_date=date(2025, 1, 1),
        config=RegimeConfig.default(),
    )

    assert set(result.strategies) == {"dca_classic", "mock_no_sentiment"}
    assert [point.market.date for point in result.timeline] == [
        date(2025, 1, 1),
        date(2025, 1, 2),
    ]


def test_run_compare_v3_on_data_sanitizes_dma_allocation_residue() -> None:
    prices, sentiments, request = _build_dma_long_run_inputs(days=746)
    request = materialize_compare_request(request)

    result = run_compare_v3_on_data(
        prices=prices,
        sentiments=sentiments,
        request=request,
        user_start_date=date(2025, 1, 1),
        config=RegimeConfig.default(),
    )

    summary = result.strategies["dma_gated_fgi_default"]
    assert summary.final_allocation.spot >= 0.0
    assert summary.final_allocation.stable >= 0.0
    assert (
        summary.final_allocation.spot + summary.final_allocation.stable
        == pytest.approx(1.0)
    )

    for point in result.timeline:
        strategy = point.strategies["dma_gated_fgi_default"]
        assert strategy.portfolio.allocation.spot >= 0.0
        assert strategy.portfolio.allocation.stable >= 0.0
        assert (
            strategy.portfolio.allocation.spot + strategy.portfolio.allocation.stable
            == pytest.approx(1.0)
        )
        target = strategy.decision.target_allocation
        assert target.btc >= 0.0
        assert target.eth >= 0.0
        assert target.spy >= 0.0
        assert target.stable >= 0.0
        assert target.alt == pytest.approx(0.0)
        assert (
            target.btc + target.eth + target.spy + target.stable + target.alt
            == pytest.approx(1.0)
        )


def test_run_compare_v3_on_data_attaches_window_and_respects_effective_start() -> None:
    request = materialize_compare_request(
        BacktestCompareRequestV3(
            token_symbol="BTC",
            start_date=date(2025, 1, 1),
            end_date=date(2025, 1, 4),
            total_capital=10_000.0,
            configs=[
                BacktestCompareConfigV3(
                    config_id="dma_runtime",
                    strategy_id="dma_gated_fgi",
                    params={},
                )
            ],
        )
    )
    window = BacktestWindowInfo(
        requested=BacktestPeriodInfo(
            start_date=date(2025, 1, 1),
            end_date=date(2025, 1, 4),
            days=3,
        ),
        effective=BacktestPeriodInfo(
            start_date=date(2025, 1, 3),
            end_date=date(2025, 1, 4),
            days=1,
        ),
    )

    result = run_compare_v3_on_data(
        prices=[
            {
                "date": date(2025, 1, 1),
                "price": 108_000.0,
                "extra_data": {"dma_200": 100_000.0},
            },
            {
                "date": date(2025, 1, 2),
                "price": 107_000.0,
                "extra_data": {"dma_200": 100_000.0},
            },
            {
                "date": date(2025, 1, 3),
                "price": 109_000.0,
                "extra_data": {"dma_200": 100_000.0},
            },
            {
                "date": date(2025, 1, 4),
                "price": 110_000.0,
                "extra_data": {"dma_200": 100_000.0},
            },
        ],
        sentiments={
            date(2025, 1, 1): {"label": "neutral", "value": 50},
            date(2025, 1, 2): {"label": "neutral", "value": 52},
            date(2025, 1, 3): {"label": "greed", "value": 70},
            date(2025, 1, 4): {"label": "greed", "value": 72},
        },
        request=request,
        user_start_date=date(2025, 1, 3),
        window=window,
        config=RegimeConfig.default(),
    )

    assert result.window == window
    assert [point.market.date for point in result.timeline] == [
        date(2025, 1, 3),
        date(2025, 1, 4),
    ]


# ── Top-Escape Integration Tests ────────────────────────────────────


def _build_parabolic_rise_inputs() -> tuple[
    list[dict[str, object]],
    dict[date, dict[str, object]],
    BacktestCompareRequestV3,
]:
    """BTC rises from 95k to 140k against DMA=100k, then stays high.

    Distance progression: -5%, 0%, 20%, 35%, 40%, 40%, 40%, 40%, 40%.
    Overextension (>=30%) fires on day 4 (distance=35%) and continues.
    Enough days for pacing to execute at least one rebalance.
    """
    start = date(2025, 6, 1)
    btc_prices = [
        95_000.0,
        100_000.0,
        120_000.0,
        135_000.0,
        140_000.0,
        140_000.0,
        140_000.0,
        140_000.0,
        140_000.0,
    ]
    prices = [
        {
            "date": start + timedelta(days=offset),
            "price": btc_prices[offset],
            "extra_data": {"dma_200": 100_000.0},
        }
        for offset in range(len(btc_prices))
    ]
    sentiments = {
        start + timedelta(days=offset): {"label": "neutral", "value": 50}
        for offset in range(len(btc_prices))
    }
    request = BacktestCompareRequestV3(
        token_symbol="BTC",
        start_date=start,
        end_date=start + timedelta(days=len(btc_prices) - 1),
        total_capital=10_000.0,
        configs=[
            BacktestCompareConfigV3(
                config_id="dma_overextension_test",
                strategy_id="dma_gated_fgi",
                params=_dma_public_params(cross_cooldown_days=0),
            )
        ],
    )
    return prices, sentiments, request


def test_run_compare_v3_on_data_triggers_overextension_sell_on_parabolic_rise() -> None:
    prices, sentiments, request = _build_parabolic_rise_inputs()
    request = materialize_compare_request(request)

    result = run_compare_v3_on_data(
        prices=prices,
        sentiments=sentiments,
        request=request,
        user_start_date=date(2025, 6, 1),
        config=RegimeConfig.default(),
    )

    points = {
        point.market.date: point.strategies["dma_overextension_test"]
        for point in result.timeline
    }

    # Day 1: below DMA → cross_up or hold
    day1 = points[date(2025, 6, 1)]
    assert day1.decision.reason != "above_dma_overextended_sell"

    # Day 3: distance = 20% → still below 30% threshold
    day3 = points[date(2025, 6, 3)]
    assert day3.decision.reason != "above_dma_overextended_sell"

    # Day 4: distance = 35% → overextension sell triggers (neutral regime, no FGI needed)
    day4 = points[date(2025, 6, 4)]
    assert day4.decision.reason == "above_dma_overextended_sell"
    assert day4.decision.action == "sell"

    # Day 5: distance = 40% → still overextended, continues selling
    day5 = points[date(2025, 6, 5)]
    assert day5.decision.reason == "above_dma_overextended_sell"

    # At least one day should produce an actual rebalance event (paced execution)
    overextended_days = [
        points[d]
        for d in sorted(points)
        if points[d].decision.reason == "above_dma_overextended_sell"
    ]
    assert any(day.execution.event is not None for day in overextended_days)


def _build_greed_fading_inputs() -> tuple[
    list[dict[str, object]],
    dict[date, dict[str, object]],
    BacktestCompareRequestV3,
]:
    """BTC at 110k with DMA=100k (distance=10%, well under overextension).

    FGI drops from 80 → 75 → 65 → 58 → 50.
    The FGI slope should turn negative enough by day 3-4 for greed_fading_sell.
    """
    start = date(2025, 6, 1)
    btc_price = 110_000.0
    fgi_values = [80, 75, 65, 58, 50]
    fgi_labels = ["greed", "greed", "greed", "greed", "neutral"]
    prices = [
        {
            "date": start + timedelta(days=offset),
            "price": btc_price,
            "extra_data": {"dma_200": 100_000.0},
        }
        for offset in range(len(fgi_values))
    ]
    sentiments = {
        start + timedelta(days=offset): {
            "label": fgi_labels[offset],
            "value": fgi_values[offset],
        }
        for offset in range(len(fgi_values))
    }
    request = BacktestCompareRequestV3(
        token_symbol="BTC",
        start_date=start,
        end_date=start + timedelta(days=len(fgi_values) - 1),
        total_capital=10_000.0,
        configs=[
            BacktestCompareConfigV3(
                config_id="dma_greed_fading_test",
                strategy_id="dma_gated_fgi",
                params=_dma_public_params(cross_cooldown_days=0),
            )
        ],
    )
    return prices, sentiments, request


def test_run_compare_v3_on_data_triggers_greed_fading_sell_on_declining_fgi() -> None:
    prices, sentiments, request = _build_greed_fading_inputs()
    request = materialize_compare_request(request)

    result = run_compare_v3_on_data(
        prices=prices,
        sentiments=sentiments,
        request=request,
        user_start_date=date(2025, 6, 1),
        config=RegimeConfig.default(),
    )

    points = {
        point.market.date: point.strategies["dma_greed_fading_test"]
        for point in result.timeline
    }

    # Collect reasons across the timeline
    reasons = {d: points[d].decision.reason for d in sorted(points)}

    # At some point, greed_fading_sell should appear (when slope turns negative enough
    # while still in greed regime)
    greed_fading_days = [
        d for d, reason in reasons.items() if reason == "above_greed_fading_sell"
    ]
    # Greed fading should fire on at least one greed-regime day
    assert len(greed_fading_days) > 0, f"Expected greed_fading_sell but got: {reasons}"

    # Verify that greed_fading_sell days are all sell actions
    for fading_day in greed_fading_days:
        assert points[fading_day].decision.action == "sell"

    # The last day is neutral → should not be greed_fading_sell (requires greed regime)
    last_day = max(points)
    assert points[last_day].decision.reason != "above_greed_fading_sell"
