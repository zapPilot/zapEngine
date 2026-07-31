"""Derive strategy trade events (buy / sell / rotation) from a compare timeline.

The landing-page NAV chart marks the days the strategy actually traded. The
timeline already carries that per day as ``strategies[id].execution.transfers``
— the bucket-to-bucket USD moves the execution engine applied.

Two fields that look like better sources are not:

- ``portfolio.spot_asset`` is ``None`` whenever two or more risk assets are held
  (``execution/portfolio.py::active_spot_asset``), which is most days for an
  equal-weight strategy such as ``dma_fgi_portfolio_rules``.
- ``decision.action`` labels a BTC->ETH rotation ``"sell"``
  (``portfolio_rules/base.py::eth_btc_ratio_rotation_intent``).

Non-empty transfers is also what increments the engine's ``trade_count``, so it
doubles as the de-duplication gate: hold runs, and the 39 days a position sits
untouched between two rotations, carry no transfers and need no comparison
against the previous day.

Trap: ``execution/engine.py::_apply_action`` has a second path driven by
``action.target_allocations`` that moves money *without* recording transfers.
The production strategy never takes it (``strategies/composed.py`` always
passes ``transfers=``), but pointing this module at a strategy that does would
silently yield zero events despite a non-zero ``trade_count``. That is why
``reconcile`` raises instead of warning.
"""

from __future__ import annotations

from typing import Any

# Matches the dust threshold execution/transfer_netting.py applies.
_AMOUNT_EPSILON = 1e-6

_STABLE_BUCKET = "stable"
_RISK_BUCKETS = frozenset({"btc", "eth", "spy", "spot"})
# argmax ties break in this order, so an equal-leg fan-out (BTC -> ETH + SPY)
# names the same destination on every run.
_ASSET_ORDER = ("btc", "eth", "spy")
_ASSET_SYMBOL = {"btc": "BTC", "eth": "ETH", "spy": "SPY"}


def _strategy_state(point: dict[str, Any], strategy_id: str) -> dict[str, Any]:
    strategies = point.get("strategies")
    if not isinstance(strategies, dict):
        return {}
    state = strategies.get(strategy_id)
    return state if isinstance(state, dict) else {}


def _point_date(point: dict[str, Any]) -> str:
    market = point.get("market")
    if isinstance(market, dict):
        value = market.get("date")
        if isinstance(value, str) and value:
            return value
    value = point.get("date")
    if isinstance(value, str) and value:
        return value
    raise ValueError("Each timeline point must include market.date")


def _spot_asset(state: dict[str, Any]) -> str | None:
    portfolio = state.get("portfolio")
    if not isinstance(portfolio, dict):
        return None
    value = portfolio.get("spot_asset")
    return value if isinstance(value, str) and value else None


def _transfers(state: dict[str, Any]) -> list[dict[str, Any]]:
    execution = state.get("execution")
    if not isinstance(execution, dict):
        return []
    transfers = execution.get("transfers")
    if not isinstance(transfers, list):
        return []
    return [entry for entry in transfers if isinstance(entry, dict)]


def _resolve_bucket(bucket: Any, spot_asset: str | None) -> str | None:
    """Normalise a bucket name, folding the legacy ``spot`` leg when possible.

    ``dca_classic`` trades the two-bucket ``spot``/``stable`` pair; the
    portfolio-rules strategies emit concrete asset buckets. When the portfolio
    holds exactly one risk asset the engine tells us which, so a ``spot`` leg
    can be attributed. Otherwise it stays an unattributed risk bucket, which
    still classifies direction correctly but cannot name a rotation target.
    """
    if not isinstance(bucket, str) or not bucket:
        return None
    key = bucket.lower()
    if key == "spot" and spot_asset is not None:
        return spot_asset.lower()
    return key


def _net_flow(
    transfers: list[dict[str, Any]], spot_asset: str | None
) -> tuple[dict[str, float], float]:
    """Fold a day's transfers into net USD flow per bucket, plus gross moved."""
    net: dict[str, float] = {}
    gross = 0.0
    for transfer in transfers:
        amount = transfer.get("amount_usd")
        if not isinstance(amount, int | float) or amount <= _AMOUNT_EPSILON:
            continue
        source = _resolve_bucket(transfer.get("from_bucket"), spot_asset)
        target = _resolve_bucket(transfer.get("to_bucket"), spot_asset)
        if source is None or target is None or source == target:
            continue
        moved = float(amount)
        gross += moved
        net[source] = net.get(source, 0.0) - moved
        net[target] = net.get(target, 0.0) + moved
    return net, gross


def _largest_inflow(net: dict[str, float]) -> str | None:
    """Nameable rotation/buy target: the asset bucket that gained the most."""
    candidates = [key for key in _ASSET_ORDER if net.get(key, 0.0) > _AMOUNT_EPSILON]
    if not candidates:
        return None
    # max() returns the first maximum, and candidates follows _ASSET_ORDER.
    return max(candidates, key=lambda key: net[key])


def _sold_assets(net: dict[str, float]) -> list[str]:
    drained = [
        key
        for key, value in net.items()
        if key in _RISK_BUCKETS and value < -_AMOUNT_EPSILON
    ]
    drained.sort(key=lambda key: net[key])
    return [_ASSET_SYMBOL.get(key, key.upper()) for key in drained]


def _classify(net: dict[str, float]) -> tuple[str, str | None] | None:
    """Return ``(type, toAsset)``, or ``None`` when the day is unclassifiable.

    A portfolio holding no risk assets cannot produce ``risk_out``, so rule 1
    can never fire from an all-stable position — the "redeploying out of cash
    looks like a rotation" case is impossible by construction rather than by
    special case.
    """
    risk_in = sum(
        value
        for key, value in net.items()
        if key in _RISK_BUCKETS and value > _AMOUNT_EPSILON
    )
    risk_out = sum(
        -value
        for key, value in net.items()
        if key in _RISK_BUCKETS and value < -_AMOUNT_EPSILON
    )
    stable_delta = net.get(_STABLE_BUCKET, 0.0)
    target = _largest_inflow(net)

    if risk_in > _AMOUNT_EPSILON and risk_out > _AMOUNT_EPSILON:
        # Rotation outranks buy/sell on a day that is both: it is the more
        # informative label, and stableDeltaUsd still carries the cash leg.
        if target is None:
            return None
        return f"rotate_to_{target}", _ASSET_SYMBOL[target]
    if stable_delta > _AMOUNT_EPSILON:
        return "sell", None
    if stable_delta < -_AMOUNT_EPSILON:
        return "buy", _ASSET_SYMBOL[target] if target is not None else None
    return None


def _reason(state: dict[str, Any]) -> str:
    decision = state.get("decision")
    if not isinstance(decision, dict):
        return ""
    details = decision.get("details")
    if isinstance(details, dict):
        name = details.get("allocation_name")
        if isinstance(name, str) and name:
            return name
    fallback = decision.get("reason")
    return fallback if isinstance(fallback, str) else ""


def _initial_allocation(state: dict[str, Any]) -> dict[str, float]:
    portfolio = state.get("portfolio")
    if not isinstance(portfolio, dict):
        return {}
    allocation = portfolio.get("asset_allocation")
    if not isinstance(allocation, dict):
        return {}
    return {
        key: round(float(value), 4)
        for key, value in allocation.items()
        if isinstance(value, int | float)
    }


def reconcile(*, event_count: int, unclassified_count: int, trade_count: int) -> None:
    """Assert every engine-recorded trade produced an event or a skip.

    Raises rather than warns: a silent shortfall means transfers stopped being
    the whole story (see the ``target_allocations`` trap in the module
    docstring), and a chart missing markers looks the same as a chart with
    nothing to mark.
    """
    accounted = event_count + unclassified_count
    if accounted != trade_count:
        raise ValueError(
            f"Event reconciliation failed: {event_count} events + "
            f"{unclassified_count} unclassified = {accounted}, "
            f"but the snapshot records trade_count={trade_count}"
        )


def derive_events(
    *,
    timeline: list[dict[str, Any]],
    strategy_id: str,
    indexed_by_date: dict[str, float],
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Build the ``events`` array and ``eventsMeta`` object for a strategy.

    ``indexed_by_date`` maps each timeline date to its indexed series value, so
    every event carries the y it must be drawn at. A missing date means the
    series and the timeline disagree, which would put a marker off the curve —
    the exact defect this artifact exists to make impossible.
    """
    events: list[dict[str, Any]] = []
    unclassified = 0
    initial_allocation: dict[str, float] = {}

    for index, point in enumerate(timeline):
        if not isinstance(point, dict):
            raise ValueError("Each timeline point must be an object")
        state = _strategy_state(point, strategy_id)
        if index == 0:
            initial_allocation = _initial_allocation(state)

        transfers = _transfers(state)
        if not transfers:
            continue

        spot_asset = _spot_asset(state)
        net, gross = _net_flow(transfers, spot_asset)
        classified = _classify(net)
        if classified is None:
            unclassified += 1
            continue

        event_type, to_asset = classified
        point_date = _point_date(point)
        if point_date not in indexed_by_date:
            raise ValueError(
                f"Event on {point_date} has no matching point in the strategy "
                "series; the marker would not sit on the curve"
            )

        events.append(
            {
                "date": point_date,
                "type": event_type,
                "toAsset": to_asset,
                "fromAssets": _sold_assets(net),
                "amountUsd": round(gross, 2),
                "stableDeltaUsd": round(net.get(_STABLE_BUCKET, 0.0), 2),
                "indexedValue": indexed_by_date[point_date],
                "reason": _reason(state),
            }
        )

    meta: dict[str, Any] = {
        "strategyId": strategy_id,
        "count": len(events),
        "unclassifiedCount": unclassified,
        "initialAllocation": initial_allocation,
    }
    return events, meta
