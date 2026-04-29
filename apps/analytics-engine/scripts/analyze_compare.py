"""API-first analyzer for compare-v3 strategy diagnostics."""

from __future__ import annotations

import argparse
import json
import math
from collections import deque
from datetime import date, timedelta
from pathlib import Path
from typing import Any, Literal

AnalysisProfile = Literal[
    "eth-btc-rotation", "spy-eth-btc-rotation", "dma-cross", "raw"
]
OutputFormat = Literal["text", "json", "markdown"]
EnrichMode = Literal["auto", "never", "required"]

DEFAULT_ENDPOINT = "http://localhost:8001"
DEFAULT_COMPARE_PATH = "/api/v3/backtesting/compare"
DEFAULT_SAVED_CONFIG_ID = "eth_btc_rotation_default"
DEFAULT_LOOKBACK_DAYS = 30

SECTION_ORDER = (
    "market",
    "outer_dma",
    "spy_dma",
    "inner_ratio",
    "asset_class",
    "decision",
    "execution",
    "portfolio",
    "consistency",
    "rule",
)


class VerificationError(ValueError):
    """Raised when compare-payload tooling encounters invalid data."""


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


def _parse_date(value: str) -> date:
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise VerificationError(
            f"Invalid date '{value}'. Expected YYYY-MM-DD."
        ) from exc


def _format_float(value: Any, digits: int = 6) -> str:
    try:
        return f"{float(value):.{digits}f}"
    except (TypeError, ValueError):
        return "n/a"


def _format_pct(value: Any, digits: int = 2) -> str:
    try:
        return f"{float(value) * 100.0:.{digits}f}%"
    except (TypeError, ValueError):
        return "n/a"


def _safe_float(value: Any) -> float | None:
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return None
    if math.isnan(numeric) or math.isinf(numeric):
        return None
    return numeric


def _safe_mapping(value: Any) -> dict[str, Any]:
    return dict(value) if isinstance(value, dict) else {}


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


def _derive_ratio_metrics(
    points: list[dict[str, Any]],
) -> tuple[dict[str, dict[str, Any]], list[str]]:
    metrics: dict[str, dict[str, Any]] = {}
    warnings: list[str] = []
    ratio_window: deque[float] = deque(maxlen=200)

    for point in points:
        market = _safe_mapping(point.get("market"))
        token_prices = _safe_mapping(market.get("token_price"))
        btc = _safe_float(token_prices.get("btc"))
        eth = _safe_float(token_prices.get("eth"))
        ratio = None
        if btc and eth and btc > 0.0:
            ratio = eth / btc
            ratio_window.append(ratio)
        else:
            warnings.append(
                f"{point['date']}: ETH/BTC ratio unavailable because market.token_price lacks BTC/ETH."
            )

        entry: dict[str, Any] = {
            "ratio": ratio,
            "ratio_dma_200": None,
            "ratio_distance": None,
            "zone": None,
            "cross_event": None,
            "cooldown_active": None,
            "cooldown_remaining_days": None,
            "cooldown_blocked_zone": None,
            "is_above_dma": None,
            "source": "unavailable",
            "unavailable_reason": None,
        }
        if ratio is None:
            entry["unavailable_reason"] = (
                "market.token_price does not include both btc and eth"
            )
        elif len(ratio_window) >= 200:
            ratio_dma_200 = sum(ratio_window) / len(ratio_window)
            entry["ratio_dma_200"] = ratio_dma_200
            entry["ratio_distance"] = (ratio - ratio_dma_200) / ratio_dma_200
            entry["is_above_dma"] = ratio > ratio_dma_200
            entry["zone"] = (
                "above"
                if ratio > ratio_dma_200
                else "below"
                if ratio < ratio_dma_200
                else "at"
            )
            entry["source"] = "compare_window"
        else:
            entry["unavailable_reason"] = (
                f"compare window only has {len(ratio_window)} observed ratios before {point['date']}; need 200 for ratio_dma_200"
            )
        metrics[point["date"]] = entry
    return metrics, warnings


def _load_db_ratio_metrics(
    points: list[dict[str, Any]],
    *,
    enrich_db: EnrichMode,
) -> tuple[dict[str, dict[str, Any]], list[str]]:
    if enrich_db == "never" or not points:
        return {}, []

    first_date = _parse_date(points[0]["date"])
    last_date = _parse_date(points[-1]["date"])
    try:
        from src.core.database import close_database, init_database, session_scope
        from src.services.dependencies import get_query_service
        from src.services.market.token_price_service import TokenPriceService

        init_database()
        try:
            with session_scope() as db:
                service = TokenPriceService(db, get_query_service())
                history = service.get_pair_ratio_dma_history(
                    start_date=first_date,
                    end_date=last_date,
                    base_token_symbol="ETH",
                    quote_token_symbol="BTC",
                )
        finally:
            close_database()
    except Exception as exc:
        if enrich_db == "required":
            raise VerificationError(f"DB enrichment failed: {exc}") from exc
        return {}, [
            f"DB enrichment unavailable; falling back to JSON-only analysis: {exc}"
        ]

    out: dict[str, dict[str, Any]] = {}
    for point_date, payload in history.items():
        date_key = point_date.isoformat()
        ratio = _safe_float(payload.get("ratio"))
        ratio_dma_200 = _safe_float(payload.get("dma_200"))
        ratio_distance = None
        if ratio is not None and ratio_dma_200 is not None and ratio_dma_200 > 0.0:
            ratio_distance = (ratio - ratio_dma_200) / ratio_dma_200
        out[date_key] = {
            "ratio": ratio,
            "ratio_dma_200": ratio_dma_200,
            "ratio_distance": ratio_distance,
            "zone": (
                "above"
                if payload.get("is_above_dma") is True
                else "below"
                if payload.get("is_above_dma") is False
                and ratio_distance not in (None, 0.0)
                else "at"
                if ratio_distance == 0.0
                else None
            ),
            "cross_event": None,
            "cooldown_active": None,
            "cooldown_remaining_days": None,
            "cooldown_blocked_zone": None,
            "is_above_dma": payload.get("is_above_dma"),
            "source": "db",
            "unavailable_reason": None,
        }
    return out, []


def _merge_ratio_metrics(
    compare_metrics: dict[str, dict[str, Any]],
    db_metrics: dict[str, dict[str, Any]],
) -> dict[str, dict[str, Any]]:
    merged = {date_key: dict(payload) for date_key, payload in compare_metrics.items()}
    for date_key, payload in db_metrics.items():
        merged[date_key] = dict(payload)
    return merged


def _merge_runtime_ratio_metrics(
    *,
    derived_metrics: dict[str, Any],
    signal_map: dict[str, Any],
) -> dict[str, Any]:
    merged = dict(derived_metrics)
    runtime_ratio = _safe_mapping(signal_map.get("ratio"))
    if not runtime_ratio:
        return merged

    runtime_ratio_value = _safe_float(runtime_ratio.get("ratio"))
    runtime_ratio_dma = _safe_float(runtime_ratio.get("ratio_dma_200"))
    runtime_ratio_distance = _safe_float(runtime_ratio.get("distance"))
    runtime_zone = runtime_ratio.get("zone")
    runtime_cross_event = runtime_ratio.get("cross_event")

    if runtime_ratio_value is not None:
        merged["ratio"] = runtime_ratio_value
    if runtime_ratio_dma is not None:
        merged["ratio_dma_200"] = runtime_ratio_dma
    if runtime_ratio_distance is not None:
        merged["ratio_distance"] = runtime_ratio_distance
    if runtime_zone in {"above", "below", "at"}:
        merged["zone"] = runtime_zone
        merged["is_above_dma"] = runtime_zone == "above"
    if runtime_cross_event in {"cross_up", "cross_down"}:
        merged["cross_event"] = runtime_cross_event

    for key in (
        "cooldown_active",
        "cooldown_remaining_days",
        "cooldown_blocked_zone",
    ):
        if key in runtime_ratio and runtime_ratio.get(key) is not None:
            merged[key] = runtime_ratio.get(key)

    merged["source"] = "runtime"
    merged["unavailable_reason"] = None
    return merged


def _distance_for_asset(
    *,
    asset_symbol: str,
    token_prices: dict[str, Any],
    dma_200: float,
) -> float | None:
    asset_price = _safe_float(token_prices.get(asset_symbol.lower()))
    if asset_price is None or dma_200 <= 0.0:
        return None
    return (asset_price - dma_200) / dma_200


def _build_consistency(
    point: dict[str, Any],
) -> dict[str, Any]:
    signal = point.get("signal")
    if not isinstance(signal, dict):
        return {"status": "no_signal", "issues": []}
    dma = _safe_mapping(signal.get("dma"))
    dma_200 = _safe_float(dma.get("dma_200"))
    reported_distance = _safe_float(dma.get("distance"))
    reported_zone = dma.get("zone")
    market = _safe_mapping(point.get("market"))
    token_prices = _safe_mapping(market.get("token_price"))
    outer_asset = str(dma.get("outer_dma_asset") or "btc").lower()
    asset_price = _safe_float(token_prices.get(outer_asset))

    issues: list[str] = []
    if (
        dma_200 is None
        or reported_distance is None
        or asset_price is None
        or dma_200 <= 0.0
    ):
        return {
            "status": "insufficient_data",
            "issues": [
                "Could not validate outer DMA consistency from market/token signal data."
            ],
        }

    expected_distance = (asset_price - dma_200) / dma_200
    if abs(expected_distance) < 1e-12:
        expected_zone = "at"
    elif expected_distance > 0.0:
        expected_zone = "above"
    else:
        expected_zone = "below"

    matched_asset = outer_asset
    if abs(reported_distance - expected_distance) > 1e-9:
        matched_asset = "unknown"
        for asset_symbol in sorted(token_prices):
            asset_distance = _distance_for_asset(
                asset_symbol=asset_symbol,
                token_prices=token_prices,
                dma_200=dma_200,
            )
            if asset_distance is None:
                continue
            if abs(reported_distance - asset_distance) <= 1e-9:
                matched_asset = asset_symbol
                break
        if matched_asset == "unknown":
            issues.append(
                f"reported distance {_format_pct(reported_distance, digits=4)} does not match {outer_asset.upper()} distance {_format_pct(expected_distance, digits=4)}"
            )
        elif matched_asset != outer_asset:
            issues.append(
                f"reported distance matches {matched_asset.upper()} price against {outer_asset.upper()} DMA instead of {outer_asset.upper()} price"
            )
    if reported_zone != expected_zone:
        issues.append(
            f"reported zone {reported_zone!r} does not match BTC-vs-DMA zone {expected_zone!r}"
        )

    return {
        "status": "ok" if not issues else "mismatch",
        "reported_distance": reported_distance,
        "expected_distance": expected_distance,
        "reported_zone": reported_zone,
        "expected_zone": expected_zone,
        "matched_asset": matched_asset,
        "outer_dma_asset": outer_asset.upper(),
        "issues": issues,
    }


def _build_rule_summary(
    point: dict[str, Any],
    *,
    ratio_metrics: dict[str, Any],
    consistency: dict[str, Any],
) -> dict[str, Any]:
    decision = _safe_mapping(point.get("decision"))
    execution = _safe_mapping(point.get("execution"))
    target_assets = _safe_mapping(decision.get("target_allocation"))
    reason = str(decision.get("reason") or "")

    if consistency.get("status") == "mismatch":
        return {
            "classification": "anomaly",
            "summary": "Observed outer DMA signal is inconsistent with BTC market data; treat this as engine behavior, not intended strategy logic.",
            "evidence": consistency.get("issues", []),
        }

    if reason == "dma_cross_down":
        return {
            "classification": "intended_rule",
            "summary": "Outer BTC DMA cross_down forced an immediate exit from all risk-on exposure back to stable.",
            "evidence": [
                f"execution={execution.get('event')!r}",
                f"target_allocation={json.dumps(target_assets, sort_keys=True)}",
            ],
        }

    if reason == "dma_cross_up":
        if _safe_float(target_assets.get("eth")) == 1.0:
            inner_ratio_note = "Inner ETH/BTC targeting pointed the full risk-on sleeve to ETH on this date."
        elif _safe_float(target_assets.get("btc")) == 1.0:
            inner_ratio_note = "Inner ETH/BTC targeting pointed the full risk-on sleeve to BTC on this date."
        else:
            inner_ratio_note = (
                "Inner ETH/BTC targeting selected a mixed BTC/ETH sleeve on this date."
            )
        if ratio_metrics.get("source") == "unavailable":
            inner_ratio_note += f" ratio_dma_200 is unavailable from JSON-only analysis ({ratio_metrics.get('unavailable_reason')})."
        return {
            "classification": "intended_rule",
            "summary": "Outer BTC DMA cross_up forced immediate full re-entry into spot.",
            "evidence": [
                inner_ratio_note,
            f"target_allocation={json.dumps(target_assets, sort_keys=True)}",
        ],
    }

    if reason == "spy_dma_cross_down":
        return {
            "classification": "intended_rule",
            "summary": "SPY DMA cross_down zeroed only the SPY sleeve and left the crypto sleeve governed by its own signal.",
            "evidence": [
                f"target_allocation={json.dumps(target_assets, sort_keys=True)}",
                f"execution={execution.get('event')!r}",
            ],
        }

    if reason == "spy_dma_cross_up":
        return {
            "classification": "intended_rule",
            "summary": "SPY DMA cross_up immediately executed the score-derived four-asset target.",
            "evidence": [
                f"target_allocation={json.dumps(target_assets, sort_keys=True)}",
                f"transfers={json.dumps(execution.get('transfers', []), sort_keys=True)}",
            ],
        }

    if reason == "crypto_dma_cross_down":
        return {
            "classification": "intended_rule",
            "summary": "Crypto DMA cross_down zeroed only the BTC/ETH sleeve and left the SPY sleeve governed by its own signal.",
            "evidence": [
                f"target_allocation={json.dumps(target_assets, sort_keys=True)}",
                f"execution={execution.get('event')!r}",
            ],
        }

    if reason == "crypto_dma_cross_up":
        return {
            "classification": "intended_rule",
            "summary": "Crypto DMA cross_up immediately executed the score-derived four-asset target.",
            "evidence": [
                f"target_allocation={json.dumps(target_assets, sort_keys=True)}",
                f"transfers={json.dumps(execution.get('transfers', []), sort_keys=True)}",
            ],
        }


    return {
        "classification": "context",
        "summary": "No special intended-rule narrative was derived for this point.",
        "evidence": [f"reason={reason or 'n/a'}"],
    }


def _build_asset_class_summary(
    *,
    decision: dict[str, Any],
    portfolio: dict[str, Any],
) -> dict[str, Any]:
    target = _safe_mapping(decision.get("target_allocation"))
    current = _safe_mapping(portfolio.get("asset_allocation"))
    return {
        "target_spy": _safe_float(target.get("spy")),
        "target_crypto": (
            (_safe_float(target.get("btc")) or 0.0)
            + (_safe_float(target.get("eth")) or 0.0)
        ),
        "target_stable": _safe_float(target.get("stable")),
        "current_spy": _safe_float(current.get("spy")),
        "current_crypto": (
            (_safe_float(current.get("btc")) or 0.0)
            + (_safe_float(current.get("eth")) or 0.0)
        ),
        "current_stable": _safe_float(current.get("stable")),
        "reason": decision.get("reason"),
        "action": decision.get("action"),
        "immediate": decision.get("immediate"),
    }


def _build_record(
    point: dict[str, Any],
    *,
    ratio_metrics: dict[str, Any],
) -> dict[str, Any]:
    decision = _safe_mapping(point.get("decision"))
    execution = _safe_mapping(point.get("execution"))
    portfolio = _safe_mapping(point.get("portfolio"))
    signal = point.get("signal")
    signal_map = signal if isinstance(signal, dict) else {}
    consistency = _build_consistency(point)
    resolved_ratio_metrics = _merge_runtime_ratio_metrics(
        derived_metrics=ratio_metrics,
        signal_map=signal_map,
    )
    rule = _build_rule_summary(
        point,
        ratio_metrics=resolved_ratio_metrics,
        consistency=consistency,
    )
    return {
        "date": point["date"],
        "market": point["market"],
        "outer_dma": _safe_mapping(signal_map.get("dma")),
        "spy_dma": _safe_mapping(signal_map.get("spy_dma")),
        "inner_ratio": resolved_ratio_metrics,
        "asset_class": _build_asset_class_summary(
            decision=decision,
            portfolio=portfolio,
        ),
        "decision": decision,
        "execution": execution,
        "portfolio": portfolio,
        "consistency": consistency,
        "rule": rule,
    }


def _default_sections(profile: AnalysisProfile) -> tuple[str, ...]:
    if profile == "raw":
        return ("market", "decision", "execution", "portfolio")
    if profile == "dma-cross":
        return (
            "market",
            "outer_dma",
            "decision",
            "execution",
            "portfolio",
            "consistency",
            "rule",
        )
    if profile == "spy-eth-btc-rotation":
        return (
            "market",
            "outer_dma",
            "spy_dma",
            "inner_ratio",
            "asset_class",
            "decision",
            "execution",
            "portfolio",
            "rule",
        )
    return SECTION_ORDER


def _selected_sections(
    profile: AnalysisProfile,
    requested_sections: list[str] | None,
) -> tuple[str, ...]:
    if not requested_sections:
        return _default_sections(profile)
    if profile == "raw":
        return tuple(
            section for section in requested_sections if section in SECTION_ORDER
        )
    sections = tuple(dict.fromkeys(requested_sections))
    return sections


def _render_text_context(context: dict[str, Any] | None) -> list[str]:
    if not context:
        return []
    lines = ["LOOKBACK_CONTEXT"]
    latest = _safe_mapping(context.get("latest_before_window"))
    if latest:
        lines.append(
            "LATEST "
            + " ".join(
                (
                    f"date={latest.get('date')}",
                    f"action={latest.get('action')}",
                    f"reason={latest.get('reason')}",
                    f"event={latest.get('event')}",
                    f"cross_event={latest.get('outer_dma_cross_event')}",
                    f"allocation={json.dumps(latest.get('allocation'), sort_keys=True)}",
                    f"asset_allocation={json.dumps(latest.get('asset_allocation'), sort_keys=True)}",
                    f"spot_asset={latest.get('spot_asset')}",
                )
            )
        )
    for event in context.get("events", []):
        if isinstance(event, dict):
            lines.append(
                "EVENT "
                + " ".join(
                    (
                        f"date={event.get('date')}",
                        f"kind={event.get('kind')}",
                        f"action={event.get('action')}",
                        f"reason={event.get('reason')}",
                        f"event={event.get('event')}",
                        f"cross_event={event.get('outer_dma_cross_event')}",
                        f"allocation={json.dumps(event.get('allocation'), sort_keys=True)}",
                        f"asset_allocation={json.dumps(event.get('asset_allocation'), sort_keys=True)}",
                    )
                )
            )
    return lines


def _render_text(
    records: list[dict[str, Any]],
    sections: tuple[str, ...],
    warnings: list[str],
    lookback_context: dict[str, Any] | None = None,
) -> str:
    lines: list[str] = []
    if warnings:
        lines.append("WARNINGS")
        for warning in warnings:
            lines.append(f"- {warning}")
        lines.append("")
    context_lines = _render_text_context(lookback_context)
    if context_lines:
        lines.extend(context_lines)
        lines.append("")
    for index, record in enumerate(records):
        if index:
            lines.append("")
        lines.append(f"DATE {record['date']}")
        for section in sections:
            lines.extend(_render_text_section(section, record))
    return "\n".join(lines).rstrip()


def _render_text_section(section: str, record: dict[str, Any]) -> list[str]:
    if section == "market":
        market = _safe_mapping(record["market"])
        token_prices = _safe_mapping(market.get("token_price"))
        ratio = record["inner_ratio"].get("ratio")
        return [
            f"MARKET btc={_format_float(token_prices.get('btc'))} eth={_format_float(token_prices.get('eth'))} spy={_format_float(token_prices.get('spy'))} eth_btc_ratio={_format_float(ratio)} sentiment={market.get('sentiment')} label={market.get('sentiment_label')}",
        ]
    if section == "outer_dma":
        dma = _safe_mapping(record["outer_dma"])
        return [
            f"OUTER_DMA dma_200={_format_float(dma.get('dma_200'))} distance={_format_pct(dma.get('distance'))} zone={dma.get('zone')} cross_event={dma.get('cross_event')}",
        ]
    if section == "spy_dma":
        spy_dma = _safe_mapping(record["spy_dma"])
        return [
            f"SPY_DMA dma_200={_format_float(spy_dma.get('dma_200'))} distance={_format_pct(spy_dma.get('distance'))} zone={spy_dma.get('zone')} cross_event={spy_dma.get('cross_event')} cooldown_active={spy_dma.get('cooldown_active')} cooldown_remaining_days={spy_dma.get('cooldown_remaining_days')}",
        ]
    if section == "inner_ratio":
        ratio = _safe_mapping(record["inner_ratio"])
        return [
            "INNER_RATIO "
            + " ".join(
                (
                    f"ratio={_format_float(ratio.get('ratio'))}",
                    f"ratio_dma_200={_format_float(ratio.get('ratio_dma_200')) if ratio.get('ratio_dma_200') is not None else 'unavailable'}",
                    f"ratio_distance={_format_pct(ratio.get('ratio_distance')) if ratio.get('ratio_distance') is not None else 'unavailable'}",
                    f"zone={ratio.get('zone')}",
                    f"cross_event={ratio.get('cross_event')}",
                    f"cooldown_active={ratio.get('cooldown_active')}",
                    f"cooldown_remaining_days={ratio.get('cooldown_remaining_days')}",
                    f"cooldown_blocked_zone={ratio.get('cooldown_blocked_zone')}",
                    f"is_above_dma={ratio.get('is_above_dma')}",
                    f"source={ratio.get('source')}",
                    f"reason={ratio.get('unavailable_reason') or ''}".rstrip(),
                )
            ).strip()
        ]
    if section == "asset_class":
        asset_class = _safe_mapping(record["asset_class"])
        return [
            "ASSET_CLASS "
            + " ".join(
                (
                    f"target_spy={_format_pct(asset_class.get('target_spy'))}",
                    f"target_crypto={_format_pct(asset_class.get('target_crypto'))}",
                    f"target_stable={_format_pct(asset_class.get('target_stable'))}",
                    f"current_spy={_format_pct(asset_class.get('current_spy'))}",
                    f"current_crypto={_format_pct(asset_class.get('current_crypto'))}",
                    f"current_stable={_format_pct(asset_class.get('current_stable'))}",
                    f"reason={asset_class.get('reason')}",
                    f"immediate={asset_class.get('immediate')}",
                )
            )
        ]
    if section == "decision":
        decision = _safe_mapping(record["decision"])
        return [
            "DECISION "
            + " ".join(
                (
                    f"action={decision.get('action')}",
                    f"reason={decision.get('reason')}",
                    f"rule_group={decision.get('rule_group')}",
                    f"immediate={decision.get('immediate')}",
            f"target_allocation={json.dumps(decision.get('target_allocation'), sort_keys=True)}",
                )
            )
        ]
    if section == "execution":
        execution = _safe_mapping(record["execution"])
        return [
            "EXECUTION "
            + " ".join(
                (
                    f"event={execution.get('event')}",
                    f"blocked_reason={execution.get('blocked_reason')}",
                    f"transfers={json.dumps(execution.get('transfers', []), sort_keys=True)}",
                )
            )
        ]
    if section == "portfolio":
        portfolio = _safe_mapping(record["portfolio"])
        return [
            "PORTFOLIO "
            + " ".join(
                (
                    f"allocation={json.dumps(portfolio.get('allocation'), sort_keys=True)}",
                    f"asset_allocation={json.dumps(portfolio.get('asset_allocation'), sort_keys=True)}",
                    f"spot_asset={portfolio.get('spot_asset')}",
                )
            )
        ]
    if section == "consistency":
        consistency = _safe_mapping(record["consistency"])
        issue_text = "; ".join(str(issue) for issue in consistency.get("issues", []))
        return [
            "CONSISTENCY "
            + " ".join(
                (
                    f"status={consistency.get('status')}",
                    f"reported_distance={_format_pct(consistency.get('reported_distance'))}",
                    f"expected_distance={_format_pct(consistency.get('expected_distance'))}",
                    f"reported_zone={consistency.get('reported_zone')}",
                    f"expected_zone={consistency.get('expected_zone')}",
                    f"matched_asset={consistency.get('matched_asset')}",
                    f"issues={issue_text or 'none'}",
                )
            )
        ]
    if section == "rule":
        rule = _safe_mapping(record["rule"])
        evidence = "; ".join(str(item) for item in rule.get("evidence", []))
        return [
            f"RULE classification={rule.get('classification')} summary={rule.get('summary')} evidence={evidence}",
        ]
    return []


def _render_markdown_context(context: dict[str, Any] | None) -> list[str]:
    if not context:
        return []
    lines = ["## Lookback Context"]
    latest = _safe_mapping(context.get("latest_before_window"))
    if latest:
        lines.extend(
            [
                "### Latest Before Window",
                f"- Date: `{latest.get('date')}`",
                f"- Action: `{latest.get('action')}`",
                f"- Reason: `{latest.get('reason')}`",
                f"- Event: `{latest.get('event')}`",
                f"- Cross event: `{latest.get('outer_dma_cross_event')}`",
                f"- Allocation: `{json.dumps(latest.get('allocation'), sort_keys=True)}`",
                f"- Asset allocation: `{json.dumps(latest.get('asset_allocation'), sort_keys=True)}`",
                f"- Spot asset: `{latest.get('spot_asset')}`",
                "",
            ]
        )
    events = [event for event in context.get("events", []) if isinstance(event, dict)]
    if events:
        lines.append("### Recent Events")
        for event in events:
            lines.append(
                f"- `{event.get('date')}` {event.get('kind')}: "
                f"action=`{event.get('action')}`, reason=`{event.get('reason')}`, "
                f"event=`{event.get('event')}`, cross=`{event.get('outer_dma_cross_event')}`"
            )
        lines.append("")
    return lines


def _render_markdown(
    records: list[dict[str, Any]],
    sections: tuple[str, ...],
    warnings: list[str],
    lookback_context: dict[str, Any] | None = None,
) -> str:
    lines = ["# Compare Analysis", ""]
    if warnings:
        lines.append("## Warnings")
        for warning in warnings:
            lines.append(f"- {warning}")
        lines.append("")
    context_lines = _render_markdown_context(lookback_context)
    if context_lines:
        lines.extend(context_lines)
    for record in records:
        lines.append(f"## {record['date']}")
        for section in sections:
            lines.extend(_render_markdown_section(section, record))
            lines.append("")
    return "\n".join(lines).rstrip()


def _render_markdown_section(section: str, record: dict[str, Any]) -> list[str]:
    if section == "market":
        market = _safe_mapping(record["market"])
        token_prices = _safe_mapping(market.get("token_price"))
        return [
            "### Market",
            f"- BTC: `{_format_float(token_prices.get('btc'))}`",
            f"- ETH: `{_format_float(token_prices.get('eth'))}`",
            f"- SPY: `{_format_float(token_prices.get('spy'))}`",
            f"- ETH/BTC ratio: `{_format_float(record['inner_ratio'].get('ratio'))}`",
            f"- FGI: `{market.get('sentiment')}` (`{market.get('sentiment_label')}`)",
        ]
    if section == "outer_dma":
        dma = _safe_mapping(record["outer_dma"])
        return [
            "### Outer DMA",
            f"- DMA200: `{_format_float(dma.get('dma_200'))}`",
            f"- Distance: `{_format_pct(dma.get('distance'))}`",
            f"- Zone: `{dma.get('zone')}`",
            f"- Cross event: `{dma.get('cross_event')}`",
            f"- Asset: `{dma.get('outer_dma_asset')}`",
        ]
    if section == "spy_dma":
        spy_dma = _safe_mapping(record["spy_dma"])
        return [
            "### SPY DMA",
            f"- DMA200: `{_format_float(spy_dma.get('dma_200'))}`",
            f"- Distance: `{_format_pct(spy_dma.get('distance'))}`",
            f"- Zone: `{spy_dma.get('zone')}`",
            f"- Cross event: `{spy_dma.get('cross_event')}`",
            f"- Cooldown active: `{spy_dma.get('cooldown_active')}`",
            f"- Cooldown remaining days: `{spy_dma.get('cooldown_remaining_days')}`",
            f"- Cooldown blocked zone: `{spy_dma.get('cooldown_blocked_zone')}`",
        ]
    if section == "inner_ratio":
        ratio = _safe_mapping(record["inner_ratio"])
        lines = [
            "### Inner Ratio",
            f"- Ratio: `{_format_float(ratio.get('ratio'))}`",
            f"- Ratio DMA200: `{_format_float(ratio.get('ratio_dma_200')) if ratio.get('ratio_dma_200') is not None else 'unavailable'}`",
            f"- Ratio distance: `{_format_pct(ratio.get('ratio_distance')) if ratio.get('ratio_distance') is not None else 'unavailable'}`",
            f"- Zone: `{ratio.get('zone')}`",
            f"- Cross event: `{ratio.get('cross_event')}`",
            f"- Cooldown active: `{ratio.get('cooldown_active')}`",
            f"- Cooldown remaining days: `{ratio.get('cooldown_remaining_days')}`",
            f"- Cooldown blocked zone: `{ratio.get('cooldown_blocked_zone')}`",
            f"- Above DMA: `{ratio.get('is_above_dma')}`",
            f"- Source: `{ratio.get('source')}`",
        ]
        if ratio.get("unavailable_reason"):
            lines.append(f"- Note: {ratio.get('unavailable_reason')}")
        return lines
    if section == "asset_class":
        asset_class = _safe_mapping(record["asset_class"])
        return [
            "### Asset Class",
            f"- Target SPY: `{_format_pct(asset_class.get('target_spy'))}`",
            f"- Target crypto: `{_format_pct(asset_class.get('target_crypto'))}`",
            f"- Target stable: `{_format_pct(asset_class.get('target_stable'))}`",
            f"- Current SPY: `{_format_pct(asset_class.get('current_spy'))}`",
            f"- Current crypto: `{_format_pct(asset_class.get('current_crypto'))}`",
            f"- Current stable: `{_format_pct(asset_class.get('current_stable'))}`",
            f"- Reason: `{asset_class.get('reason')}`",
            f"- Immediate: `{asset_class.get('immediate')}`",
        ]
    if section == "decision":
        decision = _safe_mapping(record["decision"])
        return [
            "### Decision",
            f"- Action: `{decision.get('action')}`",
            f"- Reason: `{decision.get('reason')}`",
            f"- Rule group: `{decision.get('rule_group')}`",
            f"- Immediate: `{decision.get('immediate')}`",
        f"- Target allocation: `{json.dumps(decision.get('target_allocation'), sort_keys=True)}`",
    ]
    if section == "execution":
        execution = _safe_mapping(record["execution"])
        return [
            "### Execution",
            f"- Event: `{execution.get('event')}`",
            f"- Blocked reason: `{execution.get('blocked_reason')}`",
            f"- Transfers: `{json.dumps(execution.get('transfers', []), sort_keys=True)}`",
        ]
    if section == "portfolio":
        portfolio = _safe_mapping(record["portfolio"])
        return [
            "### Portfolio",
            f"- Allocation: `{json.dumps(portfolio.get('allocation'), sort_keys=True)}`",
            f"- Asset allocation: `{json.dumps(portfolio.get('asset_allocation'), sort_keys=True)}`",
            f"- Spot asset: `{portfolio.get('spot_asset')}`",
        ]
    if section == "consistency":
        consistency = _safe_mapping(record["consistency"])
        lines = [
            "### Consistency",
            f"- Status: `{consistency.get('status')}`",
            f"- Reported distance: `{_format_pct(consistency.get('reported_distance'))}`",
            f"- Expected BTC distance: `{_format_pct(consistency.get('expected_distance'))}`",
            f"- Reported zone: `{consistency.get('reported_zone')}`",
            f"- Expected zone: `{consistency.get('expected_zone')}`",
            f"- Matched asset: `{consistency.get('matched_asset')}`",
        ]
        issues = consistency.get("issues", [])
        if issues:
            for issue in issues:
                lines.append(f"- Issue: {issue}")
        return lines
    if section == "rule":
        rule = _safe_mapping(record["rule"])
        lines = [
            "### Rule",
            f"- Classification: `{rule.get('classification')}`",
            f"- Summary: {rule.get('summary')}",
        ]
        for item in rule.get("evidence", []):
            lines.append(f"- Evidence: {item}")
        return lines
    return []


def _empty_ratio_metrics(reason: str = "ratio metrics missing") -> dict[str, Any]:
    return {
        "ratio": None,
        "ratio_dma_200": None,
        "ratio_distance": None,
        "zone": None,
        "cross_event": None,
        "cooldown_active": None,
        "cooldown_remaining_days": None,
        "cooldown_blocked_zone": None,
        "is_above_dma": None,
        "source": "unavailable",
        "unavailable_reason": reason,
    }


def _allocation_fingerprint(point: dict[str, Any]) -> str:
    portfolio = _safe_mapping(point.get("portfolio"))
    payload = {
        "allocation": portfolio.get("allocation"),
        "asset_allocation": portfolio.get("asset_allocation"),
        "spot_asset": portfolio.get("spot_asset"),
    }
    return json.dumps(payload, sort_keys=True)


def _compact_context_record(
    point: dict[str, Any],
    *,
    kind: str,
    ratio_metrics: dict[str, Any],
) -> dict[str, Any]:
    signal = point.get("signal") if isinstance(point.get("signal"), dict) else {}
    assert isinstance(signal, dict)
    dma = _safe_mapping(signal.get("dma"))
    spy_dma = _safe_mapping(signal.get("spy_dma"))
    decision = _safe_mapping(point.get("decision"))
    execution = _safe_mapping(point.get("execution"))
    portfolio = _safe_mapping(point.get("portfolio"))
    ratio = _merge_runtime_ratio_metrics(
        derived_metrics=ratio_metrics,
        signal_map=signal,
    )
    return {
        "date": point["date"],
        "kind": kind,
        "action": decision.get("action"),
        "reason": decision.get("reason"),
        "rule_group": decision.get("rule_group"),
        "event": execution.get("event"),
        "blocked_reason": execution.get("blocked_reason"),
        "outer_dma_cross_event": dma.get("cross_event"),
        "outer_dma_zone": dma.get("zone"),
        "outer_dma_distance": dma.get("distance"),
        "outer_dma_asset": dma.get("outer_dma_asset"),
        "spy_dma_cross_event": spy_dma.get("cross_event"),
        "spy_dma_zone": spy_dma.get("zone"),
        "spy_dma_distance": spy_dma.get("distance"),
        "inner_ratio_zone": ratio.get("zone"),
        "inner_ratio_cross_event": ratio.get("cross_event"),
        "allocation": portfolio.get("allocation"),
        "asset_allocation": portfolio.get("asset_allocation"),
        "spot_asset": portfolio.get("spot_asset"),
    }


def _classify_context_event(
    point: dict[str, Any],
    *,
    previous_fingerprint: str | None,
) -> str | None:
    signal = point.get("signal") if isinstance(point.get("signal"), dict) else {}
    assert isinstance(signal, dict)
    dma = _safe_mapping(signal.get("dma"))
    spy_dma = _safe_mapping(signal.get("spy_dma"))
    decision = _safe_mapping(point.get("decision"))
    execution = _safe_mapping(point.get("execution"))
    kinds: list[str] = []
    if dma.get("cross_event") in {"cross_up", "cross_down"}:
        kinds.append("cross")
    if spy_dma.get("cross_event") in {"cross_up", "cross_down"}:
        kinds.append("spy_cross")
    if str(decision.get("action") or "hold") != "hold":
        kinds.append("decision")
    if execution.get("event") == "rebalance":
        kinds.append("execution")
    if previous_fingerprint is not None:
        current_fingerprint = _allocation_fingerprint(point)
        if current_fingerprint != previous_fingerprint:
            kinds.append("allocation_change")
    if not kinds:
        return None
    return "+".join(dict.fromkeys(kinds))


def _build_lookback_context(
    points: list[dict[str, Any]],
    *,
    selected_start: str | None,
    ratio_metrics: dict[str, dict[str, Any]],
    lookback_days: int,
    max_events: int = 8,
) -> dict[str, Any] | None:
    if selected_start is None:
        return None
    before_points = [point for point in points if point["date"] < selected_start]
    if not before_points:
        return {
            "lookback_days": lookback_days,
            "records_considered": 0,
            "latest_before_window": None,
            "events": [],
        }

    events: list[dict[str, Any]] = []
    previous_fingerprint: str | None = None
    for point in before_points:
        kind = _classify_context_event(
            point,
            previous_fingerprint=previous_fingerprint,
        )
        if kind is not None:
            events.append(
                _compact_context_record(
                    point,
                    kind=kind,
                    ratio_metrics=ratio_metrics.get(
                        point["date"], _empty_ratio_metrics()
                    ),
                )
            )
        previous_fingerprint = _allocation_fingerprint(point)

    latest = before_points[-1]
    return {
        "lookback_days": lookback_days,
        "records_considered": len(before_points),
        "latest_before_window": _compact_context_record(
            latest,
            kind="latest_before_window",
            ratio_metrics=ratio_metrics.get(latest["date"], _empty_ratio_metrics()),
        ),
        "events": events[-max_events:],
    }


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
        return {
            "start_date": (target - timedelta(days=lookback_days)).isoformat(),
            "end_date": target.isoformat(),
        }
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
    token_symbol: str,
    total_capital: float,
    date_filter: str | None,
    from_date: str | None,
    to_date: str | None,
    days: int | None,
    lookback_days: int,
) -> dict[str, Any]:
    request: dict[str, Any] = {
        "token_symbol": token_symbol,
        "total_capital": total_capital,
        "configs": [
            {
                "config_id": _resolve_config_id(saved_config_id, config_id),
                "saved_config_id": saved_config_id,
            }
        ],
    }
    request.update(
        _build_request_window(
            date_filter=date_filter,
            from_date=from_date,
            to_date=to_date,
            days=days,
            lookback_days=lookback_days,
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
    date_filter: str | None = None,
    from_date: str | None = None,
    to_date: str | None = None,
    profile: AnalysisProfile = "eth-btc-rotation",
    sections: list[str] | None = None,
    output_format: OutputFormat = "json",
    enrich_db: EnrichMode = "auto",
    source_label: str,
    request_body: dict[str, Any],
    lookback_days: int = DEFAULT_LOOKBACK_DAYS,
    out_path: str | None = None,
) -> str:
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

    if profile == "raw":
        lookback_context = _build_lookback_context(
            normalized_points,
            selected_start=selected_start,
            ratio_metrics=compare_ratio_metrics,
            lookback_days=lookback_days,
        )
        rendered = json.dumps(
            {
                "source": source_label,
                "request": request_body,
                "strategy_id": selected_strategy_id,
                "profile": profile,
                "window": payload.get("window"),
                "warnings": warnings,
                "lookback_context": lookback_context,
                "records": filtered_points,
            },
            indent=2,
            ensure_ascii=False,
        )
    else:
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
            )
            for point in filtered_points
        ]
        selected_sections = _selected_sections(profile, sections)
        all_warnings = warnings + db_warnings
        if output_format == "json":
            rendered = json.dumps(
                {
                    "source": source_label,
                    "request": request_body,
                    "strategy_id": selected_strategy_id,
                    "profile": profile,
                    "sections": list(selected_sections),
                    "window": payload.get("window"),
                    "warnings": all_warnings,
                    "lookback_context": lookback_context,
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
            )
        else:
            rendered = _render_text(
                records,
                selected_sections,
                all_warnings,
                lookback_context=lookback_context,
            )

    if out_path is not None:
        Path(out_path).write_text(rendered)
    return rendered


def analyze_payload(
    *,
    endpoint: str = DEFAULT_ENDPOINT,
    saved_config_id: str = DEFAULT_SAVED_CONFIG_ID,
    config_id: str | None = None,
    token_symbol: str = "BTC",
    date_filter: str | None = None,
    from_date: str | None = None,
    to_date: str | None = None,
    days: int | None = None,
    total_capital: float = 10_000.0,
    profile: AnalysisProfile = "eth-btc-rotation",
    sections: list[str] | None = None,
    output_format: OutputFormat = "json",
    enrich_db: EnrichMode = "auto",
    lookback_days: int = DEFAULT_LOOKBACK_DAYS,
    out_path: str | None = None,
) -> str:
    request_body = _build_compare_request(
        saved_config_id=saved_config_id,
        config_id=config_id,
        token_symbol=token_symbol,
        total_capital=total_capital,
        date_filter=date_filter,
        from_date=from_date,
        to_date=to_date,
        days=days,
        lookback_days=lookback_days,
    )
    payload = _fetch_from_api(endpoint, request_body)
    selected_config_id = _resolve_config_id(saved_config_id, config_id)
    return analyze_response_payload(
        payload,
        strategy_id=selected_config_id,
        date_filter=date_filter,
        from_date=from_date,
        to_date=to_date,
        profile=profile,
        sections=sections,
        output_format=output_format,
        enrich_db=enrich_db,
        source_label=endpoint,
        request_body=request_body,
        lookback_days=lookback_days,
        out_path=out_path,
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
    parser.add_argument("--token-symbol", default="BTC")
    parser.add_argument(
        "--date", dest="date_filter", help="Show only one YYYY-MM-DD date"
    )
    parser.add_argument("--from-date", dest="from_date", help="Range start date")
    parser.add_argument("--to-date", dest="to_date", help="Range end date")
    parser.add_argument("--days", type=int, help="Compare API days window")
    parser.add_argument("--total-capital", type=float, default=10_000.0)
    parser.add_argument(
        "--profile",
        choices=["eth-btc-rotation", "spy-eth-btc-rotation", "dma-cross", "raw"],
        default="eth-btc-rotation",
    )
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
    parser.add_argument("--out", dest="out_path", help="Write rendered output to file")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = _build_arg_parser()
    args = parser.parse_args(argv)
    try:
        output = analyze_payload(
            endpoint=args.endpoint,
            saved_config_id=args.saved_config_id,
            config_id=args.config_id,
            token_symbol=args.token_symbol,
            date_filter=args.date_filter,
            from_date=args.from_date,
            to_date=args.to_date,
            days=args.days,
            total_capital=args.total_capital,
            profile=args.profile,
            sections=args.sections,
            output_format=args.output_format,
            enrich_db=args.enrich_db,
            lookback_days=args.lookback_days,
            out_path=args.out_path,
        )
    except VerificationError as exc:
        print(f"ERROR: {exc}")
        return 1
    print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())


__all__ = [
    "DEFAULT_ENDPOINT",
    "DEFAULT_SAVED_CONFIG_ID",
    "analyze_payload",
    "analyze_response_payload",
    "main",
]
