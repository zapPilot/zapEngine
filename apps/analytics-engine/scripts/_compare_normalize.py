"""Payload loading and timeline normalization for compare-v3 diagnostics."""

from __future__ import annotations

from typing import Any

from scripts._compare_common import VerificationError, _parse_date


def load_payload(source: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(source, dict):
        raise VerificationError("Compare payload root must be an object.")
    return source


def load_timeline(source: dict[str, Any]) -> list[dict[str, Any]]:
    payload = load_payload(source)
    timeline = payload.get("timeline")
    if not isinstance(timeline, list) or not timeline:
        raise VerificationError("No timeline found in response.")
    out: list[dict[str, Any]] = []
    for index, point in enumerate(timeline):
        if not isinstance(point, dict):
            raise VerificationError(f"timeline[{index}] must be an object.")
        out.append(point)
    return out


def require_mapping(value: Any, *, label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise VerificationError(f"{label} must be an object.")
    return value


def timeline_date(point: dict[str, Any]) -> str:
    market = point.get("market")
    if isinstance(market, dict):
        date_value = market.get("date")
        if isinstance(date_value, str) and date_value:
            return date_value
    legacy_date = point.get("date")
    if isinstance(legacy_date, str) and legacy_date:
        return legacy_date
    raise VerificationError("Each timeline point must include a non-empty date string.")


def select_strategy_id(
    timeline: list[dict[str, Any]],
    strategy_id: str | None = None,
) -> str:
    available: list[str] = sorted(
        {
            key
            for point in timeline
            if isinstance(point.get("strategies"), dict)
            for key in point["strategies"]
            if isinstance(key, str)
        }
    )
    if not available:
        raise VerificationError("No strategy found in timeline.")
    if strategy_id is not None:
        if strategy_id not in available:
            raise VerificationError(
                f"Unknown strategy_id '{strategy_id}'. Available strategy ids: {', '.join(available)}."
            )
        return strategy_id
    if len(available) > 1:
        raise VerificationError(
            "Multiple strategy ids found; pass --config-id. "
            f"Available strategy ids: {', '.join(available)}."
        )
    return available[0]


def strategy_point(*, point: dict[str, Any], strategy_id: str) -> dict[str, Any]:
    date_value = timeline_date(point)
    strategies = require_mapping(
        point.get("strategies"), label=f"timeline[{date_value}].strategies"
    )
    strategy_state = strategies.get(strategy_id)
    if strategy_state is None:
        raise VerificationError(
            f"timeline[{date_value}] is missing strategy '{strategy_id}'."
        )
    return require_mapping(
        strategy_state, label=f"timeline[{date_value}].strategies['{strategy_id}']"
    )


def normalize_signal(raw_signal: Any) -> dict[str, Any] | None:
    if not isinstance(raw_signal, dict):
        return None
    details = raw_signal.get("details")
    normalized_details = dict(details) if isinstance(details, dict) else {}

    ath_event = raw_signal.get("ath_event")
    if ath_event is None:
        ath_event = normalized_details.get("ath_event")
    if ath_event is not None and "ath_event" not in normalized_details:
        normalized_details["ath_event"] = ath_event

    dma = raw_signal.get("dma")
    if not isinstance(dma, dict):
        candidate_dma = normalized_details.get("dma")
        dma = dict(candidate_dma) if isinstance(candidate_dma, dict) else {}
    else:
        dma = dict(dma)
        normalized_details.setdefault("dma", dict(dma))

    ratio = raw_signal.get("ratio")
    if not isinstance(ratio, dict):
        candidate_ratio = normalized_details.get("ratio")
        ratio = dict(candidate_ratio) if isinstance(candidate_ratio, dict) else {}
    else:
        ratio = dict(ratio)
        normalized_details.setdefault("ratio", dict(ratio))

    spy_dma = raw_signal.get("spy_dma")
    if not isinstance(spy_dma, dict):
        candidate_spy_dma = normalized_details.get("spy_dma")
        spy_dma = dict(candidate_spy_dma) if isinstance(candidate_spy_dma, dict) else {}
    else:
        spy_dma = dict(spy_dma)
        normalized_details.setdefault("spy_dma", dict(spy_dma))

    signal_id = raw_signal.get("id")
    if not isinstance(signal_id, str) or not signal_id:
        signal_id = raw_signal.get("signal_id")

    return {
        "id": signal_id,
        "regime": raw_signal.get("regime"),
        "raw_value": raw_signal.get("raw_value"),
        "confidence": raw_signal.get("confidence"),
        "ath_event": ath_event,
        "dma": dma,
        "ratio": ratio,
        "spy_dma": spy_dma,
        "details": normalized_details,
    }


def normalize_execution(raw_execution: Any) -> dict[str, Any]:
    execution = require_mapping(raw_execution, label="execution")
    diagnostics = execution.get("diagnostics")
    normalized_diagnostics = dict(diagnostics) if isinstance(diagnostics, dict) else {}
    plugins = normalized_diagnostics.get("plugins")
    if not isinstance(plugins, dict):
        plugins = {}
    normalized_diagnostics["plugins"] = dict(plugins)

    buy_gate = execution.get("buy_gate")
    if not isinstance(buy_gate, dict):
        candidate = normalized_diagnostics["plugins"].get("dma_buy_gate")
        buy_gate = dict(candidate) if isinstance(candidate, dict) else {}
    else:
        buy_gate = dict(buy_gate)

    return {
        "event": execution.get("event"),
        "transfers": execution.get("transfers", []),
        "blocked_reason": execution.get("blocked_reason"),
        "step_count": execution.get("step_count", 0),
        "steps_remaining": execution.get("steps_remaining", 0),
        "interval_days": execution.get("interval_days", 0),
        "diagnostics": normalized_diagnostics,
        "buy_gate": buy_gate,
    }


def normalize_strategy_state(raw_state: dict[str, Any]) -> dict[str, Any]:
    return {
        "portfolio": raw_state.get("portfolio"),
        "signal": normalize_signal(raw_state.get("signal")),
        "decision": require_mapping(raw_state.get("decision"), label="decision"),
        "execution": normalize_execution(raw_state.get("execution")),
    }


def iter_normalized_points(
    timeline: list[dict[str, Any]],
    strategy_id: str,
) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for point in timeline:
        date_value = timeline_date(point)
        market = require_mapping(point.get("market"), label=f"{date_value}.market")
        normalized = normalize_strategy_state(
            strategy_point(point=point, strategy_id=strategy_id)
        )
        out.append(
            {
                "date": date_value,
                "market": market,
                "portfolio": normalized["portfolio"],
                "signal": normalized["signal"],
                "decision": normalized["decision"],
                "execution": normalized["execution"],
                "raw_point": point,
            }
        )
    return out


def _filter_points(
    points: list[dict[str, Any]],
    *,
    date_filter: str | None,
    from_date: str | None,
    to_date: str | None,
) -> list[dict[str, Any]]:
    if date_filter is not None and (from_date is not None or to_date is not None):
        raise VerificationError("--date cannot be combined with --from-date/--to-date.")
    if date_filter is not None:
        filtered = [point for point in points if point["date"] == date_filter]
        if not filtered:
            raise VerificationError(f"Date {date_filter} was not found in timeline.")
        return filtered

    start = _parse_date(from_date) if from_date else None
    end = _parse_date(to_date) if to_date else None
    if start and end and start > end:
        raise VerificationError("--from-date must be on or before --to-date.")

    filtered = []
    for point in points:
        current = _parse_date(point["date"])
        if start and current < start:
            continue
        if end and current > end:
            continue
        filtered.append(point)
    if (from_date or to_date) and not filtered:
        raise VerificationError("No timeline points matched the requested date range.")
    return filtered
