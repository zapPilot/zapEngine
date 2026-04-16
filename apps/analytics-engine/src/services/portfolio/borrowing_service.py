"""
Unified Borrowing Service - Central point for all lending/borrowing analytics.

Consolidates logic from previous BorrowingPositionsService and BorrowingRiskService
to eliminate duplication and ensure consistent health rate calculations.
"""

from __future__ import annotations

import logging
from datetime import UTC, date, datetime
from typing import Any, Literal
from uuid import UUID

from sqlalchemy.orm import Session

from src.models.borrowing import (
    BorrowingPosition,
    BorrowingPositionsResponse,
    TokenDetail,
)
from src.models.portfolio import BorrowingRiskMetrics, BorrowingSummary
from src.services.interfaces import (
    BorrowingServiceProtocol,
    CanonicalSnapshotServiceProtocol,
    QueryServiceProtocol,
)
from src.services.shared.query_names import QUERY_NAMES

logger = logging.getLogger(__name__)


class BorrowingService(BorrowingServiceProtocol):
    """
    Unified service for all borrowing analytics.

    Responsibilities:
    - Lists detailed borrowing positions
    - Calculates risk metrics (health rates, LTV)
    - Aggregates portfolio-level borrowing summary
    - Classifies position health (Healthy, Warning, Critical)

    Design:
    - Single source of truth for health rate thresholds
    - Consistent calculation logic across detail view and summary view
    - Prefers protocol-provided health rates, falls back to conservative LTV
    """

    # Risk thresholds (Industry standard for DeFi lending)
    HEALTHY_THRESHOLD = 2.0  # ≥2.0 = healthy (200% collateralization)
    WARNING_THRESHOLD = 1.5  # 1.5-2.0 = warning (150-200% collateralization)
    # <1.5 = critical (below 150% collateralization)

    # Conservative LTV for fallback calculations (when protocol doesn't provide health_rate)
    CONSERVATIVE_LTV = 0.75

    def _classify_health_status(
        self, health_rate: float
    ) -> Literal["HEALTHY", "WARNING", "CRITICAL"]:
        """Classify health rate into status category."""
        if health_rate >= self.HEALTHY_THRESHOLD:
            return "HEALTHY"
        if health_rate >= self.WARNING_THRESHOLD:
            return "WARNING"
        return "CRITICAL"

    def __init__(
        self,
        db: Session,
        query_service: QueryServiceProtocol,
        canonical_snapshot_service: CanonicalSnapshotServiceProtocol | None = None,
    ):
        """
        Initialize BorrowingService.

        Args:
            db: Database session
            query_service: Query service for executing SQL
            canonical_snapshot_service: Service for getting canonical snapshot dates
        """
        self.db = db
        self.query_service = query_service
        self.canonical_snapshot_service = canonical_snapshot_service

    def get_borrowing_positions(
        self, user_id: UUID, snapshot_date: date | None = None
    ) -> BorrowingPositionsResponse:
        """
        Get all borrowing positions for a user with per-position risk metrics.
        """
        logger.info("Fetching borrowing positions for user_id=%s", user_id)

        raw_positions = self._fetch_raw_positions(user_id, snapshot_date)

        if not raw_positions:
            logger.info("No borrowing positions found for user_id=%s", user_id)
            raise ValueError(f"User {user_id} has no borrowing positions")

        positions = self._transform_positions(raw_positions)

        # Calculate aggregates for the response object
        total_collateral = sum(p.collateral_usd for p in positions)
        total_debt = sum(p.debt_usd for p in positions)
        worst_health_rate = min(p.health_rate for p in positions) if positions else 0.0
        last_updated = (
            max(p.updated_at for p in positions) if positions else datetime.now(UTC)
        )

        return BorrowingPositionsResponse(
            positions=positions,
            total_collateral_usd=total_collateral,
            total_debt_usd=total_debt,
            worst_health_rate=worst_health_rate,
            last_updated=last_updated,
        )

    def calculate_borrowing_risk(
        self,
        user_id: UUID,
        total_assets_usd: float,
        total_debt_usd: float,
        total_net_usd: float,
    ) -> BorrowingRiskMetrics | None:
        """
        Calculate aggregated risk metrics for the entire portfolio.
        Returns None if no debt or calculation fails.
        """
        if total_debt_usd <= 0:
            return None

        if total_net_usd <= 0:
            logger.warning(
                "Net worth zero/negative for user %s (net=%s) - cannot calculate risk",
                user_id,
                total_net_usd,
            )
            return None

        # Fetch positions to calculate worst health rate and counts
        # We reuse the same fetch logic but process it into metrics
        raw_positions = self._fetch_raw_positions(user_id, snapshot_date=None)
        if not raw_positions:
            return None

        positions = self._transform_positions(raw_positions)
        if not positions:
            return None

        # Calculate metrics
        health_rates = [p.health_rate for p in positions]
        worst_health_rate = min(health_rates)

        # Classification counts
        critical_count = sum(1 for p in positions if p.health_status == "CRITICAL")
        warning_count = sum(1 for p in positions if p.health_status == "WARNING")

        # Overall status based on worst position
        overall_status = self._classify_health_status(worst_health_rate)

        leverage_ratio = total_assets_usd / total_net_usd

        return BorrowingRiskMetrics(
            has_leverage=True,
            worst_health_rate=worst_health_rate,
            overall_health_status=overall_status,
            critical_position_count=critical_count,
            warning_position_count=warning_count,
            leverage_ratio=leverage_ratio,
            collateral_value_usd=total_assets_usd,
            debt_value_usd=total_debt_usd,
            liquidation_threshold=self.WARNING_THRESHOLD,
            protocol_source="protocol-provided",
            position_count=len(positions),
        )

    def get_borrowing_summary(
        self,
        user_id: UUID,
        total_assets_usd: float,
        total_debt_usd: float,
        total_net_usd: float,
    ) -> BorrowingSummary:
        """
        Get a summary of borrowing status (lighter weight than full positions list).
        """
        if total_debt_usd <= 0:
            return BorrowingSummary.empty(has_debt=False)

        metrics = self.calculate_borrowing_risk(
            user_id, total_assets_usd, total_debt_usd, total_net_usd
        )

        if metrics is None:
            # Fallback if calculation failed but debt exists
            return BorrowingSummary.empty(has_debt=True)

        healthy_count = (
            metrics.position_count
            - metrics.critical_position_count
            - metrics.warning_position_count
        )

        return BorrowingSummary(
            has_debt=True,
            worst_health_rate=metrics.worst_health_rate,
            overall_status=metrics.overall_health_status,
            critical_count=metrics.critical_position_count,
            warning_count=metrics.warning_position_count,
            healthy_count=healthy_count,
        )

    def _fetch_raw_positions(
        self, user_id: UUID, snapshot_date: date | None = None
    ) -> list[dict[str, Any]]:
        """Fetch raw position data from DB using canonical snapshot date."""
        # Get canonical snapshot date if not provided
        if snapshot_date is None and self.canonical_snapshot_service:
            snapshot_date = self.canonical_snapshot_service.get_snapshot_date(user_id)
            logger.debug(
                "Using canonical snapshot_date=%s for borrowing positions (user %s)",
                snapshot_date,
                user_id,
            )

        try:
            return self.query_service.execute_query(
                self.db,
                QUERY_NAMES.BORROWING_POSITIONS_BY_USER,
                {
                    "user_id": str(user_id),
                    "snapshot_date": snapshot_date,
                },
            )
        except Exception as e:
            logger.error("Failed to fetch borrowing positions: %s", e, exc_info=True)
            return []

    def _transform_positions(
        self, raw_positions: list[dict[str, Any]]
    ) -> list[BorrowingPosition]:
        """Transform raw SQL results into unified BorrowingPosition models."""
        positions = []

        for row in raw_positions:
            debt_usd = float(row.get("total_debt_usd", 0))
            if debt_usd <= 0:
                continue

            # Extract basic data
            protocol_id = row.get("protocol_id", "")
            protocol_name = row.get("protocol_name", "")
            chain = row.get("chain", "")
            collateral_usd = float(row.get("total_collateral_usd", 0))
            net_value_usd = float(row.get("net_value_usd", 0))

            # Health Rate Calculation
            # 1. Prefer protocol-provided health rate
            protocol_health_rate = row.get("protocol_health_rate")
            if protocol_health_rate is not None:
                health_rate = float(protocol_health_rate)
            else:
                # 2. Fallback to conservative LTV calculation
                collateral_basis = collateral_usd + debt_usd
                if collateral_basis <= 0:
                    # Edge case: debt with no collateral? Skip to avoid div/0 or nonsense
                    continue
                health_rate = (collateral_basis * self.CONSERVATIVE_LTV) / debt_usd

            # Status Classification
            health_status = self._classify_health_status(health_rate)

            # Date parsing
            updated_at = row.get("last_updated")
            if isinstance(updated_at, str):
                updated_at = datetime.fromisoformat(updated_at.replace("Z", "+00:00"))
            elif not isinstance(updated_at, datetime):
                updated_at = datetime.now(UTC)

            # Token list transformation
            collateral_tokens = self._transform_token_list(
                row.get("collateral_tokens", [])
            )
            debt_tokens = self._transform_token_list(row.get("debt_tokens", []))

            positions.append(
                BorrowingPosition(
                    protocol_id=protocol_id,
                    protocol_name=protocol_name,
                    chain=chain,
                    health_rate=health_rate,
                    health_status=health_status,
                    collateral_usd=collateral_usd,
                    debt_usd=debt_usd,
                    net_value_usd=net_value_usd,
                    collateral_tokens=collateral_tokens,
                    debt_tokens=debt_tokens,
                    updated_at=updated_at,
                )
            )

        # Sort by health rate ascending (riskiest first)
        positions.sort(key=lambda p: p.health_rate)
        return positions

    def _transform_token_list(
        self, raw_tokens: list[dict[str, Any]] | None
    ) -> list[TokenDetail]:
        """Convert raw JSONB token lists to TokenDetail models."""
        if not raw_tokens:
            return []

        token_details = []
        for token in raw_tokens:
            try:
                amount = float(token.get("amount", 0))
                price = float(token.get("price", 0))
                value_usd = amount * price

                token_details.append(
                    TokenDetail(
                        symbol=token.get("symbol", "N/A"),
                        amount=amount,
                        value_usd=value_usd,
                    )
                )
            except (ValueError, TypeError):
                continue

        return token_details
