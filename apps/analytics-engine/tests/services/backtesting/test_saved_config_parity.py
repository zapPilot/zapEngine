from __future__ import annotations

from dataclasses import replace
from datetime import date
from types import SimpleNamespace
from uuid import UUID

from src.config.strategy_presets import resolve_seed_strategy_config
from src.models.backtesting import BacktestCompareConfigV3, BacktestCompareRequestV3
from src.services.backtesting.composition import resolve_saved_strategy_config
from src.services.backtesting.execution.compare import run_compare_v3_on_data
from src.services.backtesting.execution.config import RegimeConfig
from src.services.strategy.strategy_daily_suggestion_service import (
    StrategyDailySuggestionService,
)
from tests.services.backtesting.support import (
    build_mock_composed_catalog,
    build_mock_saved_config,
    mock_portfolio,
)


def test_daily_suggestion_matches_compare_output_for_same_saved_config() -> None:
    saved_config = resolve_seed_strategy_config("dma_gated_fgi_default")
    resolved_config = replace(
        resolve_saved_strategy_config(saved_config),
        request_config_id="saved_dma",
    )
    current_date = date(2025, 1, 10)
    prices = [
        {
            "date": date(2025, 1, 8),
            "price": 99_000.0,
            "extra_data": {"dma_200": 95_000.0},
        },
        {
            "date": date(2025, 1, 9),
            "price": 99_500.0,
            "extra_data": {"dma_200": 95_000.0},
        },
        {
            "date": current_date,
            "price": 100_000.0,
            "extra_data": {"dma_200": 95_000.0},
        },
    ]
    sentiments = {
        date(2025, 1, 8): {"label": "neutral", "value": 50},
        date(2025, 1, 9): {"label": "neutral", "value": 55},
        current_date: {"label": "greed", "value": 72},
    }
    request = BacktestCompareRequestV3(
        token_symbol="BTC",
        start_date=current_date,
        end_date=current_date,
        total_capital=10_000.0,
        configs=[
            BacktestCompareConfigV3(
                config_id="saved_dma",
                saved_config_id="dma_gated_fgi_default",
            )
        ],
    )

    compare_response = run_compare_v3_on_data(
        prices=prices,
        sentiments=sentiments,
        request=request,
        user_start_date=current_date,
        resolved_configs=[resolved_config],
        config=RegimeConfig.default(),
    )
    compare_state = compare_response.timeline[0].strategies["saved_dma"]

    service = StrategyDailySuggestionService(
        landing_page_service=SimpleNamespace(
            get_landing_page_data=lambda _user_id: mock_portfolio(
                btc=5_000.0, stable=5_000.0
            )
        ),
        regime_tracking_service=SimpleNamespace(),
        sentiment_service=SimpleNamespace(
            get_current_sentiment_sync=lambda: SimpleNamespace(
                status="Greed", value=72
            ),
            get_daily_sentiment_aggregates=lambda **_: [
                {
                    "date": sentiment_date,
                    "label": payload["label"],
                    "value": payload["value"],
                }
                for sentiment_date, payload in sentiments.items()
            ],
        ),
        token_price_service=SimpleNamespace(
            get_latest_price=lambda _symbol: SimpleNamespace(
                date=current_date.isoformat(),
                price_usd=100_000.0,
            ),
            get_price_history=lambda **_: [
                SimpleNamespace(
                    date=price_row["date"].isoformat(),
                    price_usd=price_row["price"],
                )
                for price_row in prices
            ],
            get_dma_history=lambda **_: {
                price_row["date"]: price_row["extra_data"]["dma_200"]
                for price_row in prices
            },
        ),
        canonical_snapshot_service=SimpleNamespace(),
        strategy_config_store=SimpleNamespace(
            resolve_config=lambda _config_id: saved_config
        ),
    )

    daily_response = service.get_daily_suggestion(
        user_id=UUID("00000000-0000-0000-0000-000000000001"),
        config_id="dma_gated_fgi_default",
        regime_history_days=2,
    )

    assert daily_response.signal == compare_state.signal
    assert daily_response.decision == compare_state.decision
    assert daily_response.execution == compare_state.execution


def test_mock_family_matches_compare_output_with_injected_catalog() -> None:
    saved_config = build_mock_saved_config(config_id="mock_family_saved")
    catalog = build_mock_composed_catalog()
    resolved_config = replace(
        resolve_saved_strategy_config(saved_config, catalog=catalog),
        request_config_id="mock_family_saved",
    )
    current_date = date(2025, 1, 10)
    prices = [
        {"date": date(2025, 1, 9), "price": 99_500.0},
        {"date": current_date, "price": 100_000.0},
    ]
    request = BacktestCompareRequestV3(
        token_symbol="BTC",
        start_date=current_date,
        end_date=current_date,
        total_capital=10_000.0,
        configs=[
            BacktestCompareConfigV3(
                config_id="mock_family_saved",
                saved_config_id=saved_config.config_id,
            )
        ],
    )

    compare_response = run_compare_v3_on_data(
        prices=prices,
        sentiments={},
        request=request,
        user_start_date=current_date,
        resolved_configs=[resolved_config],
        config=RegimeConfig.default(),
    )
    compare_state = compare_response.timeline[0].strategies["mock_family_saved"]

    service = StrategyDailySuggestionService(
        landing_page_service=SimpleNamespace(
            get_landing_page_data=lambda _user_id: mock_portfolio(
                btc=5_000.0, stable=5_000.0
            )
        ),
        regime_tracking_service=SimpleNamespace(),
        sentiment_service=SimpleNamespace(
            get_current_sentiment_sync=lambda: SimpleNamespace(
                status="Neutral", value=50
            ),
            get_daily_sentiment_aggregates=lambda **_: [],
        ),
        token_price_service=SimpleNamespace(
            get_latest_price=lambda _symbol: SimpleNamespace(
                date=current_date.isoformat(),
                price_usd=100_000.0,
            ),
            get_price_history=lambda **_: [
                SimpleNamespace(
                    date=price_row["date"].isoformat(),
                    price_usd=price_row["price"],
                )
                for price_row in prices
            ],
        ),
        canonical_snapshot_service=SimpleNamespace(),
        strategy_config_store=SimpleNamespace(
            resolve_config=lambda _config_id: saved_config
        ),
        composition_catalog=catalog,
    )

    daily_response = service.get_daily_suggestion(
        user_id=UUID("00000000-0000-0000-0000-000000000001"),
        config_id=saved_config.config_id,
        regime_history_days=2,
    )

    assert daily_response.signal == compare_state.signal
    assert daily_response.decision == compare_state.decision
    assert daily_response.execution == compare_state.execution
