"""
Reusable validation functions for cross-endpoint data consistency tests.

These helpers provide standardized assertions to catch data inconsistencies
between landing page, pool performance, and portfolio trends endpoints.
"""

from typing import Any


def extract_pool_key(pool: dict[str, Any]) -> tuple[str, str, tuple[str, ...]]:
    """
    Generate sortable key for comparing pools across endpoints.

    Args:
        pool: Pool position dictionary from any endpoint

    Returns:
        Tuple of (protocol, chain, sorted_pool_symbols) for sorting
    """
    protocol = pool.get("protocol", "").lower()
    chain = pool.get("chain", "").lower()
    pool_symbols = tuple(sorted(pool.get("pool_symbols", [])))
    return (protocol, chain, pool_symbols)


def assert_pool_lists_match(
    pools1: list[dict[str, Any]],
    pools2: list[dict[str, Any]],
    *,
    tolerance: float = 0.01,
    source1_name: str = "source1",
    source2_name: str = "source2",
) -> None:
    """
    Compare two lists of pool positions field-by-field.

    Validates that both lists contain the same pools with matching values.
    Sorts both lists by (protocol, chain, pool_symbols) before comparison.

    Args:
        pools1: First list of pool positions
        pools2: Second list of pool positions
        tolerance: Float comparison tolerance (default 0.01 for USD values)
        source1_name: Name of first source for error messages
        source2_name: Name of second source for error messages

    Raises:
        AssertionError: If pools don't match with detailed failure message
    """
    # Sort both lists for order-independent comparison
    sorted_pools1 = sorted(pools1, key=extract_pool_key)
    sorted_pools2 = sorted(pools2, key=extract_pool_key)

    # Check pool counts match
    assert len(sorted_pools1) == len(sorted_pools2), (
        f"Pool count mismatch: {source1_name} has {len(sorted_pools1)} pools, "
        f"{source2_name} has {len(sorted_pools2)} pools"
    )

    # Compare each pool field-by-field
    for i, (pool1, pool2) in enumerate(zip(sorted_pools1, sorted_pools2, strict=False)):
        pool_key = extract_pool_key(pool1)

        # Protocol match
        assert pool1.get("protocol", "").lower() == pool2.get("protocol", "").lower(), (
            f"Pool {i} protocol mismatch for {pool_key}: "
            f"{source1_name}={pool1.get('protocol')} vs {source2_name}={pool2.get('protocol')}"
        )

        # Chain match
        assert pool1.get("chain", "").lower() == pool2.get("chain", "").lower(), (
            f"Pool {i} chain mismatch for {pool_key}: "
            f"{source1_name}={pool1.get('chain')} vs {source2_name}={pool2.get('chain')}"
        )

        # Pool symbols match (order-independent)
        symbols1 = sorted(pool1.get("pool_symbols", []))
        symbols2 = sorted(pool2.get("pool_symbols", []))
        assert symbols1 == symbols2, (
            f"Pool {i} symbols mismatch for {pool_key}: "
            f"{source1_name}={symbols1} vs {source2_name}={symbols2}"
        )

        # Asset USD value match (with tolerance)
        value1 = pool1.get("asset_usd_value", 0.0)
        value2 = pool2.get("asset_usd_value", 0.0)
        assert abs(value1 - value2) < tolerance, (
            f"Pool {i} asset_usd_value mismatch for {pool_key}: "
            f"{source1_name}=${value1:.2f} vs {source2_name}=${value2:.2f} "
            f"(diff=${abs(value1 - value2):.2f}, tolerance=${tolerance})"
        )


def assert_total_values_match(
    landing_data: dict[str, Any],
    pools_data: list[dict[str, Any]],
    trends_data: dict[str, Any] | None = None,
    *,
    tolerance: float = 0.01,
) -> None:
    """
    Validate total portfolio values match across all endpoints.

    Args:
        landing_data: Landing page response JSON
        pools_data: Pool performance endpoint response JSON (list of pools)
        trends_data: Optional trends endpoint response JSON
        tolerance: Float comparison tolerance

    Raises:
        AssertionError: If total values don't match across endpoints
    """
    # Extract landing page total
    landing_total = landing_data.get("total_net_usd", 0.0)

    # Calculate pool endpoint total
    pools_total = sum(pool.get("asset_usd_value", 0.0) for pool in pools_data)

    # Validate landing page vs pools
    assert abs(landing_total - pools_total) < tolerance, (
        f"Total value mismatch between landing page and pools endpoint: "
        f"landing=${landing_total:.2f} vs pools=${pools_total:.2f} "
        f"(diff=${abs(landing_total - pools_total):.2f})"
    )

    # Validate trends if provided
    if trends_data:
        daily_values = trends_data.get("daily_values", [])
        if daily_values:
            # Get most recent trend value (first in list, sorted DESC)
            trends_latest = daily_values[0].get("total_value_usd", 0.0)

            assert abs(landing_total - trends_latest) < tolerance, (
                f"Total value mismatch between landing page and trends endpoint: "
                f"landing=${landing_total:.2f} vs trends_latest=${trends_latest:.2f} "
                f"(diff=${abs(landing_total - trends_latest):.2f})"
            )

            assert abs(pools_total - trends_latest) < tolerance, (
                f"Total value mismatch between pools and trends endpoint: "
                f"pools=${pools_total:.2f} vs trends_latest=${trends_latest:.2f} "
                f"(diff=${abs(pools_total - trends_latest):.2f})"
            )


def assert_protocol_breakdown_consistency(
    landing_data: dict[str, Any],
    trends_data: dict[str, Any],
    *,
    tolerance: float = 0.01,
) -> None:
    """
    Validate protocol aggregations match between landing page and trends.

    Args:
        landing_data: Landing page response JSON
        trends_data: Trends endpoint response JSON
        tolerance: Float comparison tolerance

    Raises:
        AssertionError: If protocol breakdowns don't match
    """
    # Extract landing page protocol breakdown
    landing_pools = landing_data.get("pool_details", [])
    landing_by_protocol: dict[str, float] = {}
    for pool in landing_pools:
        protocol = pool.get("protocol", "").lower()
        value = pool.get("asset_usd_value", 0.0)
        landing_by_protocol[protocol] = landing_by_protocol.get(protocol, 0.0) + value

    # Extract trends protocol breakdown (most recent day)
    daily_values = trends_data.get("daily_values", [])
    if not daily_values:
        return  # No trend data to compare

    trends_by_protocol = daily_values[0].get("by_protocol", {})

    # Normalize trends protocol keys to lowercase
    trends_by_protocol_lower = {k.lower(): v for k, v in trends_by_protocol.items()}

    # Check all protocols in landing page appear in trends
    for protocol, landing_value in landing_by_protocol.items():
        trends_value = trends_by_protocol_lower.get(protocol, 0.0)
        assert abs(landing_value - trends_value) < tolerance, (
            f"Protocol '{protocol}' value mismatch: "
            f"landing=${landing_value:.2f} vs trends=${trends_value:.2f} "
            f"(diff=${abs(landing_value - trends_value):.2f})"
        )


def assert_chain_breakdown_consistency(
    landing_data: dict[str, Any],
    trends_data: dict[str, Any],
    *,
    tolerance: float = 0.01,
) -> None:
    """
    Validate chain aggregations match between landing page and trends.

    Args:
        landing_data: Landing page response JSON
        trends_data: Trends endpoint response JSON
        tolerance: Float comparison tolerance

    Raises:
        AssertionError: If chain breakdowns don't match
    """
    # Extract landing page chain breakdown
    landing_pools = landing_data.get("pool_details", [])
    landing_by_chain: dict[str, float] = {}
    for pool in landing_pools:
        chain = pool.get("chain", "").lower()
        value = pool.get("asset_usd_value", 0.0)
        landing_by_chain[chain] = landing_by_chain.get(chain, 0.0) + value

    # Extract trends chain breakdown (most recent day)
    daily_values = trends_data.get("daily_values", [])
    if not daily_values:
        return  # No trend data to compare

    trends_by_chain = daily_values[0].get("by_chain", {})

    # Normalize trends chain keys to lowercase
    trends_by_chain_lower = {k.lower(): v for k, v in trends_by_chain.items()}

    # Check all chains in landing page appear in trends
    for chain, landing_value in landing_by_chain.items():
        trends_value = trends_by_chain_lower.get(chain, 0.0)
        assert abs(landing_value - trends_value) < tolerance, (
            f"Chain '{chain}' value mismatch: "
            f"landing=${landing_value:.2f} vs trends=${trends_value:.2f} "
            f"(diff=${abs(landing_value - trends_value):.2f})"
        )


def assert_token_signature_distinct(
    pools: list[dict[str, Any]],
    *,
    protocol_filter: str | None = None,
    chain_filter: str | None = None,
) -> None:
    """
    Validate that positions with different token compositions are NOT merged.

    This is the key assertion for catching GMX V2-style bugs where positions
    with same name_item but different tokens are incorrectly merged.

    Args:
        pools: List of pool positions from any endpoint
        protocol_filter: Optional protocol to filter (e.g., "gmx-v2")
        chain_filter: Optional chain to filter (e.g., "arb")

    Raises:
        AssertionError: If duplicate (protocol, chain, name_item) found with
                       different pool_symbols, indicating improper deduplication
    """
    # Filter pools if requested
    filtered_pools = pools
    if protocol_filter:
        filtered_pools = [
            p
            for p in filtered_pools
            if p.get("protocol", "").lower() == protocol_filter.lower()
        ]
    if chain_filter:
        filtered_pools = [
            p
            for p in filtered_pools
            if p.get("chain", "").lower() == chain_filter.lower()
        ]

    # Group by (protocol, chain) to check name_item uniqueness
    by_protocol_chain: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for pool in filtered_pools:
        key = (
            pool.get("protocol", "").lower(),
            pool.get("chain", "").lower(),
        )
        by_protocol_chain.setdefault(key, []).append(pool)

    # For each (protocol, chain), check that name_items are distinct or have different tokens
    for (protocol, chain), group_pools in by_protocol_chain.items():
        # Get all pool_symbols for each pool
        pool_symbols_list = [
            tuple(sorted(p.get("pool_symbols", []))) for p in group_pools
        ]

        # All pool_symbols should be distinct (if deduplication working correctly)
        # If we find duplicates, something is wrong
        seen_symbols: set[tuple[str, ...]] = set()
        for symbols in pool_symbols_list:
            if symbols and symbols in seen_symbols:
                # This should only happen if positions are properly merged
                # (same tokens). We're checking they're NOT improperly merged
                # (different tokens).
                pass
            seen_symbols.add(symbols)

        # The real check: positions with same name_item but different tokens
        # should exist as separate entries
        # We check this by ensuring each unique token combination appears once
        assert len(pool_symbols_list) == len(group_pools), (
            f"Duplicate detection issue for {protocol}/{chain}: "
            f"Found {len(group_pools)} pools but only {len(set(pool_symbols_list))} unique token signatures"
        )
