"""Integration tests for DMA-first compare wiring."""

from __future__ import annotations

import json
from datetime import date, timedelta
from pathlib import Path

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
    MACRO_FEAR_GREED_FEATURE,
    SPY_DMA_200_FEATURE,
    SPY_PRICE_FEATURE,
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
        btc_price = price_cycle[offset % len(price_cycle)]
        eth_price = 3_000.0 + float(offset % 7)
        spy_price = 500.0 + float(offset % 5)
        prices.append(
            {
                "date": snapshot_date,
                "price": btc_price,
                "prices": {"btc": btc_price, "eth": eth_price, "spy": spy_price},
                "extra_data": {
                    "dma_200": 100_000.0,
                    ETH_BTC_RATIO_FEATURE: eth_price / btc_price,
                    ETH_BTC_RATIO_DMA_200_FEATURE: 0.03,
                    SPY_PRICE_FEATURE: spy_price,
                    SPY_DMA_200_FEATURE: 480.0,
                    MACRO_FEAR_GREED_FEATURE: {
                        "score": 55.0,
                        "label": "neutral",
                        "source": "test",
                        "updated_at": snapshot_date.isoformat(),
                    },
                },
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
                config_id="portfolio_rules_runtime",
                strategy_id="dma_fgi_portfolio_rules",
                params=_dma_public_params(),
            )
        ],
    )
    return prices, sentiments, request


def test_materialize_compare_request_passes_through_configs() -> None:
    request = BacktestCompareRequestV3(
        token_symbol="BTC",
        total_capital=10_000.0,
        configs=[
            BacktestCompareConfigV3(
                config_id="portfolio_rules_only",
                strategy_id="dma_fgi_portfolio_rules",
                params={},
            )
        ],
    )

    materialized = materialize_compare_request(request)

    assert [cfg.strategy_id for cfg in materialized.configs] == [
        "dma_fgi_portfolio_rules",
    ]
    assert materialized.configs[0].config_id == "portfolio_rules_only"


def test_run_compare_v3_on_data_supports_portfolio_rules_mode() -> None:
    request = materialize_compare_request(
        BacktestCompareRequestV3(
            token_symbol="BTC",
            start_date=date(2025, 1, 1),
            end_date=date(2025, 1, 2),
            total_capital=10_000.0,
            configs=[
                BacktestCompareConfigV3(
                    config_id="portfolio_rules_runtime",
                    strategy_id="dma_fgi_portfolio_rules",
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

    assert set(result.strategies) == {"portfolio_rules_runtime"}
    dma_summary = result.strategies["portfolio_rules_runtime"]
    assert dma_summary.strategy_id == "dma_fgi_portfolio_rules"
    assert dma_summary.signal_id == "dma_fgi_portfolio_rules_signal"
    assert isinstance(dma_summary.calmar_ratio, float)
    assert isinstance(dma_summary.max_drawdown_percent, float)
    assert dma_summary.final_asset_allocation.alt == pytest.approx(0.0)
    dma_point = result.timeline[0].strategies["portfolio_rules_runtime"]
    assert dma_point.signal is not None
    assert dma_point.signal.id == "dma_fgi_portfolio_rules_signal"
    assert dma_point.portfolio.spot_asset == "BTC"
    assert dma_point.decision.target_allocation.btc == pytest.approx(
        1.0
        - dma_point.decision.target_allocation.eth
        - dma_point.decision.target_allocation.spy
        - dma_point.decision.target_allocation.stable
    )
    assert dma_point.decision.target_allocation.alt == pytest.approx(0.0)
    assert all(
        point.strategies["portfolio_rules_runtime"].portfolio.spot_asset is None
        for point in result.timeline
        if point.strategies["portfolio_rules_runtime"].portfolio.allocation.spot
        == pytest.approx(0.0)
    )
    assert dma_point.decision.rule_group in {
        "dma_fgi",
        "ath",
        "cross",
        "cooldown",
        "none",
    }


def test_run_compare_v3_on_data_writes_decision_log(tmp_path: Path) -> None:
    request = materialize_compare_request(
        BacktestCompareRequestV3(
            token_symbol="BTC",
            start_date=date(2025, 1, 1),
            end_date=date(2025, 1, 2),
            total_capital=10_000.0,
            emit_decision_log=True,
            decision_log_dir=str(tmp_path),
            configs=[
                BacktestCompareConfigV3(
                    config_id="portfolio_rules_runtime",
                    strategy_id="dma_fgi_portfolio_rules",
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
                "price": 90_000.0,
                "extra_data": {"dma_200": 100_000.0},
            },
        ],
        sentiments={
            date(2025, 1, 1): {"label": "greed", "value": 72},
            date(2025, 1, 2): {"label": "fear", "value": 25},
        },
        request=request,
        user_start_date=date(2025, 1, 1),
        config=RegimeConfig.default(),
    )

    assert result.decision_log_path == f"{tmp_path}/decisions.jsonl"
    lines = (tmp_path / "decisions.jsonl").read_text().splitlines()
    assert len(lines) == len(result.timeline)
    first = json.loads(lines[0])
    assert first["strategy"] == "portfolio_rules_runtime"
    assert set(first) == {
        "date",
        "strategy",
        "action",
        "rule",
        "group",
        "reason",
        "score",
        "signals",
        "rule_matches",
        "target_diff",
        "target",
        "executed",
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
                    strategy_id="dma_fgi_portfolio_rules",
                    params=_dma_public_params(cross_cooldown_days=0),
                ),
                BacktestCompareConfigV3(
                    config_id="dma_quota",
                    strategy_id="dma_fgi_portfolio_rules",
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

    unbounded_state = result.timeline[2].strategies["dma_unbounded"]
    assert unbounded_state.execution.blocked_reason is None
    assert unbounded_state.decision.reason == "portfolio_fgi_downshift_dca_sell"
    quota_state = result.timeline[2].strategies["dma_quota"]
    assert quota_state.decision.reason == "trade_quota_min_interval_active"


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

    assert set(result.strategies) == {"mock_no_sentiment"}
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

    summary = result.strategies["portfolio_rules_runtime"]
    assert summary.final_allocation.spot >= 0.0
    assert summary.final_allocation.stable >= 0.0
    assert (
        summary.final_allocation.spot + summary.final_allocation.stable
        == pytest.approx(1.0)
    )

    for point in result.timeline:
        strategy = point.strategies["portfolio_rules_runtime"]
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
                    config_id="portfolio_rules_runtime",
                    strategy_id="dma_fgi_portfolio_rules",
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
                strategy_id="dma_fgi_portfolio_rules",
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
    assert day1.decision.reason != "portfolio_dma_overextension_dca_sell"

    # Day 3: distance = 20% → still below 30% threshold
    day3 = points[date(2025, 6, 3)]
    assert day3.decision.reason != "portfolio_dma_overextension_dca_sell"

    # Day 4: distance = 35% → overextension sell triggers (neutral regime, no FGI needed)
    day4 = points[date(2025, 6, 4)]
    assert day4.decision.reason == "portfolio_dma_overextension_dca_sell"
    assert day4.decision.action == "sell"

    # Day 5: distance = 40% → still overextended, continues selling
    day5 = points[date(2025, 6, 5)]
    assert day5.decision.reason == "portfolio_dma_overextension_dca_sell"

    # The portfolio-rule decision should keep firing while the asset is overextended.
    overextended_days = [
        points[d]
        for d in sorted(points)
        if points[d].decision.reason == "portfolio_dma_overextension_dca_sell"
    ]
    assert len(overextended_days) >= 2


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
                strategy_id="dma_fgi_portfolio_rules",
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

    # At some point, the portfolio FGI downshift sell should appear (when slope turns negative enough
    # while still in greed regime)
    greed_fading_days = [
        d
        for d, reason in reasons.items()
        if reason == "portfolio_fgi_downshift_dca_sell"
    ]
    # FGI downshift should fire on at least one greed-regime day
    assert len(greed_fading_days) > 0, (
        f"Expected portfolio_fgi_downshift_dca_sell but got: {reasons}"
    )

    # Verify that greed_fading_sell days are all sell actions
    for fading_day in greed_fading_days:
        assert points[fading_day].decision.action == "sell"

    assert max(greed_fading_days) == date(2025, 6, 5)
