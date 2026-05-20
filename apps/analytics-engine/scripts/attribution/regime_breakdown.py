"""Regime-conditional performance breakdown for a backtesting strategy.

Decomposes a strategy's daily P&L by FGI regime and by DMA zone, so
regime-conditional rule tuning (e.g. ``dma_overextension_dca_sell`` greed
multipliers, ``fgi_downshift_dca_sell``) can be judged on per-regime evidence
instead of a single aggregate ROI.

This is an offline diagnostic: it consumes the ``/api/v3/backtesting/compare``
timeline (already serializes per-day portfolio value, FGI regime, signal
regime, and DMA zone) plus the compare decision log for executed trade rows.
It adds no API surface and does not touch the snapshot regression gate.

A daily return ``r_t`` is attributed to the regime in effect *going into* the
move (the regime on day ``t-1``) -- the regime the strategy was positioned
under when that P&L was earned.
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx
import numpy as np

from scripts.attribution._helpers import _metric
from scripts.attribution.sweep_production_window import (
    COMPARE_PATH,
    DEFAULT_ENDPOINT,
    DEFAULT_REFERENCE_DATE,
    DEFAULT_TOTAL_CAPITAL,
    DEFAULT_WINDOW_DAYS,
    _parse_reference_date,
    _window_start,
)
from scripts.attribution.sweep_production_window import (
    _compare_request as _production_compare_request,
)
from src.config.strategy_presets import get_default_seed_strategy_config
from src.services.backtesting.execution.performance_metrics import (
    PerformanceMetricsCalculator,
)
from src.services.backtesting.signals.dma_gated_fgi.regime_classifier import (
    VALID_REGIME_LABELS,
)

DEFAULT_WIN_HORIZON_DAYS = 30
# Annualizing a return over a handful of days explodes
# (1.09 ** (365/2) is astronomical and misleading). Below this many
# return-days, report annualized as n/a and rely on the cumulative figure.
MIN_ANNUALIZE_DAYS = 30
REGIME_ORDER = ("extreme_fear", "fear", "neutral", "greed", "extreme_greed")
ZONE_ORDER = ("below", "at", "above", "unknown")

_CALCULATOR = PerformanceMetricsCalculator()


@dataclass(frozen=True)
class DailyPoint:
    date: str
    value: float
    fgi_regime: str
    dma_zone: str
    signal_regime: str = "neutral"
    traded: bool = False


@dataclass(frozen=True)
class BucketStats:
    bucket: str
    days: int
    pct_of_time: float
    cumulative_return_percent: float
    annualized_return_percent: float | None
    sharpe_ratio: float
    max_drawdown_percent: float
    win_rate_percent: float | None
    trade_count: int


def _normalize_regime(raw: object) -> str:
    if not isinstance(raw, str):
        return "neutral"
    normalized = raw.strip().lower().replace("-", "_").replace(" ", "_")
    if normalized in VALID_REGIME_LABELS:
        return normalized
    return "neutral"


def _normalize_zone(raw: object) -> str:
    if not isinstance(raw, str):
        return "unknown"
    normalized = raw.strip().lower()
    return normalized if normalized in {"below", "at", "above"} else "unknown"


def _compare_request(
    *,
    strategy_id: str,
    start_date: str,
    end_date: str,
    total_capital: float,
) -> dict[str, Any]:
    request = _production_compare_request(
        strategy_ids=[strategy_id],
        start_date=start_date,
        end_date=end_date,
        total_capital=total_capital,
    )
    request["emit_decision_log"] = True
    return request


def _fetch_compare_payload(
    *,
    client: Any,
    endpoint: str | None,
    strategy_id: str,
    start_date: str,
    end_date: str,
    total_capital: float,
) -> dict[str, Any]:
    compare_url = (
        COMPARE_PATH if endpoint is None else f"{endpoint.rstrip('/')}{COMPARE_PATH}"
    )
    response = client.post(
        compare_url,
        json=_compare_request(
            strategy_id=strategy_id,
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
    if not isinstance(payload.get("timeline"), list):
        raise ValueError("Compare response must include a timeline array")
    strategies = payload.get("strategies")
    if not isinstance(strategies, dict) or strategy_id not in strategies:
        raise ValueError(f"Compare response missing strategy: {strategy_id}")
    if not isinstance(payload.get("decision_log_path"), str):
        raise ValueError("Compare response must include decision_log_path")
    return payload


def _extract_timeline(
    payload: dict[str, Any],
    strategy_id: str,
) -> list[DailyPoint]:
    points: list[DailyPoint] = []
    for raw_point in payload["timeline"]:
        if not isinstance(raw_point, dict):
            continue
        market = raw_point.get("market")
        strategies = raw_point.get("strategies")
        if not isinstance(market, dict) or not isinstance(strategies, dict):
            continue
        strategy_state = strategies.get(strategy_id)
        if not isinstance(strategy_state, dict):
            continue

        portfolio = strategy_state.get("portfolio")
        total_value = (
            portfolio.get("total_value") if isinstance(portfolio, dict) else None
        )
        if not isinstance(total_value, int | float):
            continue

        signal = strategy_state.get("signal")
        signal_regime_raw: object = None
        zone_raw: object = None
        if isinstance(signal, dict):
            signal_regime_raw = signal.get("regime")
            details = signal.get("details")
            if isinstance(details, dict) and isinstance(details.get("dma"), dict):
                zone_raw = details["dma"].get("zone")

        execution = strategy_state.get("execution")
        transfers = execution.get("transfers") if isinstance(execution, dict) else None
        traded = isinstance(transfers, list) and len(transfers) > 0

        points.append(
            DailyPoint(
                date=str(market.get("date")),
                value=float(total_value),
                fgi_regime=_normalize_regime(market.get("sentiment_label")),
                dma_zone=_normalize_zone(zone_raw),
                signal_regime=_normalize_regime(signal_regime_raw),
                traded=traded,
            )
        )
    if len(points) < 2:
        raise ValueError("Timeline has fewer than 2 usable daily points")
    return points


def _bucket_stats(
    *,
    bucket: str,
    bucket_returns: list[float],
    total_days: int,
    trade_results: list[bool],
) -> BucketStats:
    days = len(bucket_returns)
    pct_of_time = (days / total_days * 100.0) if total_days > 0 else 0.0

    annualized: float | None
    if days >= 1:
        returns_arr = np.array(bucket_returns)
        equity_curve = np.cumprod(1.0 + returns_arr)
        cumulative_return = float(equity_curve[-1] - 1.0) * 100.0
        if days < MIN_ANNUALIZE_DAYS:
            annualized = None
        elif equity_curve[-1] > 0.0:
            annualized = (float(equity_curve[-1]) ** (365.0 / days) - 1.0) * 100.0
        else:
            annualized = -100.0
        sharpe = _CALCULATOR.calculate_sharpe_ratio(returns_arr)
        max_dd = (
            _CALCULATOR.calculate_max_drawdown(equity_curve) * 100.0
            if days >= 2
            else 0.0
        )
    else:
        cumulative_return = 0.0
        annualized = None
        sharpe = 0.0
        max_dd = 0.0

    trade_count = len(trade_results)
    win_rate = (
        (sum(1 for won in trade_results if won) / trade_count * 100.0)
        if trade_count > 0
        else None
    )

    return BucketStats(
        bucket=bucket,
        days=days,
        pct_of_time=_round_metric(pct_of_time, digits=2),
        cumulative_return_percent=_round_metric(cumulative_return, digits=4),
        annualized_return_percent=(
            None if annualized is None else _round_metric(annualized, digits=4)
        ),
        sharpe_ratio=_round_metric(sharpe, digits=4),
        max_drawdown_percent=_round_metric(max_dd, digits=4),
        win_rate_percent=None
        if win_rate is None
        else _round_metric(win_rate, digits=2),
        trade_count=trade_count,
    )


def _round_metric(value: float, *, digits: int) -> float:
    return float(_metric({"value": value}, "value", round_digits=digits))


def _trade_won(points: list[DailyPoint], index: int, horizon: int) -> bool:
    """Trade-level win: portfolio value `horizon` days forward exceeds entry.

    Honest trade attribution, unlike a positive-day rate. The final window is
    clamped to the last available day.
    """
    forward = min(index + horizon, len(points) - 1)
    return points[forward].value > points[index].value


def compute_breakdowns(
    points: list[DailyPoint],
    *,
    trade_indices: list[int],
    win_horizon_days: int,
) -> dict[str, list[BucketStats]]:
    total_return_days = len(points) - 1

    fgi_returns: dict[str, list[float]] = {regime: [] for regime in REGIME_ORDER}
    zone_returns: dict[str, list[float]] = {zone: [] for zone in ZONE_ORDER}
    fgi_trades: dict[str, list[bool]] = {regime: [] for regime in REGIME_ORDER}
    zone_trades: dict[str, list[bool]] = {zone: [] for zone in ZONE_ORDER}

    for i in range(1, len(points)):
        prev = points[i - 1]
        curr = points[i]
        if prev.value <= 0.0:
            continue
        daily_return = (curr.value - prev.value) / prev.value
        # Attribute to the regime in effect going into the move.
        fgi_returns.setdefault(prev.fgi_regime, []).append(daily_return)
        zone_returns.setdefault(prev.dma_zone, []).append(daily_return)

    for index in trade_indices:
        if index < 0 or index >= len(points):
            continue
        point = points[index]
        won = _trade_won(points, index, win_horizon_days)
        fgi_trades.setdefault(point.fgi_regime, []).append(won)
        zone_trades.setdefault(point.dma_zone, []).append(won)

    by_fgi = [
        _bucket_stats(
            bucket=regime,
            bucket_returns=fgi_returns.get(regime, []),
            total_days=total_return_days,
            trade_results=fgi_trades.get(regime, []),
        )
        for regime in REGIME_ORDER
    ]
    by_zone = [
        _bucket_stats(
            bucket=zone,
            bucket_returns=zone_returns.get(zone, []),
            total_days=total_return_days,
            trade_results=zone_trades.get(zone, []),
        )
        for zone in ZONE_ORDER
    ]
    return {"by_fgi_regime": by_fgi, "by_dma_zone": by_zone}


def _trade_indices_from_decision_log(
    *,
    decision_log_path: Path,
    points: list[DailyPoint],
    strategy_id: str,
) -> list[int]:
    date_to_index = {point.date: index for index, point in enumerate(points)}
    trade_indices: list[int] = []
    for line in decision_log_path.read_text().splitlines():
        if not line.strip():
            continue
        payload = json.loads(line)
        if not isinstance(payload, dict):
            continue
        if payload.get("strategy") != strategy_id:
            continue
        if payload.get("executed") is not True:
            continue
        raw_date = payload.get("date")
        if not isinstance(raw_date, str):
            continue
        index = date_to_index.get(raw_date)
        if index is not None:
            trade_indices.append(index)
    return trade_indices


def _render_section(title: str, rows: list[BucketStats]) -> list[str]:
    lines = [
        f"## {title}",
        "",
        "| Bucket | Days | % Time | Cum % | Ann % | Sharpe | MaxDD % | "
        "Win % | Trades |",
        "|---|---:|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for row in rows:
        win = "n/a" if row.win_rate_percent is None else f"{row.win_rate_percent:.2f}"
        ann = (
            "n/a"
            if row.annualized_return_percent is None
            else f"{row.annualized_return_percent:+.4f}"
        )
        lines.append(
            "| "
            + " | ".join(
                (
                    row.bucket,
                    str(row.days),
                    f"{row.pct_of_time:.2f}",
                    f"{row.cumulative_return_percent:+.4f}",
                    ann,
                    f"{row.sharpe_ratio:.4f}",
                    f"{row.max_drawdown_percent:.4f}",
                    win,
                    str(row.trade_count),
                )
            )
            + " |"
        )
    lines.append("")
    return lines


def render_report(
    *,
    strategy_id: str,
    window_start: str,
    window_end: str,
    overall_summary: dict[str, Any],
    breakdowns: dict[str, list[BucketStats]],
) -> str:
    total_days = sum(row.days for row in breakdowns["by_fgi_regime"])
    pct_sum = sum(row.pct_of_time for row in breakdowns["by_fgi_regime"])
    lines = [
        "# Regime-Conditional Performance Breakdown",
        "",
        f"Strategy: `{strategy_id}`",
        f"Window: {window_start} .. {window_end}  ({total_days} return-days)",
        (
            "Headline: "
            f"ROI {_metric(overall_summary, 'roi_percent', default=0.0)}% | "
            f"Sharpe {_metric(overall_summary, 'sharpe_ratio', default=0.0)} | "
            f"Sortino {_metric(overall_summary, 'sortino_ratio', default=0.0)} | "
            f"MaxDD {_metric(overall_summary, 'max_drawdown_percent', default=0.0)}%"
        ),
        f"FGI %-of-time sums to {pct_sum:.2f} (sanity: ~100)",
        "",
    ]
    lines.extend(_render_section("By FGI Regime", breakdowns["by_fgi_regime"]))
    lines.extend(_render_section("By DMA Zone", breakdowns["by_dma_zone"]))
    return "\n".join(lines) + "\n"


def _serialize(stats: list[BucketStats]) -> list[dict[str, Any]]:
    return [
        {
            "bucket": row.bucket,
            "days": row.days,
            "pct_of_time": row.pct_of_time,
            "cumulative_return_percent": row.cumulative_return_percent,
            "annualized_return_percent": row.annualized_return_percent,
            "sharpe_ratio": row.sharpe_ratio,
            "max_drawdown_percent": row.max_drawdown_percent,
            "win_rate_percent": row.win_rate_percent,
            "trade_count": row.trade_count,
        }
        for row in stats
    ]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--endpoint", default=DEFAULT_ENDPOINT)
    parser.add_argument(
        "--in-process",
        action="store_true",
        help="Use FastAPI TestClient instead of a running HTTP server.",
    )
    parser.add_argument("--strategy-id", default=None)
    parser.add_argument("--reference-date", default=DEFAULT_REFERENCE_DATE)
    parser.add_argument("--days", type=int, default=DEFAULT_WINDOW_DAYS)
    parser.add_argument("--total-capital", type=float, default=DEFAULT_TOTAL_CAPITAL)
    parser.add_argument(
        "--win-horizon-days", type=int, default=DEFAULT_WIN_HORIZON_DAYS
    )
    parser.add_argument("--json", default=None, help="Optional JSON dump path.")
    args = parser.parse_args()

    strategy_id = str(
        args.strategy_id
        if args.strategy_id is not None
        else get_default_seed_strategy_config().strategy_id
    )
    reference_date = _parse_reference_date(str(args.reference_date))
    window_days = int(args.days)
    start_date = _window_start(reference_date, window_days)

    def _collect(client: Any, endpoint: str | None) -> dict[str, Any]:
        return _fetch_compare_payload(
            client=client,
            endpoint=endpoint,
            strategy_id=strategy_id,
            start_date=start_date.isoformat(),
            end_date=reference_date.isoformat(),
            total_capital=float(args.total_capital),
        )

    if args.in_process:
        from fastapi.testclient import TestClient

        from src.main import app

        with TestClient(app) as client:
            payload = _collect(client, None)
    else:
        with httpx.Client() as http_client:
            payload = _collect(http_client, str(args.endpoint))

    points = _extract_timeline(payload, strategy_id)
    decision_log_path = payload.get("decision_log_path")
    if not isinstance(decision_log_path, str):
        raise ValueError("Compare response must include decision_log_path")
    trade_indices = _trade_indices_from_decision_log(
        decision_log_path=Path(decision_log_path),
        points=points,
        strategy_id=strategy_id,
    )
    breakdowns = compute_breakdowns(
        points,
        trade_indices=trade_indices,
        win_horizon_days=int(args.win_horizon_days),
    )
    overall_summary = payload["strategies"][strategy_id]

    report = render_report(
        strategy_id=strategy_id,
        window_start=start_date.isoformat(),
        window_end=reference_date.isoformat(),
        overall_summary=overall_summary,
        breakdowns=breakdowns,
    )
    print(report, end="")

    if args.json is not None:
        out_path = Path(str(args.json))
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(
            json.dumps(
                {
                    "strategy_id": strategy_id,
                    "window_start": start_date.isoformat(),
                    "window_end": reference_date.isoformat(),
                    "win_horizon_days": int(args.win_horizon_days),
                    "by_fgi_regime": _serialize(breakdowns["by_fgi_regime"]),
                    "by_dma_zone": _serialize(breakdowns["by_dma_zone"]),
                },
                indent=2,
            )
            + "\n"
        )
        print(f"Wrote JSON: {out_path}", file=sys.stderr)


if __name__ == "__main__":
    main()
