"""
Regime Tracking Service

Core service for market regime transition tracking and directional strategy display.

Responsibilities:
    - Map sentiment values (0-100) to regime IDs (ef, f, n, g, eg)
    - Compute transition direction (fromLeft, fromRight, default)
    - Fetch regime history from database
    - Record new regime transitions
    - Calculate duration metadata

Created: 2025-12-12
Phase: 2 - Backend Implementation
"""

import logging
from collections.abc import Mapping
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.orm import Session

from src.core.exceptions import DatabaseError, DataNotFoundError
from src.models.regime_tracking import (
    DirectionType,
    DurationInfo,
    RegimeHistoryResponse,
    RegimeId,
    RegimeTransition,
    format_duration_human_readable,
)
from src.services.interfaces import QueryServiceProtocol

logger = logging.getLogger(__name__)


# =============================================================================
# CONSTANTS
# =============================================================================

# Regime order for direction calculation (ef=0, f=1, n=2, g=3, eg=4)
REGIME_ORDER = {
    RegimeId.ef: 0,
    RegimeId.f: 1,
    RegimeId.n: 2,
    RegimeId.g: 3,
    RegimeId.eg: 4,
}

# =============================================================================
# SERVICE CLASS
# =============================================================================


class RegimeTrackingService:
    """
    Service for tracking market regime transitions and computing directional strategies.

    This service provides:
    - Sentiment-to-regime mapping
    - Direction calculation for contextual strategy display
    - Database operations for regime history
    - Duration calculations for "time in regime" display
    """

    def __init__(
        self, db: Session, query_service: QueryServiceProtocol | None = None
    ) -> None:
        """
        Initialize with database session and optional query service.
        # pylint: disable=duplicate-code

        Args:
            db: SQLAlchemy Session
            query_service: QueryService instance (optional for backward compat)
        """
        self.db = db
        # Handle optional query_service for backward compatibility
        if query_service is None:
            # Avoid circular import
            from src.services.dependencies import get_query_service

            self.query_service = get_query_service()
        else:
            self.query_service = query_service

    # =========================================================================
    # PUBLIC API METHODS
    # =========================================================================

    def compute_direction(
        self, current: RegimeId, previous: RegimeId | None
    ) -> DirectionType:
        """
        Compute transition direction from previous regime to current regime.

        Direction Logic:
            - fromLeft: Moving toward greed (ef -> f -> n -> g -> eg)
                Example: ef -> f is recovery, "Hold positions, zero rebalancing"
            - fromRight: Moving toward fear (eg -> g -> n -> f -> ef)
                Example: n -> f is decline, "Unwind LP positions, shift to spot"
            - default: No previous regime (first transition)

        Args:
            current: Current regime ID
            previous: Previous regime ID (None for first transition)

        Returns:
            DirectionType (fromLeft, fromRight, or default)

        Examples:
            >>> service.compute_direction(RegimeId.f, RegimeId.ef)
            DirectionType.fromLeft  # Recovery
            >>> service.compute_direction(RegimeId.f, RegimeId.n)
            DirectionType.fromRight  # Decline
            >>> service.compute_direction(RegimeId.n, None)
            DirectionType.default  # First transition
        """
        # No previous regime (first transition)
        if previous is None:
            return DirectionType.default

        # Get regime order positions
        current_order = REGIME_ORDER[current]
        previous_order = REGIME_ORDER[previous]

        # Moving toward greed (left to right on spectrum)
        if current_order > previous_order:
            return DirectionType.fromLeft

        # Moving toward fear (right to left on spectrum)
        if current_order < previous_order:
            return DirectionType.fromRight

        # Same regime (should not happen due to database constraint, but handle gracefully)
        logger.warning(
            f"compute_direction called with same regime: {current}, returning default"
        )
        return DirectionType.default

    def get_regime_history(
        self, limit: int = 2, since: datetime | None = None
    ) -> RegimeHistoryResponse:
        """
        Get regime history from database with direction calculation.

        This is the main method called by the API endpoint.
        Returns current regime, previous regime, and computed direction.

        Args:
            limit: Maximum number of transitions to return (default 2)
            since: Optional timestamp to filter transitions (default None = all)

        Returns:
            RegimeHistoryResponse with current, previous, direction, duration, and transitions list

        Raises:
            DataNotFoundError: If no regime transitions exist
            DatabaseError: If database query fails

        Examples:
            >>> history = service.get_regime_history(limit=2)
            >>> print(history.current.to_regime)  # Current regime
            >>> print(history.direction)  # fromLeft/fromRight/default
        """
        try:
            # Query registry import here to ensure availability
            from src.services.shared.query_names import QUERY_NAMES

            params = {"limit": limit, "since": since}

            # Execute named query
            rows = self.query_service.execute_query(
                self.db, QUERY_NAMES.REGIME_HISTORY, params
            )

            # Check if any transitions exist
            if not rows:
                raise DataNotFoundError(
                    message="No regime transitions found. Ensure alpha-etl is collecting sentiment data."
                )

            # Transform rows to RegimeTransition models
            transitions = [self._transform_row_to_transition(row) for row in rows]

            # Extract current and previous
            current = transitions[0]
            previous = transitions[1] if len(transitions) > 1 else None

            # Compute direction
            direction = self.compute_direction(
                current.to_regime,
                previous.to_regime if previous else None,
            )

            # Calculate duration in current regime
            duration_info = self._calculate_duration_info(current.transitioned_at)

            # Build response
            response = RegimeHistoryResponse(
                current=current,
                previous=previous,
                direction=direction,
                duration_in_current=duration_info,
                transitions=transitions,
                timestamp=datetime.now(UTC),
                cached=False,  # Will be set by caching layer
            )

            logger.info(
                f"Retrieved regime history: current={current.to_regime}, "
                f"previous={previous.to_regime if previous else None}, "
                f"direction={direction}"
            )

            return response

        except DataNotFoundError:
            # Re-raise domain exception
            raise

        except Exception as error:
            logger.exception("Error fetching regime history: %s", error)
            raise DatabaseError(
                message=f"Failed to fetch regime history: {str(error)[:200]}"
            ) from error

    # =========================================================================
    # PRIVATE HELPER METHODS
    # =========================================================================

    def _transform_row_to_transition(self, row: Mapping[str, Any]) -> RegimeTransition:
        """
        Transform database row to RegimeTransition model.

        Args:
            row: Database row as dictionary

        Returns:
            RegimeTransition model instance

        Raises:
            ValueError: If required fields are missing or invalid
        """
        try:
            return RegimeTransition(
                id=str(row["id"]),
                from_regime=RegimeId(row["from_regime"])
                if row.get("from_regime")
                else None,
                to_regime=RegimeId(row["to_regime"]),
                sentiment_value=int(row["sentiment_value"]),
                transitioned_at=row["transitioned_at"],
                duration_hours=None,  # Calculated separately if needed
            )
        except (KeyError, ValueError) as error:
            logger.exception(
                f"Error transforming database row to RegimeTransition: {error}"
            )
            raise ValueError(f"Invalid database row format: {error}") from error

    def _calculate_duration_info(self, transitioned_at: datetime) -> DurationInfo:
        """
        Calculate duration metadata for time spent in regime.

        Args:
            transitioned_at: Timestamp when regime transition occurred

        Returns:
            DurationInfo with hours, days, and human-readable string
        """
        now = datetime.now(UTC)
        duration = now - transitioned_at.replace(tzinfo=UTC)

        hours = duration.total_seconds() / 3600
        days = hours / 24
        human_readable = format_duration_human_readable(hours)

        return DurationInfo(
            hours=round(hours, 2),
            days=round(days, 2),
            human_readable=human_readable,
        )
