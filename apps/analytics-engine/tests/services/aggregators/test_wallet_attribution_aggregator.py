"""Unit tests for idle wallet token attribution."""

from __future__ import annotations

from datetime import date
from typing import Any

import pytest

from src.models.yield_returns import DailyWalletReturn
from src.services.aggregators.wallet_attribution_aggregator import (
    aggregate_wallet_snapshots,
    build_wallet_returns,
    calculate_wallet_deltas,
)

ETH = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
USDC_ETH = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"
USDC_BASE = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"


def _row(
    day: str,
    symbol: str,
    amount: float,
    price: float,
    *,
    wallet: str = "0xaaa",
    chain: str = "eth",
    token_address: str = ETH,
) -> dict[str, Any]:
    return {
        "wallet": wallet,
        "chain": chain,
        "token_address": token_address,
        "symbol": symbol,
        "amount": amount,
        "price": price,
        "snapshot_date": date.fromisoformat(day),
    }


def _returns(rows: list[dict[str, Any]]) -> list[DailyWalletReturn]:
    return build_wallet_returns(
        calculate_wallet_deltas(aggregate_wallet_snapshots(rows))
    )


def _token(entry: DailyWalletReturn, symbol: str):
    return next(token for token in entry.tokens if token.symbol == symbol)


def test_price_move_on_a_held_balance_is_market_only() -> None:
    """An unchanged balance at a new price is entirely a price effect."""
    [entry] = _returns(
        [
            _row("2026-01-01", "ETH", 2.0, 3_000.0),
            _row("2026-01-02", "ETH", 2.0, 3_100.0),
        ]
    )

    assert entry.date == "2026-01-02"
    token = _token(entry, "ETH")
    assert token.market_return_usd == pytest.approx(200.0)
    assert token.yield_return_usd == pytest.approx(0.0)


def test_transfer_between_the_users_own_wallets_nets_to_zero() -> None:
    """Wallets are summed before differencing, so an internal move is invisible."""
    rows = [
        _row("2026-01-01", "ETH", 2.0, 3_000.0, wallet="0xaaa"),
        _row("2026-01-01", "ETH", 1.0, 3_000.0, wallet="0xbbb"),
        _row("2026-01-02", "ETH", 0.0, 3_000.0, wallet="0xaaa"),
        _row("2026-01-02", "ETH", 3.0, 3_000.0, wallet="0xbbb"),
    ]

    assert _returns(rows) == []


def test_bridging_the_same_symbol_across_chains_nets_to_zero() -> None:
    """Per-symbol merging makes a bridge a wash rather than a paired flow."""
    rows = [
        _row("2026-01-01", "USDC", 100.0, 1.0, chain="eth", token_address=USDC_ETH),
        _row("2026-01-02", "USDC", 0.0, 1.0, chain="eth", token_address=USDC_ETH),
        _row("2026-01-02", "USDC", 100.0, 1.0, chain="base", token_address=USDC_BASE),
    ]

    assert _returns(rows) == []


def test_a_newly_seen_token_is_reported_entirely_as_a_balance_change() -> None:
    """No previous balance means no provable price effect — it is a transfer in."""
    rows = [
        _row("2026-01-01", "ETH", 2.0, 3_000.0),
        _row("2026-01-02", "ETH", 2.0, 3_000.0),
        _row("2026-01-02", "USDC", 500.0, 1.0, chain="eth", token_address=USDC_ETH),
    ]

    [entry] = _returns(rows)

    usdc = _token(entry, "USDC")
    assert usdc.yield_return_usd == pytest.approx(500.0)
    assert usdc.market_return_usd == pytest.approx(0.0)


def test_a_snapshot_gap_pairs_the_two_days_that_have_data() -> None:
    """A missing day is bridged; the whole move lands on the later snapshot."""
    rows = [
        _row("2026-01-01", "ETH", 2.0, 3_000.0),
        _row("2026-01-05", "ETH", 2.0, 3_400.0),
    ]

    [entry] = _returns(rows)

    assert entry.date == "2026-01-05"
    assert _token(entry, "ETH").market_return_usd == pytest.approx(800.0)


def test_an_unpriced_side_never_invents_a_market_move() -> None:
    """A zero price means "unknown" upstream, not "worthless"."""
    rows = [
        _row("2026-01-01", "ETH", 2.0, 0.0),
        _row("2026-01-02", "ETH", 2.0, 3_000.0),
    ]

    assert _returns(rows) == []


def test_the_same_symbol_on_two_chains_merges_into_one_row() -> None:
    """The frontend groups DeFi and wallet market effects by symbol, so do we."""
    rows = [
        _row("2026-01-01", "USDC", 100.0, 1.0, chain="eth", token_address=USDC_ETH),
        _row("2026-01-01", "USDC", 300.0, 1.0, chain="base", token_address=USDC_BASE),
        _row("2026-01-02", "USDC", 100.0, 1.01, chain="eth", token_address=USDC_ETH),
        _row("2026-01-02", "USDC", 300.0, 1.01, chain="base", token_address=USDC_BASE),
    ]

    [entry] = _returns(rows)

    assert [token.symbol for token in entry.tokens] == ["USDC"]
    token = _token(entry, "USDC")
    assert token.market_return_usd == pytest.approx(4.0)
    assert token.current_price == pytest.approx(1.01)


def test_string_snapshot_dates_are_accepted() -> None:
    """Drivers may hand back an ISO string instead of a date object."""
    rows = [
        {**_row("2026-01-01", "ETH", 2.0, 3_000.0), "snapshot_date": "2026-01-01"},
        {
            **_row("2026-01-02", "ETH", 2.0, 3_100.0),
            "snapshot_date": "2026-01-02T00:00:00+00:00",
        },
    ]

    [entry] = _returns(rows)

    assert entry.date == "2026-01-02"


def test_a_single_day_of_history_produces_no_attribution() -> None:
    """Attribution needs two snapshots; one day is not a change."""
    assert _returns([_row("2026-01-01", "ETH", 2.0, 3_000.0)]) == []
