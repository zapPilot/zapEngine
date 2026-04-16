from src.services.interfaces import (
    BorrowingServiceProtocol,
    CanonicalSnapshotServiceProtocol,
)
from src.services.portfolio.borrowing_service import BorrowingService
from src.services.portfolio.canonical_snapshot_service import CanonicalSnapshotService


def test_borrowing_service_implements_protocol():
    """Verify BorrowingService implements BorrowingServiceProtocol."""
    assert BorrowingServiceProtocol in BorrowingService.__mro__
    assert hasattr(BorrowingService, "calculate_borrowing_risk")
    assert hasattr(BorrowingService, "get_borrowing_summary")


def test_canonical_snapshot_service_implements_protocol():
    """Verify CanonicalSnapshotService implements CanonicalSnapshotServiceProtocol."""
    assert CanonicalSnapshotServiceProtocol in CanonicalSnapshotService.__mro__
    assert hasattr(CanonicalSnapshotService, "get_snapshot_info")
    assert hasattr(CanonicalSnapshotService, "get_snapshot_date_range")
    assert hasattr(CanonicalSnapshotService, "validate_snapshot_consistency")
