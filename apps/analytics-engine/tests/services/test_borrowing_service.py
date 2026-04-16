"""
Tests for BorrowingService.

Unified tests for the consolidated BorrowingService, covering:
- Position listing and transformation
- Risk metric calculation
- Summary aggregation
"""

from datetime import UTC, datetime
from unittest.mock import MagicMock
from uuid import UUID, uuid4

import pytest

from src.models.portfolio import BorrowingRiskMetrics
from src.services.portfolio.borrowing_service import BorrowingService


@pytest.fixture
def user_id() -> UUID:
    """Test user ID."""
    return uuid4()


@pytest.fixture
def mock_query_service():
    """Mock query service."""
    return MagicMock()


@pytest.fixture
def mock_db():
    """Mock database session."""
    return MagicMock()


@pytest.fixture
def mock_canonical_snapshot_service():
    """Mock canonical snapshot service."""
    service = MagicMock()
    service.get_snapshot_date.return_value = datetime.now(UTC).date()
    return service


@pytest.fixture
def borrowing_service(mock_db, mock_query_service, mock_canonical_snapshot_service):
    """BorrowingService instance with mocked dependencies."""
    return BorrowingService(
        mock_db, mock_query_service, mock_canonical_snapshot_service
    )


def _raw_position(
    protocol_id="Morpho",
    protocol_name="Morpho",
    chain="eth",
    collateral=1000.0,
    debt=500.0,
    net=500.0,
    protocol_health_rate=None,
    updated_at=None,
    collateral_tokens=None,
    debt_tokens=None,
):
    return {
        "protocol_id": protocol_id,
        "protocol_name": protocol_name,
        "chain": chain,
        "total_collateral_usd": collateral,
        "total_debt_usd": debt,
        "net_value_usd": net,
        "protocol_health_rate": protocol_health_rate,
        "collateral_tokens": collateral_tokens or [],
        "debt_tokens": debt_tokens or [],
        "last_updated": updated_at or datetime.now(UTC),
    }


class TestGetBorrowingPositions:
    """Tests for get_borrowing_positions."""

    def test_prefers_protocol_health_rate_when_available(
        self, borrowing_service, mock_query_service, user_id
    ):
        """Verify protocol health_rate is used when provided."""
        mock_query_service.execute_query.return_value = [
            _raw_position(
                protocol_health_rate=1.2, collateral=1000.0, debt=800.0, net=200.0
            )
        ]

        result = borrowing_service.get_borrowing_positions(user_id)

        assert len(result.positions) == 1
        assert result.positions[0].health_rate == 1.2
        assert result.positions[0].health_status == "CRITICAL"

    def test_fallback_status_calculation(
        self, borrowing_service, mock_query_service, user_id
    ):
        """Verify fallback calculation when protocol rate missing."""
        # (1000 + 500) * 0.75 / 500 = 2.25 -> HEALTHY
        mock_query_service.execute_query.return_value = [
            _raw_position(
                protocol_health_rate=None, collateral=1000.0, debt=500.0, net=500.0
            )
        ]

        result = borrowing_service.get_borrowing_positions(user_id)

        assert len(result.positions) == 1
        assert result.positions[0].health_rate == 2.25
        assert result.positions[0].health_status == "HEALTHY"

    def test_sorts_by_risk_descending(
        self, borrowing_service, mock_query_service, user_id
    ):
        """Verify positions are sorted by health rate ascending (riskiest first)."""
        mock_query_service.execute_query.return_value = [
            _raw_position(protocol_health_rate=2.0),  # Healthy
            _raw_position(protocol_health_rate=1.1),  # Critical
            _raw_position(protocol_health_rate=1.6),  # Warning
        ]

        result = borrowing_service.get_borrowing_positions(user_id)

        assert len(result.positions) == 3
        assert result.positions[0].health_rate == 1.1
        assert result.positions[1].health_rate == 1.6
        assert result.positions[2].health_rate == 2.0
        assert result.worst_health_rate == 1.1

    def test_raises_value_error_if_no_positions(
        self, borrowing_service, mock_query_service, user_id
    ):
        """Verify raises ValueError when no positions found."""
        mock_query_service.execute_query.return_value = []

        with pytest.raises(ValueError, match="no borrowing positions"):
            borrowing_service.get_borrowing_positions(user_id)

    def test_token_transformation(self, borrowing_service, mock_query_service, user_id):
        """Verify token lists are transformed correctly."""
        mock_query_service.execute_query.return_value = [
            _raw_position(
                collateral_tokens=[{"symbol": "ETH", "amount": 10.0, "price": 3000.0}],
                debt_tokens=[{"symbol": "USDC", "amount": 5000.0, "price": 1.0}],
            )
        ]

        result = borrowing_service.get_borrowing_positions(user_id)
        pos = result.positions[0]

        assert len(pos.collateral_tokens) == 1
        assert pos.collateral_tokens[0].symbol == "ETH"
        assert pos.collateral_tokens[0].value_usd == 30000.0

        assert len(pos.debt_tokens) == 1
        assert pos.debt_tokens[0].symbol == "USDC"
        assert pos.debt_tokens[0].value_usd == 5000.0


class TestCalculateBorrowingRisk:
    """Tests for calculate_borrowing_risk."""

    def test_returns_none_when_no_debt(
        self, borrowing_service, mock_query_service, user_id
    ):
        """Verify returns None when portfolio has no debt."""
        result = borrowing_service.calculate_borrowing_risk(
            user_id, total_assets_usd=10000.0, total_debt_usd=0.0, total_net_usd=10000.0
        )
        assert result is None

    def test_calculates_aggregates_correctly(
        self, borrowing_service, mock_query_service, user_id
    ):
        """Verify aggregates and counts are calculated correctly."""
        mock_query_service.execute_query.return_value = [
            _raw_position(
                protocol_health_rate=1.2, debt=1000.0, collateral=2000.0
            ),  # Critical
            _raw_position(
                protocol_health_rate=1.8, debt=1000.0, collateral=3000.0
            ),  # Warning
            _raw_position(
                protocol_health_rate=2.5, debt=1000.0, collateral=4000.0
            ),  # Healthy
        ]

        result = borrowing_service.calculate_borrowing_risk(
            user_id,
            total_assets_usd=9000.0,
            total_debt_usd=3000.0,
            total_net_usd=6000.0,
        )

        assert isinstance(result, BorrowingRiskMetrics)
        assert result.worst_health_rate == 1.2
        assert result.overall_health_status == "CRITICAL"
        assert result.critical_position_count == 1
        assert result.warning_position_count == 1
        assert result.position_count == 3
        # Leverage = 9000 / 6000 = 1.5
        assert result.leverage_ratio == 1.5


class TestGetBorrowingSummary:
    """Tests for get_borrowing_summary."""

    def test_summary_reflects_risk_metrics(
        self, borrowing_service, mock_query_service, user_id
    ):
        """Verify summary reflects calculated risk metrics."""
        mock_query_service.execute_query.return_value = [
            _raw_position(protocol_health_rate=1.2),  # Critical
            _raw_position(protocol_health_rate=2.5),  # Healthy
        ]

        summary = borrowing_service.get_borrowing_summary(
            user_id,
            total_assets_usd=10000.0,
            total_debt_usd=1000.0,
            total_net_usd=9000.0,
        )

        assert summary.has_debt is True
        assert summary.worst_health_rate == 1.2
        assert summary.overall_status == "CRITICAL"
        assert summary.critical_count == 1
        assert summary.healthy_count == 1
        assert summary.warning_count == 0

    def test_returns_empty_summary_when_no_debt(
        self, borrowing_service, mock_query_service, user_id
    ):
        """Verify returns empty summary structure when no debt."""
        summary = borrowing_service.get_borrowing_summary(
            user_id,
            total_assets_usd=10000.0,
            total_debt_usd=0.0,
            total_net_usd=10000.0,
        )

        assert summary.has_debt is False
        assert summary.worst_health_rate is None


class TestEdgeCasesAndBoundaries:
    """Tests for edge cases and boundary conditions."""

    def test_net_worth_zero_returns_none(
        self, borrowing_service, mock_query_service, user_id
    ):
        """Verify returns None when net worth is zero or negative.

        Service returns None early when total_net_usd <= 0 to avoid division by zero.
        """
        result = borrowing_service.calculate_borrowing_risk(
            user_id,
            total_assets_usd=1000.0,
            total_debt_usd=1000.0,  # Net = 0
            total_net_usd=0.0,
        )
        # Early return None when net worth <= 0
        assert result is None

    def test_raw_positions_empty_after_fetch(
        self, borrowing_service, mock_query_service, user_id
    ):
        """Verify behavior when query returns empty positions list."""
        mock_query_service.execute_query.return_value = []

        # This will raise ValueError because no positions found
        with pytest.raises(ValueError, match="no borrowing positions"):
            borrowing_service.get_borrowing_positions(user_id)

    def test_all_positions_filtered_due_to_zero_debt(
        self, borrowing_service, mock_query_service, user_id
    ):
        """Positions with zero/negative debt result in empty transform.

        When all positions are filtered out by _transform_positions,
        calculate_borrowing_risk returns None (no valid positions).
        """
        mock_query_service.execute_query.return_value = [
            _raw_position(debt=0.0),  # Will be filtered
            _raw_position(debt=-100.0),  # Will be filtered (negative debt)
        ]

        # For calculate_borrowing_risk: returns None when no valid positions after transform
        result = borrowing_service.calculate_borrowing_risk(
            user_id,
            total_assets_usd=10000.0,
            total_debt_usd=1000.0,  # Has debt, so will try to fetch
            total_net_usd=9000.0,
        )
        # All positions filtered out → returns None
        assert result is None

    def test_health_rate_warning_range(
        self, borrowing_service, mock_query_service, user_id
    ):
        """Verify WARNING status for health rate 1.5-2.0."""
        mock_query_service.execute_query.return_value = [
            _raw_position(protocol_health_rate=1.8)  # In warning range
        ]

        result = borrowing_service.get_borrowing_positions(user_id)

        assert result.positions[0].health_status == "WARNING"

    def test_health_rate_critical_range(
        self, borrowing_service, mock_query_service, user_id
    ):
        """Verify CRITICAL status for health rate < 1.5."""
        mock_query_service.execute_query.return_value = [
            _raw_position(protocol_health_rate=1.3)  # Critical range
        ]

        result = borrowing_service.get_borrowing_positions(user_id)

        assert result.positions[0].health_status == "CRITICAL"

    def test_health_rate_healthy_range(
        self, borrowing_service, mock_query_service, user_id
    ):
        """Verify HEALTHY status for health rate >= 2.0."""
        mock_query_service.execute_query.return_value = [
            _raw_position(protocol_health_rate=2.5)  # Healthy range
        ]

        result = borrowing_service.get_borrowing_positions(user_id)

        assert result.positions[0].health_status == "HEALTHY"

    def test_iso8601_date_parsing_with_z_suffix(
        self, borrowing_service, mock_query_service, user_id
    ):
        """Verify ISO8601 date parsing handles Z suffix."""
        mock_query_service.execute_query.return_value = [
            _raw_position(
                debt=500.0,  # Must have debt to not be filtered
            )
        ]

        # Override last_updated to test string parsing
        mock_query_service.execute_query.return_value[0]["last_updated"] = (
            "2025-01-15T10:30:00Z"
        )

        result = borrowing_service.get_borrowing_positions(user_id)

        assert result.positions[0].updated_at is not None


class TestQueryExceptionHandling:
    """Tests for query exception handling."""

    def test_query_exception_returns_empty_list(
        self, borrowing_service, mock_query_service, user_id
    ):
        """Query exception is caught and returns empty list.

        The _fetch_raw_positions method catches exceptions and returns [].
        This means calculate_borrowing_risk will return None (no positions).
        """
        mock_query_service.execute_query.side_effect = Exception("Database error")

        result = borrowing_service.calculate_borrowing_risk(
            user_id,
            total_assets_usd=10000.0,
            total_debt_usd=1000.0,
            total_net_usd=9000.0,
        )
        # Exception is caught, returns None due to empty positions
        assert result is None

    def test_get_positions_raises_on_empty(
        self, borrowing_service, mock_query_service, user_id
    ):
        """get_borrowing_positions raises ValueError on empty result."""
        mock_query_service.execute_query.side_effect = Exception("Database error")

        # Exception is caught → empty list → raises ValueError
        with pytest.raises(ValueError, match="no borrowing positions"):
            borrowing_service.get_borrowing_positions(user_id)


class TestUncoveredBranches:
    """Targeted tests for previously uncovered lines."""

    def test_get_borrowing_summary_fallback_when_metrics_none(
        self, borrowing_service, mock_query_service, user_id
    ):
        """Line 194: get_borrowing_summary returns empty(has_debt=True) when
        calculate_borrowing_risk returns None despite debt > 0.

        This happens when raw_positions is empty inside calculate_borrowing_risk.
        """
        # Return no positions so calculate_borrowing_risk returns None
        mock_query_service.execute_query.return_value = []

        summary = borrowing_service.get_borrowing_summary(
            user_id,
            total_assets_usd=5000.0,
            total_debt_usd=1000.0,  # debt > 0, so we won't hit the early return
            total_net_usd=4000.0,
        )

        assert summary.has_debt is True
        assert summary.worst_health_rate is None

    def test_transform_positions_skips_zero_collateral_basis(
        self, borrowing_service, mock_query_service, user_id
    ):
        """Line 265: position with no protocol_health_rate and collateral_basis <= 0
        is skipped (continue).

        collateral_basis = collateral_usd + debt_usd; if collateral is very negative
        such that the sum is <= 0, the position is skipped.

        Use calculate_borrowing_risk which handles empty positions list gracefully
        by returning None rather than attempting a broken aggregation.
        """
        raw = _raw_position(
            protocol_health_rate=None,
            collateral=-500.0,  # collateral_basis = -500 + 100 = -400 ≤ 0
            debt=100.0,
            net=-400.0,
        )
        mock_query_service.execute_query.return_value = [raw]

        # raw_positions non-empty, but all filtered by _transform_positions → returns None
        result = borrowing_service.calculate_borrowing_risk(
            user_id,
            total_assets_usd=5000.0,
            total_debt_usd=100.0,
            total_net_usd=4900.0,
        )
        assert result is None

    def test_transform_positions_updated_at_non_datetime_non_str(
        self, borrowing_service, mock_query_service, user_id
    ):
        """Line 276: when last_updated is neither str nor datetime,
        datetime.now(UTC) is used as fallback.
        """
        raw = _raw_position(debt=500.0)
        raw["last_updated"] = None  # Neither str nor datetime

        mock_query_service.execute_query.return_value = [raw]

        result = borrowing_service.get_borrowing_positions(user_id)

        assert len(result.positions) == 1
        assert result.positions[0].updated_at is not None

    def test_transform_token_list_skips_invalid_token(
        self, borrowing_service, mock_query_service, user_id
    ):
        """Lines 325-326: _transform_token_list skips tokens with invalid
        amount/price values that raise ValueError or TypeError.
        """
        raw = _raw_position(
            collateral_tokens=[
                {"symbol": "ETH", "amount": "not-a-number", "price": 3000.0},
                {"symbol": "WBTC", "amount": 1.0, "price": 45000.0},
            ],
            debt_tokens=[
                {"symbol": "USDC", "amount": None, "price": None},
            ],
        )
        mock_query_service.execute_query.return_value = [raw]

        result = borrowing_service.get_borrowing_positions(user_id)

        pos = result.positions[0]
        # ETH with "not-a-number" amount → skipped; WBTC valid → kept
        assert len(pos.collateral_tokens) == 1
        assert pos.collateral_tokens[0].symbol == "WBTC"
        # USDC with None amount/price → not skipped (float(None) raises TypeError)
        # amount=float(None) raises TypeError → skipped
        assert len(pos.debt_tokens) == 0
