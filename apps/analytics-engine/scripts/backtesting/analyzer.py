"""JSON-first analyzer for compare-v3 backtest payloads."""

from __future__ import annotations

import argparse
import json
import math
from collections import deque
from datetime import date
from pathlib import Path
from typing import Any, Literal

from scripts.backtesting.compare_payload import (
    VerificationError,
    iter_normalized_points,
    load_payload,
    load_timeline,
    select_strategy_id,
)

AnalysisProfile = Literal["eth-btc-rotation", "dma-cross", "raw"]
OutputFormat = Literal["text", "json", "markdown"]
EnrichMode = Literal["auto", "never", "required"]

SECTION_ORDER = (
    "market",
    "outer_dma",
    "inner_ratio",
    "decision",
    "execution",
    "portfolio",
    "consistency",
    "rule",
)


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
    btc_price = _safe_float(token_prices.get("btc"))

    issues: list[str] = []
    if (
        dma_200 is None
        or reported_distance is None
        or btc_price is None
        or dma_200 <= 0.0
    ):
        return {
            "status": "insufficient_data",
            "issues": [
                "Could not validate outer DMA consistency from market/token signal data."
            ],
        }

    expected_distance = (btc_price - dma_200) / dma_200
    if abs(expected_distance) < 1e-12:
        expected_zone = "at"
    elif expected_distance > 0.0:
        expected_zone = "above"
    else:
        expected_zone = "below"

    matched_asset = "btc"
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
                f"reported distance {_format_pct(reported_distance, digits=4)} does not match BTC distance {_format_pct(expected_distance, digits=4)}"
            )
        elif matched_asset != "btc":
            issues.append(
                f"reported distance matches {matched_asset.upper()} price against BTC DMA instead of BTC price"
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
    target_assets = _safe_mapping(decision.get("target_asset_allocation"))
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
                f"target_asset_allocation={json.dumps(target_assets, sort_keys=True)}",
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
                f"target_asset_allocation={json.dumps(target_assets, sort_keys=True)}",
            ],
        }

    return {
        "classification": "context",
        "summary": "No special intended-rule narrative was derived for this point.",
        "evidence": [f"reason={reason or 'n/a'}"],
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
        "inner_ratio": resolved_ratio_metrics,
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


def _render_text(
    records: list[dict[str, Any]], sections: tuple[str, ...], warnings: list[str]
) -> str:
    lines: list[str] = []
    if warnings:
        lines.append("WARNINGS")
        for warning in warnings:
            lines.append(f"- {warning}")
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
            f"MARKET btc={_format_float(token_prices.get('btc'))} eth={_format_float(token_prices.get('eth'))} eth_btc_ratio={_format_float(ratio)} sentiment={market.get('sentiment')} label={market.get('sentiment_label')}",
        ]
    if section == "outer_dma":
        dma = _safe_mapping(record["outer_dma"])
        return [
            f"OUTER_DMA dma_200={_format_float(dma.get('dma_200'))} distance={_format_pct(dma.get('distance'))} zone={dma.get('zone')} cross_event={dma.get('cross_event')}",
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
                    f"target_asset_allocation={json.dumps(decision.get('target_asset_allocation'), sort_keys=True)}",
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


def _render_markdown(
    records: list[dict[str, Any]], sections: tuple[str, ...], warnings: list[str]
) -> str:
    lines = ["# Compare Analysis", ""]
    if warnings:
        lines.append("## Warnings")
        for warning in warnings:
            lines.append(f"- {warning}")
        lines.append("")
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
    if section == "decision":
        decision = _safe_mapping(record["decision"])
        return [
            "### Decision",
            f"- Action: `{decision.get('action')}`",
            f"- Reason: `{decision.get('reason')}`",
            f"- Rule group: `{decision.get('rule_group')}`",
            f"- Immediate: `{decision.get('immediate')}`",
            f"- Target allocation: `{json.dumps(decision.get('target_allocation'), sort_keys=True)}`",
            f"- Target asset allocation: `{json.dumps(decision.get('target_asset_allocation'), sort_keys=True)}`",
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


_DEFAULT_ENDPOINT = "http://localhost:8001"
_DEFAULT_COMPARE_PATH = "/api/v3/backtesting/compare"


def _fetch_from_api(endpoint: str) -> dict[str, Any]:
    import httpx

    request_body = {
        "configs": [
            {
                "config_id": "default",
                "saved_config_id": "eth_btc_rotation_default",
            }
        ]
    }
    response = httpx.post(
        f"{endpoint.rstrip('/')}{_DEFAULT_COMPARE_PATH}",
        json=request_body,
        timeout=120.0,
    )
    response.raise_for_status()
    data = response.json()
    if not isinstance(data, dict):
        raise VerificationError("API response root must be an object.")
    return data


def analyze_payload(
    source: str | dict[str, Any] | None = None,
    *,
    endpoint: str | None = None,
    strategy_id: str | None = None,
    date_filter: str | None = None,
    from_date: str | None = None,
    to_date: str | None = None,
    profile: AnalysisProfile = "eth-btc-rotation",
    sections: list[str] | None = None,
    output_format: OutputFormat = "text",
    enrich_db: EnrichMode = "auto",
    out_path: str | None = None,
) -> str:
    if source is None:
        source = _fetch_from_api(endpoint or _DEFAULT_ENDPOINT)
    source_label = (
        source if isinstance(source, str) else (endpoint or _DEFAULT_ENDPOINT)
    )
    payload = load_payload(source)
    timeline = load_timeline(source)
    selected_strategy_id = select_strategy_id(timeline, strategy_id)
    normalized_points = iter_normalized_points(timeline, selected_strategy_id)
    filtered_points = _filter_points(
        normalized_points,
        date_filter=date_filter,
        from_date=from_date,
        to_date=to_date,
    )
    if profile == "raw":
        rendered = json.dumps(filtered_points, indent=2, ensure_ascii=False)
    else:
        compare_ratio_metrics, warnings = _derive_ratio_metrics(normalized_points)
        db_ratio_metrics, db_warnings = _load_db_ratio_metrics(
            normalized_points,
            enrich_db=enrich_db,
        )
        ratio_metrics = _merge_ratio_metrics(compare_ratio_metrics, db_ratio_metrics)
        records = [
            _build_record(
                point,
                ratio_metrics=ratio_metrics.get(
                    point["date"],
                    {
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
                        "unavailable_reason": "ratio metrics missing",
                    },
                ),
            )
            for point in filtered_points
        ]
        selected_sections = _selected_sections(profile, sections)
        all_warnings = warnings + db_warnings
        if output_format == "json":
            rendered = json.dumps(
                {
                    "source": source_label,
                    "strategy_id": selected_strategy_id,
                    "profile": profile,
                    "sections": list(selected_sections),
                    "window": payload.get("window"),
                    "warnings": all_warnings,
                    "records": records,
                },
                indent=2,
                ensure_ascii=False,
            )
        elif output_format == "markdown":
            rendered = _render_markdown(records, selected_sections, all_warnings)
        else:
            rendered = _render_text(records, selected_sections, all_warnings)

    if out_path is not None:
        Path(out_path).write_text(rendered)
    return rendered


def _build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "backtest_result",
        nargs="?",
        default=None,
        help="Path to compare-v3 backtest JSON (omit to fetch from API)",
    )
    parser.add_argument(
        "--endpoint",
        default=_DEFAULT_ENDPOINT,
        help=f"API base URL when fetching live results (default: {_DEFAULT_ENDPOINT})",
    )
    parser.add_argument(
        "--strategy-id", help="Strategy id when response contains multiple strategies"
    )
    parser.add_argument(
        "--date", dest="date_filter", help="Show only one YYYY-MM-DD date"
    )
    parser.add_argument("--from-date", dest="from_date", help="Range start date")
    parser.add_argument("--to-date", dest="to_date", help="Range end date")
    parser.add_argument(
        "--profile",
        choices=["eth-btc-rotation", "dma-cross", "raw"],
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
        default="text",
    )
    parser.add_argument(
        "--enrich-db",
        choices=["auto", "never", "required"],
        default="auto",
    )
    parser.add_argument("--out", dest="out_path", help="Write rendered output to file")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = _build_arg_parser()
    args = parser.parse_args(argv)
    try:
        output = analyze_payload(
            args.backtest_result,
            endpoint=args.endpoint if args.backtest_result is None else None,
            strategy_id=args.strategy_id,
            date_filter=args.date_filter,
            from_date=args.from_date,
            to_date=args.to_date,
            profile=args.profile,
            sections=args.sections,
            output_format=args.output_format,
            enrich_db=args.enrich_db,
            out_path=args.out_path,
        )
    except VerificationError as exc:
        print(f"ERROR: {exc}")
        return 1
    print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())


__all__ = ["analyze_payload", "main"]
