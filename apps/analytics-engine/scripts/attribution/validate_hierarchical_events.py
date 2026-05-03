"""Validate known hierarchical SPY/crypto regression events via compare-v3."""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path
from typing import Any

import httpx

from scripts.attribution.hierarchical_event_validator import (
    VALIDATION_STRATEGY_IDS,
    all_passed,
    build_compare_request,
    load_event_cases,
    render_markdown_report,
    render_multi_strategy_report,
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


def _filter_cases(
    cases: list[dict[str, Any]],
    event_ids: list[str] | None,
) -> list[dict[str, Any]]:
    if not event_ids:
        return cases
    selected = set(event_ids)
    filtered = [case for case in cases if str(case.get("id")) in selected]
    missing = selected - {str(case.get("id")) for case in filtered}
    if missing:
        raise ValueError("Unknown event id(s): " + ", ".join(sorted(missing)))
    return filtered


def _selected_strategy_ids(
    *,
    requested_strategy_ids: list[str] | None,
    all_strategies: bool,
) -> list[str]:
    if all_strategies or not requested_strategy_ids:
        return list(VALIDATION_STRATEGY_IDS)
    return list(dict.fromkeys(requested_strategy_ids))


def _render_side_by_side_allocations(
    *,
    cases: list[dict[str, Any]],
    payload: dict[str, Any],
    results_by_strategy: dict[str, list[Any]],
) -> str:
    timeline = payload.get("timeline")
    if not isinstance(timeline, list):
        return ""
    lines = [
        "",
        "## Side-by-Side Allocations",
        "",
        "| Event | Date | Strategy | Target BTC | Target ETH | Target SPY | Target Stable | Current BTC | Current ETH | Current Stable | Reason |",
        "|---|---|---|---:|---:|---:|---:|---:|---:|---:|---|",
    ]
    for case in cases:
        case_id = str(case["id"])
        for strategy_id, results in results_by_strategy.items():
            result = next(
                (item for item in results if item.case_id == case_id),
                None,
            )
            if result is None or result.event_date is None:
                continue
            point = _point_for_date(timeline=timeline, event_date=result.event_date)
            if point is None:
                continue
            state = _strategy_state(point=point, strategy_id=strategy_id)
            decision = _mapping(state.get("decision"))
            target = _mapping(decision.get("target_allocation"))
            portfolio = _mapping(state.get("portfolio"))
            current = _mapping(portfolio.get("asset_allocation"))
            lines.append(
                "| "
                + " | ".join(
                    (
                        case_id,
                        result.event_date,
                        strategy_id,
                        _format_share(target.get("btc")),
                        _format_share(target.get("eth")),
                        _format_share(target.get("spy")),
                        _format_share(target.get("stable")),
                        _format_share(current.get("btc")),
                        _format_share(current.get("eth")),
                        _format_share(current.get("stable")),
                        str(decision.get("reason") or "").replace("|", "\\|"),
                    )
                )
                + " |"
            )
    return "\n".join(lines) + "\n"


def _run_failure_diffs(
    *,
    endpoint: str,
    total_capital: float,
    cases: list[dict[str, Any]],
    results_by_strategy: dict[str, list[Any]],
) -> None:
    case_by_id = {str(case["id"]): case for case in cases}
    for strategy_id, results in results_by_strategy.items():
        for result in results:
            if result.passed or result.event_date is None:
                continue
            case = case_by_id.get(result.case_id, {})
            history_start = str(
                case.get("run_start_date") or case.get("search_start_date")
            )
            print(
                (
                    "\n## Diff Diagnostics: "
                    f"{result.case_id} / {strategy_id} / {result.event_date}\n"
                ),
                flush=True,
            )
            subprocess.run(
                [
                    sys.executable,
                    str(APP_ROOT / "scripts/analyze_compare.py"),
                    "--endpoint",
                    endpoint,
                    "--saved-config-id",
                    strategy_id,
                    "--config-id",
                    strategy_id,
                    "--date",
                    result.event_date,
                    "--history-start-date",
                    history_start,
                    "--total-capital",
                    str(total_capital),
                    "--profile",
                    "spy-eth-btc-rotation",
                    "--format",
                    "markdown",
                ],
                cwd=APP_ROOT,
                check=False,
            )


def _point_for_date(
    *,
    timeline: list[Any],
    event_date: str,
) -> dict[str, Any] | None:
    for raw_point in timeline:
        point = _mapping(raw_point)
        market = _mapping(point.get("market"))
        if market.get("date") == event_date or point.get("date") == event_date:
            return point
    return None


def _strategy_state(
    *,
    point: dict[str, Any],
    strategy_id: str,
) -> dict[str, Any]:
    strategies = _mapping(point.get("strategies"))
    return _mapping(strategies.get(strategy_id))


def _mapping(value: Any) -> dict[str, Any]:
    return dict(value) if isinstance(value, dict) else {}


def _format_share(value: Any) -> str:
    return f"{_number(value) * 100.0:.2f}%"


def _number(value: Any) -> float:
    return (
        float(value)
        if isinstance(value, int | float) and not isinstance(value, bool)
        else 0.0
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--endpoint", default=DEFAULT_ENDPOINT)
    parser.add_argument("--fixture", default=str(DEFAULT_FIXTURE))
    parser.add_argument("--total-capital", type=float, default=10_000.0)
    parser.add_argument(
        "--event-id",
        action="append",
        help="Run only the named fixture event; repeatable.",
    )
    parser.add_argument(
        "--strategy-id",
        action="append",
        help="Run only the named strategy id; repeatable. Defaults to all registered validation strategies.",
    )
    parser.add_argument("--config-id", default=None)
    parser.add_argument(
        "--all-strategies",
        action="store_true",
        help="Run all validation fixture strategies in one compare request.",
    )
    parser.add_argument(
        "--diff",
        action="store_true",
        help="Run analyze_compare.py for failing event assertions.",
    )
    parser.add_argument(
        "--side-by-side",
        action="store_true",
        help="Emit per-strategy target/current allocation rows for each event date.",
    )
    parser.add_argument("--out", default=None)
    args = parser.parse_args()

    cases = _filter_cases(
        load_event_cases(Path(str(args.fixture))),
        args.event_id,
    )
    strategy_ids = _selected_strategy_ids(
        requested_strategy_ids=args.strategy_id,
        all_strategies=bool(args.all_strategies),
    )
    if len(strategy_ids) > 1 and args.config_id is not None:
        raise ValueError("--config-id can only be used with one --strategy-id")

    if len(strategy_ids) > 1:
        request_payload = build_compare_request(
            cases=cases,
            strategy_ids=strategy_ids,
            total_capital=float(args.total_capital),
        )
        payload = _fetch_compare_payload(
            endpoint=str(args.endpoint),
            request_payload=request_payload,
        )
        results_by_strategy = {
            strategy_id: validate_cases(
                cases=cases,
                payload=payload,
                strategy_id=strategy_id,
            )
            for strategy_id in strategy_ids
        }
        report = render_multi_strategy_report(results_by_strategy)
        if args.side_by_side:
            report += _render_side_by_side_allocations(
                cases=cases,
                payload=payload,
                results_by_strategy=results_by_strategy,
            )
        print(report, end="")
        if args.out:
            Path(str(args.out)).write_text(report)
        if args.diff:
            _run_failure_diffs(
                endpoint=str(args.endpoint),
                total_capital=float(args.total_capital),
                cases=cases,
                results_by_strategy=results_by_strategy,
            )
        if not all(all_passed(results) for results in results_by_strategy.values()):
            raise SystemExit(1)
        return

    strategy_id = strategy_ids[0]
    config_id = str(args.config_id or strategy_id)
    request_payload = build_compare_request(
        cases=cases,
        strategy_id=strategy_id,
        config_id=config_id,
        total_capital=float(args.total_capital),
    )
    payload = _fetch_compare_payload(
        endpoint=str(args.endpoint),
        request_payload=request_payload,
    )
    results = validate_cases(
        cases=cases,
        payload=payload,
        strategy_id=config_id,
    )
    report = render_markdown_report(results)
    if args.side_by_side:
        report += _render_side_by_side_allocations(
            cases=cases,
            payload=payload,
            results_by_strategy={config_id: results},
        )
    print(report, end="")
    if args.out:
        Path(str(args.out)).write_text(report)
    if args.diff:
        _run_failure_diffs(
            endpoint=str(args.endpoint),
            total_capital=float(args.total_capital),
            cases=cases,
            results_by_strategy={config_id: results},
        )
    if not all_passed(results):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
