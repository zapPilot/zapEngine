"""Text/markdown rendering, lookback context, and output writing for compare-v3."""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

from scripts._compare_common import _format_float, _format_pct, _safe_mapping
from scripts._compare_metrics import _empty_ratio_metrics, _merge_runtime_ratio_metrics


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
    constraint_validation: dict[str, Any] | None = None,
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
    constraint_lines = _render_text_constraints(constraint_validation)
    if constraint_lines:
        if lines:
            lines.append("")
        lines.extend(constraint_lines)
    return "\n".join(lines).rstrip()


def _render_text_constraints(validation: dict[str, Any] | None) -> list[str]:
    if not validation:
        return []
    if validation.get("enabled") is False:
        return ["CONSTRAINT_VALIDATION enabled=False passed=True checked=0"]
    lines = [
        "CONSTRAINT_VALIDATION "
        + " ".join(
            (
                f"enabled={validation.get('enabled')}",
                f"passed={validation.get('passed')}",
                f"checked={validation.get('checked')}",
                f"violations={len(validation.get('violations', []))}",
            )
        )
    ]
    for result in validation.get("results", []):
        if isinstance(result, dict):
            lines.append(
                "CONSTRAINT "
                + " ".join(
                    (
                        f"id={result.get('id')}",
                        f"date={result.get('event_date')}",
                        f"type={result.get('event_type')}",
                        f"passed={result.get('passed')}",
                        f"message={result.get('message')}",
                    )
                )
            )
    return lines


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
    if section == "active_tactics":
        tactics = _safe_mapping(record["active_tactics"])
        if not tactics:
            return []
        return [
            "ACTIVE_TACTICS "
            + " ".join(
                (
                    f"adaptive_crypto_dma_reference={tactics.get('adaptive_crypto_dma_reference')}",
                    f"spy_cross_up_latch={tactics.get('spy_cross_up_latch')}",
                    f"disabled_rules={json.dumps(tactics.get('disabled_rules'), sort_keys=True)}",
                    f"dma_buy_strength_floor={tactics.get('dma_buy_strength_floor')}",
                )
            )
        ]
    if section == "decision":
        decision = _safe_mapping(record["decision"])
        details = _safe_mapping(decision.get("details"))
        return [
            "DECISION "
            + " ".join(
                (
                    f"action={decision.get('action')}",
                    f"reason={decision.get('reason')}",
                    f"rule_group={decision.get('rule_group')}",
                    f"matched_rule_name={details.get('matched_rule_name')}",
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
    constraint_validation: dict[str, Any] | None = None,
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
    constraint_lines = _render_markdown_constraints(constraint_validation)
    if constraint_lines:
        lines.extend(constraint_lines)
    return "\n".join(lines).rstrip()


def _render_markdown_constraints(validation: dict[str, Any] | None) -> list[str]:
    if not validation:
        return []
    if validation.get("enabled") is False:
        return [
            "## Constraint Validation",
            "",
            "- Enabled: `False`",
            "- Passed: `True`",
        ]
    lines = [
        "## Constraint Validation",
        "",
        f"- Passed: `{validation.get('passed')}`",
        f"- Checked: `{validation.get('checked')}`",
        f"- Violations: `{len(validation.get('violations', []))}`",
        "",
    ]
    results = [
        result for result in validation.get("results", []) if isinstance(result, dict)
    ]
    if results:
        lines.extend(
            [
                "| Event | Date | Type | Status | Message |",
                "|---|---|---|---|---|",
            ]
        )
        for result in results:
            status = str(
                result.get("status") or ("PASS" if result.get("passed") else "FAIL")
            )
            message = str(result.get("message") or "").replace("|", "\\|")
            lines.append(
                "| "
                + " | ".join(
                    (
                        str(result.get("id")),
                        str(result.get("event_date")),
                        str(result.get("event_type")),
                        status,
                        message,
                    )
                )
                + " |"
            )
    return lines


def _resolve_out_path(out_path: str | None) -> Path | None:
    if out_path is None:
        return None
    return Path(out_path).expanduser().resolve()


def _write_rendered_output(
    path: Path, rendered: str, *, fallback: bool = False
) -> None:
    path.write_text(rendered, encoding="utf-8")
    label = "Saved fallback to" if fallback else "Saved to"
    print(f"{label} {path}", file=sys.stderr)


def _render_markdown_failure_fallback(
    *,
    exc: Exception,
    source_label: str,
    request_body: dict[str, Any],
    constraint_validation: dict[str, Any],
) -> str:
    lines = [
        "# Compare Analysis Rendering Failed",
        "",
        f"- Source: `{source_label}`",
        f"- Exception: `{type(exc).__name__}`",
        f"- Message: `{str(exc)}`",
        f"- Request: `{json.dumps(request_body, sort_keys=True, default=str)}`",
        "",
    ]
    lines.extend(_render_markdown_constraints(constraint_validation))
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
    if section == "active_tactics":
        tactics = _safe_mapping(record["active_tactics"])
        if not tactics:
            return []
        return [
            "### Active Tactics",
            f"- Adaptive crypto DMA reference: `{tactics.get('adaptive_crypto_dma_reference')}`",
            f"- SPY cross-up latch: `{tactics.get('spy_cross_up_latch')}`",
            f"- Disabled rules: `{json.dumps(tactics.get('disabled_rules'), sort_keys=True)}`",
            f"- DMA buy-strength floor: `{tactics.get('dma_buy_strength_floor')}`",
        ]
    if section == "decision":
        decision = _safe_mapping(record["decision"])
        details = _safe_mapping(decision.get("details"))
        return [
            "### Decision",
            f"- Action: `{decision.get('action')}`",
            f"- Reason: `{decision.get('reason')}`",
            f"- Rule group: `{decision.get('rule_group')}`",
            f"- Matched rule: `{details.get('matched_rule_name')}`",
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
