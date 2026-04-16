"""
Comprehensive tests for RegimeTrackingService.

Tests cover:
- Direction calculation (all regime transitions)
- Regime history retrieval with database mocking
- Error handling (DatabaseError, DataNotFoundError)
- Edge cases and validation

Coverage target: 85%+
"""

from datetime import UTC, datetime, timedelta
from unittest.mock import MagicMock, patch

import pytest
from sqlalchemy.exc import SQLAlchemyError

from src.core.exceptions import DatabaseError, DataNotFoundError
from src.models.regime_tracking import DirectionType, RegimeId
from src.services.market.regime_tracking_service import RegimeTrackingService
from src.services.shared.query_names import QUERY_NAMES
from src.services.shared.query_service import QueryService


class TestRegimeTrackingServiceInitialization:
    """Test service initialization."""

    def test_init_with_valid_session(self):
        """Service should initialize with a valid database session."""
        mock_db = MagicMock()
        mock_query_service = MagicMock(spec=QueryService)
        service = RegimeTrackingService(mock_db, query_service=mock_query_service)

        assert service.db is mock_db
        assert service.query_service is mock_query_service
        assert isinstance(service, RegimeTrackingService)


class TestComputeDirection:
    """Test compute_direction() with all regime transition combinations."""

    @pytest.fixture
    def service(self):
        """Create service instance for testing."""
        return RegimeTrackingService(MagicMock(), query_service=MagicMock())

    @pytest.mark.parametrize(
        "new_regime,prev_regime,expected",
        [
            # No previous regime (first transition)
            (RegimeId.n, None, DirectionType.default),
            # Moving toward greed (fromLeft)
            (RegimeId.f, RegimeId.ef, DirectionType.fromLeft),
            (RegimeId.n, RegimeId.ef, DirectionType.fromLeft),
            (RegimeId.n, RegimeId.f, DirectionType.fromLeft),
            (RegimeId.g, RegimeId.f, DirectionType.fromLeft),
            (RegimeId.g, RegimeId.n, DirectionType.fromLeft),
            (RegimeId.eg, RegimeId.n, DirectionType.fromLeft),
            (RegimeId.eg, RegimeId.g, DirectionType.fromLeft),
            # Moving toward fear (fromRight)
            (RegimeId.g, RegimeId.eg, DirectionType.fromRight),
            (RegimeId.n, RegimeId.eg, DirectionType.fromRight),
            (RegimeId.n, RegimeId.g, DirectionType.fromRight),
            (RegimeId.f, RegimeId.g, DirectionType.fromRight),
            (RegimeId.f, RegimeId.n, DirectionType.fromRight),
            (RegimeId.ef, RegimeId.n, DirectionType.fromRight),
            (RegimeId.ef, RegimeId.f, DirectionType.fromRight),
        ],
    )
    def test_compute_direction(self, service, new_regime, prev_regime, expected):
        """Verify direction for all regime transition combinations."""
        assert service.compute_direction(new_regime, prev_regime) == expected

    def test_same_regime_returns_default_with_warning(self, service):
        """Same regime transition should return default with warning."""
        with patch("src.services.market.regime_tracking_service.logger") as mock_logger:
            direction = service.compute_direction(RegimeId.n, RegimeId.n)
            assert direction == DirectionType.default
            mock_logger.warning.assert_called_once()


class TestGetRegimeHistory:
    """Test get_regime_history() with database mocking."""

    @pytest.fixture
    def mock_query_service(self):
        return MagicMock(spec=QueryService)

    @pytest.fixture
    def service(self, mock_query_service):
        """Create service instance with mocked database."""
        mock_db = MagicMock()
        return RegimeTrackingService(mock_db, query_service=mock_query_service)

    @pytest.fixture
    def mock_transition_rows(self):
        """Mock database rows for regime transitions."""
        now = datetime.now(UTC)
        return [
            {
                "id": "550e8400-e29b-41d4-a716-446655440000",
                "from_regime": "f",
                "to_regime": "n",
                "sentiment_value": 48,
                "transitioned_at": now,
                "source": "fear_greed_index",
            },
            {
                "id": "450e8400-e29b-41d4-a716-446655440000",
                "from_regime": "ef",
                "to_regime": "f",
                "sentiment_value": 30,
                "transitioned_at": now - timedelta(hours=50),
                "source": "fear_greed_index",
            },
        ]

    def test_get_regime_history_success(
        self, service, mock_query_service, mock_transition_rows
    ):
        """Should retrieve regime history with direction calculation."""
        mock_query_service.execute_query.return_value = mock_transition_rows

        # Execute
        response = service.get_regime_history(limit=2)

        # Verify query was called
        args, _ = mock_query_service.execute_query.call_args
        assert args[1] == QUERY_NAMES.REGIME_HISTORY

        assert response.current.to_regime == RegimeId.n
        assert response.previous.to_regime == RegimeId.f
        assert response.direction == DirectionType.fromLeft
        assert response.duration_in_current is not None
        assert response.duration_in_current.hours >= 0
        assert len(response.transitions) == 2
        assert response.cached is False

    def test_get_regime_history_no_transitions_raises_error(
        self, service, mock_query_service
    ):
        """Should raise DataNotFoundError when no transitions exist."""
        mock_query_service.execute_query.return_value = []

        # Execute and verify
        with pytest.raises(DataNotFoundError, match="No regime transitions found"):
            service.get_regime_history(limit=2)

    def test_get_regime_history_single_transition(
        self, service, mock_query_service, mock_transition_rows
    ):
        """Should handle single transition (no previous regime)."""
        single_row = [mock_transition_rows[0]]
        mock_query_service.execute_query.return_value = single_row

        # Execute
        response = service.get_regime_history(limit=1)

        # Verify
        assert response.current.to_regime == RegimeId.n
        assert response.previous is None
        assert response.direction == DirectionType.default

    def test_get_regime_history_with_since_filter(
        self, service, mock_query_service, mock_transition_rows
    ):
        """Should filter transitions by timestamp."""
        mock_query_service.execute_query.return_value = mock_transition_rows

        # Execute with since filter
        since = datetime.now(UTC) - timedelta(days=1)
        service.get_regime_history(limit=10, since=since)

        # Verify params
        args, _ = mock_query_service.execute_query.call_args
        params = args[2]
        assert params["since"] == since

    def test_get_regime_history_database_error(self, service, mock_query_service):
        """Should raise DatabaseError on database failure."""
        mock_query_service.execute_query.side_effect = SQLAlchemyError(
            "Connection failed"
        )

        # Execute and verify
        with pytest.raises(DatabaseError, match="Failed to fetch regime history"):
            service.get_regime_history(limit=2)

    def test_get_regime_history_custom_limit(
        self, service, mock_query_service, mock_transition_rows
    ):
        """Should respect custom limit parameter."""
        mock_query_service.execute_query.return_value = mock_transition_rows

        # Execute with custom limit
        response = service.get_regime_history(limit=5)

        # Verify
        assert len(response.transitions) == 2  # Only 2 rows in mock
        # Check limit param
        args, _ = mock_query_service.execute_query.call_args
        params = args[2]
        assert params["limit"] == 5


class TestTransformRowToTransition:
    """Test _transform_row_to_transition() helper method."""

    @pytest.fixture
    def service(self):
        """Create service instance."""
        return RegimeTrackingService(MagicMock(), query_service=MagicMock())

    def test_transform_valid_row(self, service):
        """Should transform valid database row to RegimeTransition."""
        row = {
            "id": "550e8400-e29b-41d4-a716-446655440000",
            "from_regime": "f",
            "to_regime": "n",
            "sentiment_value": 48,
            "transitioned_at": datetime.now(UTC),
        }

        transition = service._transform_row_to_transition(row)

        assert transition.id == row["id"]
        assert transition.from_regime == RegimeId.f
        assert transition.to_regime == RegimeId.n
        assert transition.sentiment_value == 48
        assert transition.duration_hours is None

    def test_transform_row_with_null_from_regime(self, service):
        """Should handle null from_regime (first transition)."""
        row = {
            "id": "550e8400-e29b-41d4-a716-446655440000",
            "from_regime": None,
            "to_regime": "n",
            "sentiment_value": 50,
            "transitioned_at": datetime.now(UTC),
        }

        transition = service._transform_row_to_transition(row)

        assert transition.from_regime is None
        assert transition.to_regime == RegimeId.n

    def test_transform_row_missing_required_field(self, service):
        """Should raise ValueError when required field is missing."""
        row = {
            "id": "550e8400-e29b-41d4-a716-446655440000",
            # Missing to_regime
            "sentiment_value": 48,
            "transitioned_at": datetime.now(UTC),
        }

        with pytest.raises(ValueError, match="Invalid database row format"):
            service._transform_row_to_transition(row)

    def test_transform_row_invalid_regime_id(self, service):
        """Should raise ValueError for invalid regime ID."""
        row = {
            "id": "550e8400-e29b-41d4-a716-446655440000",
            "from_regime": "invalid",
            "to_regime": "n",
            "sentiment_value": 48,
            "transitioned_at": datetime.now(UTC),
        }

        with pytest.raises(ValueError, match="Invalid database row format"):
            service._transform_row_to_transition(row)


class TestCalculateDurationInfo:
    """Test _calculate_duration_info() helper method."""

    @pytest.fixture
    def service(self):
        """Create service instance."""
        return RegimeTrackingService(MagicMock(), query_service=MagicMock())

    def test_calculate_duration_recent_transition(self, service):
        """Should calculate duration for recent transition (< 1 hour)."""
        transitioned_at = datetime.now(UTC) - timedelta(minutes=30)

        duration = service._calculate_duration_info(transitioned_at)

        assert 0.4 < duration.hours < 0.6  # ~0.5 hours
        assert duration.days < 0.1
        assert "minute" in duration.human_readable.lower()

    def test_calculate_duration_few_hours(self, service):
        """Should calculate duration for few hours."""
        transitioned_at = datetime.now(UTC) - timedelta(hours=3)

        duration = service._calculate_duration_info(transitioned_at)

        assert 2.9 < duration.hours < 3.1
        assert duration.days < 0.2
        assert "hour" in duration.human_readable.lower()

    def test_calculate_duration_multiple_days(self, service):
        """Should calculate duration for multiple days."""
        transitioned_at = datetime.now(UTC) - timedelta(days=2, hours=3)

        duration = service._calculate_duration_info(transitioned_at)

        assert 50 < duration.hours < 52  # ~51 hours
        assert 2.0 < duration.days < 2.2
        assert "day" in duration.human_readable.lower()

    def test_calculate_duration_exact_day(self, service):
        """Should calculate duration for exactly 1 day."""
        transitioned_at = datetime.now(UTC) - timedelta(days=1)

        duration = service._calculate_duration_info(transitioned_at)

        assert 23.9 < duration.hours < 24.1
        assert 0.9 < duration.days < 1.1
        assert duration.human_readable == "1 day"

    def test_calculate_duration_handles_naive_datetime(self, service):
        """Should handle naive datetime by adding UTC timezone."""
        # Create a naive datetime 2 hours in the past (relative to UTC now)
        utc_now = datetime.now(UTC)
        naive_time = (utc_now - timedelta(hours=2)).replace(tzinfo=None)

        duration = service._calculate_duration_info(naive_time)

        # Should not raise error and calculate duration
        assert duration.hours >= 1.9  # Allow for slight timing differences
        assert duration.days >= 0
