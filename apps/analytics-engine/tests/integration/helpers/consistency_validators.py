"""
Reusable validation functions for landing-page and portfolio-trend consistency tests.
"""

from typing import Any


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
