"""Validate known hierarchical SPY/crypto regression events via compare-v3."""

from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any

import httpx

from scripts.attribution.hierarchical_event_validator import (
    DEFAULT_CONFIG_ID,
    DEFAULT_STRATEGY_ID,
    all_passed,
    build_compare_request,
    load_event_cases,
    render_markdown_report,
    validate_cases,
)

APP_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_ENDPOINT = "http://localhost:8001"
DEFAULT_FIXTURE = APP_ROOT / "tests/fixtures/hierarchical_validation_events.json"
COMPARE_PATH = "/api/v3/backtesting/compare"


def _fetch_compare_payload(
    *,
    endpoint: str,
    request_payload: dict[str, Any],
) -> dict[str, Any]:
    with httpx.Client(timeout=240.0) as client:
        response = client.post(
            f"{endpoint.rstrip('/')}{COMPARE_PATH}",
            json=request_payload,
        )
        response.raise_for_status()
        payload = response.json()
        if not isinstance(payload, dict):
            raise ValueError("Compare response root must be an object")
        return payload


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--endpoint", default=DEFAULT_ENDPOINT)
    parser.add_argument("--fixture", default=str(DEFAULT_FIXTURE))
    parser.add_argument("--total-capital", type=float, default=10_000.0)
    parser.add_argument("--strategy-id", default=DEFAULT_STRATEGY_ID)
    parser.add_argument("--config-id", default=DEFAULT_CONFIG_ID)
    parser.add_argument("--out", default=None)
    args = parser.parse_args()

    cases = load_event_cases(Path(str(args.fixture)))
    request_payload = build_compare_request(
        cases=cases,
        strategy_id=str(args.strategy_id),
        config_id=str(args.config_id),
        total_capital=float(args.total_capital),
    )
    payload = _fetch_compare_payload(
        endpoint=str(args.endpoint),
        request_payload=request_payload,
    )
    results = validate_cases(
        cases=cases,
        payload=payload,
        strategy_id=str(args.config_id),
    )
    report = render_markdown_report(results)
    print(report, end="")
    if args.out:
        Path(str(args.out)).write_text(report)
    if not all_passed(results):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
