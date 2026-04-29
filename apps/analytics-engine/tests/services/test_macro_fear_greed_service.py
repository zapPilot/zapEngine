from __future__ import annotations

from datetime import UTC, date, datetime
from unittest.mock import MagicMock

from src.services.market.macro_fear_greed_service import MacroFearGreedDatabaseService
from src.services.shared.query_names import QUERY_NAMES
from src.services.shared.query_service import QueryService


def test_get_daily_macro_fear_greed_transforms_rows() -> None:
    query_service = MagicMock(spec=QueryService)
    query_service.execute_query.return_value = [
        {
            "snapshot_date": date(2026, 4, 29),
            "score": 72.4,
            "label": "greed",
            "source": "cnn_fear_greed_unofficial",
            "provider_updated_at": datetime(2026, 4, 29, tzinfo=UTC),
            "raw_rating": "Greed",
        }
    ]
    service = MacroFearGreedDatabaseService(MagicMock(), query_service)

    result = service.get_daily_macro_fear_greed(
        start_date=date(2026, 4, 1),
        end_date=date(2026, 4, 30),
    )

    assert result[date(2026, 4, 29)]["score"] == 72.4
    assert result[date(2026, 4, 29)]["label"] == "greed"
    query_service.execute_query.assert_called_once_with(
        service.db,
        QUERY_NAMES.MACRO_FEAR_GREED_DAILY,
        {"start_date": date(2026, 4, 1), "end_date": date(2026, 4, 30)},
    )


def test_get_current_macro_fear_greed_returns_none_when_empty() -> None:
    query_service = MagicMock(spec=QueryService)
    query_service.execute_query_one.return_value = None
    service = MacroFearGreedDatabaseService(MagicMock(), query_service)

    assert service.get_current_macro_fear_greed() is None
