"""Shared compare-payload row extraction and formatting helpers."""

from __future__ import annotations

import csv
from io import StringIO
from typing import Any

from scripts.backtesting.compare_payload import (
    VerificationError,
    iter_normalized_points,
    portfolio_weights,
    select_strategy_id,
)

DECISION_COLUMNS = (
    "DATE",
    "SIGNAL",
    "REGIME",
    "RAW",
    "CONF",
    "RULE_GROUP",
    "REASON",
    "ATH_EVENT",
    "CROSS_EVENT",
    "ACTION",
    "ZONE",
    "DMA_DIST",
)

EXECUTION_COLUMNS = (
    "DATE",
    "SIGNAL",
    "ACTION",
    "EXECUTED",
    "EVENT",
    "BLOCK_REASON",
    "REASON",
    "RULE_GROUP",
    "ATH_EVENT",
    "CROSS_EVENT",
    "ZONE",
    "BUY_STR",
    "SIDEWAYS_OK",
    "LEG",
    "LEG_CAP_USD",
    "LEG_SPENT_USD",
    "BUY_GATE",
    "SPOT_PCT",
    "STABLE_PCT",
)


def _format_text(value: Any) -> str:
    if value in (None, ""):
        return ""
    return str(value)


def _format_float(value: Any, digits: int = 4) -> str:
    try:
        return f"{float(value):.{digits}f}"
    except (TypeError, ValueError):
        return ""


def _format_distance(value: Any) -> str:
    try:
        return f"{float(value) * 100.0:+.2f}%"
    except (TypeError, ValueError):
        return ""


def _format_bool(value: Any) -> str:
    if value is None:
        return ""
    return "true" if bool(value) else "false"


def _format_pct(value: float) -> str:
    return f"{value * 100.0:.2f}%"


def classify_action(decision: dict[str, Any]) -> str:
    rule_group = decision.get("rule_group")
    if rule_group == "cross":
        return "CROSS"
    action = str(decision.get("action") or "hold").upper()
    return action


def extract_decision_rows(
    timeline: list[dict[str, Any]],
    strategy_id: str,
) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    for point in iter_normalized_points(timeline, strategy_id):
        signal = point["signal"]
        if signal is None:
            continue
        decision = point["decision"]
        date_value = point["date"]
        dma = signal["dma"]
        rows.append(
            {
                "DATE": date_value,
                "SIGNAL": _format_text(signal.get("id")),
                "REGIME": _format_text(signal.get("regime")),
                "RAW": _format_float(signal.get("raw_value"), digits=1),
                "CONF": _format_float(signal.get("confidence"), digits=2),
                "RULE_GROUP": _format_text(decision.get("rule_group")),
                "REASON": _format_text(decision.get("reason")),
                "ATH_EVENT": _format_text(signal.get("ath_event")),
                "CROSS_EVENT": _format_text(dma.get("cross_event")),
                "ACTION": classify_action(decision),
                "ZONE": _format_text(dma.get("zone")),
                "DMA_DIST": _format_distance(dma.get("distance")),
            }
        )
    return rows


def extract_execution_rows(
    timeline: list[dict[str, Any]],
    strategy_id: str,
) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    for point in iter_normalized_points(timeline, strategy_id):
        signal = point["signal"]
        if signal is None:
            continue
        date_value = point["date"]
        decision = point["decision"]
        execution = point["execution"]
        dma = signal["dma"]
        buy_gate = execution["buy_gate"]
        event = execution.get("event")
        action = classify_action(decision)
        executed = event == "rebalance"
        blocked_reason = execution.get("blocked_reason")
        if not executed and action != "HOLD" and blocked_reason is None:
            blocked_reason = "signal_not_executed"
        weights = portfolio_weights(point)
        rows.append(
            {
                "DATE": date_value,
                "SIGNAL": _format_text(signal.get("id")),
                "ACTION": action,
                "EXECUTED": "true" if executed else "false",
                "EVENT": _format_text(event),
                "BLOCK_REASON": _format_text(blocked_reason),
                "REASON": _format_text(decision.get("reason")),
                "RULE_GROUP": _format_text(decision.get("rule_group")),
                "ATH_EVENT": _format_text(signal.get("ath_event")),
                "CROSS_EVENT": _format_text(dma.get("cross_event")),
                "ZONE": _format_text(dma.get("zone")),
                "BUY_STR": _format_float(buy_gate.get("buy_strength"), digits=6),
                "SIDEWAYS_OK": _format_bool(buy_gate.get("sideways_confirmed")),
                "LEG": _format_text(buy_gate.get("leg_index")),
                "LEG_CAP_USD": _format_float(buy_gate.get("leg_cap_usd"), digits=6),
                "LEG_SPENT_USD": _format_float(buy_gate.get("leg_spent_usd"), digits=6),
                "BUY_GATE": _format_text(buy_gate.get("block_reason")),
                "SPOT_PCT": _format_pct(weights["spot"]),
                "STABLE_PCT": _format_pct(weights["stable"]),
            }
        )
    return rows


def filter_rows_by_date(
    rows: list[dict[str, str]], date_filter: str | None
) -> list[dict[str, str]]:
    if date_filter is None:
        return rows
    filtered = [row for row in rows if row["DATE"] == date_filter]
    if not filtered:
        raise VerificationError(f"Date {date_filter} was not found in rows.")
    return filtered


def format_table(rows: list[dict[str, str]], columns: tuple[str, ...]) -> str:
    if not rows:
        return "(no data)"
    widths = {column: len(column) for column in columns}
    for row in rows:
        for column in columns:
            widths[column] = max(widths[column], len(row.get(column, "")))
    header = "  ".join(column.ljust(widths[column]) for column in columns)
    lines = [header]
    for row in rows:
        lines.append(
            "  ".join(row.get(column, "").ljust(widths[column]) for column in columns)
        )
    return "\n".join(lines)


def format_csv(rows: list[dict[str, str]], columns: tuple[str, ...]) -> str:
    if not rows:
        return ""
    output = StringIO()
    writer = csv.DictWriter(output, fieldnames=list(columns))
    writer.writeheader()
    writer.writerows(rows)
    return output.getvalue()


def select_rows(
    timeline: list[dict[str, Any]],
    *,
    strategy_id: str | None,
    row_type: str,
    date_filter: str | None = None,
    filter_mode: str | None = None,
) -> list[dict[str, str]]:
    selected_id = select_strategy_id(timeline, strategy_id)
    if row_type == "decision":
        rows = extract_decision_rows(timeline, selected_id)
        if filter_mode == "hold":
            rows = [row for row in rows if row["ACTION"] == "HOLD"]
        elif filter_mode == "trade":
            rows = [row for row in rows if row["ACTION"] != "HOLD"]
    elif row_type == "execution":
        rows = extract_execution_rows(timeline, selected_id)
    else:  # pragma: no cover
        raise ValueError(f"Unsupported row_type: {row_type}")
    return filter_rows_by_date(rows, date_filter)


__all__ = [
    "DECISION_COLUMNS",
    "EXECUTION_COLUMNS",
    "classify_action",
    "extract_decision_rows",
    "extract_execution_rows",
    "filter_rows_by_date",
    "format_csv",
    "format_table",
    "select_rows",
]
