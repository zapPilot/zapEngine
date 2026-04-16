"""Shared test model factories to avoid duplication across test files."""

from src.models.portfolio import BorrowingSummary


def create_default_borrowing_summary(
    has_debt: bool = False,
) -> BorrowingSummary:
    """Create default borrowing summary for testing (no debt by default)."""
    return BorrowingSummary(
        has_debt=has_debt,
        worst_health_rate=None,
        overall_status=None,
        critical_count=0,
        warning_count=0,
        healthy_count=0,
    )
