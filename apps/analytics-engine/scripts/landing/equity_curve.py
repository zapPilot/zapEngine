"""Generate the landing-page equity curve from compare timeline output."""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path
from typing import Any

DCA_CONFIG_ID = "dca_classic"
ROI_TOLERANCE_PP = 1.0
STRATEGY_COLOR = "#d4c5a3"
DCA_COLOR = "#52525b"


def _require_mapping(value: Any, *, label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError(f"{label} must be an object")
    return value


def _timeline_date(point: dict[str, Any]) -> str:
    market = point.get("market")
    if isinstance(market, dict):
        date_value = market.get("date")
        if isinstance(date_value, str) and date_value:
            return date_value

    date_value = point.get("date")
    if isinstance(date_value, str) and date_value:
        return date_value

    raise ValueError("Each timeline point must include market.date")


def _strategy_state(
    point: dict[str, Any],
    strategy_id: str,
    *,
    point_date: str,
) -> dict[str, Any]:
    strategies = _require_mapping(
        point.get("strategies"), label=f"timeline[{point_date}].strategies"
    )
    state = strategies.get(strategy_id)
    return _require_mapping(
        state,
        label=f"timeline[{point_date}].strategies[{strategy_id!r}]",
    )


def _portfolio_total(
    point: dict[str, Any],
    strategy_id: str,
    *,
    point_date: str,
) -> float:
    state = _strategy_state(point, strategy_id, point_date=point_date)
    portfolio = _require_mapping(
        state.get("portfolio"),
        label=f"timeline[{point_date}].strategies[{strategy_id!r}].portfolio",
    )
    value = portfolio.get("total_value")
    if not isinstance(value, int | float):
        raise ValueError(
            f"timeline[{point_date}].strategies[{strategy_id!r}].portfolio."
            "total_value must be numeric"
        )
    return float(value)


def _extract_totals(
    timeline: list[dict[str, Any]],
    strategy_id: str,
) -> list[tuple[str, float]]:
    totals: list[tuple[str, float]] = []
    for point in timeline:
        if not isinstance(point, dict):
            raise ValueError("Each timeline point must be an object")
        point_date = _timeline_date(point)
        totals.append(
            (
                point_date,
                _portfolio_total(point, strategy_id, point_date=point_date),
            )
        )

    if not totals:
        raise ValueError("Timeline must contain at least one point")
    return totals


def _to_indexed_points(totals: list[tuple[str, float]]) -> list[dict[str, Any]]:
    initial_value = totals[0][1]
    if initial_value <= 0:
        raise ValueError("Initial portfolio total must be positive")

    return [
        {"date": point_date, "value": round((value / initial_value) * 100, 2)}
        for point_date, value in totals
    ]


def _snapshot_strategy(
    snapshot_meta: dict[str, Any],
    strategy_id: str,
) -> dict[str, Any]:
    strategies = _require_mapping(
        snapshot_meta.get("strategies"), label="snapshot_meta.strategies"
    )
    strategy = strategies.get(strategy_id)
    return _require_mapping(
        strategy,
        label=f"snapshot_meta.strategies[{strategy_id!r}]",
    )


def _snapshot_float(
    snapshot_meta: dict[str, Any],
    strategy_id: str,
    metric: str,
) -> float:
    strategy = _snapshot_strategy(snapshot_meta, strategy_id)
    value = strategy.get(metric)
    if not isinstance(value, int | float):
        raise ValueError(
            f"snapshot_meta.strategies[{strategy_id!r}].{metric} must be numeric"
        )
    return float(value)


def _validate_final_roi(
    *,
    series_label: str,
    points: list[dict[str, Any]],
    expected_roi_percent: float,
) -> None:
    final_indexed = points[-1]["value"]
    if not isinstance(final_indexed, int | float):
        raise ValueError(f"{series_label} final indexed value must be numeric")

    actual_roi_percent = float(final_indexed) - 100.0
    delta = actual_roi_percent - expected_roi_percent
    if abs(delta) > ROI_TOLERANCE_PP:
        raise ValueError(
            f"{series_label} final indexed ROI {actual_roi_percent:.4f}pp "
            f"does not match snapshot ROI {expected_roi_percent:.4f}pp "
            f"within {ROI_TOLERANCE_PP:.1f}pp"
        )


def _window_payload(
    snapshot_meta: dict[str, Any],
    strategy_points: list[dict[str, Any]],
) -> dict[str, Any]:
    start = snapshot_meta.get("window_start") or strategy_points[0]["date"]
    end = snapshot_meta.get("window_end") or strategy_points[-1]["date"]
    days = snapshot_meta.get("window_days") or len(strategy_points)
    if (
        not isinstance(start, str)
        or not isinstance(end, str)
        or not isinstance(days, int)
    ):
        raise ValueError("Snapshot window metadata is malformed")
    return {"start": start, "end": end, "days": days}


def generate(
    timeline: list[dict[str, Any]],
    snapshot_meta: dict[str, Any],
    output_path: Path,
) -> None:
    """Transform a compare timeline into landing-page equity-curve.json."""

    if not output_path.parent.exists():
        raise FileNotFoundError(
            f"Landing-page data directory does not exist: {output_path.parent}"
        )

    strategy_id = snapshot_meta.get("default_strategy_id")
    if not isinstance(strategy_id, str) or not strategy_id:
        raise ValueError("snapshot_meta.default_strategy_id must be a non-empty string")

    strategy_points = _to_indexed_points(_extract_totals(timeline, strategy_id))
    dca_points = _to_indexed_points(_extract_totals(timeline, DCA_CONFIG_ID))

    _validate_final_roi(
        series_label="strategy",
        points=strategy_points,
        expected_roi_percent=_snapshot_float(
            snapshot_meta,
            strategy_id,
            "roi_percent",
        ),
    )
    _validate_final_roi(
        series_label="dca",
        points=dca_points,
        expected_roi_percent=_snapshot_float(
            snapshot_meta,
            DCA_CONFIG_ID,
            "roi_percent",
        ),
    )

    payload = {
        "window": _window_payload(snapshot_meta, strategy_points),
        "source": (
            "Generated from sweep_production_window.py --update-snapshot on "
            f"{date.today().isoformat()}. Strategy/DCA final values match "
            "strategy-snapshot.json within 1pp tolerance."
        ),
        "drawdownBand": {
            "label": "Max drawdown range",
            "strategyPercent": round(
                _snapshot_float(snapshot_meta, strategy_id, "max_drawdown_percent"),
                2,
            ),
            "dcaPercent": round(
                _snapshot_float(snapshot_meta, DCA_CONFIG_ID, "max_drawdown_percent"),
                2,
            ),
        },
        "series": [
            {
                "id": "strategy",
                "label": "Strategy",
                "color": STRATEGY_COLOR,
                "values": strategy_points,
            },
            {
                "id": "dca",
                "label": "DCA Classic",
                "color": DCA_COLOR,
                "values": dca_points,
            },
        ],
    }

    output_path.write_text(json.dumps(payload, indent=2) + "\n")
