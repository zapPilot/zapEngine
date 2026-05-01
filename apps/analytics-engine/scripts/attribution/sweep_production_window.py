"""Run the pinned 500-day production strategy snapshot through compare-v3."""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path
from typing import Any

import httpx

from src.services.backtesting.constants import (
    STRATEGY_DCA_CLASSIC,
    STRATEGY_DISPLAY_NAMES,
    STRATEGY_DMA_FGI_ADAPTIVE_BINARY_ETH_BTC,
    STRATEGY_DMA_GATED_FGI,
    STRATEGY_ETH_BTC_ROTATION,
    STRATEGY_SPY_ETH_BTC_ROTATION,
)
from src.services.backtesting.strategies.eth_btc_attribution import (
    ATTRIBUTION_VARIANTS,
)
from src.services.backtesting.strategies.hierarchical_attribution import (
    HIERARCHICAL_ATTRIBUTION_VARIANTS,
)
from src.services.backtesting.strategies.hierarchical_minimum import (
    MINIMUM_HIERARCHICAL_VARIANTS,
)

APP_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_ENDPOINT = "http://localhost:8001"
COMPARE_PATH = "/api/v3/backtesting/compare"
DEFAULT_REFERENCE_DATE = "2026-04-15"
DEFAULT_WINDOW_DAYS = 500
DEFAULT_TOTAL_CAPITAL = 10_000.0
DEFAULT_SNAPSHOT_PATH = (
    APP_ROOT / "tests/fixtures/strategy_performance_snapshot_500d.json"
)
METRIC_KEYS = (
    "roi_percent",
    "calmar_ratio",
    "sharpe_ratio",
    "max_drawdown_percent",
    "trade_count",
)
DEFAULT_TOLERANCES: dict[str, float] = {
    "roi_percent": 2.0,
    "calmar_ratio": 0.10,
    "sharpe_ratio": 0.10,
    "max_drawdown_percent": 1.0,
    "trade_count": 5.0,
}
TOLERANCE_ALIASES = {
    "roi": "roi_percent",
    "roi_percent": "roi_percent",
    "calmar": "calmar_ratio",
    "calmar_ratio": "calmar_ratio",
    "sharpe": "sharpe_ratio",
    "sharpe_ratio": "sharpe_ratio",
    "max_dd": "max_drawdown_percent",
    "max_drawdown": "max_drawdown_percent",
    "max_drawdown_percent": "max_drawdown_percent",
    "trades": "trade_count",
    "trade_count": "trade_count",
}


@dataclass(frozen=True)
class DriftRow:
    strategy_id: str
    metric: str
    expected: float | int | None
    actual: float | int | None
    delta: float | None
    tolerance: float
    status: str


def _default_strategy_universe() -> list[str]:
    strategy_ids: list[str] = []
    seen: set[str] = set()
    for strategy_id in (
        *HIERARCHICAL_ATTRIBUTION_VARIANTS.keys(),
        *MINIMUM_HIERARCHICAL_VARIANTS.keys(),
        *ATTRIBUTION_VARIANTS.keys(),
        STRATEGY_DMA_FGI_ADAPTIVE_BINARY_ETH_BTC,
        STRATEGY_ETH_BTC_ROTATION,
        STRATEGY_SPY_ETH_BTC_ROTATION,
        STRATEGY_DCA_CLASSIC,
        STRATEGY_DMA_GATED_FGI,
    ):
        if strategy_id in seen:
            continue
        strategy_ids.append(strategy_id)
        seen.add(strategy_id)
    return strategy_ids


def _load_snapshot(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text())
    if not isinstance(payload, dict):
        raise ValueError("Strategy performance snapshot must be a JSON object")
    return payload


def _parse_tolerances(raw: str | None, base: dict[str, float]) -> dict[str, float]:
    tolerances = dict(base)
    if raw is None or not raw.strip():
        return tolerances
    for item in raw.split(","):
        if not item.strip():
            continue
        if "=" not in item:
            raise ValueError(f"Invalid tolerance override '{item}'; expected key=value")
        raw_key, raw_value = item.split("=", 1)
        key = TOLERANCE_ALIASES.get(raw_key.strip())
        if key is None:
            raise ValueError(f"Unsupported tolerance metric '{raw_key.strip()}'")
        tolerances[key] = float(raw_value)
    return tolerances


def _parse_reference_date(raw: str) -> date:
    try:
        return date.fromisoformat(raw)
    except ValueError as exc:
        raise ValueError(
            f"Invalid reference date '{raw}'; expected YYYY-MM-DD"
        ) from exc


def _window_start(reference_date: date, window_days: int) -> date:
    if window_days < 1:
        raise ValueError("window_days must be >= 1")
    return reference_date - timedelta(days=window_days - 1)


def _compare_request(
    *,
    strategy_ids: list[str],
    start_date: str,
    end_date: str,
    total_capital: float,
) -> dict[str, Any]:
    return {
        "token_symbol": "BTC",
        "total_capital": total_capital,
        "start_date": start_date,
        "end_date": end_date,
        "configs": [
            {
                "config_id": strategy_id,
                "strategy_id": strategy_id,
                "params": {},
            }
            for strategy_id in strategy_ids
        ],
    }


def _fetch_summaries(
    *,
    client: httpx.Client,
    endpoint: str,
    strategy_ids: list[str],
    start_date: str,
    end_date: str,
    total_capital: float,
) -> dict[str, dict[str, Any]]:
    response = client.post(
        f"{endpoint.rstrip('/')}{COMPARE_PATH}",
        json=_compare_request(
            strategy_ids=strategy_ids,
            start_date=start_date,
            end_date=end_date,
            total_capital=total_capital,
        ),
        timeout=600.0,
    )
    response.raise_for_status()
    payload = response.json()
    if not isinstance(payload, dict):
        raise ValueError("Compare response root must be an object")
    strategies = payload.get("strategies")
    if not isinstance(strategies, dict):
        raise ValueError("Compare response must include a strategies object")
    missing = [
        strategy_id for strategy_id in strategy_ids if strategy_id not in strategies
    ]
    if missing:
        raise ValueError("Compare response missing strategies: " + ", ".join(missing))
    return {
        strategy_id: dict(strategies[strategy_id])
        for strategy_id in strategy_ids
        if isinstance(strategies[strategy_id], dict)
    }


def _metric(summary: dict[str, Any], key: str) -> float | int:
    value = summary.get(key)
    if not isinstance(value, int | float):
        raise ValueError(f"Strategy summary missing numeric metric '{key}'")
    if key == "trade_count":
        return int(value)
    return round(float(value), 4)


def _snapshot_strategy_entry(
    strategy_id: str, summary: dict[str, Any]
) -> dict[str, Any]:
    return {
        "display_name": STRATEGY_DISPLAY_NAMES.get(strategy_id, strategy_id),
        "calmar_ratio": _metric(summary, "calmar_ratio"),
        "sharpe_ratio": _metric(summary, "sharpe_ratio"),
        "max_drawdown_percent": _metric(summary, "max_drawdown_percent"),
        "roi_percent": _metric(summary, "roi_percent"),
        "trade_count": _metric(summary, "trade_count"),
    }


def collect_snapshot(
    *,
    endpoint: str,
    reference_date: date,
    window_days: int,
    total_capital: float,
    tolerances: dict[str, float],
    show_progress: bool = True,
) -> dict[str, Any]:
    strategy_ids = _default_strategy_universe()
    start_date = _window_start(reference_date, window_days)
    if show_progress:
        print(
            (
                f"Fetching {len(strategy_ids)} strategies for "
                f"{start_date.isoformat()}..{reference_date.isoformat()}"
            ),
            file=sys.stderr,
        )
    with httpx.Client() as client:
        summaries = _fetch_summaries(
            client=client,
            endpoint=endpoint,
            strategy_ids=strategy_ids,
            start_date=start_date.isoformat(),
            end_date=reference_date.isoformat(),
            total_capital=total_capital,
        )
    return {
        "reference_date": reference_date.isoformat(),
        "window_days": window_days,
        "window_start": start_date.isoformat(),
        "window_end": reference_date.isoformat(),
        "total_capital": total_capital,
        "tolerances": {key: tolerances[key] for key in METRIC_KEYS},
        "strategies": {
            strategy_id: _snapshot_strategy_entry(strategy_id, summaries[strategy_id])
            for strategy_id in strategy_ids
        },
    }


def _expected_context(
    *,
    snapshot_path: Path,
    reference_date_arg: str | None,
    days_arg: int | None,
    total_capital_arg: float | None,
    tolerance_arg: str | None,
) -> tuple[date, int, float, dict[str, float], dict[str, Any] | None]:
    existing = _load_snapshot(snapshot_path) if snapshot_path.exists() else None
    reference_date_raw = reference_date_arg or (
        str(existing.get("reference_date")) if existing else DEFAULT_REFERENCE_DATE
    )
    window_days = int(
        days_arg
        if days_arg is not None
        else (existing.get("window_days") if existing else DEFAULT_WINDOW_DAYS)
    )
    total_capital = float(
        total_capital_arg
        if total_capital_arg is not None
        else (existing.get("total_capital") if existing else DEFAULT_TOTAL_CAPITAL)
    )
    base_tolerances = dict(DEFAULT_TOLERANCES)
    if existing and isinstance(existing.get("tolerances"), dict):
        base_tolerances.update(
            {
                key: float(value)
                for key, value in existing["tolerances"].items()
                if key in METRIC_KEYS and isinstance(value, int | float)
            }
        )
    tolerances = _parse_tolerances(tolerance_arg, base_tolerances)
    return (
        _parse_reference_date(reference_date_raw),
        window_days,
        total_capital,
        tolerances,
        existing,
    )


def _snapshot_metric(
    snapshot: dict[str, Any],
    strategy_id: str,
    metric: str,
) -> float | int | None:
    strategies = snapshot.get("strategies")
    if not isinstance(strategies, dict):
        return None
    raw_strategy = strategies.get(strategy_id)
    if not isinstance(raw_strategy, dict):
        return None
    value = raw_strategy.get(metric)
    if isinstance(value, int | float):
        return int(value) if metric == "trade_count" else float(value)
    return None


def diff_snapshots(
    *,
    expected: dict[str, Any],
    actual: dict[str, Any],
    tolerances: dict[str, float],
) -> list[DriftRow]:
    rows: list[DriftRow] = []
    strategy_ids = _default_strategy_universe()
    for strategy_id in strategy_ids:
        for metric in METRIC_KEYS:
            expected_value = _snapshot_metric(expected, strategy_id, metric)
            actual_value = _snapshot_metric(actual, strategy_id, metric)
            tolerance = tolerances[metric]
            if expected_value is None or actual_value is None:
                rows.append(
                    DriftRow(
                        strategy_id=strategy_id,
                        metric=metric,
                        expected=expected_value,
                        actual=actual_value,
                        delta=None,
                        tolerance=tolerance,
                        status="MISSING",
                    )
                )
                continue
            delta = float(actual_value) - float(expected_value)
            status = "DRIFT" if abs(delta) > tolerance else "OK"
            rows.append(
                DriftRow(
                    strategy_id=strategy_id,
                    metric=metric,
                    expected=expected_value,
                    actual=actual_value,
                    delta=delta,
                    tolerance=tolerance,
                    status=status,
                )
            )
    return rows


def _format_value(value: float | int | None) -> str:
    if value is None:
        return "n/a"
    if isinstance(value, int):
        return str(value)
    return f"{value:.4f}"


def render_drift_table(rows: list[DriftRow]) -> str:
    drift_rows = [row for row in rows if row.status != "OK"]
    lines = [
        "# Strategy Performance Snapshot Drift",
        "",
        f"Checked metrics: {len(rows)}",
        f"Drift rows: {len(drift_rows)}",
    ]
    if not drift_rows:
        lines.extend(["", "No metric drift exceeded tolerance."])
        return "\n".join(lines) + "\n"
    lines.extend(
        [
            "",
            "| Strategy | Metric | Snapshot | Current | Delta | Tolerance | Status |",
            "|---|---|---:|---:|---:|---:|---|",
        ]
    )
    for row in drift_rows:
        delta = "n/a" if row.delta is None else f"{row.delta:+.4f}"
        lines.append(
            "| "
            + " | ".join(
                (
                    row.strategy_id,
                    row.metric,
                    _format_value(row.expected),
                    _format_value(row.actual),
                    delta,
                    f"{row.tolerance:.4f}",
                    row.status,
                )
            )
            + " |"
        )
    return "\n".join(lines) + "\n"


def _write_snapshot(path: Path, snapshot: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(snapshot, indent=2) + "\n")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--endpoint", default=DEFAULT_ENDPOINT)
    parser.add_argument("--snapshot", default=str(DEFAULT_SNAPSHOT_PATH))
    parser.add_argument("--reference-date", default=None)
    parser.add_argument("--days", type=int, default=None)
    parser.add_argument("--total-capital", type=float, default=None)
    parser.add_argument(
        "--tolerance",
        default=None,
        help="Comma-separated metric tolerances, e.g. roi=2.0,calmar=0.10.",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Exit 1 when drift exceeds the configured per-metric tolerance.",
    )
    parser.add_argument(
        "--update-snapshot",
        action="store_true",
        help="Overwrite the snapshot fixture with current compare API results.",
    )
    parser.add_argument(
        "--no-progress",
        action="store_true",
        help="Disable stderr progress output.",
    )
    args = parser.parse_args()

    snapshot_path = Path(str(args.snapshot))
    reference_date, window_days, total_capital, tolerances, expected = (
        _expected_context(
            snapshot_path=snapshot_path,
            reference_date_arg=(
                None if args.reference_date is None else str(args.reference_date)
            ),
            days_arg=args.days,
            total_capital_arg=args.total_capital,
            tolerance_arg=None if args.tolerance is None else str(args.tolerance),
        )
    )
    actual = collect_snapshot(
        endpoint=str(args.endpoint),
        reference_date=reference_date,
        window_days=window_days,
        total_capital=total_capital,
        tolerances=tolerances,
        show_progress=not bool(args.no_progress),
    )
    if args.update_snapshot:
        _write_snapshot(snapshot_path, actual)
        print(f"Updated snapshot: {snapshot_path}")
        return

    if expected is None:
        print(f"Snapshot fixture not found: {snapshot_path}", file=sys.stderr)
        raise SystemExit(1 if args.check else 0)

    rows = diff_snapshots(expected=expected, actual=actual, tolerances=tolerances)
    print(render_drift_table(rows), end="")
    if args.check and any(row.status != "OK" for row in rows):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
