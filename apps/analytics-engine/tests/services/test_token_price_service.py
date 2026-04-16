"""Unit tests for TokenPriceService.

Tests token price business logic by mocking QueryService dependency.
This isolates the service testing from database/QueryService implementation details.
"""

from datetime import UTC, date, datetime
from typing import Any
from unittest.mock import MagicMock

import pytest
from sqlalchemy.orm import Session

from src.models.token_price import TokenPriceSnapshot
from src.services.market.token_price_service import TokenPriceService
from src.services.shared.query_names import QUERY_NAMES
from src.services.shared.query_service import QueryService


@pytest.fixture
def mock_db_session() -> MagicMock:
    """Provides a mock SQLAlchemy session."""
    return MagicMock(spec=Session)


@pytest.fixture
def mock_query_service() -> MagicMock:
    """Provides a mock QueryService."""
    return MagicMock(spec=QueryService)


@pytest.fixture
def token_price_service(
    mock_db_session: MagicMock, mock_query_service: MagicMock
) -> TokenPriceService:
    """Provides a TokenPriceService with mocked dependencies."""
    return TokenPriceService(db=mock_db_session, query_service=mock_query_service)


def _create_mock_snapshot(
    snapshot_date: str = "2024-01-15",
    price_usd: float = 42500.00,
    market_cap_usd: float | None = 850000000000.0,
    volume_24h_usd: float | None = 15000000000.0,
    source: str = "coingecko",
    token_symbol: str = "BTC",
    token_id: str = "bitcoin",
) -> dict[str, Any]:
    """Create a mock snapshot dict (simulating QueryService return value)."""
    return {
        "snapshot_date": snapshot_date,
        "price_usd": price_usd,
        "market_cap_usd": market_cap_usd,
        "volume_24h_usd": volume_24h_usd,
        "source": source,
        "token_symbol": token_symbol,
        "token_id": token_id,
    }


def _get_execute_query_params(mock_query_service: MagicMock) -> dict[str, Any]:
    """Extract params from the latest execute_query call."""
    args, _ = mock_query_service.execute_query.call_args
    return args[2]


def _get_execute_query_one_params(mock_query_service: MagicMock) -> dict[str, Any]:
    """Extract params from the latest execute_query_one call."""
    args, _ = mock_query_service.execute_query_one.call_args
    return args[2]


class TestTokenPriceServiceInit:
    """Tests for TokenPriceService initialization."""

    def test_init_stores_dependencies(
        self, mock_db_session: MagicMock, mock_query_service: MagicMock
    ) -> None:
        """Test that __init__ stores the database session and query service."""
        service = TokenPriceService(
            db=mock_db_session, query_service=mock_query_service
        )
        assert service.db is mock_db_session
        assert service.query_service is mock_query_service


class TestGetPriceHistory:
    """Tests for get_price_history method."""

    def test_returns_list_of_snapshots(
        self, token_price_service: TokenPriceService, mock_query_service: MagicMock
    ) -> None:
        """Test successful retrieval of price history."""
        mock_data = [
            _create_mock_snapshot("2024-01-15", 42000.0),
            _create_mock_snapshot("2024-01-16", 43000.0),
            _create_mock_snapshot("2024-01-17", 44000.0),
        ]
        mock_query_service.execute_query.return_value = mock_data

        result = token_price_service.get_price_history(days=30)

        assert len(result) == 3
        # Verify call arguments
        mock_query_service.execute_query.assert_called_once()
        args, _ = mock_query_service.execute_query.call_args
        assert args[1] == QUERY_NAMES.TOKEN_PRICE_HISTORY
        # Implementation calculates start_date from days, doesn't pass limit
        params = _get_execute_query_params(mock_query_service)
        assert "start_date" in params
        assert "end_date" in params
        assert params["token_symbol"] == "BTC"

    def test_returns_empty_list_when_no_data(
        self, token_price_service: TokenPriceService, mock_query_service: MagicMock
    ) -> None:
        """Test empty result when no price data exists."""
        mock_query_service.execute_query.return_value = []

        result = token_price_service.get_price_history(days=30)

        assert result == []

    def test_supports_different_token_symbols(
        self, token_price_service: TokenPriceService, mock_query_service: MagicMock
    ) -> None:
        """Test querying for different tokens (valdiates params passed)."""
        mock_data = [_create_mock_snapshot("2024-01-15", 2500.0, token_symbol="ETH")]
        mock_query_service.execute_query.return_value = mock_data

        token_price_service.get_price_history(days=7, token_symbol="ETH")

        # Verify token_symbol passed in params
        params = _get_execute_query_params(mock_query_service)
        assert params["token_symbol"] == "ETH"

    def test_raises_on_error(
        self, token_price_service: TokenPriceService, mock_query_service: MagicMock
    ) -> None:
        """Test that errors are propagated."""
        mock_query_service.execute_query.side_effect = Exception("Query failed")

        with pytest.raises(Exception, match="Query failed"):
            token_price_service.get_price_history(days=30)

    def test_with_explicit_date_range(
        self, token_price_service: TokenPriceService, mock_query_service: MagicMock
    ) -> None:
        """Test that explicit start_date/end_date override 'days' calculation."""
        mock_data = [
            _create_mock_snapshot("2025-09-06", 42000.0),
            _create_mock_snapshot("2025-09-07", 43000.0),
            _create_mock_snapshot("2025-09-08", 44000.0),
        ]
        mock_query_service.execute_query.return_value = mock_data

        # Request historical 2025 data with explicit dates
        result = token_price_service.get_price_history(
            token_symbol="BTC",
            start_date=date(2025, 9, 6),
            end_date=date(2025, 9, 8),
        )

        # Verify results
        assert len(result) == 3
        assert all(isinstance(snap, TokenPriceSnapshot) for snap in result)

        # Verify the query was called with the explicit dates (not calculated from days)
        params = _get_execute_query_params(mock_query_service)
        assert params["start_date"] == date(2025, 9, 6)
        assert params["end_date"] == date(2025, 9, 8)
        assert params["token_symbol"] == "BTC"

    def test_backward_compatibility_with_days_only(
        self, token_price_service: TokenPriceService, mock_query_service: MagicMock
    ) -> None:
        """Test that 'days' parameter still works when dates not provided."""
        mock_data = [
            _create_mock_snapshot("2024-01-15", 42000.0),
            _create_mock_snapshot("2024-01-16", 43000.0),
        ]
        mock_query_service.execute_query.return_value = mock_data

        # Call with only days parameter (backward compatible)
        result = token_price_service.get_price_history(days=30, token_symbol="BTC")

        # Verify results
        assert len(result) == 2

        # Verify the query was called with calculated dates (not explicit)
        params = _get_execute_query_params(mock_query_service)
        # Should have calculated start_date and end_date from today
        assert "start_date" in params
        assert "end_date" in params
        assert params["token_symbol"] == "BTC"
        # The end_date should be today (or very recent)
        today = datetime.now(UTC).date()
        # Allow a small margin for test execution time
        assert (today - params["end_date"]).days <= 1


class TestGetDmaHistory:
    """Tests for get_dma_history method."""

    def test_returns_dma_mapping(
        self, token_price_service: TokenPriceService, mock_query_service: MagicMock
    ) -> None:
        mock_query_service.execute_query.return_value = [
            {"snapshot_date": date(2025, 1, 1), "dma_200": 45000.0},
            {"snapshot_date": date(2025, 1, 2), "dma_200": 45100.0},
        ]

        result = token_price_service.get_dma_history(
            start_date=date(2025, 1, 1),
            end_date=date(2025, 1, 2),
            token_symbol="BTC",
        )

        assert result == {
            date(2025, 1, 1): 45000.0,
            date(2025, 1, 2): 45100.0,
        }
        args, _ = mock_query_service.execute_query.call_args
        assert args[1] == QUERY_NAMES.TOKEN_PRICE_DMA_HISTORY
        params = _get_execute_query_params(mock_query_service)
        assert params["start_date"] == date(2025, 1, 1)
        assert params["end_date"] == date(2025, 1, 2)
        assert params["token_symbol"] == "BTC"

    def test_invalid_dma_value_raises(
        self, token_price_service: TokenPriceService, mock_query_service: MagicMock
    ) -> None:
        mock_query_service.execute_query.return_value = [
            {"snapshot_date": date(2025, 1, 1), "dma_200": "invalid"},
        ]

        with pytest.raises(ValueError, match="Invalid dma_200 value"):
            token_price_service.get_dma_history(
                start_date=date(2025, 1, 1),
                end_date=date(2025, 1, 1),
                token_symbol="BTC",
            )

    def test_invalid_snapshot_date_raises(
        self, token_price_service: TokenPriceService, mock_query_service: MagicMock
    ) -> None:
        mock_query_service.execute_query.return_value = [
            {"snapshot_date": object(), "dma_200": 45000.0},
        ]

        with pytest.raises(ValueError, match="Invalid snapshot_date"):
            token_price_service.get_dma_history(
                start_date=date(2025, 1, 1),
                end_date=date(2025, 1, 1),
                token_symbol="BTC",
            )

    def test_query_error_is_propagated(
        self, token_price_service: TokenPriceService, mock_query_service: MagicMock
    ) -> None:
        mock_query_service.execute_query.side_effect = RuntimeError("query failed")

        with pytest.raises(RuntimeError, match="query failed"):
            token_price_service.get_dma_history(
                start_date=date(2025, 1, 1),
                end_date=date(2025, 1, 1),
                token_symbol="BTC",
            )


class TestGetPairRatioDmaHistory:
    """Tests for get_pair_ratio_dma_history method."""

    def test_returns_ratio_mapping(
        self, token_price_service: TokenPriceService, mock_query_service: MagicMock
    ) -> None:
        mock_query_service.execute_query.return_value = [
            {
                "snapshot_date": date(2025, 1, 1),
                "ratio_value": 0.05,
                "dma_200": None,
                "is_above_dma": None,
            },
            {
                "snapshot_date": date(2025, 1, 2),
                "ratio_value": 0.052,
                "dma_200": 0.049,
                "is_above_dma": True,
            },
        ]

        result = token_price_service.get_pair_ratio_dma_history(
            start_date=date(2025, 1, 1),
            end_date=date(2025, 1, 2),
            base_token_symbol="ETH",
            quote_token_symbol="BTC",
        )

        assert result == {
            date(2025, 1, 1): {
                "ratio": 0.05,
                "dma_200": None,
                "is_above_dma": None,
            },
            date(2025, 1, 2): {
                "ratio": 0.052,
                "dma_200": 0.049,
                "is_above_dma": True,
            },
        }
        args, _ = mock_query_service.execute_query.call_args
        assert args[1] == QUERY_NAMES.TOKEN_PAIR_RATIO_DMA_HISTORY
        params = _get_execute_query_params(mock_query_service)
        assert params["start_date"] == date(2025, 1, 1)
        assert params["end_date"] == date(2025, 1, 2)
        assert params["base_token_symbol"] == "ETH"
        assert params["quote_token_symbol"] == "BTC"

    def test_invalid_ratio_value_raises(
        self, token_price_service: TokenPriceService, mock_query_service: MagicMock
    ) -> None:
        mock_query_service.execute_query.return_value = [
            {
                "snapshot_date": date(2025, 1, 1),
                "ratio_value": "invalid",
                "dma_200": 0.049,
                "is_above_dma": True,
            }
        ]

        with pytest.raises(ValueError, match="Invalid ratio_value value"):
            token_price_service.get_pair_ratio_dma_history(
                start_date=date(2025, 1, 1),
                end_date=date(2025, 1, 1),
            )

    def test_invalid_is_above_dma_value_raises(
        self, token_price_service: TokenPriceService, mock_query_service: MagicMock
    ) -> None:
        mock_query_service.execute_query.return_value = [
            {
                "snapshot_date": date(2025, 1, 1),
                "ratio_value": 0.05,
                "dma_200": 0.049,
                "is_above_dma": "unknown",
            }
        ]

        with pytest.raises(ValueError, match="Invalid is_above_dma value"):
            token_price_service.get_pair_ratio_dma_history(
                start_date=date(2025, 1, 1),
                end_date=date(2025, 1, 1),
            )


class TestGetLatestPrice:
    """Tests for get_latest_price method."""

    def test_returns_latest_snapshot(
        self, token_price_service: TokenPriceService, mock_query_service: MagicMock
    ) -> None:
        """Test successful retrieval of latest price."""
        mock_data = _create_mock_snapshot("2024-01-17", 45000.0)
        mock_query_service.execute_query_one.return_value = mock_data

        result = token_price_service.get_latest_price()

        assert result is not None
        assert isinstance(result, TokenPriceSnapshot)
        assert result.price_usd == 45000.0

        # Verify query name
        args, _ = mock_query_service.execute_query_one.call_args
        assert args[1] == QUERY_NAMES.TOKEN_LATEST_PRICE

    def test_returns_none_when_no_data(
        self, token_price_service: TokenPriceService, mock_query_service: MagicMock
    ) -> None:
        """Test returns None when no price data exists."""
        mock_query_service.execute_query_one.return_value = None

        result = token_price_service.get_latest_price()

        assert result is None


class TestGetPriceForDate:
    """Tests for get_price_for_date method."""

    def test_returns_snapshot_for_date(
        self, token_price_service: TokenPriceService, mock_query_service: MagicMock
    ) -> None:
        """Test successful retrieval of price for specific date."""
        mock_data = _create_mock_snapshot("2024-01-15", 42000.0)
        mock_query_service.execute_query_one.return_value = mock_data

        result = token_price_service.get_price_for_date("2024-01-15")

        assert result is not None
        assert result.price_usd == 42000.0

        # Verify params
        params = _get_execute_query_one_params(mock_query_service)
        assert params["date"] == "2024-01-15"

    def test_returns_none_when_date_not_found(
        self, token_price_service: TokenPriceService, mock_query_service: MagicMock
    ) -> None:
        """Test returns None when no data exists for date."""
        mock_query_service.execute_query_one.return_value = None

        result = token_price_service.get_price_for_date("2020-01-01")

        assert result is None


class TestGetSnapshotCount:
    """Tests for get_snapshot_count method."""

    def test_returns_count(
        self, token_price_service: TokenPriceService, mock_query_service: MagicMock
    ) -> None:
        """Test successful count retrieval."""
        mock_query_service.execute_query_one.return_value = {"count": 365}

        result = token_price_service.get_snapshot_count()

        assert result == 365

    def test_returns_zero_when_row_is_none(
        self, token_price_service: TokenPriceService, mock_query_service: MagicMock
    ) -> None:
        """Test returns 0 when query returns None."""
        mock_query_service.execute_query_one.return_value = None

        result = token_price_service.get_snapshot_count()

        assert result == 0
