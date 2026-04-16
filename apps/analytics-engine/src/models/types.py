"""
Shared custom types and validators for Pydantic models.

Provides reusable, declarative rounding via Annotated + AfterValidator so
models avoid repetitive @field_validator methods for common patterns.
"""

from typing import Annotated

from pydantic import AfterValidator

from src.core.config import settings


def _round_usd(value: float) -> float:
    """Round monetary values to configured USD decimal places."""
    return round(value, settings.validation.usd_decimal_places)


def _round_percentage(value: float) -> float:
    """Round percentage values to configured decimal places."""
    return round(value, settings.validation.percentage_decimal_places)


def _round_3dp(value: float) -> float:
    """Round to 3 decimal places (used for Sharpe ratio precision)."""
    return round(value, 3)


def _round_4dp(value: float) -> float:
    """Round to 4 decimal places (used for APR/ROI precision)."""
    return round(value, 4)


def _round_6dp(value: float) -> float:
    """Round to 6 decimal places (used for daily volatility/return precision)."""
    return round(value, 6)


# Type aliases for concise, reusable validation/rounding

# - Use these for any USD fields that require rounding, with per-field bounds
#   applied via Field(...) in model attribute declarations as needed.
USDRounded = Annotated[float, AfterValidator(_round_usd)]

# - Use for percentages that require 2dp rounding; apply bounds per field.
PercentageRounded = Annotated[float, AfterValidator(_round_percentage)]

# - Use for Sharpe ratio style metrics requiring 3dp rounding.
Float3dpRounded = Annotated[float, AfterValidator(_round_3dp)]

# - Use for APR/ROI/other precision floats that should be rounded to 4dp.
Float4dpRounded = Annotated[float, AfterValidator(_round_4dp)]

# - Use for daily volatility/returns that require 6dp precision.
Float6dpRounded = Annotated[float, AfterValidator(_round_6dp)]
