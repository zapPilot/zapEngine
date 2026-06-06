"""API-first analyzer for compare-v3 strategy diagnostics."""

from __future__ import annotations

import argparse
import json
from datetime import timedelta
from pathlib import Path
from typing import Any, Literal

from scripts._compare_common import (
    VerificationError,
    _parse_date,
)
from scripts._compare_constraints import (
    _maybe_precondition_skip,
    _validate_constraint_case,
)
from scripts._compare_metrics import (
    EnrichMode,
    _derive_ratio_metrics,
    _empty_ratio_metrics,
    _load_db_ratio_metrics,
    _merge_ratio_metrics,
)
from scripts._compare_normalize import (
    _filter_points,
    iter_normalized_points,
    load_payload,
    load_timeline,
    select_strategy_id,
    timeline_date,
)
from scripts._compare_render import (
    _build_lookback_context,
    _render_markdown,
    _render_markdown_failure_fallback,
    _render_text,
    _resolve_out_path,
    _write_rendered_output,
)
from scripts._compare_summaries import (
    _build_record,
)
from scripts._summarize import render_summary
from src.services.backtesting.validation.event_runner import (
    ConstraintValidationFailed,
    ValidationEventError,
)
from src.services.backtesting.validation.event_runner import (
    build_constraint_validation as _run_constraint_validation,
)

# Public surface exercised by tests/scripts/test_analyze_compare.py. The two
# leading-underscore constraint helpers are re-exported from
# scripts._compare_constraints for that test; the rest are defined below.
__all__ = [
    "ConstraintValidationFailed",
    "SECTION_ORDER",
    "VerificationError",
    "_build_arg_parser",
    "_maybe_precondition_skip",
    "_validate_constraint_case",
    "analyze_payload",
    "analyze_response_payload",
    "main",
]

OutputFormat = Literal["text", "json", "markdown"]

DEFAULT_ENDPOINT = "http://localhost:8001"
DEFAULT_COMPARE_PATH = "/api/v3/backtesting/compare"
DEFAULT_SAVED_CONFIG_ID = "dma_fgi_portfolio_rules_default"
DEFAULT_LOOKBACK_DAYS = 30
DEFAULT_STATEFUL_DATE_LOOKBACK_DAYS = 400
APP_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CONSTRAINTS_FIXTURE = (
    APP_ROOT / "tests/fixtures/hierarchical_validation_events.json"
)

SECTION_ORDER = (
    "market",
    "outer_dma",
    "spy_dma",
    "inner_ratio",
    "asset_class",
    "active_tactics",
    "decision",
    "execution",
    "portfolio",
    "consistency",
    "rule",
)


def _constraint_event_dates(
    *,
    filtered_points: list[dict[str, Any]],
) -> set[str]:
    return {str(point["date"]) for point in filtered_points}


def _build_constraint_validation(
    *,
    points: list[dict[str, Any]],
    filtered_points: list[dict[str, Any]],
    fixture_path: str | Path | None,
    event_ids: list[str] | None,
    strategy_id: str | None = None,
) -> dict[str, Any]:
    return _run_constraint_validation(
        points=points,
        filtered_points=filtered_points,
        fixture_path=fixture_path,
        event_ids=event_ids,
        strategy_id=strategy_id,
    )


def _resolve_config_id(saved_config_id: str, config_id: str | None) -> str:
    return config_id or saved_config_id


def _validate_window_args(
    *,
    date_filter: str | None,
    from_date: str | None,
    to_date: str | None,
    days: int | None,
) -> None:
    if date_filter is not None and (from_date is not None or to_date is not None):
        raise VerificationError("--date cannot be combined with --from-date/--to-date.")
    if days is not None and (date_filter or from_date or to_date):
        raise VerificationError("--days cannot be combined with explicit dates.")
    if days is not None and days <= 0:
        raise VerificationError("--days must be a positive integer.")
    if from_date and to_date and _parse_date(from_date) > _parse_date(to_date):
        raise VerificationError("--from-date must be on or before --to-date.")


def _build_request_window(
    *,
    date_filter: str | None,
    from_date: str | None,
    to_date: str | None,
    days: int | None,
    lookback_days: int,
    history_start_date: str | None = None,
) -> dict[str, Any]:
    _validate_window_args(
        date_filter=date_filter,
        from_date=from_date,
        to_date=to_date,
        days=days,
    )
    if days is not None:
        return {"days": days}
    if date_filter is not None:
        target = _parse_date(date_filter)
        start = (
            _parse_date(history_start_date)
            if history_start_date is not None
            else target
            - timedelta(days=max(lookback_days, DEFAULT_STATEFUL_DATE_LOOKBACK_DAYS))
        )
        if start > target:
            raise VerificationError("--history-start-date must be on or before --date.")
        return {
            "start_date": start.isoformat(),
            "end_date": target.isoformat(),
        }
    if history_start_date is not None:
        raise VerificationError("--history-start-date requires --date.")
    if from_date is not None:
        start = _parse_date(from_date)
        window: dict[str, Any] = {
            "start_date": (start - timedelta(days=lookback_days)).isoformat()
        }
        if to_date is not None:
            window["end_date"] = _parse_date(to_date).isoformat()
        return window
    if to_date is not None:
        end = _parse_date(to_date)
        return {
            "start_date": (end - timedelta(days=lookback_days)).isoformat(),
            "end_date": end.isoformat(),
        }
    return {}


def _build_compare_request(
    *,
    saved_config_id: str,
    config_id: str | None,
    compare_id: str | None,
    token_symbol: str,
    total_capital: float,
    date_filter: str | None,
    from_date: str | None,
    to_date: str | None,
    days: int | None,
    lookback_days: int,
    history_start_date: str | None = None,
    emit_decision_log: bool = False,
    decision_log_dir: str | None = None,
) -> dict[str, Any]:
    resolved_config_id = _resolve_config_id(saved_config_id, config_id)
    request: dict[str, Any] = {
        "token_symbol": token_symbol,
        "total_capital": total_capital,
        "configs": [
            {
                "config_id": resolved_config_id,
                "saved_config_id": saved_config_id,
            }
        ],
    }
    if compare_id is not None:
        request["configs"].append(
            {
                "config_id": compare_id,
                "saved_config_id": compare_id,
            }
        )
    if emit_decision_log:
        request["emit_decision_log"] = True
        if decision_log_dir is not None:
            request["decision_log_dir"] = decision_log_dir
    request.update(
        _build_request_window(
            date_filter=date_filter,
            from_date=from_date,
            to_date=to_date,
            days=days,
            lookback_days=lookback_days,
            history_start_date=history_start_date,
        )
    )
    return request


def _fetch_from_api(endpoint: str, request_body: dict[str, Any]) -> dict[str, Any]:
    import httpx

    try:
        response = httpx.post(
            f"{endpoint.rstrip('/')}{DEFAULT_COMPARE_PATH}",
            json=request_body,
            timeout=120.0,
        )
        response.raise_for_status()
    except httpx.HTTPError as exc:
        raise VerificationError(f"Compare API request failed: {exc}") from exc
    data = response.json()
    if not isinstance(data, dict):
        raise VerificationError("API response root must be an object.")
    return data


def analyze_response_payload(
    payload: dict[str, Any],
    *,
    strategy_id: str | None = None,
    compare_strategy_id: str | None = None,
    date_filter: str | None = None,
    from_date: str | None = None,
    to_date: str | None = None,
    sections: list[str] | None = None,
    output_format: OutputFormat = "json",
    enrich_db: EnrichMode = "auto",
    source_label: str,
    request_body: dict[str, Any],
    lookback_days: int = DEFAULT_LOOKBACK_DAYS,
    out_path: str | None = None,
    constraints_fixture: str | None = str(DEFAULT_CONSTRAINTS_FIXTURE),
    constraint_event_ids: list[str] | None = None,
    fail_on_constraint_violation: bool = False,
    summary: bool = False,
) -> str:
    resolved_out_path = _resolve_out_path(out_path)
    payload = load_payload(payload)
    timeline = load_timeline(payload)
    selected_strategy_id = select_strategy_id(timeline, strategy_id)
    normalized_points = iter_normalized_points(timeline, selected_strategy_id)
    filtered_points = _filter_points(
        normalized_points,
        date_filter=date_filter,
        from_date=from_date,
        to_date=to_date,
    )
    selected_start = filtered_points[0]["date"] if filtered_points else None
    compare_ratio_metrics, warnings = _derive_ratio_metrics(normalized_points)
    constraint_validation = _build_constraint_validation(
        points=normalized_points,
        filtered_points=filtered_points,
        fixture_path=constraints_fixture,
        event_ids=constraint_event_ids,
        strategy_id=selected_strategy_id,
    )
    if summary:
        selected_dates = {str(point["date"]) for point in filtered_points}
        summary_payload = {
            **payload,
            "timeline": [
                point for point in timeline if timeline_date(point) in selected_dates
            ],
        }
        rendered = render_summary(
            payload=summary_payload,
            strategy_id=selected_strategy_id,
            base_strategy_id=compare_strategy_id,
            constraint_validation=constraint_validation,
        )
        if resolved_out_path is not None:
            _write_rendered_output(resolved_out_path, rendered)
        if fail_on_constraint_violation and not constraint_validation.get(
            "passed", True
        ):
            raise ConstraintValidationFailed(rendered, constraint_validation)
        return rendered

    try:
        db_ratio_metrics, db_warnings = _load_db_ratio_metrics(
            normalized_points,
            enrich_db=enrich_db,
        )
        ratio_metrics = _merge_ratio_metrics(compare_ratio_metrics, db_ratio_metrics)
        lookback_context = _build_lookback_context(
            normalized_points,
            selected_start=selected_start,
            ratio_metrics=ratio_metrics,
            lookback_days=lookback_days,
        )
        records = [
            _build_record(
                point,
                ratio_metrics=ratio_metrics.get(point["date"], _empty_ratio_metrics()),
                strategy_id=selected_strategy_id,
            )
            for point in filtered_points
        ]
        selected_sections = (
            tuple(dict.fromkeys(sections)) if sections else SECTION_ORDER
        )
        all_warnings = warnings + db_warnings
        if output_format == "json":
            rendered = json.dumps(
                {
                    "source": source_label,
                    "request": request_body,
                    "strategy_id": selected_strategy_id,
                    "sections": list(selected_sections),
                    "window": payload.get("window"),
                    "warnings": all_warnings,
                    "lookback_context": lookback_context,
                    "constraint_validation": constraint_validation,
                    "decision_log_path": payload.get("decision_log_path"),
                    "records": records,
                },
                indent=2,
                ensure_ascii=False,
            )
        elif output_format == "markdown":
            rendered = _render_markdown(
                records,
                selected_sections,
                all_warnings,
                lookback_context=lookback_context,
                constraint_validation=constraint_validation,
            )
        else:
            rendered = _render_text(
                records,
                selected_sections,
                all_warnings,
                lookback_context=lookback_context,
                constraint_validation=constraint_validation,
            )
    except Exception as exc:
        if output_format == "markdown" and resolved_out_path is not None:
            fallback_rendered = _render_markdown_failure_fallback(
                exc=exc,
                source_label=source_label,
                request_body=request_body,
                constraint_validation=constraint_validation,
            )
            _write_rendered_output(resolved_out_path, fallback_rendered, fallback=True)
        raise

    if resolved_out_path is not None:
        _write_rendered_output(resolved_out_path, rendered)
    if fail_on_constraint_violation and not constraint_validation.get("passed", True):
        raise ConstraintValidationFailed(rendered, constraint_validation)
    return rendered


def analyze_payload(
    *,
    endpoint: str = DEFAULT_ENDPOINT,
    saved_config_id: str = DEFAULT_SAVED_CONFIG_ID,
    config_id: str | None = None,
    compare_id: str | None = None,
    token_symbol: str = "BTC",
    date_filter: str | None = None,
    from_date: str | None = None,
    to_date: str | None = None,
    days: int | None = None,
    total_capital: float = 10_000.0,
    sections: list[str] | None = None,
    output_format: OutputFormat = "json",
    enrich_db: EnrichMode = "auto",
    lookback_days: int = DEFAULT_LOOKBACK_DAYS,
    history_start_date: str | None = None,
    out_path: str | None = None,
    constraints_fixture: str | None = str(DEFAULT_CONSTRAINTS_FIXTURE),
    constraint_event_ids: list[str] | None = None,
    fail_on_constraint_violation: bool = False,
    summary: bool = False,
    emit_decision_log: bool = False,
    decision_log_dir: str | None = None,
) -> str:
    request_body = _build_compare_request(
        saved_config_id=saved_config_id,
        config_id=config_id,
        compare_id=compare_id,
        token_symbol=token_symbol,
        total_capital=total_capital,
        date_filter=date_filter,
        from_date=from_date,
        to_date=to_date,
        days=days,
        lookback_days=lookback_days,
        history_start_date=history_start_date,
        emit_decision_log=summary or emit_decision_log,
        decision_log_dir=decision_log_dir,
    )
    payload = _fetch_from_api(endpoint, request_body)
    selected_config_id = _resolve_config_id(saved_config_id, config_id)
    return analyze_response_payload(
        payload,
        strategy_id=selected_config_id,
        compare_strategy_id=compare_id,
        date_filter=date_filter,
        from_date=from_date,
        to_date=to_date,
        sections=sections,
        output_format=output_format,
        enrich_db=enrich_db,
        source_label=endpoint,
        request_body=request_body,
        lookback_days=lookback_days,
        out_path=out_path,
        constraints_fixture=constraints_fixture,
        constraint_event_ids=constraint_event_ids,
        fail_on_constraint_violation=fail_on_constraint_violation,
        summary=summary,
    )


def _build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--endpoint",
        default=DEFAULT_ENDPOINT,
        help=f"API base URL (default: {DEFAULT_ENDPOINT})",
    )
    parser.add_argument(
        "--saved-config-id",
        default=DEFAULT_SAVED_CONFIG_ID,
        help=f"Saved strategy config id (default: {DEFAULT_SAVED_CONFIG_ID})",
    )
    parser.add_argument("--config-id", help="Config id key to use in compare response")
    parser.add_argument(
        "--compare",
        dest="compare_id",
        help="Second saved config or strategy id to include as the summary diff base.",
    )
    parser.add_argument("--token-symbol", default="BTC")
    parser.add_argument(
        "--date", dest="date_filter", help="Show only one YYYY-MM-DD date"
    )
    parser.add_argument("--from-date", dest="from_date", help="Range start date")
    parser.add_argument("--to-date", dest="to_date", help="Range end date")
    parser.add_argument("--days", type=int, help="Compare API days window")
    parser.add_argument("--total-capital", type=float, default=10_000.0)
    parser.add_argument(
        "--section",
        dest="sections",
        action="append",
        choices=list(SECTION_ORDER),
        help="Repeatable section selector",
    )
    parser.add_argument(
        "--format",
        dest="output_format",
        choices=["text", "json", "markdown"],
        default="json",
    )
    parser.add_argument(
        "--enrich-db",
        choices=["auto", "never", "required"],
        default="auto",
    )
    parser.add_argument(
        "--lookback-days",
        type=int,
        default=DEFAULT_LOOKBACK_DAYS,
        help=argparse.SUPPRESS,
    )
    parser.add_argument(
        "--history-start-date",
        help="History start date for stateful --date diagnostics",
    )
    parser.add_argument(
        "--constraints-fixture",
        default=str(DEFAULT_CONSTRAINTS_FIXTURE),
        help="JSON fixture of event constraints to validate against selected strategy.",
    )
    parser.add_argument(
        "--no-constraints",
        action="store_true",
        help="Disable fixture constraint validation.",
    )
    parser.add_argument(
        "--constraint-event-id",
        action="append",
        help="Validate only the named constraint event; repeatable.",
    )
    parser.add_argument("--out", dest="out_path", help="Write rendered output to file")
    parser.add_argument(
        "--emit-decision-log",
        action="store_true",
        help="Ask compare-v3 to write a compact decisions.jsonl artifact.",
    )
    parser.add_argument(
        "--decision-log-dir",
        help="Directory for decisions.jsonl when --emit-decision-log or --summary is used.",
    )
    parser.add_argument(
        "--summary",
        action="store_true",
        help="Render a compact plain-text rule-attribution summary.",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = _build_arg_parser()
    args = parser.parse_args(argv)
    try:
        output = analyze_payload(
            endpoint=args.endpoint,
            saved_config_id=args.saved_config_id,
            config_id=args.config_id,
            compare_id=args.compare_id,
            token_symbol=args.token_symbol,
            date_filter=args.date_filter,
            from_date=args.from_date,
            to_date=args.to_date,
            days=args.days,
            total_capital=args.total_capital,
            sections=args.sections,
            output_format=args.output_format,
            enrich_db=args.enrich_db,
            lookback_days=args.lookback_days,
            history_start_date=args.history_start_date,
            out_path=args.out_path,
            constraints_fixture=None
            if args.no_constraints
            else str(args.constraints_fixture),
            constraint_event_ids=args.constraint_event_id,
            fail_on_constraint_violation=True,
            summary=args.summary,
            emit_decision_log=args.emit_decision_log,
            decision_log_dir=args.decision_log_dir,
        )
    except ConstraintValidationFailed as exc:
        print(exc.rendered)
        return 1
    except (VerificationError, ValidationEventError) as exc:
        print(f"ERROR: {exc}")
        return 1
    print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())


__all__ = [
    "ConstraintValidationFailed",
    "DEFAULT_CONSTRAINTS_FIXTURE",
    "DEFAULT_ENDPOINT",
    "DEFAULT_SAVED_CONFIG_ID",
    "analyze_payload",
    "analyze_response_payload",
    "main",
]
