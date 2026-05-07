"""Plain-text compare rollups for analyze_compare.py."""

from __future__ import annotations

import json
from collections import Counter, defaultdict
from typing import Any

from src.services.backtesting.audit import format_decision_log_lines


def render_summary(
    *,
    payload: dict[str, Any],
    strategy_id: str,
    base_strategy_id: str | None = None,
    decision_log_lines: list[str] | None = None,
    constraint_validation: dict[str, Any] | None = None,
) -> str:
    timeline = _timeline(payload)
    summary = _strategy_summary(payload, strategy_id)
    lines = [
        _header_line(payload=payload, strategy_id=strategy_id),
        _metrics_line(summary),
        "",
        "rules fired:",
    ]
    decisions = _decision_rows(
        decision_log_lines
        if decision_log_lines is not None
        else format_decision_log_lines(timeline=timeline, strategy_ids=[strategy_id]),
        strategy_id=strategy_id,
    )
    lines.extend(
        _rule_lines(decisions=decisions, timeline=timeline, strategy_id=strategy_id)
    )
    lines.extend(["", _regime_line(timeline)])
    validation_line = _validation_line(constraint_validation)
    if validation_line is not None:
        lines.extend(["", validation_line])
    if base_strategy_id:
        lines.extend(
            [
                "",
                f"diff vs {base_strategy_id} (base):",
                _diff_line(
                    payload, strategy_id=strategy_id, base_strategy_id=base_strategy_id
                ),
            ]
        )
    return "\n".join(lines[:80])


def _timeline(payload: dict[str, Any]) -> list[dict[str, Any]]:
    timeline = payload.get("timeline")
    return (
        [point for point in timeline if isinstance(point, dict)]
        if isinstance(timeline, list)
        else []
    )


def _strategy_summary(payload: dict[str, Any], strategy_id: str) -> dict[str, Any]:
    strategies = payload.get("strategies")
    if not isinstance(strategies, dict):
        return {}
    summary = strategies.get(strategy_id)
    return summary if isinstance(summary, dict) else {}


def _header_line(*, payload: dict[str, Any], strategy_id: str) -> str:
    window = payload.get("window")
    effective = window.get("effective") if isinstance(window, dict) else None
    if isinstance(effective, dict):
        start = effective.get("start_date", "?")
        end = effective.get("end_date", "?")
        days = effective.get("days", "?")
    else:
        dates = [
            str(point.get("market", {}).get("date"))
            for point in _timeline(payload)
            if isinstance(point.get("market"), dict)
        ]
        start = dates[0] if dates else "?"
        end = dates[-1] if dates else "?"
        days = len(dates)
    return f"strategy: {strategy_id}  window: {start} .. {end}  {days} days"


def _metrics_line(summary: dict[str, Any]) -> str:
    return (
        f"ROI: {_format_pct(summary.get('roi_percent'))}  "
        f"Calmar: {_format_float(summary.get('calmar_ratio'))}  "
        f"MaxDD: {_format_pct(summary.get('max_drawdown_percent'))}  "
        f"Trades: {_format_int(summary.get('trade_count'))}"
    )


def _decision_rows(lines: list[str], *, strategy_id: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for line in lines:
        try:
            row = json.loads(line)
        except json.JSONDecodeError:
            continue
        if not isinstance(row, dict):
            continue
        if row.get("strategy") != strategy_id:
            continue
        rows.append(row)
    return rows


def _rule_lines(
    *,
    decisions: list[dict[str, Any]],
    timeline: list[dict[str, Any]],
    strategy_id: str,
) -> list[str]:
    if not decisions:
        return ["  none                         0  (no decisions in selected window)"]
    counts = Counter(str(row.get("rule") or "unknown") for row in decisions)
    executed = Counter(
        str(row.get("rule") or "unknown")
        for row in decisions
        if row.get("executed") is True
    )
    pnl_by_rule = _next_day_return_by_rule(
        decisions=decisions,
        timeline=timeline,
        strategy_id=strategy_id,
    )
    out: list[str] = []
    for rule, count in counts.most_common():
        executed_count = executed.get(rule, 0)
        held = count - executed_count
        suffix = (
            f"{_format_pct(pnl_by_rule[rule])} next-day"
            if rule in pnl_by_rule
            else "held"
            if executed_count == 0
            else f"{executed_count} executed"
        )
        if held and executed_count:
            suffix += f", {held} held"
        out.append(f"  {rule:<28} {count:>3}  ({suffix})")
    return out


def _next_day_return_by_rule(
    *,
    decisions: list[dict[str, Any]],
    timeline: list[dict[str, Any]],
    strategy_id: str,
) -> dict[str, float]:
    values: dict[str, float] = {}
    dates: list[str] = []
    for point in timeline:
        market = point.get("market")
        strategies = point.get("strategies")
        if not isinstance(market, dict) or not isinstance(strategies, dict):
            continue
        date_value = market.get("date")
        state = strategies.get(strategy_id)
        if not isinstance(date_value, str) or not isinstance(state, dict):
            continue
        portfolio = state.get("portfolio")
        if not isinstance(portfolio, dict):
            continue
        total = portfolio.get("total_value")
        if isinstance(total, int | float):
            dates.append(date_value)
            values[date_value] = float(total)
    next_date = dict(zip(dates, dates[1:], strict=False))
    totals: dict[str, list[float]] = defaultdict(list)
    for row in decisions:
        date_value = row.get("date")
        if not isinstance(date_value, str) or date_value not in next_date:
            continue
        current = values.get(date_value)
        nxt = values.get(next_date[date_value])
        if current is None or nxt is None or current <= 0.0:
            continue
        totals[str(row.get("rule") or "unknown")].append(
            ((nxt / current) - 1.0) * 100.0
        )
    return {rule: sum(items) for rule, items in totals.items() if items}


def _regime_line(timeline: list[dict[str, Any]]) -> str:
    counts = Counter()
    for point in timeline:
        market = point.get("market")
        if isinstance(market, dict):
            label = market.get("sentiment_label")
            if isinstance(label, str) and label:
                counts[label] += 1
    if not counts:
        return "regime time: unavailable"
    ordered = ["extreme_fear", "fear", "neutral", "greed", "extreme_greed"]
    parts = [f"{label} {counts[label]}d" for label in ordered if counts[label]]
    parts.extend(
        f"{label} {count}d"
        for label, count in sorted(counts.items())
        if label not in ordered
    )
    return "regime time:\n  " + "   ".join(parts)


def _validation_line(validation: dict[str, Any] | None) -> str | None:
    if not validation:
        return None
    if validation.get("enabled") is False:
        return "validation: disabled"
    return (
        "validation: "
        f"passed={validation.get('passed')} "
        f"checked={validation.get('checked')} "
        f"violations={len(validation.get('violations', []))}"
    )


def _diff_line(
    payload: dict[str, Any],
    *,
    strategy_id: str,
    base_strategy_id: str,
) -> str:
    strategy = _strategy_summary(payload, strategy_id)
    base = _strategy_summary(payload, base_strategy_id)
    if not strategy or not base:
        return "  unavailable"
    return (
        f"  ROI: {_format_pp_delta(strategy.get('roi_percent'), base.get('roi_percent'))}    "
        f"Calmar: {_format_delta(strategy.get('calmar_ratio'), base.get('calmar_ratio'))}    "
        f"MaxDD: {_format_pp_delta(strategy.get('max_drawdown_percent'), base.get('max_drawdown_percent'))}"
    )


def _format_pct(value: Any) -> str:
    if not isinstance(value, int | float):
        return "n/a"
    return f"{float(value):+.2f}%"


def _format_float(value: Any) -> str:
    if not isinstance(value, int | float):
        return "n/a"
    return f"{float(value):.2f}"


def _format_int(value: Any) -> str:
    if not isinstance(value, int | float):
        return "n/a"
    return str(int(value))


def _format_pp_delta(value: Any, base: Any) -> str:
    if not isinstance(value, int | float) or not isinstance(base, int | float):
        return "n/a"
    return f"{float(value) - float(base):+.2f}pp"


def _format_delta(value: Any, base: Any) -> str:
    if not isinstance(value, int | float) or not isinstance(base, int | float):
        return "n/a"
    return f"{float(value) - float(base):+.2f}"


__all__ = ["render_summary"]
