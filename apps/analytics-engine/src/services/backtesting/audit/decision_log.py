"""Compact JSONL decision-log formatter."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

ASSET_KEYS = ("btc", "eth", "spy", "stable", "alt")
_EPSILON = 1e-9


def format_decision_log_line(
    *,
    strategy_id: str,
    point: dict[str, Any],
    prior_target: dict[str, float] | None = None,
) -> str:
    decision = _mapping(point.get("decision"))
    details = _mapping(decision.get("details"))
    target = _target_allocation(decision)
    payload = {
        "date": str(point.get("date", "")),
        "strategy": strategy_id,
        "action": str(decision.get("action", "hold")),
        "rule": _matched_rule(decision, details),
        "group": str(decision.get("rule_group", "none")),
        "reason": str(decision.get("reason", "")),
        "score": _round_number(details.get("decision_score"), digits=4),
        "signals": _signals_consulted(details),
        "target_diff": _target_diff(prior_target or {}, target),
        "target": _target_name(details),
        "executed": _executed(point),
    }
    return json.dumps(payload, sort_keys=False, separators=(",", ":"))


def format_decision_log_lines(
    *,
    timeline: list[dict[str, Any]],
    strategy_ids: list[str] | None = None,
) -> list[str]:
    if not timeline:
        return []
    resolved_strategy_ids = strategy_ids or _strategy_ids(timeline)
    prior_targets: dict[str, dict[str, float]] = {
        strategy_id: {} for strategy_id in resolved_strategy_ids
    }
    lines: list[str] = []
    for timeline_point in timeline:
        date_value = _timeline_date(timeline_point)
        strategies = _mapping(timeline_point.get("strategies"))
        for strategy_id in resolved_strategy_ids:
            strategy_state = _mapping(strategies.get(strategy_id))
            if not strategy_state:
                continue
            point = {"date": date_value, **strategy_state}
            line = format_decision_log_line(
                strategy_id=strategy_id,
                point=point,
                prior_target=prior_targets.get(strategy_id),
            )
            lines.append(line)
            prior_targets[strategy_id] = _target_allocation(
                _mapping(strategy_state.get("decision"))
            )
    return lines


def write_decision_log(
    *,
    output_dir: Path,
    timeline: list[dict[str, Any]],
    strategy_ids: list[str] | None = None,
) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    path = output_dir / "decisions.jsonl"
    lines = format_decision_log_lines(timeline=timeline, strategy_ids=strategy_ids)
    path.write_text("\n".join(lines) + ("\n" if lines else ""))
    return path


def _strategy_ids(timeline: list[dict[str, Any]]) -> list[str]:
    seen: list[str] = []
    for point in timeline:
        strategies = _mapping(point.get("strategies"))
        for strategy_id in strategies:
            if isinstance(strategy_id, str) and strategy_id not in seen:
                seen.append(strategy_id)
    return seen


def _timeline_date(point: dict[str, Any]) -> str:
    market = _mapping(point.get("market"))
    raw_date = market.get("date") or point.get("date")
    return str(raw_date or "")


def _target_allocation(decision: dict[str, Any]) -> dict[str, float]:
    raw_target = _mapping(decision.get("target_allocation"))
    return {
        asset: _float_or_zero(raw_target.get(asset))
        for asset in ASSET_KEYS
        if asset in raw_target
    }


def _target_diff(
    prior_target: dict[str, float],
    current_target: dict[str, float],
) -> dict[str, float]:
    diff: dict[str, float] = {}
    for asset in ASSET_KEYS:
        delta = current_target.get(asset, 0.0) - prior_target.get(asset, 0.0)
        if abs(delta) > _EPSILON:
            diff[asset] = _round_number(delta, digits=6)
    return diff


def _matched_rule(
    decision: dict[str, Any],
    details: dict[str, Any],
) -> str:
    for key in ("matched_rule_name", "allocation_name"):
        value = details.get(key)
        if isinstance(value, str) and value:
            return value
    reason = decision.get("reason")
    return str(reason or "unknown")


def _target_name(details: dict[str, Any]) -> str | None:
    value = details.get("allocation_name")
    return value if isinstance(value, str) and value else None


def _signals_consulted(details: dict[str, Any]) -> dict[str, Any]:
    raw = details.get("signals_consulted")
    if not isinstance(raw, dict):
        raw = details.get("signals")
    if not isinstance(raw, dict):
        return {}
    return {
        str(key): _json_scalar(value)
        for key, value in raw.items()
        if isinstance(key, str) and _json_scalar(value) is not None
    }


def _executed(point: dict[str, Any]) -> bool:
    execution = _mapping(point.get("execution"))
    transfers = execution.get("transfers")
    return isinstance(transfers, list) and len(transfers) > 0


def _json_scalar(value: Any) -> Any:
    if isinstance(value, bool | int | float | str) or value is None:
        if isinstance(value, float):
            return _round_number(value, digits=6)
        return value
    return str(value)


def _round_number(value: Any, *, digits: int) -> float:
    if not isinstance(value, int | float) or isinstance(value, bool):
        return 0.0
    rounded = round(float(value), digits)
    if rounded == -0.0:
        return 0.0
    return rounded


def _float_or_zero(value: Any) -> float:
    return (
        float(value)
        if isinstance(value, int | float) and not isinstance(value, bool)
        else 0.0
    )


def _mapping(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


__all__ = [
    "format_decision_log_line",
    "format_decision_log_lines",
    "write_decision_log",
]
