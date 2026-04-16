from datetime import date
from unittest.mock import MagicMock, Mock
from uuid import uuid4

import pytest

from src.services.portfolio.canonical_snapshot_service import CanonicalSnapshotService
from src.services.shared.query_names import QUERY_NAMES


@pytest.fixture
def mock_db():
    return MagicMock()


@pytest.fixture
def mock_query_service():
    return Mock()


@pytest.fixture
def service(mock_db, mock_query_service):
    return CanonicalSnapshotService(mock_db, mock_query_service)


def test_validate_snapshot_consistency_valid(service, mock_query_service, mock_db):
    """Test validation when snapshot date matches and wallet count matches."""
    user_id = uuid4()
    snapshot_date = date(2025, 1, 1)

    # Mock query result
    mock_query_service.execute_query_one.return_value = {
        "snapshot_date": snapshot_date,
        "wallet_count": 3,
    }

    result = service.validate_snapshot_consistency(
        user_id, snapshot_date, expected_wallet_count=3
    )

    assert result["is_complete"] is True
    assert result["wallet_count"] == 3
    assert result["has_wallet_tokens"] is True

    # Verify query
    mock_query_service.execute_query_one.assert_called_with(
        mock_db,
        QUERY_NAMES.CANONICAL_SNAPSHOT_DATE,
        {"user_id": str(user_id), "wallet_address": None},
    )


def test_validate_snapshot_consistency_date_mismatch(
    service, mock_query_service, mock_db
):
    """Test validation when returned snapshot date differs from requested."""
    user_id = uuid4()
    requested_date = date(2025, 1, 1)
    actual_date = date(2025, 1, 2)

    mock_query_service.execute_query_one.return_value = {
        "snapshot_date": actual_date,
        "wallet_count": 3,
    }

    result = service.validate_snapshot_consistency(user_id, requested_date)

    assert result["is_complete"] is False
    assert result["error"] == "Snapshot date does not match canonical snapshot"


def test_validate_snapshot_consistency_wallet_count_mismatch(
    service, mock_query_service, mock_db
):
    """Test validation when wallet count does not match expected."""
    user_id = uuid4()
    snapshot_date = date(2025, 1, 1)

    mock_query_service.execute_query_one.return_value = {
        "snapshot_date": snapshot_date,
        "wallet_count": 3,
    }

    result = service.validate_snapshot_consistency(
        user_id, snapshot_date, expected_wallet_count=5
    )

    assert result["is_complete"] is False
    assert result["wallet_count"] == 3
