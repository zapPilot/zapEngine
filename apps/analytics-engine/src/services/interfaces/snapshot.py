from __future__ import annotations

from datetime import date
from typing import Any, Protocol
from uuid import UUID

from src.models.analytics_responses import SnapshotInfo
from src.models.portfolio_snapshot import PortfolioSnapshot


class CanonicalSnapshotServiceProtocol(Protocol):
    """
    Interface for canonical snapshot date services.

    Provides single source of truth for snapshot date selection across all analytics.
    All services should call this FIRST to get the canonical "as-of" date before
    querying snapshot data, ensuring consistency across all endpoints.
    """

    def get_snapshot_info(
        self, user_id: UUID, wallet_address: str | None = None
    ) -> SnapshotInfo | None:
        """
        Get detailed snapshot information including precise timestamp.

        Args:
            user_id: User identifier
            wallet_address: Optional wallet filter

        Returns:
            SnapshotInfo with date, count, and precise timestamp, or None
        """
        ...  # pragma: no cover

    def get_snapshot_date(
        self, user_id: UUID, wallet_address: str | None = None
    ) -> date | None:
        """
        Get the latest complete snapshot date for the user/wallet.

        Args:
            user_id: User identifier
            wallet_address: Optional wallet filter. When None, returns latest date
                           where ALL user wallets have snapshots. When provided,
                           returns latest date for that specific wallet.

        Returns:
            Latest date with complete data, or None if no snapshots exist
        """
        ...  # pragma: no cover

    def get_snapshot_date_range(
        self, user_id: UUID, days: int, wallet_address: str | None = None
    ) -> tuple[date, date]:
        """
        Get (start_date, end_date) for time-range queries.

        Computes the date range relative to the latest canonical snapshot date:
        - end_date: latest_snapshot + 1 day (exclusive upper bound)
        - start_date: end_date - days

        Args:
            user_id: User identifier
            days: Number of days back from latest snapshot
            wallet_address: Optional wallet filter

        Returns:
            (start_date, end_date) where end_date is latest snapshot + 1 day

        Raises:
            ValueError: If no snapshot data exists for the user

        Example:
            # Get last 30 days relative to latest snapshot
            start, end = service.get_snapshot_date_range(user_id, days=30)
        """
        ...  # pragma: no cover

    def validate_snapshot_consistency(
        self,
        user_id: UUID,
        snapshot_date: date,
        expected_wallet_count: int | None = None,
    ) -> dict[str, Any]:
        """
        Validate that snapshot_date meets an expected wallet count.

        Checks:
        1. All user wallets with snapshot data are included on this date
        2. Wallet count matches expected (if provided)
        3. Wallet tokens exist for this date

        Args:
            user_id: User identifier
            snapshot_date: Date to validate
            expected_wallet_count: Expected number of wallets (optional validation)

        Returns:
            {
                "is_complete": bool,
                "wallet_count": int,
                "missing_wallets": list[str],
                "has_wallet_tokens": bool
            }

        Example:
            validation = service.validate_snapshot_consistency(
                user_id, snapshot_date, expected_wallet_count=3
            )
            if not validation["is_complete"]:
                logger.error("Incomplete snapshot: %s", validation)
        """
        ...  # pragma: no cover


class PortfolioSnapshotServiceProtocol(Protocol):
    """Interface for canonical portfolio snapshot service."""

    def get_portfolio_snapshot(
        self,
        user_id: UUID,
        *,
        snapshot_date: date,
    ) -> PortfolioSnapshot | None:
        """Return the latest snapshot for the requested user."""
        ...  # pragma: no cover
