"""Diagnose SPY/crypto switch timing tax between two strategy timelines."""

from __future__ import annotations

import argparse
from datetime import date, timedelta
from pathlib import Path
from typing import Any

import httpx

from scripts.attribution.spy_tax_helpers import (
    align_timelines,
    detect_divergence_events,
    render_markdown_report,
    summarize_events,
)

DEFAULT_ENDPOINT = "http://localhost:8001"
COMPARE_PATH = "/api/v3/backtesting/compare"
DEFAULT_BASELINE_STRATEGY = "dma_fgi_hierarchical_minimum"
DEFAULT_REFERENCE_STRATEGY = "dma_fgi_eth_btc_minimum"
DEFAULT_REFERENCE_DATE = "2026-04-15"
DEFAULT_WINDOW_DAYS = 500
DEFAULT_TOTAL_CAPITAL = 10_000.0


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--endpoint", default=DEFAULT_ENDPOINT)
    parser.add_argument("--baseline-strategy", default=DEFAULT_BASELINE_STRATEGY)
    parser.add_argument("--reference-strategy", default=DEFAULT_REFERENCE_STRATEGY)
    parser.add_argument("--reference-date", default=DEFAULT_REFERENCE_DATE)
    parser.add_argument("--window-days", type=int, default=DEFAULT_WINDOW_DAYS)
    parser.add_argument("--total-capital", type=float, default=DEFAULT_TOTAL_CAPITAL)
    parser.add_argument(
        "--out",
        default=None,
        help="Markdown report path. Prints to stdout when omitted.",
    )
    args = parser.parse_args()

    reference_date = _parse_reference_date(str(args.reference_date))
    window_days = int(args.window_days)
    payload = _fetch_compare_payload(
        endpoint=str(args.endpoint),
        baseline_strategy=str(args.baseline_strategy),
        reference_strategy=str(args.reference_strategy),
        reference_date=reference_date,
        window_days=window_days,
        total_capital=float(args.total_capital),
    )
    days = align_timelines(
        payload=payload,
        baseline_strategy=str(args.baseline_strategy),
        reference_strategy=str(args.reference_strategy),
    )
    events = detect_divergence_events(days)
    stats = summarize_events(events)
    summaries = payload.get("strategies")
    if not isinstance(summaries, dict):
        summaries = {}
    report = render_markdown_report(
        baseline_strategy=str(args.baseline_strategy),
        reference_strategy=str(args.reference_strategy),
        reference_date=reference_date,
        window_days=window_days,
        events=events,
        stats=stats,
        summaries=summaries,
    )
    if args.out is None:
        print(report, end="")
        return
    out_path = Path(str(args.out))
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(report)


def _fetch_compare_payload(
    *,
    endpoint: str,
    baseline_strategy: str,
    reference_strategy: str,
    reference_date: date,
    window_days: int,
    total_capital: float,
) -> dict[str, Any]:
    if window_days < 1:
        raise ValueError("window-days must be >= 1")
    start_date = reference_date - timedelta(days=window_days - 1)
    request_payload = {
        "token_symbol": "BTC",
        "total_capital": total_capital,
        "start_date": start_date.isoformat(),
        "end_date": reference_date.isoformat(),
        "configs": [
            {
                "config_id": baseline_strategy,
                "strategy_id": baseline_strategy,
                "params": {},
            },
            {
                "config_id": reference_strategy,
                "strategy_id": reference_strategy,
                "params": {},
            },
        ],
    }
    with httpx.Client(timeout=600.0) as client:
        response = client.post(
            f"{endpoint.rstrip('/')}{COMPARE_PATH}",
            json=request_payload,
        )
        response.raise_for_status()
        payload = response.json()
    if not isinstance(payload, dict):
        raise ValueError("Compare response root must be an object")
    return payload


def _parse_reference_date(raw: str) -> date:
    try:
        return date.fromisoformat(raw)
    except ValueError as exc:
        raise ValueError(
            f"Invalid reference date '{raw}'; expected YYYY-MM-DD"
        ) from exc


if __name__ == "__main__":
    main()
