"""Unit tests for the deposit/withdrawal fence over balance deltas."""

from __future__ import annotations

from typing import Any

from src.services.aggregators.delta_outliers import flag_outlier_deltas


def _delta(
    date: str,
    value: float,
    *,
    protocol: str = "Aave",
    chain: str = "ethereum",
) -> dict[str, Any]:
    return {
        "snapshot_at": date,
        "protocol_name": protocol,
        "chain": chain,
        "token_yield_usd": value,
    }


def _month(
    values: list[float], *, protocol: str = "Aave", chain: str = "ethereum"
) -> list[dict[str, Any]]:
    return [
        _delta(f"2026-01-{index + 1:02d}", value, protocol=protocol, chain=chain)
        for index, value in enumerate(values)
    ]


def _routine(base: float, count: int = 29) -> list[float]:
    """Carry that wobbles a little, so the IQR fence has a real spread to work
    with rather than the degenerate identical-values guard."""
    return [base * (1.0 + 0.1 * (index % 3)) for index in range(count)]


def test_only_the_deposit_spike_is_flagged() -> None:
    """A month of routine carry plus one funding day flags only that day."""
    deltas = _month([*_routine(2.0), 1_000.0])

    flagged = flag_outlier_deltas(deltas)

    assert flagged == {("Aave", "ethereum", "2026-01-30")}


def test_withdrawal_spike_is_flagged_like_a_deposit() -> None:
    """The fence is two-sided: a large negative day is a flow, not a loss."""
    deltas = _month([*_routine(2.0), -1_000.0])

    flagged = flag_outlier_deltas(deltas)

    assert flagged == {("Aave", "ethereum", "2026-01-30")}


def test_short_series_is_never_flagged() -> None:
    """Below the strategy's sample minimum, nothing is guessed at."""
    deltas = _month([2.0, 2.2, 900.0])

    assert flag_outlier_deltas(deltas) == set()


def test_each_protocol_position_is_fenced_against_its_own_history() -> None:
    """A big protocol's routine day is not flagged by a small protocol's scale."""
    deltas = _month([*_routine(500.0), 520.0], protocol="Big") + _month(
        [*_routine(1.0), 400.0], protocol="Small"
    )

    flagged = flag_outlier_deltas(deltas)

    assert flagged == {("Small", "ethereum", "2026-01-30")}


def test_same_protocol_on_two_chains_is_fenced_separately() -> None:
    """Chain is part of the series identity, so one chain cannot mask another."""
    deltas = _month([*_routine(1.0), 400.0], chain="ethereum") + _month(
        _routine(1.0, 30), chain="base"
    )

    flagged = flag_outlier_deltas(deltas)

    assert flagged == {("Aave", "ethereum", "2026-01-30")}


def test_multiple_positions_on_one_day_are_summed_before_fencing() -> None:
    """Two rows sharing a protocol/chain/day are one observation, and both flag."""
    deltas = _month(_routine(2.0))
    deltas.extend(
        [
            _delta("2026-01-30", 600.0),
            _delta("2026-01-30", 600.0),
        ]
    )

    flagged = flag_outlier_deltas(deltas)

    assert flagged == {("Aave", "ethereum", "2026-01-30")}


def test_rows_without_a_date_are_ignored() -> None:
    """A delta with no snapshot date cannot be placed on the series."""
    deltas = _month(_routine(2.0, 30))
    deltas.append(
        {"protocol_name": "Aave", "chain": "ethereum", "token_yield_usd": 9.0}
    )

    assert flag_outlier_deltas(deltas) == set()
