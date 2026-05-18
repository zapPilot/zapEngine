from __future__ import annotations

import logging
from datetime import UTC, date, datetime
from unittest.mock import MagicMock

import pytest

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


def test_get_current_macro_fear_greed_transforms_string_dates_and_defaults_rating() -> (
    None
):
    query_service = MagicMock(spec=QueryService)
    query_service.execute_query_one.return_value = {
        "snapshot_date": "2026-04-29T13:00:00Z",
        "score": "12.5",
        "label": " fear ",
        "source": " cnn ",
        "provider_updated_at": "2026-04-29T13:00:00Z",
        "raw_rating": None,
    }
    service = MacroFearGreedDatabaseService(MagicMock(), query_service)

    result = service.get_current_macro_fear_greed()

    assert result == {
        "score": 12.5,
        "label": "fear",
        "source": "cnn",
        "updated_at": "2026-04-29T13:00:00+00:00",
        "raw_rating": None,
    }
    query_service.execute_query_one.assert_called_once_with(
        service.db,
        QUERY_NAMES.MACRO_FEAR_GREED_CURRENT,
    )


@pytest.mark.parametrize(
    ("row", "message"),
    [
        (
            {
                "snapshot_date": object(),
                "score": 50,
                "label": "neutral",
                "source": "cnn",
                "provider_updated_at": datetime(2026, 4, 29, tzinfo=UTC),
            },
            "Invalid macro FGI snapshot_date",
        ),
        (
            {
                "snapshot_date": date(2026, 4, 29),
                "score": 101,
                "label": "greed",
                "source": "cnn",
                "provider_updated_at": datetime(2026, 4, 29, tzinfo=UTC),
            },
            "Invalid macro FGI score",
        ),
        (
            {
                "snapshot_date": date(2026, 4, 29),
                "score": 50,
                "label": "",
                "source": "cnn",
                "provider_updated_at": datetime(2026, 4, 29, tzinfo=UTC),
            },
            "Invalid macro FGI label/source",
        ),
        (
            {
                "snapshot_date": date(2026, 4, 29),
                "score": 50,
                "label": "neutral",
                "source": "cnn",
                "provider_updated_at": object(),
            },
            "Invalid macro FGI provider_updated_at",
        ),
    ],
)
def test_transform_row_rejects_malformed_macro_rows(
    row: dict[str, object],
    message: str,
) -> None:
    with pytest.raises(ValueError, match=message):
        MacroFearGreedDatabaseService._transform_row(row)


def test_get_daily_macro_fear_greed_skips_malformed_rows(
    caplog: pytest.LogCaptureFixture,
) -> None:
    query_service = MagicMock(spec=QueryService)
    query_service.execute_query.return_value = [
        {
            "snapshot_date": date(2026, 4, 29),
            "score": 50,
            "label": "neutral",
            "source": "cnn",
            "provider_updated_at": datetime(2026, 4, 29),
        },
        {
            "snapshot_date": date(2026, 4, 30),
            "score": 150,
            "label": "extreme greed",
            "source": "cnn",
            "provider_updated_at": datetime(2026, 4, 30, tzinfo=UTC),
        },
    ]
    service = MacroFearGreedDatabaseService(MagicMock(), query_service)

    with caplog.at_level(logging.WARNING):
        result = service.get_daily_macro_fear_greed()

    assert list(result) == [date(2026, 4, 29)]
    assert result[date(2026, 4, 29)]["updated_at"] == "2026-04-29T00:00:00+00:00"
    assert "Skipping malformed macro FGI row" in caplog.text
