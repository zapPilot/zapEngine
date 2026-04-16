"""
Financial Utility Functions

Shared utilities for safe type conversions and financial calculations
across the analytics engine. Consolidates duplicate logic from service layers.

Functions:
    - safe_float: Convert any value to float with fallback to 0.0
    - safe_int: Convert any value to int with fallback to 0
    - calculate_percentage: Calculate percentage with division-by-zero protection
    - calculate_percentage_rounded: Calculate percentage rounded to 2 decimal places
    - sum_category_wallet_values: Sum wallet_tokens_value across portfolio categories
    - sum_category_total_values: Sum total_value across portfolio categories

All functions are defensive against None, invalid types, and edge cases.
"""

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from src.models.portfolio import PortfolioAllocation  # pragma: no cover


def safe_float(value: Any) -> float:
    """
    Convert any value to float with safe fallback to 0.0.

    Handles None, empty strings, and invalid types gracefully without raising
    exceptions. Essential for processing financial data from external sources
    where values may be missing or malformed.

    Args:
        value: Any value to convert to float (int, float, str, None, etc.)

    Returns:
        float: The converted value, or 0.0 if conversion fails

    Examples:
        >>> safe_float(42)
        42.0
        >>> safe_float("123.45")
        123.45
        >>> safe_float(None)
        0.0
        >>> safe_float("")
        0.0
        >>> safe_float("invalid")
        0.0
        >>> safe_float([1, 2, 3])
        0.0

    Notes:
        - Treats None and empty values as 0.0
        - No exceptions raised for invalid input
        - Uses Python's built-in float() for conversion
    """
    try:
        return float(value or 0.0)
    except (TypeError, ValueError):
        return 0.0


def safe_int(value: Any) -> int:
    """
    Convert any value to int with safe fallback to 0.

    Handles None, empty strings, and invalid types gracefully without raising
    exceptions. Useful for processing counts and IDs from database queries.

    Args:
        value: Any value to convert to int (int, float, str, None, etc.)

    Returns:
        int: The converted value, or 0 if conversion fails

    Examples:
        >>> safe_int(42)
        42
        >>> safe_int("123")
        123
        >>> safe_int(45.7)
        45
        >>> safe_int(None)
        0
        >>> safe_int("")
        0
        >>> safe_int("invalid")
        0
        >>> safe_int([1, 2, 3])
        0

    Notes:
        - Treats None and empty values as 0
        - Truncates floats to integers (no rounding)
        - No exceptions raised for invalid input
        - Uses Python's built-in int() for conversion
    """
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def calculate_percentage(part: float, whole: float) -> float:
    """
    Calculate percentage with division-by-zero protection.

    Computes (part / whole) * 100 with safe handling of edge cases.
    Returns 0.0 when the whole is zero or negative, or when the part is
    zero or negative.

    Args:
        part: The partial value (numerator)
        whole: The total value (denominator)

    Returns:
        float: Percentage value, or 0.0 if calculation is invalid

    Examples:
        >>> calculate_percentage(50, 200)
        25.0
        >>> calculate_percentage(75, 100)
        75.0
        >>> calculate_percentage(100, 100)
        100.0
        >>> calculate_percentage(0, 100)
        0.0
        >>> calculate_percentage(50, 0)
        0.0
        >>> calculate_percentage(-10, 100)
        0.0
        >>> calculate_percentage(50, -100)
        0.0

    Notes:
        - Returns 0.0 when whole <= 0.0 (division by zero protection)
        - Returns 0.0 when part <= 0.0 (negative percentage protection)
        - Does not round the result (use calculate_percentage_rounded for that)
        - Formula: (part / whole) * 100.0
    """
    if whole <= 0.0 or part <= 0.0:
        return 0.0
    return (part / whole) * 100.0


def calculate_percentage_rounded(part: float, whole: float, decimals: int = 2) -> float:
    """
    Calculate percentage rounded to specified decimal places.

    Convenience function that combines calculate_percentage with rounding.
    Default rounding is to 2 decimal places, which is standard for financial
    reporting.

    Args:
        part: The partial value (numerator)
        whole: The total value (denominator)
        decimals: Number of decimal places to round to (default: 2)

    Returns:
        float: Rounded percentage value, or 0.0 if calculation is invalid

    Examples:
        >>> calculate_percentage_rounded(33.33, 100)
        33.33
        >>> calculate_percentage_rounded(1, 3)
        33.33
        >>> calculate_percentage_rounded(2, 3)
        66.67
        >>> calculate_percentage_rounded(1, 3, decimals=4)
        33.3333
        >>> calculate_percentage_rounded(0, 100)
        0.0
        >>> calculate_percentage_rounded(50, 0)
        0.0

    Notes:
        - Uses calculate_percentage() for the calculation
        - Standard rounding rules apply (0.5 rounds to nearest even)
        - Common use case: decimals=2 for financial percentage display
        - Inherits edge case handling from calculate_percentage()
    """
    return round(calculate_percentage(part, whole), decimals)


def sum_category_wallet_values(allocation: "PortfolioAllocation") -> float:
    """
    Sum wallet_tokens_value across all portfolio categories.

    Provides a single source of truth for category wallet value summation,
    eliminating floating-point precision discrepancies between duplicate
    calculation paths in the builder and validator.

    Args:
        allocation: PortfolioAllocation containing category data

    Returns:
        Sum of wallet_tokens_value from btc, eth, stablecoins, others

    Example:
        >>> allocation = PortfolioAllocation(...)
        >>> total = sum_category_wallet_values(allocation)
        >>> # Guarantees exact match between builder and validator

    Notes:
        - Uses forward reference to avoid circular import
        - Evaluates categories in consistent order (btc, eth, stablecoins, others)
        - Guarantees exact match between builder and validator calculations
        - Both builder and validator MUST use this function
    """
    return (
        allocation.btc.wallet_tokens_value
        + allocation.eth.wallet_tokens_value
        + allocation.stablecoins.wallet_tokens_value
        + allocation.others.wallet_tokens_value
    )


def sum_category_total_values(allocation: "PortfolioAllocation") -> float:
    """
    Sum total_value across all portfolio categories.

    Companion to sum_category_wallet_values() for total value summation.
    Provides consistent calculation path for allocation sum validation.

    Args:
        allocation: PortfolioAllocation containing category data

    Returns:
        Sum of total_value from btc, eth, stablecoins, others

    Example:
        >>> allocation = PortfolioAllocation(...)
        >>> total = sum_category_total_values(allocation)
        >>> # Used in portfolio allocation sum validation

    Notes:
        - Uses forward reference to avoid circular import
        - Evaluates categories in consistent order (btc, eth, stablecoins, others)
        - Ensures consistent validation logic across the codebase
    """
    return (
        allocation.btc.total_value
        + allocation.eth.total_value
        + allocation.stablecoins.total_value
        + allocation.others.total_value
    )
