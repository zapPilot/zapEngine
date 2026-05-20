"""Supplemental tests for SentimentDatabaseService coverage."""

from datetime import UTC, date, datetime
from unittest.mock import MagicMock, patch

import pytest

from src.exceptions.market_sentiment import MarketSentimentError
from src.services.market.sentiment_database_service import (
    SentimentDatabaseService,
    _coerce_history_bound,
)
from src.services.shared.query_names import QUERY_NAMES


@pytest.fixture
def mock_db():
    return MagicMock()


def test_init_default_query_service(mock_db):
    """Test initialization uses default query service if not provided."""
    with patch("src.services.dependencies.get_query_service") as mock_get_qs:
        mock_qs = MagicMock()
        mock_get_qs.return_value = mock_qs

        service = SentimentDatabaseService(mock_db, query_service=None)

        assert service.query_service is mock_qs
        mock_get_qs.assert_called_once()


def test_transform_db_row_none_sentiment_value(mock_db):
    """Test _transform_db_row_to_response with None sentiment value."""
    service = SentimentDatabaseService(mock_db, MagicMock())

    row = {
        "sentiment_value": None,
        "classification": "Neutral",
        "snapshot_time": "2023-01-01T12:00:00Z",  # Will raise since datetime check is strict
    }

    # We need to mock datetime check or provide datetime
    from datetime import datetime

    row["snapshot_time"] = datetime(2023, 1, 1)

    # This should default value to 0
    response = service._transform_db_row_to_response(row)
    assert response.value == 0


@pytest.mark.asyncio
async def test_get_current_sentiment_reraise_domain_error(mock_db):
    """Test get_current_sentiment reraises MarketSentimentError as-is."""
    mock_qs = MagicMock()
    service = SentimentDatabaseService(mock_db, mock_qs)

    # Simulate internal method raising MarketSentimentError
    # (Since execute_query_one doesn't usually raise this, we can mock _transform_db_row_to_response or simulate validation error that might bubble up if checking logic was different)
    # Actually code is:
    # try: ... except MarketSentimentError: raise
    # So we need execute_query_one or logic inside try block to raise it.

    mock_qs.execute_query_one.side_effect = MarketSentimentError(
        "Domain error", 500, "ERR"
    )

    with pytest.raises(MarketSentimentError):
        await service.get_current_sentiment()


@pytest.mark.asyncio
async def test_get_sentiment_history_reraise_domain_error(mock_db):
    """Test get_sentiment_history reraises MarketSentimentError as-is."""
    mock_qs = MagicMock()
    service = SentimentDatabaseService(mock_db, mock_qs)

    mock_qs.execute_query.side_effect = MarketSentimentError("Domain error", 500, "ERR")

    with pytest.raises(MarketSentimentError):
        await service.get_sentiment_history()


def test_get_daily_sentiment_aggregates_raises_internal_error_on_exception(mock_db):
    """Lines 374-376: get_daily_sentiment_aggregates wraps unexpected exceptions
    in InternalError and re-raises.
    """
    from src.exceptions.market_sentiment import InternalError

    mock_qs = MagicMock()
    mock_qs.execute_query.side_effect = RuntimeError("DB connection lost")

    service = SentimentDatabaseService(mock_db, mock_qs)

    with pytest.raises(
        InternalError, match="Failed to fetch daily sentiment aggregates"
    ):
        service.get_daily_sentiment_aggregates()


def test_coerce_history_bound_sets_date_to_start_or_end_of_utc_day() -> None:
    assert _coerce_history_bound(date(2026, 4, 29), end_of_day=False) == datetime(
        2026, 4, 29, tzinfo=UTC
    )
    assert _coerce_history_bound(date(2026, 4, 29), end_of_day=True) == datetime(
        2026, 4, 29, 23, 59, 59, 999999, tzinfo=UTC
    )


def test_coerce_history_bound_normalizes_datetime_to_utc() -> None:
    value = datetime(2026, 4, 29, 21, 30, tzinfo=UTC)

    assert _coerce_history_bound(value, end_of_day=True) == datetime(
        2026, 4, 29, 21, 30, tzinfo=UTC
    )


@pytest.mark.asyncio
async def test_get_sentiment_history_uses_explicit_date_bounds(mock_db) -> None:
    mock_qs = MagicMock()
    mock_qs.execute_query.return_value = [
        {
            "sentiment_value": 25,
            "classification": "Fear",
            "source": "alternative.me",
            "snapshot_time": datetime(2026, 4, 29, 12, tzinfo=UTC),
        }
    ]
    service = SentimentDatabaseService(mock_db, mock_qs)

    result = await service.get_sentiment_history(
        start_time=date(2026, 4, 29),
        end_time=date(2026, 4, 30),
    )

    assert [item.value for item in result] == [25]
    mock_qs.execute_query.assert_called_once_with(
        service.db,
        QUERY_NAMES.SENTIMENT_HISTORY,
        {
            "min_timestamp": datetime(2026, 4, 29, tzinfo=UTC),
            "max_timestamp": datetime(2026, 4, 30, 23, 59, 59, 999999, tzinfo=UTC),
        },
    )
