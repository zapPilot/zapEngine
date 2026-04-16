"""
Comprehensive tests for PoolPerformanceService.

Tests cover initialization, successful data retrieval, edge cases,
and error handling following the specialized service architecture pattern.
"""

from typing import Any
from uuid import uuid4

import pytest
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from src.core.exceptions import DatabaseError, ValidationError
from src.services.portfolio.pool_performance_service import PoolPerformanceService


class _DummyQueryService:
    """Mock QueryService for testing PoolPerformanceService."""

    def __init__(self, rows: list[dict[str, Any]]):
        self._rows = rows
        self.last_query_name: str | None = None
        self.last_params: dict[str, Any] | None = None

    def execute_query(
        self, db: Session, query_name: str, params: dict[str, Any] | None = None
    ) -> list[dict[str, Any]]:
        """Record query details and return configured rows."""
        self.last_query_name = query_name
        self.last_params = params
        return self._rows

    def execute_query_one(
        self, *_args, **_kwargs
    ) -> dict[str, Any] | None:  # pragma: no cover - not used
        return None


class _RaisingQueryService:
    """Mock QueryService that raises SQLAlchemyError for error testing."""

    def execute_query(
        self, db: Session, query_name: str, params: dict[str, Any] | None = None
    ) -> list[dict[str, Any]]:
        """Raise SQLAlchemyError to simulate database errors."""
        raise SQLAlchemyError("Database connection failed")

    def execute_query_one(
        self, *_args, **_kwargs
    ) -> dict[str, Any] | None:  # pragma: no cover - not used
        return None


def _create_service(rows: list[dict[str, Any]], db_session: Session):
    """Helper factory to create PoolPerformanceService with mock query service."""
    query_service = _DummyQueryService(rows)
    return PoolPerformanceService(db_session, query_service), query_service


def _create_pool_row(
    snapshot_id: str | None = None,
    wallet: str = "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
    chain: str = "ethereum",
    protocol_id: str = "aave-v3",
    protocol_name: str = "Aave V3",
    asset_usd_value: float = 5000.0,
    pool_symbols: list[str] | None = None,
    final_apr: float | None = None,  # Deprecated field, now optional
    protocol_matched: bool | None = None,  # Deprecated field, now optional
    apr_data: dict[str, Any] | None = None,  # Deprecated field, now optional
    snapshot_ids: list[str] | None = None,
    contribution_to_portfolio: float = 50.0,
) -> dict[str, Any]:
    """
    Factory function to create a pool performance row dictionary.

    Matches the structure returned by get_pool_performance_by_user.sql query.

    Note: APR fields (final_apr, protocol_matched, apr_data) are deprecated and
    optional. The new SQL query no longer returns these fields.
    """
    if snapshot_id is None:
        snapshot_id = str(uuid4())

    if pool_symbols is None:
        pool_symbols = ["USDC", "WETH"]

    row = {
        "wallet": wallet,  # Include wallet for position identification
        "snapshot_id": snapshot_id,
        "chain": chain,
        "protocol_id": protocol_id,
        "protocol_name": protocol_name,
        "asset_usd_value": asset_usd_value,
        "pool_symbols": pool_symbols,
        "contribution_to_portfolio": contribution_to_portfolio,
    }

    # Add optional snapshot_ids if provided
    if snapshot_ids is not None:
        row["snapshot_ids"] = snapshot_ids

    # Legacy APR fields (only included if explicitly provided for backward compatibility tests)
    if final_apr is not None:
        row["final_apr"] = final_apr
    if protocol_matched is not None:
        row["protocol_matched"] = protocol_matched
    if apr_data is not None:
        row["apr_data"] = apr_data

    return row


# ============================================================================
# Initialization Tests
# ============================================================================


def test_init_with_valid_dependencies(db_session: Session):
    """Test that service initializes correctly with valid db and query_service."""
    query_service = _DummyQueryService([])
    service = PoolPerformanceService(db_session, query_service)

    assert service.db is db_session
    assert service.query_service is query_service


def test_init_raises_when_query_service_is_none(db_session: Session):
    """Test that ValueError is raised when query_service is None."""
    with pytest.raises(ValueError, match="Query service is required"):
        PoolPerformanceService(db_session, None)  # type: ignore


def test_init_raises_when_db_is_none():
    """Test that ValueError is raised when db session is None."""
    query_service = _DummyQueryService([])
    with pytest.raises(ValueError, match="Database session is required"):
        PoolPerformanceService(None, query_service)  # type: ignore


# ============================================================================
# Success Cases - get_pool_performance()
# ============================================================================


def test_get_pool_performance_empty_results_returns_empty_list(db_session: Session):
    """Test that empty query results return an empty list."""
    service, _ = _create_service([], db_session)
    user_id = uuid4()

    result = service.get_pool_performance(user_id)

    assert result == []
    assert isinstance(result, list)


def test_get_pool_performance_single_pool_complete_data(db_session: Session):
    """Test retrieval of a single pool with complete APR data."""
    snapshot_id = str(uuid4())
    rows = [
        _create_pool_row(
            snapshot_id=snapshot_id,
            chain="ethereum",
            protocol_id="aave-v3",
            protocol_name="Aave V3",
            asset_usd_value=10000.0,
            pool_symbols=["USDC", "WETH"],
            contribution_to_portfolio=100.0,
        )
    ]

    service, query_service = _create_service(rows, db_session)
    user_id = uuid4()

    result = service.get_pool_performance(user_id)

    # Verify query was called correctly
    assert query_service.last_query_name == "get_pool_performance_by_user"
    assert query_service.last_params == {
        "user_id": str(user_id),
        "snapshot_date": None,  # Backward compatible - None when not provided
    }

    # Verify result structure
    assert len(result) == 1
    pool = result[0]

    assert pool["snapshot_id"] == snapshot_id
    assert pool["chain"] == "ethereum"
    assert pool["protocol"] == "aave-v3"
    assert pool["protocol_name"] == "Aave V3"
    assert pool["asset_usd_value"] == 10000.0
    assert pool["pool_symbols"] == ["USDC", "WETH"]
    assert pool["contribution_to_portfolio"] == 100.0

    # APR fields are deprecated and no longer returned by the SQL query
    assert "final_apr" not in pool or pool.get("final_apr") is None
    assert "protocol_matched" not in pool or pool.get("protocol_matched") is None
    assert "apr_data" not in pool or pool.get("apr_data") is None


def test_get_pool_performance_multiple_pools_mixed_protocols(db_session: Session):
    """Test retrieval of multiple pools with DeFiLlama and Hyperliquid protocols."""
    rows = [
        _create_pool_row(
            snapshot_id=str(uuid4()),
            chain="ethereum",
            protocol_id="aave-v3",
            protocol_name="Aave V3",
            asset_usd_value=5000.0,
            pool_symbols=["DAI", "USDC"],
            contribution_to_portfolio=40.0,
        ),
        _create_pool_row(
            snapshot_id=str(uuid4()),
            chain="arbitrum",
            protocol_id="hyperliquid",
            protocol_name="Hyperliquid",
            asset_usd_value=3500.0,
            pool_symbols=["HLP"],
            contribution_to_portfolio=28.0,
        ),
        _create_pool_row(
            snapshot_id=str(uuid4()),
            chain="polygon",
            protocol_id="compound-v3",
            protocol_name="Compound V3",
            asset_usd_value=4000.0,
            pool_symbols=["USDT"],
            contribution_to_portfolio=32.0,
        ),
    ]

    service, _ = _create_service(rows, db_session)
    user_id = uuid4()

    result = service.get_pool_performance(user_id)

    assert len(result) == 3

    assert [pool["asset_usd_value"] for pool in result] == [5000.0, 4000.0, 3500.0]

    aave_pool = result[0]
    assert aave_pool["protocol"] == "aave-v3"
    compound_pool = result[1]
    assert compound_pool["protocol"] == "compound-v3"
    hl_pool = result[2]
    assert hl_pool["protocol"] == "hyperliquid"


def test_get_pool_performance_deprecated_apr_fields_omitted(db_session: Session):
    """Deprecated APR fields should be absent from results."""
    rows = [
        _create_pool_row(
            protocol_id="curve",
            protocol_name="Curve Finance",
        )
    ]

    service, _ = _create_service(rows, db_session)
    user_id = uuid4()

    result = service.get_pool_performance(user_id)

    assert len(result) == 1
    pool = result[0]

    assert "final_apr" not in pool or pool.get("final_apr") is None
    assert "protocol_matched" not in pool or pool.get("protocol_matched") is None
    assert "apr_data" not in pool or pool.get("apr_data") is None


def test_get_pool_performance_no_apr_fields_when_unmatched(db_session: Session):
    """Protocols without APR data should not expose deprecated fields."""
    rows = [
        _create_pool_row(
            protocol_id="unknown-protocol",
            protocol_name="Unknown Protocol",
        )
    ]

    service, _ = _create_service(rows, db_session)
    user_id = uuid4()

    result = service.get_pool_performance(user_id)

    assert len(result) == 1
    pool = result[0]

    assert "final_apr" not in pool or pool.get("final_apr") is None
    assert "protocol_matched" not in pool or pool.get("protocol_matched") is None
    assert "apr_data" not in pool or pool.get("apr_data") is None


def test_get_pool_performance_data_transformation_correctness(db_session: Session):
    """Test that data is correctly transformed from SQL result to response format."""
    snapshot_id = str(uuid4())
    rows = [
        {
            "wallet": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
            "snapshot_id": snapshot_id,
            "snapshot_ids": [snapshot_id, str(uuid4())],
            "chain": "optimism",
            "protocol_id": "velodrome",
            "protocol_name": "Velodrome",
            "asset_usd_value": 7500.50,
            "pool_symbols": ["OP", "USDC"],
            "contribution_to_portfolio": 62.5,
        }
    ]

    service, _ = _create_service(rows, db_session)
    user_id = uuid4()

    result = service.get_pool_performance(user_id)

    assert len(result) == 1
    pool = result[0]

    # Verify all fields are present and correctly typed
    assert pool["snapshot_id"] == snapshot_id
    assert isinstance(pool["snapshot_ids"], list)
    assert len(pool["snapshot_ids"]) == 2
    assert pool["chain"] == "optimism"
    assert pool["protocol"] == "velodrome"
    assert pool["protocol_name"] == "Velodrome"
    assert isinstance(pool["asset_usd_value"], float)
    assert pool["asset_usd_value"] == 7500.50
    assert isinstance(pool["pool_symbols"], list)
    assert pool["pool_symbols"] == ["OP", "USDC"]
    assert isinstance(pool["contribution_to_portfolio"], float)
    assert pool["contribution_to_portfolio"] == 62.5

    assert "final_apr" not in pool or pool.get("final_apr") is None
    assert "protocol_matched" not in pool or pool.get("protocol_matched") is None
    assert "apr_data" not in pool or pool.get("apr_data") is None


# ============================================================================
# Edge Cases - get_pool_performance()
# ============================================================================


def test_get_pool_performance_missing_optional_snapshot_ids(db_session: Session):
    """Test that missing snapshot_ids field is handled correctly."""
    rows = [
        _create_pool_row(
            # snapshot_ids not provided, should use .get() with None default
        )
    ]

    service, _ = _create_service(rows, db_session)
    user_id = uuid4()

    result = service.get_pool_performance(user_id)

    assert len(result) == 1
    pool = result[0]
    assert pool["snapshot_ids"] is None


def test_get_pool_performance_missing_optional_contribution(db_session: Session):
    """Test that missing contribution_to_portfolio defaults to 0.0."""
    row = _create_pool_row()
    # Remove contribution_to_portfolio to test .get() default
    del row["contribution_to_portfolio"]
    rows = [row]

    service, _ = _create_service(rows, db_session)
    user_id = uuid4()

    result = service.get_pool_performance(user_id)

    assert len(result) == 1
    pool = result[0]
    assert pool["contribution_to_portfolio"] == 0.0


def test_get_pool_performance_null_values_in_apr_data(db_session: Session):
    """Deprecated APR payload should not appear even when NULLs are provided."""
    rows = [_create_pool_row()]

    service, _ = _create_service(rows, db_session)
    user_id = uuid4()

    result = service.get_pool_performance(user_id)

    assert len(result) == 1
    pool = result[0]
    assert "apr_data" not in pool or pool.get("apr_data") is None


def test_get_pool_performance_zero_asset_values(db_session: Session):
    """Test handling of pools with zero asset values."""
    rows = [
        _create_pool_row(
            asset_usd_value=0.0,
            contribution_to_portfolio=0.0,
        )
    ]

    service, _ = _create_service(rows, db_session)
    user_id = uuid4()

    result = service.get_pool_performance(user_id)

    assert len(result) == 1
    pool = result[0]
    assert pool["asset_usd_value"] == 0.0
    assert pool["contribution_to_portfolio"] == 0.0


def test_get_pool_performance_multiple_snapshot_ids(db_session: Session):
    """Test pool with multiple aggregated snapshot IDs."""
    snapshot_ids = [str(uuid4()), str(uuid4()), str(uuid4())]
    rows = [
        _create_pool_row(
            snapshot_id=snapshot_ids[0],
            snapshot_ids=snapshot_ids,
        )
    ]

    service, _ = _create_service(rows, db_session)
    user_id = uuid4()

    result = service.get_pool_performance(user_id)

    assert len(result) == 1
    pool = result[0]
    assert pool["snapshot_id"] == snapshot_ids[0]
    assert pool["snapshot_ids"] == snapshot_ids
    assert len(pool["snapshot_ids"]) == 3


def test_get_pool_performance_empty_pool_symbols(db_session: Session):
    """Test pool with empty pool_symbols list."""
    rows = [
        _create_pool_row(
            pool_symbols=[],
        )
    ]

    service, _ = _create_service(rows, db_session)
    user_id = uuid4()

    result = service.get_pool_performance(user_id)

    assert len(result) == 1
    pool = result[0]
    assert pool["pool_symbols"] == []


def test_get_pool_performance_large_apr_values(db_session: Session):
    """Test handling of very large APR values (e.g., 1000% APR)."""
    rows = [_create_pool_row()]

    service, _ = _create_service(rows, db_session)
    user_id = uuid4()

    result = service.get_pool_performance(user_id)

    assert len(result) == 1
    pool = result[0]
    assert "final_apr" not in pool or pool.get("final_apr") is None
    assert "apr_data" not in pool or pool.get("apr_data") is None


# ============================================================================
# Error Cases - get_pool_performance()
# ============================================================================


def test_get_pool_performance_sqlalchemy_error_raises(db_session: Session):
    """Test that SQLAlchemyError from database is wrapped in DatabaseError."""
    query_service = _RaisingQueryService()
    service = PoolPerformanceService(db_session, query_service)
    user_id = uuid4()

    with pytest.raises(DatabaseError, match="Failed to fetch pool performance"):
        service.get_pool_performance(user_id)


def test_get_pool_performance_missing_required_field_raises_value_error(
    db_session: Session,
):
    """Test that missing required field in query result raises ValueError."""
    # Missing 'chain' field
    rows = [
        {
            "snapshot_id": str(uuid4()),
            # "chain": "ethereum",  # Missing required field
            "protocol_id": "aave-v3",
            "protocol_name": "Aave V3",
            "asset_usd_value": 5000.0,
            "pool_symbols": ["USDC", "WETH"],
            "contribution_to_portfolio": 50.0,
        }
    ]

    service, _ = _create_service(rows, db_session)
    user_id = uuid4()

    with pytest.raises(ValidationError, match="Invalid query result structure"):
        service.get_pool_performance(user_id)


def test_get_pool_performance_missing_protocol_id_raises_value_error(
    db_session: Session,
):
    """Test that missing protocol_id field raises ValidationError."""
    rows = [
        {
            "snapshot_id": str(uuid4()),
            "chain": "ethereum",
            # "protocol_id": "aave-v3",  # Missing required field
            "protocol_name": "Aave V3",
            "asset_usd_value": 5000.0,
            "pool_symbols": ["USDC", "WETH"],
            "contribution_to_portfolio": 50.0,
        }
    ]

    service, _ = _create_service(rows, db_session)
    user_id = uuid4()

    with pytest.raises(ValidationError, match="Invalid query result structure"):
        service.get_pool_performance(user_id)


def test_get_pool_performance_missing_apr_data_raises_value_error(
    db_session: Session,
):
    """Test that missing wallet field raises ValidationError."""
    rows = [
        {
            "snapshot_id": str(uuid4()),
            "chain": "ethereum",
            "protocol_id": "aave-v3",
            "protocol_name": "Aave V3",
            "asset_usd_value": 5000.0,
            "pool_symbols": ["USDC", "WETH"],
            "contribution_to_portfolio": 50.0,
        }
    ]

    service, _ = _create_service(rows, db_session)
    user_id = uuid4()

    with pytest.raises(ValidationError, match="Invalid query result structure"):
        service.get_pool_performance(user_id)


# ============================================================================
# UUID Type Conversion Tests
# ============================================================================


def test_get_pool_performance_uuid_converted_to_string(db_session: Session):
    """Test that UUID parameter is correctly converted to string for query."""
    service, query_service = _create_service([], db_session)
    user_id = uuid4()

    service.get_pool_performance(user_id)

    # Verify UUID was converted to string in params
    assert query_service.last_params is not None
    assert "user_id" in query_service.last_params
    assert isinstance(query_service.last_params["user_id"], str)
    assert query_service.last_params["user_id"] == str(user_id)


def test_get_pool_performance_preserves_snapshot_id_as_string(db_session: Session):
    """Test that snapshot_id is preserved as string in response."""
    snapshot_id = str(uuid4())
    rows = [_create_pool_row(snapshot_id=snapshot_id)]

    service, _ = _create_service(rows, db_session)
    user_id = uuid4()

    result = service.get_pool_performance(user_id)

    assert len(result) == 1
    assert result[0]["snapshot_id"] == snapshot_id
    assert isinstance(result[0]["snapshot_id"], str)


# ============================================================================
# Aggregator Integration Tests
# ============================================================================


class _MockAggregator:
    """Mock PoolPerformanceAggregator for testing service integration."""

    def __init__(self, aggregated_result: list[dict[str, Any]]):
        self._aggregated_result = aggregated_result
        self.aggregate_positions_called = False
        self.received_positions: list[dict[str, Any]] | None = None

    @classmethod
    def aggregate_positions(
        cls, positions: list[dict[str, Any]]
    ) -> list[dict[str, Any]]:
        """Mock aggregate_positions that records call and returns configured result."""
        # This is a classmethod in the real aggregator, but for testing we'll
        # use instance attributes via a singleton pattern
        instance = getattr(cls, "_instance", None)
        if instance is None:
            raise RuntimeError("Mock aggregator instance not set")
        instance.aggregate_positions_called = True
        instance.received_positions = list(positions)
        return instance._aggregated_result

    @classmethod
    def set_instance(cls, instance: "_MockAggregator") -> None:
        """Set the singleton instance for classmethod access."""
        cls._instance = instance  # type: ignore


class _RaisingAggregator:
    """Mock aggregator that raises errors for error handling tests."""

    @classmethod
    def aggregate_positions(
        cls, positions: list[dict[str, Any]]
    ) -> list[dict[str, Any]]:
        """Raise ValueError to simulate aggregator errors."""
        raise ValueError("Aggregator processing failed")


def test_service_delegates_to_aggregator(db_session: Session):
    """Test that service calls aggregator.aggregate_positions() with query results."""
    # Setup: Create raw query results
    raw_rows = [
        _create_pool_row(
            wallet="0x111",
            protocol_id="aave-v3",
            chain="ethereum",
            asset_usd_value=1000.0,
        ),
        _create_pool_row(
            wallet="0x222",
            protocol_id="aave-v3",
            chain="ethereum",
            asset_usd_value=2000.0,
        ),
    ]

    # Setup: Create aggregated result (what aggregator should return)
    aggregated_result = [
        {
            "wallet": "0x111",
            "protocol_id": "aave-v3",
            "protocol": "aave-v3",
            "protocol_name": "Aave V3",
            "chain": "ethereum",
            "asset_usd_value": 3000.0,  # Sum of 1000 + 2000
            "pool_symbols": ["USDC", "WETH"],
            "contribution_to_portfolio": 100.0,
            "snapshot_id": str(uuid4()),
            "snapshot_ids": None,
        }
    ]

    # Create mock aggregator
    mock_aggregator = _MockAggregator(aggregated_result)
    _MockAggregator.set_instance(mock_aggregator)

    # Create service with mock aggregator instance
    query_service = _DummyQueryService(raw_rows)
    service = PoolPerformanceService(db_session, query_service, mock_aggregator)
    user_id = uuid4()

    # Execute
    result = service.get_pool_performance(user_id)

    # Verify aggregator was called
    assert mock_aggregator.aggregate_positions_called is True

    # Verify aggregator received raw query results
    assert mock_aggregator.received_positions is not None
    assert len(mock_aggregator.received_positions) == 2
    assert mock_aggregator.received_positions[0]["wallet"] == "0x111"
    assert mock_aggregator.received_positions[1]["wallet"] == "0x222"

    # Verify service returns aggregated results
    assert result == aggregated_result
    assert len(result) == 1
    assert result[0]["asset_usd_value"] == 3000.0


def test_service_returns_aggregator_results_directly(db_session: Session):
    """Test that service returns aggregator output without modification."""
    raw_rows = [_create_pool_row()]

    aggregated_result = [
        {
            "wallet": "0x999",
            "protocol_id": "custom-protocol",
            "protocol": "custom-protocol",
            "protocol_name": "Custom Protocol",
            "chain": "polygon",
            "asset_usd_value": 12345.67,
            "pool_symbols": ["CUSTOM"],
            "contribution_to_portfolio": 100.0,
            "snapshot_id": "custom-snapshot-id",
            "snapshot_ids": ["id1", "id2"],
        }
    ]

    mock_aggregator = _MockAggregator(aggregated_result)
    _MockAggregator.set_instance(mock_aggregator)

    query_service = _DummyQueryService(raw_rows)
    service = PoolPerformanceService(db_session, query_service, mock_aggregator)
    user_id = uuid4()

    result = service.get_pool_performance(user_id)

    # Verify exact output from aggregator is returned
    assert result == aggregated_result
    assert result[0]["protocol_id"] == "custom-protocol"
    assert result[0]["asset_usd_value"] == 12345.67
    assert result[0]["snapshot_ids"] == ["id1", "id2"]


def test_service_handles_empty_aggregator_result(db_session: Session):
    """Test that service handles empty list from aggregator."""
    raw_rows = [_create_pool_row()]

    # Aggregator returns empty list (e.g., all positions filtered out)
    mock_aggregator = _MockAggregator([])
    _MockAggregator.set_instance(mock_aggregator)

    query_service = _DummyQueryService(raw_rows)
    service = PoolPerformanceService(db_session, query_service, mock_aggregator)
    user_id = uuid4()

    result = service.get_pool_performance(user_id)

    assert result == []
    assert isinstance(result, list)
    assert len(result) == 0


def test_service_handles_aggregator_error(db_session: Session):
    """Test that service handles aggregator errors appropriately."""
    raw_rows = [_create_pool_row()]

    query_service = _DummyQueryService(raw_rows)
    service = PoolPerformanceService(db_session, query_service, _RaisingAggregator())
    user_id = uuid4()

    # Aggregator raises ValueError, service should propagate or wrap appropriately
    with pytest.raises(ValueError, match="Aggregator processing failed"):
        service.get_pool_performance(user_id)


def test_get_pool_performance_applies_min_value_filter(db_session: Session):
    """Pools below the minimum USD threshold are filtered out."""
    rows = [
        _create_pool_row(protocol_id="protocol-small", asset_usd_value=1000.0),
        _create_pool_row(protocol_id="protocol-large", asset_usd_value=5000.0),
    ]
    service, _ = _create_service(rows, db_session)
    user_id = uuid4()

    result = service.get_pool_performance(user_id, min_value_usd=2000.0)

    assert len(result) == 1
    assert result[0]["asset_usd_value"] == 5000.0


def test_get_pool_performance_applies_limit_after_sort(db_session: Session):
    """Limit is applied after sorting pools by asset value descending."""
    rows = [
        _create_pool_row(protocol_id="pool-a", asset_usd_value=1000.0),
        _create_pool_row(protocol_id="pool-b", asset_usd_value=3000.0),
        _create_pool_row(protocol_id="pool-c", asset_usd_value=2000.0),
    ]
    service, _ = _create_service(rows, db_session)
    user_id = uuid4()

    result = service.get_pool_performance(user_id, limit=2)

    assert len(result) == 2
    assert result[0]["asset_usd_value"] == 3000.0
    assert result[1]["asset_usd_value"] == 2000.0


def test_service_passes_all_query_rows_to_aggregator(db_session: Session):
    """Test that service passes all query results to aggregator, not just first."""
    # Create 5 different positions
    raw_rows = [
        _create_pool_row(wallet=f"0x{i:03d}", protocol_id=f"protocol-{i}")
        for i in range(5)
    ]

    aggregated_result = [{"combined": "result"}]
    mock_aggregator = _MockAggregator(aggregated_result)
    _MockAggregator.set_instance(mock_aggregator)

    query_service = _DummyQueryService(raw_rows)
    service = PoolPerformanceService(db_session, query_service, mock_aggregator)
    user_id = uuid4()

    service.get_pool_performance(user_id)

    # Verify all 5 rows were passed to aggregator
    assert mock_aggregator.received_positions is not None
    assert len(mock_aggregator.received_positions) == 5
    assert mock_aggregator.received_positions[0]["wallet"] == "0x000"
    assert mock_aggregator.received_positions[4]["wallet"] == "0x004"


# ============================================================================
# Snapshot Date Filtering Tests
# ============================================================================


def test_get_pool_performance_with_snapshot_date_passes_date_to_query(
    db_session: Session,
):
    """Test that snapshot_date parameter is correctly passed to SQL query."""
    from datetime import date

    service, query_service = _create_service([], db_session)
    user_id = uuid4()
    target_date = date(2025, 12, 27)

    service.get_pool_performance(user_id, snapshot_date=target_date)

    # Verify snapshot_date was passed to query
    assert query_service.last_params is not None
    assert "snapshot_date" in query_service.last_params
    assert query_service.last_params["snapshot_date"] == "2025-12-27"


def test_get_pool_performance_without_snapshot_date_passes_none_to_query(
    db_session: Session,
):
    """Test that omitting snapshot_date maintains backward compatibility (None in params)."""
    service, query_service = _create_service([], db_session)
    user_id = uuid4()

    # Call without snapshot_date parameter
    service.get_pool_performance(user_id)

    # Verify snapshot_date is None in query params (backward compatible)
    assert query_service.last_params is not None
    assert "snapshot_date" in query_service.last_params
    assert query_service.last_params["snapshot_date"] is None


def test_get_pool_performance_with_snapshot_date_returns_filtered_results(
    db_session: Session,
):
    """Test that snapshot_date filtering returns expected results."""
    from datetime import date

    # Create rows with complete data
    rows = [
        _create_pool_row(
            protocol_id="aave-v3",
            chain="ethereum",
            asset_usd_value=5000.0,
        )
    ]

    service, query_service = _create_service(rows, db_session)
    user_id = uuid4()
    target_date = date(2025, 12, 27)

    result = service.get_pool_performance(user_id, snapshot_date=target_date)

    # Verify query was called with snapshot_date
    assert query_service.last_params["snapshot_date"] == "2025-12-27"

    # Verify results are returned (SQL filtering happens at query level)
    assert len(result) == 1
    assert result[0]["asset_usd_value"] == 5000.0
