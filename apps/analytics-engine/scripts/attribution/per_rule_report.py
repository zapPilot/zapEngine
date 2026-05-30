"""Summarize portfolio-rule match, win, and shadowing counts from decisions.jsonl."""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass
class RuleReportRow:
    rule_name: str
    match_count: int = 0
    win_count: int = 0
    shadowed_count: int = 0


@dataclass
class PerRuleReport:
    rules: dict[str, RuleReportRow]
    shadowing_matrix: dict[tuple[str, str], int]


def summarize_rule_matches(
    lines: list[str],
    *,
    strategy: str | None = None,
) -> PerRuleReport:
    rows: dict[str, RuleReportRow] = {}
    shadowing: dict[tuple[str, str], int] = {}
    for line in lines:
        if not line.strip():
            continue
        record = json.loads(line)
        if strategy is not None and record.get("strategy") != strategy:
            continue
        winning_rule = record.get("rule")
        for entry in _rule_match_entries(record):
            rule_name = entry["rule_name"]
            row = rows.setdefault(rule_name, RuleReportRow(rule_name=rule_name))
            if not entry["matched"]:
                continue
            row.match_count += 1
            suppressed_by = entry.get("suppressed_by")
            if isinstance(suppressed_by, str) and suppressed_by:
                row.shadowed_count += 1
                key = (suppressed_by, rule_name)
                shadowing[key] = shadowing.get(key, 0) + 1
            elif winning_rule == rule_name:
                row.win_count += 1
    return PerRuleReport(rules=rows, shadowing_matrix=shadowing)


def render_markdown_report(report: PerRuleReport) -> str:
    lines = [
        "| Rule | Matches | Wins | Shadowed |",
        "| --- | ---: | ---: | ---: |",
    ]
    for row in _sorted_rows(report):
        lines.append(
            f"| {row.rule_name} | {row.match_count} | "
            f"{row.win_count} | {row.shadowed_count} |"
        )
    lines.extend(
        [
            "",
            "| Shadower | Shadowed | Count |",
            "| --- | --- | ---: |",
        ]
    )
    for (shadower, shadowed), count in _sorted_shadowing(report):
        lines.append(f"| {shadower} | {shadowed} | {count} |")
    return "\n".join(lines)


def render_text_report(report: PerRuleReport) -> str:
    lines = ["rule match_count win_count shadowed_count"]
    for row in _sorted_rows(report):
        lines.append(
            f"{row.rule_name} {row.match_count} {row.win_count} {row.shadowed_count}"
        )
    if report.shadowing_matrix:
        lines.append("")
        lines.append("shadowing_matrix")
        for (shadower, shadowed), count in _sorted_shadowing(report):
            lines.append(f"{shadower} -> {shadowed}: {count}")
    return "\n".join(lines)


def report_to_jsonable(report: PerRuleReport) -> dict[str, Any]:
    return {
        "rules": [
            {
                "rule_name": row.rule_name,
                "match_count": row.match_count,
                "win_count": row.win_count,
                "shadowed_count": row.shadowed_count,
            }
            for row in _sorted_rows(report)
        ],
        "shadowing_matrix": [
            {
                "shadower": shadower,
                "shadowed": shadowed,
                "count": count,
            }
            for (shadower, shadowed), count in _sorted_shadowing(report)
        ],
    }


def _rule_match_entries(record: dict[str, Any]) -> list[dict[str, Any]]:
    raw_entries = record.get("rule_matches")
    if not isinstance(raw_entries, list):
        return []
    entries: list[dict[str, Any]] = []
    for raw_entry in raw_entries:
        if not isinstance(raw_entry, dict):
            continue
        rule_name = raw_entry.get("rule_name")
        matched = raw_entry.get("matched")
        if not isinstance(rule_name, str) or not isinstance(matched, bool):
            continue
        entries.append(
            {
                "rule_name": rule_name,
                "matched": matched,
                "suppressed_by": raw_entry.get("suppressed_by"),
            }
        )
    return entries


def _sorted_rows(report: PerRuleReport) -> list[RuleReportRow]:
    return sorted(
        report.rules.values(),
        key=lambda row: (-row.match_count, -row.win_count, row.rule_name),
    )


def _sorted_shadowing(report: PerRuleReport) -> list[tuple[tuple[str, str], int]]:
    return sorted(
        report.shadowing_matrix.items(),
        key=lambda item: (-item[1], item[0][0], item[0][1]),
    )


def _build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("decision_log", type=Path)
    parser.add_argument("--strategy", help="Filter to one strategy/config id.")
    parser.add_argument(
        "--format",
        choices=("markdown", "text", "json"),
        default="markdown",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _build_arg_parser().parse_args(argv)
    report = summarize_rule_matches(
        args.decision_log.read_text().splitlines(),
        strategy=args.strategy,
    )
    if args.format == "json":
        print(json.dumps(report_to_jsonable(report), indent=2, sort_keys=True))
    elif args.format == "text":
        print(render_text_report(report))
    else:
        print(render_markdown_report(report))
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
