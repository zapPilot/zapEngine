"""
Comprehensive tests for SentimentDatabaseService.

Tests cover:
- Current sentiment retrieval
- Historical sentiment queries
- Error handling and edge cases
- Data transformation and validation
- Timezone handling
"""

from datetime import UTC, datetime, timedelta
from unittest.mock import MagicMock, patch

import pytest

from src.exceptions.market_sentiment import InternalError
from src.models.market_sentiment import MarketSentimentResponse
from src.services.market.sentiment_database_service import SentimentDatabaseService
from src.services.shared.query_names import QUERY_NAMES
from src.services.shared.query_service import QueryService


class TestSentimentDatabaseServiceInitialization:
    """Test service initialization."""

    def test_init_with_valid_session(self):
        """Service should initialize with a valid database session."""
        mock_db = MagicMock()
        mock_query_service = MagicMock(spec=QueryService)
        service = SentimentDatabaseService(mock_db, query_service=mock_query_service)

        assert service.db is mock_db
        assert service.query_service is mock_query_service
        assert isinstance(service, SentimentDatabaseService)


class TestTransformDbRowToResponse:
    """Test database row transformation to response model."""

    def test_transform_valid_row(self):
        """Should transform valid database row to response model."""
        service = SentimentDatabaseService(MagicMock(), query_service=MagicMock())
        timestamp = datetime(2025, 1, 15, 12, 0, 0, tzinfo=UTC)

        row = {
            "sentiment_value": 45,
            "classification": "Fear",
            "source": "alternative.me",
            "snapshot_time": timestamp,
        }

        response = service._transform_db_row_to_response(row, cached=True)

        assert response.value == 45
        assert response.status == "Fear"
        assert response.source == "alternative.me"
        assert response.cached is True
        assert response.timestamp == timestamp

    def test_transform_with_naive_datetime(self):
        """Should add UTC timezone to naive datetime."""
        service = SentimentDatabaseService(MagicMock(), query_service=MagicMock())
        naive_time = datetime(2025, 1, 15, 12, 0, 0)  # No timezone

        row = {
            "sentiment_value": 50,
            "classification": "Neutral",
            "source": "alternative.me",
            "snapshot_time": naive_time,
        }

        response = service._transform_db_row_to_response(row)

        assert response.timestamp.tzinfo == UTC
        assert response.timestamp.replace(tzinfo=None) == naive_time

    def test_transform_with_different_timezone(self):
        """Should convert non-UTC timezone to UTC."""
        service = SentimentDatabaseService(MagicMock(), query_service=MagicMock())
        from datetime import timezone

        # Create timestamp in UTC+2
        utc_plus_2 = timezone(timedelta(hours=2))
        timestamp_with_tz = datetime(2025, 1, 15, 14, 0, 0, tzinfo=utc_plus_2)

        row = {
            "sentiment_value": 75,
            "classification": "Greed",
            "source": "alternative.me",
            "snapshot_time": timestamp_with_tz,
        }

        response = service._transform_db_row_to_response(row)

        # Should be converted to UTC (14:00 UTC+2 = 12:00 UTC)
        assert response.timestamp.tzinfo == UTC
        assert response.timestamp.hour == 12

    def test_transform_invalid_sentiment_value_negative(self):
        """Should reject sentiment values less than 0."""
        service = SentimentDatabaseService(MagicMock(), query_service=MagicMock())

        row = {
            "sentiment_value": -1,
            "classification": "Fear",
            "source": "alternative.me",
            "snapshot_time": datetime.now(UTC),
        }

        with pytest.raises(ValueError, match="Invalid sentiment value"):
            service._transform_db_row_to_response(row)

    def test_transform_invalid_sentiment_value_exceeds_100(self):
        """Should reject sentiment values greater than 100."""
        service = SentimentDatabaseService(MagicMock(), query_service=MagicMock())

        row = {
            "sentiment_value": 101,
            "classification": "Extreme Greed",
            "source": "alternative.me",
            "snapshot_time": datetime.now(UTC),
        }

        with pytest.raises(ValueError, match="Invalid sentiment value"):
            service._transform_db_row_to_response(row)

    def test_transform_empty_classification(self):
        """Should reject empty classification."""
        service = SentimentDatabaseService(MagicMock(), query_service=MagicMock())

        row = {
            "sentiment_value": 50,
            "classification": "",
            "source": "alternative.me",
            "snapshot_time": datetime.now(UTC),
        }

        with pytest.raises(ValueError, match="Classification cannot be empty"):
            service._transform_db_row_to_response(row)

    def test_transform_whitespace_classification(self):
        """Should reject classification with only whitespace."""
        service = SentimentDatabaseService(MagicMock(), query_service=MagicMock())

        row = {
            "sentiment_value": 50,
            "classification": "   ",
            "source": "alternative.me",
            "snapshot_time": datetime.now(UTC),
        }

        with pytest.raises(ValueError, match="Classification cannot be empty"):
            service._transform_db_row_to_response(row)

    def test_transform_invalid_timestamp_type(self):
        """Should reject invalid timestamp types."""
        service = SentimentDatabaseService(MagicMock(), query_service=MagicMock())

        row = {
            "sentiment_value": 50,
            "classification": "Fear",
            "source": "alternative.me",
            "snapshot_time": "2025-01-15T12:00:00Z",  # String instead of datetime
        }

        with pytest.raises(ValueError, match="Invalid timestamp type"):
            service._transform_db_row_to_response(row)

    def test_transform_missing_required_fields(self):
        """Should handle missing required fields gracefully."""
        service = SentimentDatabaseService(MagicMock(), query_service=MagicMock())

        row = {
            "sentiment_value": 50,
            # Missing classification
            "source": "alternative.me",
            "snapshot_time": datetime.now(UTC),
        }

        with pytest.raises(ValueError):
            service._transform_db_row_to_response(row)

    def test_transform_cached_flag_propagates(self):
        """Should propagate cached flag to response."""
        service = SentimentDatabaseService(MagicMock(), query_service=MagicMock())

        row = {
            "sentiment_value": 50,
            "classification": "Fear",
            "source": "alternative.me",
            "snapshot_time": datetime.now(UTC),
        }

        # Test cached=True
        response_cached = service._transform_db_row_to_response(row, cached=True)
        assert response_cached.cached is True

        # Test cached=False (default)
        response_uncached = service._transform_db_row_to_response(row, cached=False)
        assert response_uncached.cached is False


class TestGetCurrentSentiment:
    """Test get_current_sentiment method."""

    def test_get_current_sentiment_sync_success(self):
        """Should retrieve and return current sentiment snapshot via sync accessor."""
        mock_db = MagicMock()
        mock_query_service = MagicMock(spec=QueryService)
        service = SentimentDatabaseService(mock_db, query_service=mock_query_service)

        timestamp = datetime(2025, 1, 15, 12, 0, 0, tzinfo=UTC)
        mock_row = {
            "sentiment_value": 45,
            "classification": "Fear",
            "source": "alternative.me",
            "snapshot_time": timestamp,
        }

        mock_query_service.execute_query_one.return_value = mock_row

        with patch("src.services.market.sentiment_database_service.logger"):
            response = service.get_current_sentiment_sync()

        assert isinstance(response, MarketSentimentResponse)
        assert response.value == 45
        assert response.status == "Fear"
        assert response.cached is True

        # Verify query name
        args, _ = mock_query_service.execute_query_one.call_args
        assert args[1] == QUERY_NAMES.SENTIMENT_CURRENT

    def test_get_current_sentiment_sync_no_data(self):
        """Should raise error when sync accessor has no sentiment data."""
        mock_db = MagicMock()
        mock_query_service = MagicMock(spec=QueryService)
        service = SentimentDatabaseService(mock_db, query_service=mock_query_service)

        mock_query_service.execute_query_one.return_value = None

        with pytest.raises(InternalError):
            service.get_current_sentiment_sync()

    @pytest.mark.asyncio
    async def test_get_current_sentiment_async_delegates_to_sync(self):
        """Async accessor should delegate to sync accessor for parity."""
        mock_db = MagicMock()
        mock_query_service = MagicMock(spec=QueryService)
        service = SentimentDatabaseService(mock_db, query_service=mock_query_service)

        expected = MarketSentimentResponse(
            value=62,
            status="Greed",
            timestamp=datetime(2025, 1, 15, 12, 0, 0, tzinfo=UTC),
            source="alternative.me",
            cached=True,
        )
        service.get_current_sentiment_sync = MagicMock(return_value=expected)

        response = await service.get_current_sentiment()

        service.get_current_sentiment_sync.assert_called_once_with()
        assert response == expected

    @pytest.mark.asyncio
    async def test_get_current_sentiment_success(self):
        """Should retrieve and return current sentiment snapshot."""
        mock_db = MagicMock()
        mock_query_service = MagicMock(spec=QueryService)
        service = SentimentDatabaseService(mock_db, query_service=mock_query_service)

        timestamp = datetime(2025, 1, 15, 12, 0, 0, tzinfo=UTC)
        mock_row = {
            "sentiment_value": 45,
            "classification": "Fear",
            "source": "alternative.me",
            "snapshot_time": timestamp,
        }

        mock_query_service.execute_query_one.return_value = mock_row

        with patch("src.services.market.sentiment_database_service.logger"):
            response = await service.get_current_sentiment()

        assert isinstance(response, MarketSentimentResponse)
        assert response.value == 45
        assert response.status == "Fear"
        assert response.cached is True

        # Verify query name
        args, _ = mock_query_service.execute_query_one.call_args
        assert args[1] == QUERY_NAMES.SENTIMENT_CURRENT

    @pytest.mark.asyncio
    async def test_get_current_sentiment_no_data(self):
        """Should raise error when no sentiment data is available."""
        mock_db = MagicMock()
        mock_query_service = MagicMock(spec=QueryService)
        service = SentimentDatabaseService(mock_db, query_service=mock_query_service)

        mock_query_service.execute_query_one.return_value = None

        with pytest.raises(InternalError):
            await service.get_current_sentiment()

    @pytest.mark.asyncio
    async def test_get_current_sentiment_database_error(self):
        """Should handle database errors gracefully."""
        mock_db = MagicMock()
        mock_query_service = MagicMock(spec=QueryService)
        service = SentimentDatabaseService(mock_db, query_service=mock_query_service)

        mock_query_service.execute_query_one.side_effect = Exception(
            "Database connection failed"
        )

        with pytest.raises(InternalError):
            await service.get_current_sentiment()

    @pytest.mark.asyncio
    async def test_get_current_sentiment_prefers_newest_timestamp_across_sources(self):
        """Should return newest sentiment snapshot regardless of source."""
        # Note: logic for "preferring newest" is in the SQL query (ORDER BY snapshot_time DESC LIMIT 1)
        # So unit test just checks that if query returns X, service returns mapped X.
        mock_db = MagicMock()
        mock_query_service = MagicMock(spec=QueryService)
        service = SentimentDatabaseService(mock_db, query_service=mock_query_service)

        newer_timestamp = datetime(2025, 12, 27, 2, 8, 10, tzinfo=UTC)
        mock_row = {
            "sentiment_value": 28,
            "classification": "Fear",
            "source": "coinmarketcap",
            "snapshot_time": newer_timestamp,
        }

        mock_query_service.execute_query_one.return_value = mock_row

        with patch("src.services.market.sentiment_database_service.logger"):
            response = await service.get_current_sentiment()

        assert isinstance(response, MarketSentimentResponse)
        assert response.value == 28
        assert response.source == "coinmarketcap"
        assert response.timestamp == newer_timestamp


class TestGetSentimentHistory:
    """Test get_sentiment_history method."""

    @pytest.mark.asyncio
    async def test_get_sentiment_history_success(self):
        """Should retrieve historical sentiment snapshots."""
        mock_db = MagicMock()
        mock_query_service = MagicMock(spec=QueryService)
        service = SentimentDatabaseService(mock_db, query_service=mock_query_service)

        base_time = datetime(2025, 1, 15, 12, 0, 0, tzinfo=UTC)
        mock_rows = [
            {
                "sentiment_value": 40,
                "classification": "Fear",
                "source": "alternative.me",
                "snapshot_time": base_time,
            },
            {
                "sentiment_value": 50,
                "classification": "Neutral",
                "source": "alternative.me",
                "snapshot_time": base_time + timedelta(hours=6),
            },
            {
                "sentiment_value": 65,
                "classification": "Greed",
                "source": "alternative.me",
                "snapshot_time": base_time + timedelta(hours=12),
            },
        ]

        mock_query_service.execute_query.return_value = mock_rows

        with patch("src.services.market.sentiment_database_service.logger"):
            responses = await service.get_sentiment_history(hours=24)

        assert len(responses) == 3
        # Verify query name and params
        args, _ = mock_query_service.execute_query.call_args
        assert args[1] == QUERY_NAMES.SENTIMENT_HISTORY
        # Implementation maps hours to min_timestamp parameter
        assert "min_timestamp" in args[2]
        assert "max_timestamp" in args[2]

    @pytest.mark.asyncio
    async def test_get_sentiment_history_uses_explicit_date_range(self):
        """Should query requested historical bounds instead of relative now only."""
        mock_db = MagicMock()
        mock_query_service = MagicMock(spec=QueryService)
        service = SentimentDatabaseService(mock_db, query_service=mock_query_service)
        mock_query_service.execute_query.return_value = []

        with patch("src.services.market.sentiment_database_service.logger"):
            responses = await service.get_sentiment_history(
                start_time=datetime(2024, 11, 1, tzinfo=UTC),
                end_time=datetime(2026, 4, 6, tzinfo=UTC),
            )

        assert responses == []
        args, _ = mock_query_service.execute_query.call_args
        assert args[2]["min_timestamp"] == datetime(2024, 11, 1, tzinfo=UTC)
        assert args[2]["max_timestamp"] == datetime(2026, 4, 6, tzinfo=UTC)

    @pytest.mark.asyncio
    async def test_get_sentiment_history_no_data(self):
        """Should return empty list when no data is available."""
        mock_db = MagicMock()
        mock_query_service = MagicMock(spec=QueryService)
        service = SentimentDatabaseService(mock_db, query_service=mock_query_service)

        mock_query_service.execute_query.return_value = []

        with patch("src.services.market.sentiment_database_service.logger"):
            responses = await service.get_sentiment_history(hours=24)

        assert responses == []

    @pytest.mark.asyncio
    async def test_get_sentiment_history_invalid_hours(self):
        """Should reject invalid hours parameter."""
        service = SentimentDatabaseService(MagicMock(), query_service=MagicMock())

        with pytest.raises(ValueError, match="Hours must be >= 1"):
            await service.get_sentiment_history(hours=0)

    @pytest.mark.asyncio
    async def test_get_sentiment_history_negative_hours(self):
        """Should reject negative hours."""
        service = SentimentDatabaseService(MagicMock(), query_service=MagicMock())

        with pytest.raises(ValueError, match="Hours must be >= 1"):
            await service.get_sentiment_history(hours=-5)

    @pytest.mark.asyncio
    async def test_get_sentiment_history_skips_malformed_rows(self):
        """Should skip malformed rows and continue processing."""
        mock_db = MagicMock()
        mock_query_service = MagicMock(spec=QueryService)
        service = SentimentDatabaseService(mock_db, query_service=mock_query_service)

        base_time = datetime(2025, 1, 15, 12, 0, 0, tzinfo=UTC)
        mock_rows = [
            {
                "sentiment_value": 40,
                "classification": "Fear",
                "source": "alternative.me",
                "snapshot_time": base_time,
            },
            {
                # Malformed row - invalid sentiment value
                "sentiment_value": 150,
                "classification": "Invalid",
                "source": "alternative.me",
                "snapshot_time": base_time + timedelta(hours=6),
            },
            {
                "sentiment_value": 65,
                "classification": "Greed",
                "source": "alternative.me",
                "snapshot_time": base_time + timedelta(hours=12),
            },
        ]

        mock_query_service.execute_query.return_value = mock_rows

        with patch("src.services.market.sentiment_database_service.logger"):
            responses = await service.get_sentiment_history(hours=24)

        # Should return 2 valid rows, skipping the malformed one
        assert len(responses) == 2
        assert responses[0].value == 40
        assert responses[1].value == 65

    @pytest.mark.asyncio
    async def test_get_sentiment_history_database_error(self):
        """Should handle database errors gracefully."""
        mock_db = MagicMock()
        mock_query_service = MagicMock(spec=QueryService)
        service = SentimentDatabaseService(mock_db, query_service=mock_query_service)

        mock_query_service.execute_query.side_effect = Exception(
            "Database connection lost"
        )

        with pytest.raises(InternalError):
            await service.get_sentiment_history(hours=24)

    @pytest.mark.asyncio
    async def test_get_sentiment_history_returns_data_from_all_sources(self):
        """Should return historical data from all sources (logic in SQL, test validates mapping)."""
        mock_db = MagicMock()
        mock_query_service = MagicMock(spec=QueryService)
        service = SentimentDatabaseService(mock_db, query_service=mock_query_service)

        mock_rows = [
            {
                "sentiment_value": 40,
                "classification": "Fear",
                "source": "A",
                "snapshot_time": datetime.now(UTC),
            },
            {
                "sentiment_value": 42,
                "classification": "Fear",
                "source": "B",
                "snapshot_time": datetime.now(UTC),
            },
        ]
        mock_query_service.execute_query.return_value = mock_rows

        with patch("src.services.market.sentiment_database_service.logger"):
            responses = await service.get_sentiment_history(hours=24)

        assert len(responses) == 2


class TestGetSentimentAtTime:
    """Test get_sentiment_at_time method."""

    @pytest.mark.asyncio
    async def test_get_sentiment_at_time_success(self):
        """Should retrieve sentiment closest to specified time."""
        mock_db = MagicMock()
        mock_query_service = MagicMock(spec=QueryService)
        service = SentimentDatabaseService(mock_db, query_service=mock_query_service)

        target_time = datetime(2025, 1, 15, 12, 0, 0, tzinfo=UTC)
        mock_row = {
            "sentiment_value": 45,
            "classification": "Fear",
            "source": "alternative.me",
            "snapshot_time": target_time,
        }

        mock_query_service.execute_query_one.return_value = mock_row

        with patch("src.services.market.sentiment_database_service.logger"):
            response = await service.get_sentiment_at_time(target_time)

        assert response is not None
        assert response.value == 45

        # Verify params
        args, _ = mock_query_service.execute_query_one.call_args
        assert args[1] == QUERY_NAMES.SENTIMENT_AT_TIME
        assert args[2]["target_time"] == target_time

    @pytest.mark.asyncio
    async def test_get_sentiment_at_time_no_data(self):
        """Should return None when no data is available."""
        mock_db = MagicMock()
        mock_query_service = MagicMock(spec=QueryService)
        service = SentimentDatabaseService(mock_db, query_service=mock_query_service)

        mock_query_service.execute_query_one.return_value = None

        with patch("src.services.market.sentiment_database_service.logger"):
            response = await service.get_sentiment_at_time(datetime.now(UTC))

        assert response is None

    @pytest.mark.asyncio
    async def test_get_sentiment_at_time_with_naive_datetime(self):
        """Should handle naive datetime by assuming UTC."""
        mock_db = MagicMock()
        mock_query_service = MagicMock(spec=QueryService)
        service = SentimentDatabaseService(mock_db, query_service=mock_query_service)

        naive_time = datetime(2025, 1, 15, 12, 0, 0)  # No timezone
        mock_row = {
            "sentiment_value": 50,
            "classification": "Neutral",
            "source": "alternative.me",
            "snapshot_time": naive_time.replace(tzinfo=UTC),
        }

        mock_query_service.execute_query_one.return_value = mock_row

        with patch("src.services.market.sentiment_database_service.logger"):
            response = await service.get_sentiment_at_time(naive_time)

        assert response is not None
        # Verify updated target_time arg has UTC
        args, _ = mock_query_service.execute_query_one.call_args
        assert args[2]["target_time"].tzinfo == UTC

    @pytest.mark.asyncio
    async def test_get_sentiment_at_time_invalid_type(self):
        """Should reject invalid timestamp types."""
        service = SentimentDatabaseService(MagicMock(), query_service=MagicMock())

        with pytest.raises(ValueError, match="target_time must be a datetime"):
            await service.get_sentiment_at_time("2025-01-15T12:00:00Z")

    @pytest.mark.asyncio
    async def test_get_sentiment_at_time_database_error(self):
        """Should handle database errors gracefully."""
        mock_db = MagicMock()
        mock_query_service = MagicMock(spec=QueryService)
        service = SentimentDatabaseService(mock_db, query_service=mock_query_service)

        mock_query_service.execute_query_one.side_effect = Exception("Database error")

        with pytest.raises(InternalError):
            await service.get_sentiment_at_time(datetime.now(UTC))


class TestErrorHandling:
    """Test error handling methods."""

    def test_handle_query_error_creates_internal_error(self):
        """Should create InternalError with descriptive message."""
        service = SentimentDatabaseService(MagicMock(), query_service=MagicMock())
        original_error = Exception("Connection timeout")

        error = service._handle_query_error(original_error, "test_operation")

        assert isinstance(error, InternalError)
        assert "test_operation" in error.details.get("reason", "")
        # QueryService wraps error, but here we test the service wrapper logic itself
        # passed generic exception
        assert "Connection timeout" in error.details.get("reason", "")

    def test_handle_query_error_truncates_long_messages(self):
        """Should truncate error messages to prevent overflow."""
        service = SentimentDatabaseService(MagicMock(), query_service=MagicMock())
        long_message = "x" * 1000
        original_error = Exception(long_message)

        error = service._handle_query_error(original_error, "operation")

        # Message should be truncated to 200 chars in details
        reason = error.details.get("reason", "")
        assert len(reason) <= 300  # Should be truncated


class TestBoundaryConditions:
    """Test boundary conditions and edge cases."""

    def test_sentiment_value_boundaries(self):
        """Should accept valid boundary values 0 and 100."""
        service = SentimentDatabaseService(MagicMock(), query_service=MagicMock())
        timestamp = datetime.now(UTC)

        # Test 0
        row_zero = {
            "sentiment_value": 0,
            "classification": "Extreme Fear",
            "source": "alternative.me",
            "snapshot_time": timestamp,
        }
        response_zero = service._transform_db_row_to_response(row_zero)
        assert response_zero.value == 0

        # Test 100
        row_hundred = {
            "sentiment_value": 100,
            "classification": "Extreme Greed",
            "source": "alternative.me",
            "snapshot_time": timestamp,
        }
        response_hundred = service._transform_db_row_to_response(row_hundred)
        assert response_hundred.value == 100

    @pytest.mark.asyncio
    async def test_get_sentiment_history_one_hour(self):
        """Should handle minimum hours parameter."""
        mock_db = MagicMock()
        mock_query_service = MagicMock(spec=QueryService)
        service = SentimentDatabaseService(mock_db, query_service=mock_query_service)

        mock_query_service.execute_query.return_value = []

        with patch("src.services.market.sentiment_database_service.logger"):
            # Should not raise error for hours=1
            responses = await service.get_sentiment_history(hours=1)
            assert responses == []

    @pytest.mark.asyncio
    async def test_get_sentiment_history_large_hour_range(self):
        """Should handle large hour ranges (e.g., 365 days)."""
        mock_db = MagicMock()
        mock_query_service = MagicMock(spec=QueryService)
        service = SentimentDatabaseService(mock_db, query_service=mock_query_service)

        mock_query_service.execute_query.return_value = []

        with patch("src.services.market.sentiment_database_service.logger"):
            # Should handle 1 year of history
            responses = await service.get_sentiment_history(hours=8760)
            assert responses == []
