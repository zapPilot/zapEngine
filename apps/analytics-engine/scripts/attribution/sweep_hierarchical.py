"""Run hierarchical SPY/crypto attribution variants through compare-v3."""

from __future__ import annotations

import argparse
from datetime import date
from pathlib import Path
from typing import Any

import httpx

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
    "max_drawdown_percent",
    "roi_percent",
    "trade_count",
)


def _parse_windows(raw: str) -> list[str]:
    windows = [item.strip() for item in raw.split(",") if item.strip()]
    invalid = sorted(set(windows) - set(WINDOW_RANGES))
    if invalid:
        raise ValueError("Unsupported windows: " + ", ".join(invalid))
    return windows or list(DEFAULT_WINDOWS)


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


def _format_metric(value: float | int | None, *, pct: bool = False) -> str:
    if value is None:
        return "n/a"
    if pct:
        return f"{float(value):.2f}%"
    if isinstance(value, int):
        return str(value)
    return f"{float(value):.2f}"


def render_markdown(
    results: dict[str, dict[str, dict[str, Any]]],
    *,
    generated_on: date | None = None,
) -> str:
    today = generated_on or date.today()
    lines = [f"# Hierarchical Attribution Sweep - {today.isoformat()}"]
    for window, window_results in results.items():
        control = window_results.get("dma_fgi_hierarchical_control", {})
        control_calmar = _metric(control, "calmar_ratio")
        lines.extend(
            [
                "",
                f"## Window: {window}",
                "",
                "| Variant | Calmar | Max DD | ROI | Trades | Delta Calmar | Validated |",
                "|---|---:|---:|---:|---:|---:|---|",
            ]
        )
        for strategy_id, variant in HIERARCHICAL_ATTRIBUTION_VARIANTS.items():
            summary = window_results.get(strategy_id, {})
            calmar = _metric(summary, "calmar_ratio")
            delta = (
                None
                if calmar is None or control_calmar is None
                else float(calmar) - float(control_calmar)
            )
            validated = (
                "baseline"
                if strategy_id == "dma_fgi_hierarchical_control"
                else ("yes" if delta is not None and delta > 0.05 else "no")
            )
            lines.append(
                "| "
                + " | ".join(
                    (
                        variant.display_name,
                        _format_metric(calmar),
                        _format_metric(
                            _metric(summary, "max_drawdown_percent"),
                            pct=True,
                        ),
                        _format_metric(_metric(summary, "roi_percent"), pct=True),
                        _format_metric(_metric(summary, "trade_count")),
                        "baseline" if delta is None else f"{delta:+.2f}",
                        validated,
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
) -> dict[str, dict[str, dict[str, Any]]]:
    results: dict[str, dict[str, dict[str, Any]]] = {}
    with httpx.Client() as client:
        for window in windows:
            start_date, end_date = WINDOW_RANGES[window]
            results[window] = {}
            for strategy_id in HIERARCHICAL_ATTRIBUTION_VARIANTS:
                results[window][strategy_id] = _fetch_summary(
                    client=client,
                    endpoint=endpoint,
                    strategy_id=strategy_id,
                    start_date=start_date,
                    end_date=end_date,
                    total_capital=total_capital,
                )
    return results


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--endpoint", default=DEFAULT_ENDPOINT)
    parser.add_argument("--windows", default=",".join(DEFAULT_WINDOWS))
    parser.add_argument("--total-capital", type=float, default=10_000.0)
    parser.add_argument("--out", default=None)
    args = parser.parse_args()

    results = run_sweep(
        endpoint=str(args.endpoint),
        windows=_parse_windows(str(args.windows)),
        total_capital=float(args.total_capital),
    )
    rendered = render_markdown(results)
    print(rendered, end="")
    if args.out:
        Path(str(args.out)).write_text(rendered)


if __name__ == "__main__":
    main()
