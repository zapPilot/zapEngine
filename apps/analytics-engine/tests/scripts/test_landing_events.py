from __future__ import annotations

import json
from typing import Any

import pytest

from scripts.attribution.sweep_production_window import (
    DEFAULT_SNAPSHOT_PATH,
    LANDING_EQUITY_CURVE_PATH,
)
from scripts.landing.events import derive_events, reconcile

STRATEGY_ID = "dma_fgi_portfolio_rules"


def _day(
    date: str,
    *,
    transfers: list[dict[str, Any]] | None = None,
    spot_asset: str | None = None,
    asset_allocation: dict[str, float] | None = None,
    reason: str = "",
) -> dict[str, Any]:
    return {
        "market": {"date": date},
        "strategies": {
            STRATEGY_ID: {
                "portfolio": {
                    "total_value": 10_000.0,
                    "spot_asset": spot_asset,
                    "asset_allocation": asset_allocation
                    or {"btc": 0.5, "eth": 0.0, "spy": 0.0, "stable": 0.5, "alt": 0.0},
                },
                "decision": {"reason": reason, "details": {}},
                "execution": {"transfers": transfers or []},
            }
        },
    }


def _leg(source: str, target: str, amount: float) -> dict[str, Any]:
    return {"from_bucket": source, "to_bucket": target, "amount_usd": amount}


def _derive(timeline: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], dict]:
    indexed = {
        point["market"]["date"]: 100.0 + index for index, point in enumerate(timeline)
    }
    return derive_events(
        timeline=timeline, strategy_id=STRATEGY_ID, indexed_by_date=indexed
    )


def test_hold_run_emits_nothing() -> None:
    events, meta = _derive([_day("2026-01-01"), _day("2026-01-02"), _day("2026-01-03")])

    assert events == []
    assert meta["count"] == 0
    assert meta["unclassifiedCount"] == 0


def test_stable_into_risk_is_a_buy() -> None:
    events, _ = _derive(
        [_day("2026-01-01", transfers=[_leg("stable", "btc", 2_000.0)])]
    )

    assert events[0]["type"] == "buy"
    assert events[0]["toAsset"] == "BTC"
    assert events[0]["fromAssets"] == []
    assert events[0]["amountUsd"] == 2_000.0
    assert events[0]["stableDeltaUsd"] == -2_000.0


def test_risk_into_stable_is_a_sell() -> None:
    events, _ = _derive(
        [_day("2026-01-01", transfers=[_leg("btc", "stable", 1_500.0)])]
    )

    assert events[0]["type"] == "sell"
    assert events[0]["toAsset"] is None
    assert events[0]["fromAssets"] == ["BTC"]
    assert events[0]["stableDeltaUsd"] == 1_500.0


def test_risk_to_risk_is_a_rotation() -> None:
    events, _ = _derive([_day("2026-01-01", transfers=[_leg("btc", "eth", 3_000.0)])])

    assert events[0]["type"] == "rotate_to_eth"
    assert events[0]["toAsset"] == "ETH"
    assert events[0]["fromAssets"] == ["BTC"]
    assert events[0]["stableDeltaUsd"] == 0.0


def test_rotation_outranks_the_cash_leg_on_a_mixed_day() -> None:
    events, _ = _derive(
        [
            _day(
                "2026-01-01",
                transfers=[_leg("stable", "eth", 1_000.0), _leg("btc", "eth", 4_000.0)],
            )
        ]
    )

    assert events[0]["type"] == "rotate_to_eth"
    assert events[0]["amountUsd"] == 5_000.0
    # The cash leg survives in the payload even though the label is a rotation.
    assert events[0]["stableDeltaUsd"] == -1_000.0


def test_redeploying_from_an_all_stable_portfolio_is_never_a_rotation() -> None:
    """No risk holdings means no risk outflow, so rule 1 cannot fire."""
    events, _ = _derive(
        [
            _day(
                "2026-01-01",
                spot_asset=None,
                transfers=[_leg("stable", "spy", 8_000.0)],
                asset_allocation={
                    "btc": 0.0,
                    "eth": 0.0,
                    "spy": 0.0,
                    "stable": 1.0,
                    "alt": 0.0,
                },
            )
        ]
    )

    assert events[0]["type"] == "buy"
    assert events[0]["toAsset"] == "SPY"


def test_full_exit_across_three_assets_is_a_sell() -> None:
    events, _ = _derive(
        [
            _day(
                "2026-01-01",
                transfers=[
                    _leg("btc", "stable", 3_000.0),
                    _leg("eth", "stable", 2_000.0),
                    _leg("spy", "stable", 1_000.0),
                ],
            )
        ]
    )

    assert events[0]["type"] == "sell"
    # Sorted by magnitude drained, largest first.
    assert events[0]["fromAssets"] == ["BTC", "ETH", "SPY"]


def test_day_zero_emits_when_it_actually_trades() -> None:
    events, meta = _derive(
        [_day("2026-01-01", transfers=[_leg("stable", "btc", 5_000.0)])]
    )

    assert [event["date"] for event in events] == ["2026-01-01"]
    assert meta["initialAllocation"]["stable"] == 0.5


def test_day_zero_without_transfers_still_reports_initial_allocation() -> None:
    events, meta = _derive(
        [
            _day(
                "2026-01-01",
                asset_allocation={
                    "btc": 0.25,
                    "eth": 0.25,
                    "spy": 0.0,
                    "stable": 0.5,
                    "alt": 0.0,
                },
            )
        ]
    )

    assert events == []
    assert meta["initialAllocation"] == {
        "btc": 0.25,
        "eth": 0.25,
        "spy": 0.0,
        "stable": 0.5,
        "alt": 0.0,
    }


def test_dust_transfers_are_skipped_and_counted() -> None:
    events, meta = _derive(
        [_day("2026-01-01", transfers=[_leg("stable", "btc", 1e-9)])]
    )

    assert events == []
    assert meta["unclassifiedCount"] == 1


def test_legacy_spot_bucket_resolves_through_spot_asset() -> None:
    events, _ = _derive(
        [
            _day(
                "2026-01-01",
                spot_asset="BTC",
                transfers=[_leg("stable", "spot", 2_500.0)],
            )
        ]
    )

    assert events[0]["type"] == "buy"
    assert events[0]["toAsset"] == "BTC"


def test_unattributable_spot_rotation_is_counted_not_invented() -> None:
    """A `spot` leg with no resolvable asset cannot name a rotation target."""
    events, meta = _derive(
        [
            _day(
                "2026-01-01",
                spot_asset=None,
                transfers=[_leg("btc", "spot", 2_500.0)],
            )
        ]
    )

    assert events == []
    assert meta["unclassifiedCount"] == 1


def test_equal_fan_out_picks_a_deterministic_target() -> None:
    timeline = [
        _day(
            "2026-01-01",
            transfers=[_leg("btc", "eth", 2_000.0), _leg("btc", "spy", 2_000.0)],
        )
    ]

    first, _ = _derive(timeline)
    second, _ = _derive(timeline)

    assert first[0]["type"] == second[0]["type"] == "rotate_to_eth"


def test_event_without_a_matching_series_point_raises() -> None:
    with pytest.raises(ValueError, match="would not sit on the curve"):
        derive_events(
            timeline=[_day("2026-01-01", transfers=[_leg("stable", "btc", 100.0)])],
            strategy_id=STRATEGY_ID,
            indexed_by_date={"2026-01-02": 100.0},
        )


def test_reconcile_accepts_events_plus_skips() -> None:
    reconcile(event_count=51, unclassified_count=2, trade_count=53)


def test_reconcile_raises_on_a_shortfall() -> None:
    with pytest.raises(ValueError, match="trade_count=53"):
        reconcile(event_count=40, unclassified_count=0, trade_count=53)


def test_committed_artifact_reconciles_with_the_snapshot_fixture() -> None:
    """Two committed JSON files, no database: do the shipped markers add up?

    Whether the real 500-day window yields exactly N events is an integration
    property that needs the read-only replica. This is the honest DB-free
    proxy — it catches a stale or partially regenerated artifact.
    """
    snapshot = json.loads(DEFAULT_SNAPSHOT_PATH.read_text())
    curve = json.loads(LANDING_EQUITY_CURVE_PATH.read_text())

    strategy_id = snapshot["default_strategy_id"]
    meta = curve["eventsMeta"]

    assert meta["strategyId"] == strategy_id
    assert meta["count"] == len(curve["events"])
    assert meta["tradeCount"] == snapshot["strategies"][strategy_id]["trade_count"]
    reconcile(
        event_count=meta["count"],
        unclassified_count=meta["unclassifiedCount"],
        trade_count=meta["tradeCount"],
    )

    series_by_date = {
        point["date"]: point["value"] for point in curve["series"][0]["values"]
    }
    for event in curve["events"]:
        assert event["indexedValue"] == series_by_date[event["date"]]
