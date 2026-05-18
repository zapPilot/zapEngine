from __future__ import annotations

from datetime import date

import pytest
from pydantic import ValidationError

from src.models.market_data_freshness import MarketDataFreshness, StaleFeatureInfo


def test_market_data_freshness_marks_stale_from_max_lag_days() -> None:
    freshness = MarketDataFreshness(
        requested_date=date(2025, 1, 5),
        effective_date=date(2025, 1, 3),
        missing_dates=[date(2025, 1, 4), date(2025, 1, 5)],
        stale_features=[
            StaleFeatureInfo(
                feature_name="dma_200",
                asset="BTC",
                requested_date=date(2025, 1, 5),
                effective_date=date(2025, 1, 3),
                lag_days=2,
            )
        ],
        max_lag_days=2,
    )

    assert freshness.is_stale is True


def test_market_data_freshness_rejects_effective_date_after_requested_date() -> None:
    with pytest.raises(ValidationError, match="cannot be after requested_date"):
        MarketDataFreshness(
            requested_date=date(2025, 1, 3),
            effective_date=date(2025, 1, 4),
            max_lag_days=0,
        )
