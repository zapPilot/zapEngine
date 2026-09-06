"""Shared token-level split between price effect and balance change.

Both the DeBank position path and the idle wallet path need the same
decomposition, so it lives here rather than on either service.
"""

from __future__ import annotations

from src.models.yield_returns import TokenYieldBreakdown


def build_token_breakdown(
    current_amounts: dict[str, dict[str, float]],
    previous_amounts: dict[str, dict[str, float]],
) -> list[TokenYieldBreakdown]:
    """Generate token-level amount and price attribution."""
    breakdown: list[TokenYieldBreakdown] = []
    all_symbols = sorted(set(current_amounts.keys()) | set(previous_amounts.keys()))

    for symbol in all_symbols:
        current = current_amounts.get(symbol, {})
        previous = previous_amounts.get(symbol, {})
        current_amount = float(current.get("amount", 0.0))
        current_price = float(current.get("price", previous.get("price", 0.0)))
        previous_amount = float(previous.get("amount", 0.0))
        previous_price = float(previous.get("price", current_price))
        amount_diff = current_amount - previous_amount
        yield_return_usd = amount_diff * current_price
        # Upstream stores a missing DeBank price as 0.0, which is
        # indistinguishable from a worthless token. Attributing a price
        # effect against an unpriced side would invent a market move worth
        # the whole position, so leave it for the caller's residual.
        market_return_usd = (
            previous_amount * (current_price - previous_price)
            if current_price > 0.0 and previous_price > 0.0
            else 0.0
        )
        breakdown.append(
            TokenYieldBreakdown(
                symbol=symbol,
                amount_change=amount_diff,
                current_price=current_price,
                yield_return_usd=yield_return_usd,
                market_return_usd=market_return_usd,
            )
        )

    return breakdown
