"""
Regime Tracking Models

Pydantic models for market regime transition tracking and directional strategy display.

Models:
    - RegimeId: Enum of 5 market regimes (ef, f, n, g, eg)
    - DirectionType: Enum of transition directions (fromLeft, fromRight, default)
    - RegimeTransition: Single regime transition record
    - DurationInfo: Duration metadata for time spent in regime
    - RegimeHistoryResponse: API response with current/previous regime and direction

Created: 2025-12-12
Phase: 2 - Backend Implementation
"""

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field

# =============================================================================
# ENUMS
# =============================================================================


class RegimeId(str, Enum):
    """
    Market regime types based on Fear & Greed Index sentiment ranges.

    Sentiment Ranges:
        - ef (Extreme Fear): 0-25
        - f (Fear): 26-45
        - n (Neutral): 46-54
        - g (Greed): 55-75
        - eg (Extreme Greed): 76-100
    """

    ef = "ef"  # Extreme Fear
    f = "f"  # Fear
    n = "n"  # Neutral
    g = "g"  # Greed
    eg = "eg"  # Extreme Greed

    def __str__(self) -> str:
        """Return regime ID as string."""
        return self.value

    @property
    def label(self) -> str:
        """Return human-readable label for regime."""
        labels = {
            "ef": "Extreme Fear",
            "f": "Fear",
            "n": "Neutral",
            "g": "Greed",
            "eg": "Extreme Greed",
        }
        return labels[self.value]

    @property
    def sentiment_range(self) -> tuple[int, int]:
        """Return (min, max) sentiment values for this regime."""
        ranges = {
            "ef": (0, 25),
            "f": (26, 45),
            "n": (46, 54),
            "g": (55, 75),
            "eg": (76, 100),
        }
        return ranges[self.value]


class DirectionType(str, Enum):
    """
    Direction of regime transition for contextual strategy display.

    Values:
        - fromLeft: Moving toward greed (ef -> f -> n -> g -> eg)
        - fromRight: Moving toward fear (eg -> g -> n -> f -> ef)
        - default: No previous regime (first transition or unknown direction)

    Use Cases:
        - fromLeft: "Recovery" strategies (hold positions, monitor)
        - fromRight: "Decline" strategies (unwind LP, shift to spot)
        - default: Generic strategies (regime-appropriate actions)
    """

    fromLeft = "fromLeft"  # Moving toward greed
    fromRight = "fromRight"  # Moving toward fear
    default = "default"  # No previous regime

    def __str__(self) -> str:
        """Return direction as string."""
        return self.value


# =============================================================================
# DATA MODELS
# =============================================================================


class RegimeTransition(BaseModel):
    """
    Single regime transition record.

    Represents a change from one market regime to another, including
    the sentiment value that triggered the transition and timing information.
    """

    id: str = Field(..., description="Unique identifier (UUID) for this transition")

    from_regime: RegimeId | None = Field(
        None,
        description="Previous regime (null for initial transition)",
    )

    to_regime: RegimeId = Field(..., description="New regime after transition")

    sentiment_value: int = Field(
        ...,
        ge=0,
        le=100,
        description="Fear & Greed Index value (0-100) that triggered this regime",
    )

    transitioned_at: datetime = Field(
        ..., description="Timestamp when the regime transition occurred"
    )

    duration_hours: float | None = Field(
        None,
        description="Duration in hours that previous regime lasted (null for current regime)",
    )

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "id": "550e8400-e29b-41d4-a716-446655440000",
                "from_regime": "f",
                "to_regime": "n",
                "sentiment_value": 48,
                "transitioned_at": "2025-01-17T10:30:00Z",
                "duration_hours": 50.5,
            }
        }
    )


class DurationInfo(BaseModel):
    """
    Duration metadata for time spent in current regime.

    Provides human-readable duration information for displaying
    "You've been in Fear for 2 days" type messages.
    """

    hours: float = Field(..., ge=0, description="Duration in hours (fractional)")

    days: float = Field(..., ge=0, description="Duration in days (fractional)")

    human_readable: str = Field(
        ...,
        description='Human-readable duration string (e.g., "2 days, 3 hours")',
    )

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "hours": 51.5,
                "days": 2.1,
                "human_readable": "2 days, 3 hours",
            }
        }
    )


class RegimeHistoryResponse(BaseModel):
    """
    API response for GET /api/v2/market/regime/history endpoint.

    Returns current regime, previous regime, and computed direction
    for contextual strategy display in the frontend.
    """

    current: RegimeTransition = Field(..., description="Current regime transition")

    previous: RegimeTransition | None = Field(
        None, description="Previous regime transition (null if no history)"
    )

    direction: DirectionType = Field(
        ..., description="Direction of transition (fromLeft/fromRight/default)"
    )

    duration_in_current: DurationInfo | None = Field(
        None,
        description="Duration metadata for current regime (null if just transitioned)",
    )

    transitions: list[RegimeTransition] = Field(
        ...,
        description="Ordered list of regime transitions (most recent first)",
    )

    timestamp: datetime = Field(
        ..., description="Server timestamp when response was generated"
    )

    cached: bool = Field(
        False, description="Whether this response was served from cache"
    )

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "current": {
                    "id": "550e8400-e29b-41d4-a716-446655440000",
                    "from_regime": "f",
                    "to_regime": "n",
                    "sentiment_value": 48,
                    "transitioned_at": "2025-01-17T10:30:00Z",
                    "duration_hours": None,
                },
                "previous": {
                    "id": "450e8400-e29b-41d4-a716-446655440000",
                    "from_regime": "ef",
                    "to_regime": "f",
                    "sentiment_value": 30,
                    "transitioned_at": "2025-01-15T08:00:00Z",
                    "duration_hours": 50.5,
                },
                "direction": "fromLeft",
                "duration_in_current": {
                    "hours": 51.5,
                    "days": 2.1,
                    "human_readable": "2 days, 3 hours",
                },
                "transitions": [],
                "timestamp": "2025-01-17T11:00:00Z",
                "cached": False,
            }
        }
    )


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================


def format_duration_human_readable(hours: float) -> str:
    """
    Format duration in hours to human-readable string.

    Examples:
        - 0.5 hours -> "30 minutes"
        - 2.5 hours -> "2 hours, 30 minutes"
        - 25 hours -> "1 day, 1 hour"
        - 50.5 hours -> "2 days, 2 hours"

    Args:
        hours: Duration in hours (fractional)

    Returns:
        Human-readable duration string
    """
    if hours < 1:
        minutes = int(hours * 60)
        return f"{minutes} minute{'s' if minutes != 1 else ''}"

    days = int(hours // 24)
    remaining_hours = int(hours % 24)

    parts = []
    if days > 0:
        parts.append(f"{days} day{'s' if days != 1 else ''}")
    if remaining_hours > 0:
        parts.append(f"{remaining_hours} hour{'s' if remaining_hours != 1 else ''}")

    return ", ".join(parts)
