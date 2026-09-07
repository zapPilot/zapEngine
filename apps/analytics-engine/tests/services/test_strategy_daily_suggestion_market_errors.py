"""Error-classification regression tests for daily suggestion market data."""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from src.config.strategy_presets import get_default_seed_strategy_config
from src.services.backtesting.composition import resolve_saved_strategy_config
from src.services.backtesting.composition_catalog import get_default_composition_catalog
from src.services.exceptions import MarketDataUnavailableError
from src.services.strategy.strategy_daily_suggestion_service import (
    StrategyDailySuggestionService,
)


def test_missing_latest_primary_asset_price_is_market_data_unavailable() -> None:
    service = StrategyDailySuggestionService(
        landing_page_service=SimpleNamespace(),
        regime_tracking_service=SimpleNamespace(),
        sentiment_service=SimpleNamespace(),
        token_price_service=SimpleNamespace(get_latest_price=lambda _asset: None),
    )
    resolved_config = resolve_saved_strategy_config(
        get_default_seed_strategy_config(),
        catalog=get_default_composition_catalog(),
    )

    with pytest.raises(MarketDataUnavailableError) as exc_info:
        service._load_market_data(
            resolved_config=resolved_config,
            lookback_days=30,
        )

    assert str(exc_info.value) == "Missing latest BTC price"
    assert exc_info.value.missing_assets == ["BTC"]
    assert exc_info.value.oldest_data_date is None
