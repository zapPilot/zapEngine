"""Run minimal-baseline-plus-one-rule attribution sweeps."""

from __future__ import annotations

import argparse
import json
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx

from scripts.attribution._helpers import _metric
from scripts.attribution.per_rule_report import summarize_rule_matches
from scripts.attribution.sweep_production_window import (
    COMPARE_PATH,
    DEFAULT_ENDPOINT,
    DEFAULT_REFERENCE_DATE,
    DEFAULT_TOTAL_CAPITAL,
    DEFAULT_WINDOW_DAYS,
    _parse_reference_date,
    _window_start,
)
from src.services.backtesting.constants import STRATEGY_DMA_FGI_PORTFOLIO_RULES
from src.services.backtesting.portfolio_rules import (
    MINIMAL_BASELINE_PORTFOLIO_RULE_NAMES,
    RULE_NAMES,
    RULE_PRIORITIES,
)


@dataclass(frozen=True)
class RuleOnlySweepRow:
    config_id: str
    added_rule: str | None
    roi_percent: float
    roi_delta: float
    calmar_ratio: float
    calmar_delta: float
    sharpe_ratio: float
    sharpe_delta: float
    trade_count: int
    trade_count_delta: int
    match_count: int


def build_rule_only_compare_request(
    *,
    start_date: str,
    end_date: str,
    total_capital: float,
    baseline_rules: frozenset[str],
    candidate_rules: tuple[str, ...],
    decision_log_dir: str,
    extra_params: dict[str, Any] | None = None,
) -> dict[str, Any]:
    resolved_extra_params = dict(extra_params or {})
    configs = [
        _compare_config(
            config_id="baseline",
            enabled_rules=baseline_rules,
            extra_params=resolved_extra_params,
        )
    ]
    for rule_name in candidate_rules:
        configs.append(
            _compare_config(
                config_id=f"baseline_plus_{rule_name}",
                enabled_rules=frozenset({*baseline_rules, rule_name}),
                extra_params=resolved_extra_params,
            )
        )
    return {
        "token_symbol": "BTC",
        "total_capital": total_capital,
        "start_date": start_date,
        "end_date": end_date,
        "emit_decision_log": True,
        "decision_log_dir": decision_log_dir,
        "configs": configs,
    }


def collect_rule_only_sweep(
    *,
    endpoint: str | None,
    reference_date_raw: str,
    window_days: int,
    total_capital: float,
    baseline_rules: frozenset[str] = MINIMAL_BASELINE_PORTFOLIO_RULE_NAMES,
    candidate_rules: tuple[str, ...] | None = None,
    extra_params: dict[str, Any] | None = None,
    client: Any | None = None,
    decision_log_dir: str | None = None,
) -> list[RuleOnlySweepRow]:
    reference_date = _parse_reference_date(reference_date_raw)
    start_date = _window_start(reference_date, window_days)
    resolved_candidate_rules = candidate_rules or _default_candidate_rules()
    resolved_log_dir = decision_log_dir or tempfile.mkdtemp(
        prefix="zapengine-rule-only-"
    )
    request = build_rule_only_compare_request(
        start_date=start_date.isoformat(),
        end_date=reference_date.isoformat(),
        total_capital=total_capital,
        baseline_rules=baseline_rules,
        candidate_rules=resolved_candidate_rules,
        decision_log_dir=resolved_log_dir,
        extra_params=extra_params,
    )
    if client is None:
        with httpx.Client() as http_client:
            payload = _post_compare(
                client=http_client,
                endpoint=endpoint,
                request=request,
            )
    else:
        payload = _post_compare(client=client, endpoint=endpoint, request=request)
    return _sweep_rows(
        payload=payload,
        candidate_rules=resolved_candidate_rules,
    )


def render_markdown_rows(rows: list[RuleOnlySweepRow]) -> str:
    lines = [
        "| Config | Added Rule | ROI | ROI Delta | Calmar | Calmar Delta | Sharpe | Sharpe Delta | Trades | Trade Delta | Matches |",
        "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ]
    for row in rows:
        lines.append(
            f"| {row.config_id} | {row.added_rule or '-'} | "
            f"{row.roi_percent:.4f} | {row.roi_delta:.4f} | "
            f"{row.calmar_ratio:.4f} | {row.calmar_delta:.4f} | "
            f"{row.sharpe_ratio:.4f} | {row.sharpe_delta:.4f} | "
            f"{row.trade_count} | {row.trade_count_delta} | {row.match_count} |"
        )
    return "\n".join(lines)


def rows_to_jsonable(rows: list[RuleOnlySweepRow]) -> list[dict[str, Any]]:
    return [
        {
            "config_id": row.config_id,
            "added_rule": row.added_rule,
            "roi_percent": row.roi_percent,
            "roi_delta": row.roi_delta,
            "calmar_ratio": row.calmar_ratio,
            "calmar_delta": row.calmar_delta,
            "sharpe_ratio": row.sharpe_ratio,
            "sharpe_delta": row.sharpe_delta,
            "trade_count": row.trade_count,
            "trade_count_delta": row.trade_count_delta,
            "match_count": row.match_count,
        }
        for row in rows
    ]


def _compare_config(
    *,
    config_id: str,
    enabled_rules: frozenset[str],
    extra_params: dict[str, Any],
) -> dict[str, Any]:
    return {
        "config_id": config_id,
        "strategy_id": STRATEGY_DMA_FGI_PORTFOLIO_RULES,
        "params": {**extra_params, "enabled_rules": sorted(enabled_rules)},
    }


def _post_compare(
    *,
    client: Any,
    endpoint: str | None,
    request: dict[str, Any],
) -> dict[str, Any]:
    compare_url = COMPARE_PATH if endpoint is None else f"{endpoint.rstrip('/')}{COMPARE_PATH}"
    response = client.post(compare_url, json=request, timeout=600.0)
    response.raise_for_status()
    payload = response.json()
    if not isinstance(payload, dict):
        raise ValueError("Compare response root must be an object")
    return payload


def _sweep_rows(
    *,
    payload: dict[str, Any],
    candidate_rules: tuple[str, ...],
) -> list[RuleOnlySweepRow]:
    strategies = payload.get("strategies")
    if not isinstance(strategies, dict):
        raise ValueError("Compare response must include strategies")
    decision_log_path = payload.get("decision_log_path")
    if not isinstance(decision_log_path, str):
        raise ValueError("Compare response must include decision_log_path")
    lines = Path(decision_log_path).read_text().splitlines()
    baseline_summary = _summary(strategies, "baseline")
    rows = [_row_for_config("baseline", None, baseline_summary, baseline_summary, 0)]
    for rule_name in candidate_rules:
        config_id = f"baseline_plus_{rule_name}"
        summary = _summary(strategies, config_id)
        rule_report = summarize_rule_matches(lines, strategy=config_id)
        report_row = rule_report.rules.get(rule_name)
        match_count = 0 if report_row is None else report_row.match_count
        rows.append(
            _row_for_config(
                config_id,
                rule_name,
                summary,
                baseline_summary,
                match_count,
            )
        )
    return rows


def _summary(strategies: dict[str, Any], config_id: str) -> dict[str, Any]:
    raw = strategies.get(config_id)
    if not isinstance(raw, dict):
        raise ValueError(f"Compare response missing strategy {config_id!r}")
    return raw


def _row_for_config(
    config_id: str,
    added_rule: str | None,
    summary: dict[str, Any],
    baseline_summary: dict[str, Any],
    match_count: int,
) -> RuleOnlySweepRow:
    roi = float(_metric(summary, "roi_percent", round_digits=4))
    baseline_roi = float(_metric(baseline_summary, "roi_percent", round_digits=4))
    calmar = float(_metric(summary, "calmar_ratio", round_digits=4))
    baseline_calmar = float(
        _metric(baseline_summary, "calmar_ratio", round_digits=4)
    )
    sharpe = float(_metric(summary, "sharpe_ratio", round_digits=4))
    baseline_sharpe = float(
        _metric(baseline_summary, "sharpe_ratio", round_digits=4)
    )
    trades = int(_metric(summary, "trade_count", integer_keys=("trade_count",)))
    baseline_trades = int(
        _metric(baseline_summary, "trade_count", integer_keys=("trade_count",))
    )
    return RuleOnlySweepRow(
        config_id=config_id,
        added_rule=added_rule,
        roi_percent=roi,
        roi_delta=round(roi - baseline_roi, 4),
        calmar_ratio=calmar,
        calmar_delta=round(calmar - baseline_calmar, 4),
        sharpe_ratio=sharpe,
        sharpe_delta=round(sharpe - baseline_sharpe, 4),
        trade_count=trades,
        trade_count_delta=trades - baseline_trades,
        match_count=match_count,
    )


def _default_candidate_rules() -> tuple[str, ...]:
    return tuple(sorted(RULE_NAMES, key=lambda name: (RULE_PRIORITIES[name], name)))


def _build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--endpoint", default=DEFAULT_ENDPOINT)
    parser.add_argument(
        "--in-process",
        action="store_true",
        help="Use FastAPI TestClient instead of requiring a running HTTP server.",
    )
    parser.add_argument("--reference-date", default=DEFAULT_REFERENCE_DATE)
    parser.add_argument("--days", type=int, default=DEFAULT_WINDOW_DAYS)
    parser.add_argument("--total-capital", type=float, default=DEFAULT_TOTAL_CAPITAL)
    parser.add_argument(
        "--rule",
        dest="rules",
        action="append",
        help="Candidate rule to test. Repeatable; defaults to all known rules.",
    )
    parser.add_argument(
        "--extreme-fear-days",
        type=int,
        help=(
            "Set min_consecutive_extreme_fear_days for the sweep. "
            "Useful when testing extreme_fear_dca_buy variants."
        ),
    )
    parser.add_argument(
        "--buy-step",
        type=float,
        help=(
            "Set extreme_fear_buy_step for the sweep (fraction of stable "
            "deployed per fire, default 0.01). Useful when testing size "
            "variants of extreme_fear_dca_buy."
        ),
    )
    parser.add_argument("--decision-log-dir")
    parser.add_argument("--format", choices=("markdown", "json"), default="markdown")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _build_arg_parser().parse_args(argv)
    candidate_rules = tuple(args.rules) if args.rules else None
    unknown_rules = sorted(set(candidate_rules or ()) - RULE_NAMES)
    if unknown_rules:
        print("Unknown rules: " + ", ".join(unknown_rules), file=sys.stderr)
        return 2
    extreme_fear_section: dict[str, float | int] = {}
    if args.extreme_fear_days is not None:
        extreme_fear_section["min_consecutive_days"] = args.extreme_fear_days
    if args.buy_step is not None:
        extreme_fear_section["buy_step"] = args.buy_step
    extra_params = (
        {"extreme_fear": extreme_fear_section} if extreme_fear_section else None
    )
    if args.in_process:
        from fastapi.testclient import TestClient

        from src.main import app

        with TestClient(app) as client:
            rows = collect_rule_only_sweep(
                endpoint=None,
                reference_date_raw=args.reference_date,
                window_days=args.days,
                total_capital=args.total_capital,
                candidate_rules=candidate_rules,
                extra_params=extra_params,
                client=client,
                decision_log_dir=args.decision_log_dir,
            )
    else:
        rows = collect_rule_only_sweep(
            endpoint=args.endpoint,
            reference_date_raw=args.reference_date,
            window_days=args.days,
            total_capital=args.total_capital,
            candidate_rules=candidate_rules,
            extra_params=extra_params,
            decision_log_dir=args.decision_log_dir,
        )
    if args.format == "json":
        print(json.dumps(rows_to_jsonable(rows), indent=2, sort_keys=True))
    else:
        print(render_markdown_rows(rows))
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
