"""Daily attribution for idle wallet token balances.

``analytics.daily_wallet_tokens`` is the only source that covers holdings sitting
outside a tracked DeFi position. Without it a price move on wallet ETH lands in
the frontend's unexplained residual, which makes "flows & other" the largest and
most misleading bucket on the home screen.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date as date_type
from typing import Any

from src.models.yield_returns import DailyWalletReturn, TokenYieldBreakdown
from src.services.aggregators.token_attribution import build_token_breakdown


@dataclass
class WalletTokenHolding:
    """Bundle-wide holding of one token on one chain for a single day."""

    symbol: str
    amount: float = 0.0
    price: float = 0.0


@dataclass(frozen=True)
class WalletDayDelta:
    """Adjacent holding snapshots keyed by ``chain:token_address``."""

    date: str
    current: dict[str, WalletTokenHolding]
    previous: dict[str, WalletTokenHolding]


@dataclass
class _SymbolTotals:
    """Running per-symbol totals while chain-specific rows are merged."""

    amount_change: float = 0.0
    yield_return_usd: float = 0.0
    market_return_usd: float = 0.0
    price_weight: float = 0.0
    weighted_price: float = 0.0
    fallback_price: float = 0.0


def _normalize_date(value: Any) -> str | None:
    """Reduce a snapshot date of any supported type to ``YYYY-MM-DD``."""
    if isinstance(value, date_type):
        return value.isoformat()[:10]
    if isinstance(value, str) and value:
        return value[:10]
    return None


def _as_float(value: Any) -> float:
    """Coerce a driver-supplied numeric (Decimal, str, None) to float."""
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def aggregate_wallet_snapshots(
    rows: list[dict[str, Any]],
) -> dict[str, dict[str, WalletTokenHolding]]:
    """Sum every wallet's holdings per day and token.

    Wallets are summed *before* the day-over-day difference so a transfer
    between two of the user's own wallets nets to zero instead of surfacing as
    a withdrawal plus a deposit.
    """
    by_day: dict[str, dict[str, WalletTokenHolding]] = defaultdict(dict)

    for row in rows:
        day = _normalize_date(row.get("snapshot_date"))
        if day is None:
            continue

        chain = str(row.get("chain") or "")
        token_address = str(row.get("token_address") or "")
        key = f"{chain}:{token_address}"
        symbol = str(row.get("symbol") or "")

        holding = by_day[day].get(key)
        if holding is None:
            holding = WalletTokenHolding(symbol=symbol or key)
            by_day[day][key] = holding

        holding.amount += _as_float(row.get("amount"))
        price = _as_float(row.get("price"))
        if price > 0.0:
            holding.price = price

    return dict(by_day)


def calculate_wallet_deltas(
    by_day: dict[str, dict[str, WalletTokenHolding]],
) -> list[WalletDayDelta]:
    """Pair each day with the previous day that actually has data.

    Snapshot gaps are bridged rather than skipped, so the whole move lands on
    the later day exactly as the DeBank position path already does.
    """
    deltas: list[WalletDayDelta] = []
    previous: dict[str, WalletTokenHolding] | None = None

    for day in sorted(by_day):
        current = by_day[day]
        if previous is not None:
            deltas.append(WalletDayDelta(date=day, current=current, previous=previous))
        previous = current

    return deltas


def _to_amount_map(
    holdings: dict[str, WalletTokenHolding],
) -> dict[str, dict[str, float]]:
    return {
        key: {"amount": holding.amount, "price": holding.price}
        for key, holding in holdings.items()
    }


def _resolve_symbol(delta: WalletDayDelta, key: str) -> str:
    holding = delta.current.get(key) or delta.previous.get(key)
    return holding.symbol if holding else key


def _merge_token(
    totals: _SymbolTotals, token: TokenYieldBreakdown, weight: float
) -> None:
    """Fold one chain-specific token result into its symbol's running totals."""
    totals.amount_change += token.amount_change
    totals.yield_return_usd += token.yield_return_usd
    totals.market_return_usd += token.market_return_usd
    totals.weighted_price += token.current_price * weight
    totals.price_weight += weight
    if totals.fallback_price == 0.0:
        totals.fallback_price = token.current_price


def _symbol_price(totals: _SymbolTotals) -> float:
    """Holdings-weighted price, falling back when nothing is held any more."""
    if totals.price_weight > 0.0:
        return totals.weighted_price / totals.price_weight
    return totals.fallback_price


@dataclass
class _DayAccumulator:
    """Per-symbol totals for a single day."""

    totals: dict[str, _SymbolTotals] = field(default_factory=dict)

    def add(self, symbol: str, token: TokenYieldBreakdown, weight: float) -> None:
        _merge_token(self.totals.setdefault(symbol, _SymbolTotals()), token, weight)

    def to_breakdown(self) -> list[TokenYieldBreakdown]:
        return [
            TokenYieldBreakdown(
                symbol=symbol,
                amount_change=totals.amount_change,
                current_price=_symbol_price(totals),
                yield_return_usd=totals.yield_return_usd,
                market_return_usd=totals.market_return_usd,
            )
            for symbol, totals in sorted(self.totals.items())
            if totals.yield_return_usd != 0.0 or totals.market_return_usd != 0.0
        ]


def build_wallet_returns(deltas: list[WalletDayDelta]) -> list[DailyWalletReturn]:
    """Split each day's wallet move into price effect and balance change.

    The same symbol held on several chains is merged so it lines up with the
    DeFi-position attribution the frontend renders alongside it. A token that
    first appears has no previous balance, so its whole value is reported as a
    balance change — which for a wallet is exactly what a transfer in looks
    like.
    """
    wallet_returns: list[DailyWalletReturn] = []

    for delta in deltas:
        accumulator = _DayAccumulator()
        breakdown = build_token_breakdown(
            _to_amount_map(delta.current), _to_amount_map(delta.previous)
        )
        for token in breakdown:
            key = token.symbol
            weight = abs(delta.current.get(key, WalletTokenHolding(symbol=key)).amount)
            accumulator.add(_resolve_symbol(delta, key), token, weight)

        tokens = accumulator.to_breakdown()
        if tokens:
            wallet_returns.append(DailyWalletReturn(date=delta.date, tokens=tokens))

    return wallet_returns
