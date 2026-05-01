"""Run hierarchical SPY/crypto attribution variants through compare-v3."""

from __future__ import annotations

import argparse
import sys
from datetime import date
from pathlib import Path
from typing import Any

import httpx

from src.services.backtesting.constants import STRATEGY_DMA_FGI_HIERARCHICAL_CONTROL
from src.services.backtesting.strategies.hierarchical_attribution import (
    HIERARCHICAL_ATTRIBUTION_VARIANTS,
)

DEFAULT_ENDPOINT = "http://localhost:8001"
COMPARE_PATH = "/api/v3/backtesting/compare"
DEFAULT_WINDOWS = ("2024", "2025", "2026", "combined")
WINDOW_RANGES: dict[str, tuple[str, str]] = {
    "2024": ("2024-01-01", "2024-12-31"),
    "2025": ("2025-01-01", "2025-12-31"),
    "2026": ("2026-01-01", "2026-04-15"),
    "combined": ("2024-01-01", "2026-04-15"),
}
METRIC_KEYS = (
    "calmar_ratio",
    "sharpe_ratio",
    "max_drawdown_percent",
    "roi_percent",
    "trade_count",
    "win_rate_percent",
)
PROGRESS_BAR_WIDTH = 24


def _parse_windows(raw: str) -> list[str]:
    windows = [item.strip() for item in raw.split(",") if item.strip()]
    invalid = sorted(set(windows) - set(WINDOW_RANGES))
    if invalid:
        raise ValueError("Unsupported windows: " + ", ".join(invalid))
    return windows or list(DEFAULT_WINDOWS)


def _resolve_variants_subset(variants_subset: list[str] | None) -> list[str]:
    if variants_subset is None:
        return list(HIERARCHICAL_ATTRIBUTION_VARIANTS)
    invalid = sorted(set(variants_subset) - set(HIERARCHICAL_ATTRIBUTION_VARIANTS))
    if invalid:
        raise ValueError("Unsupported variants: " + ", ".join(invalid))
    return list(variants_subset)


def _parse_variants(raw: str | None) -> list[str] | None:
    if raw is None:
        return None

    variants: list[str] = []
    seen: set[str] = set()
    for item in raw.split(","):
        strategy_id = item.strip()
        if not strategy_id or strategy_id in seen:
            continue
        variants.append(strategy_id)
        seen.add(strategy_id)
    return _resolve_variants_subset(variants) if variants else None


def _compare_request(
    *,
    strategy_id: str,
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
        ],
    }


def _extract_summary(payload: dict[str, Any], strategy_id: str) -> dict[str, Any]:
    strategies = payload.get("strategies")
    if not isinstance(strategies, dict):
        return {}
    summary = strategies.get(strategy_id)
    return dict(summary) if isinstance(summary, dict) else {}


def _fetch_summary(
    *,
    client: httpx.Client,
    endpoint: str,
    strategy_id: str,
    start_date: str,
    end_date: str,
    total_capital: float,
) -> dict[str, Any]:
    response = client.post(
        f"{endpoint.rstrip('/')}{COMPARE_PATH}",
        json=_compare_request(
            strategy_id=strategy_id,
            start_date=start_date,
            end_date=end_date,
            total_capital=total_capital,
        ),
        timeout=180.0,
    )
    response.raise_for_status()
    payload = response.json()
    if not isinstance(payload, dict):
        raise ValueError("Compare response root must be an object")
    return _extract_summary(payload, strategy_id)


def _metric(summary: dict[str, Any], key: str) -> float | int | None:
    value = summary.get(key)
    if isinstance(value, int | float):
        return value
    return None


def _first_metric(summary: dict[str, Any], keys: tuple[str, ...]) -> float | int | None:
    for key in keys:
        value = _metric(summary, key)
        if value is not None:
            return value
    return None


def _win_rate_percent(summary: dict[str, Any]) -> float | int | None:
    value = _first_metric(summary, ("win_rate_percent", "win_rate"))
    if value is None:
        return None
    if float(value) <= 1.0:
        return float(value) * 100.0
    return value


def _format_metric(value: float | int | None, *, pct: bool = False) -> str:
    if value is None:
        return "n/a"
    if pct:
        return f"{float(value):.2f}%"
    if isinstance(value, int):
        return str(value)
    return f"{float(value):.2f}"


def _progress_line(
    *,
    completed: int,
    total: int,
    window: str,
    strategy_id: str,
) -> str:
    ratio = 1.0 if total <= 0 else completed / total
    filled = int(PROGRESS_BAR_WIDTH * ratio)
    bar = "#" * filled + "-" * (PROGRESS_BAR_WIDTH - filled)
    percent = ratio * 100.0
    return (
        f"\r[{bar}] {completed}/{total} {percent:5.1f}% "
        f"window={window} variant={strategy_id}"
    )


def _emit_progress(
    *,
    completed: int,
    total: int,
    window: str,
    strategy_id: str,
) -> None:
    print(
        _progress_line(
            completed=completed,
            total=total,
            window=window,
            strategy_id=strategy_id,
        ),
        end="",
        file=sys.stderr,
        flush=True,
    )


def _calmar_delta(
    *,
    window_results: dict[str, dict[str, Any]],
    strategy_id: str,
    baseline_id: str,
) -> float | None:
    summary = window_results.get(strategy_id, {})
    baseline = window_results.get(baseline_id, {})
    calmar = _metric(summary, "calmar_ratio")
    baseline_calmar = _metric(baseline, "calmar_ratio")
    if calmar is None or baseline_calmar is None:
        return None
    return float(calmar) - float(baseline_calmar)


def _validated_labels(
    results: dict[str, dict[str, dict[str, Any]]],
    *,
    baseline_id: str,
    variants_subset: list[str] | None = None,
) -> dict[str, str]:
    strategy_ids = _resolve_variants_subset(variants_subset)
    non_overlapping_windows = [
        window for window in results if window in {"2024", "2025", "2026"}
    ]
    labels: dict[str, str] = {baseline_id: "baseline"}
    for strategy_id in strategy_ids:
        if strategy_id == baseline_id:
            continue
        contribution_count = sum(
            1
            for window in non_overlapping_windows
            if (
                _calmar_delta(
                    window_results=results.get(window, {}),
                    strategy_id=strategy_id,
                    baseline_id=baseline_id,
                )
                or 0.0
            )
            > 0.05
        )
        window_count = len(non_overlapping_windows)
        validated = contribution_count >= 2
        labels[strategy_id] = (
            f"{'yes' if validated else 'no'} ({contribution_count}/{window_count})"
        )
    return labels


def render_markdown(
    results: dict[str, dict[str, dict[str, Any]]],
    *,
    generated_on: date | None = None,
    baseline_id: str = STRATEGY_DMA_FGI_HIERARCHICAL_CONTROL,
    variants_subset: list[str] | None = None,
) -> str:
    today = generated_on or date.today()
    strategy_ids = _resolve_variants_subset(variants_subset)
    validated_labels = _validated_labels(
        results,
        baseline_id=baseline_id,
        variants_subset=strategy_ids,
    )
    lines = [f"# Hierarchical Attribution Sweep - {today.isoformat()}"]
    for window, window_results in results.items():
        lines.extend(
            [
                "",
                f"## Window: {window}",
                "",
                "| Variant | Calmar | Sharpe | Max DD | ROI | Trades | Win Rate | Delta Calmar | Validated |",
                "|---|---:|---:|---:|---:|---:|---:|---:|---|",
            ]
        )
        for strategy_id in strategy_ids:
            variant = HIERARCHICAL_ATTRIBUTION_VARIANTS[strategy_id]
            summary = window_results.get(strategy_id, {})
            calmar = _metric(summary, "calmar_ratio")
            delta = _calmar_delta(
                window_results=window_results,
                strategy_id=strategy_id,
                baseline_id=baseline_id,
            )
            delta_label = (
                "baseline"
                if strategy_id == baseline_id
                else ("n/a" if delta is None else f"{delta:+.2f}")
            )
            lines.append(
                "| "
                + " | ".join(
                    (
                        variant.display_name,
                        _format_metric(calmar),
                        _format_metric(_metric(summary, "sharpe_ratio")),
                        _format_metric(
                            _metric(summary, "max_drawdown_percent"),
                            pct=True,
                        ),
                        _format_metric(_metric(summary, "roi_percent"), pct=True),
                        _format_metric(
                            _first_metric(summary, ("trade_count", "total_trades"))
                        ),
                        _format_metric(_win_rate_percent(summary), pct=True),
                        delta_label,
                        validated_labels[strategy_id],
                    )
                )
                + " |"
            )
    return "\n".join(lines).rstrip() + "\n"


def run_sweep(
    *,
    endpoint: str,
    windows: list[str],
    total_capital: float,
    variants_subset: list[str] | None = None,
    show_progress: bool = True,
) -> dict[str, dict[str, dict[str, Any]]]:
    results: dict[str, dict[str, dict[str, Any]]] = {}
    strategy_ids = _resolve_variants_subset(variants_subset)
    total_steps = len(windows) * len(strategy_ids)
    completed_steps = 0
    with httpx.Client() as client:
        for window in windows:
            start_date, end_date = WINDOW_RANGES[window]
            results[window] = {}
            for strategy_id in strategy_ids:
                results[window][strategy_id] = _fetch_summary(
                    client=client,
                    endpoint=endpoint,
                    strategy_id=strategy_id,
                    start_date=start_date,
                    end_date=end_date,
                    total_capital=total_capital,
                )
                completed_steps += 1
                if show_progress:
                    _emit_progress(
                        completed=completed_steps,
                        total=total_steps,
                        window=window,
                        strategy_id=strategy_id,
                    )
    if show_progress:
        print(file=sys.stderr)
    return results


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--endpoint", default=DEFAULT_ENDPOINT)
    parser.add_argument("--windows", default=",".join(DEFAULT_WINDOWS))
    parser.add_argument("--total-capital", type=float, default=10_000.0)
    parser.add_argument("--out", default=None)
    parser.add_argument(
        "--baseline-strategy",
        default=STRATEGY_DMA_FGI_HIERARCHICAL_CONTROL,
        help="Strategy ID to use as baseline for Calmar delta and validated labels.",
    )
    parser.add_argument(
        "--variants",
        default=None,
        help="Comma-separated variant subset to run; defaults to all registered variants.",
    )
    parser.add_argument(
        "--no-progress",
        action="store_true",
        help="Disable stderr progress output.",
    )
    args = parser.parse_args()

    baseline_id = str(args.baseline_strategy)
    if baseline_id not in HIERARCHICAL_ATTRIBUTION_VARIANTS:
        raise ValueError(f"Unsupported baseline strategy: {baseline_id}")
    variants_subset = _parse_variants(
        None if args.variants is None else str(args.variants)
    )
    results = run_sweep(
        endpoint=str(args.endpoint),
        windows=_parse_windows(str(args.windows)),
        total_capital=float(args.total_capital),
        variants_subset=variants_subset,
        show_progress=not bool(args.no_progress),
    )
    rendered = render_markdown(
        results,
        baseline_id=baseline_id,
        variants_subset=variants_subset,
    )
    print(rendered, end="")
    if args.out:
        Path(str(args.out)).write_text(rendered)


if __name__ == "__main__":
    main()
