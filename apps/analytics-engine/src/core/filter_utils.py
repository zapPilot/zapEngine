"""Filter normalization utilities for query parameter processing."""


def normalize_filter(values: list[str] | None) -> str:
    """
    Normalize a list of filter values to a consistent string format.

    Converts a list of strings to a sorted, lowercase, comma-separated string.
    Returns "all" if the list is empty or None.

    Args:
        values: List of filter values (e.g., protocols, chains) or None

    Returns:
        Normalized filter string ("all" for empty/None, comma-separated otherwise)

    Examples:
        >>> normalize_filter(None)
        'all'
        >>> normalize_filter([])
        'all'
        >>> normalize_filter(["AAVE", "Compound"])
        'aave,compound'
        >>> normalize_filter(["ETH", "BTC", ""])
        'btc,eth'
    """
    if not values:
        return "all"
    normalized = sorted(v.strip().lower() for v in values if v)
    return ",".join(normalized) if normalized else "all"
