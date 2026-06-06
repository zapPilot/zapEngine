"""Per-point summaries and record assembly for compare-v3 diagnostics."""

from __future__ import annotations

import json
from typing import Any

from scripts._compare_common import _format_pct, _safe_float, _safe_mapping
from scripts._compare_metrics import _merge_runtime_ratio_metrics
from src.services.backtesting.tactics.rules import RULE_DESCRIPTIONS


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
    decision_details = _safe_mapping(decision.get("details"))
    reason = str(decision.get("reason") or "")
    matched_rule_name = decision_details.get("matched_rule_name")

    if consistency.get("status") == "mismatch":
        return {
            "classification": "anomaly",
            "summary": "Observed outer DMA signal is inconsistent with BTC market data; treat this as engine behavior, not intended strategy logic.",
            "evidence": consistency.get("issues", []),
        }

    if isinstance(matched_rule_name, str) and matched_rule_name in RULE_DESCRIPTIONS:
        return {
            "classification": "intended_rule",
            "summary": RULE_DESCRIPTIONS[matched_rule_name],
            "evidence": [
                f"matched_rule_name={matched_rule_name}",
                f"reason={reason or 'n/a'}",
                f"target_allocation={json.dumps(target_assets, sort_keys=True)}",
            ],
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
    details = _safe_mapping(decision.get("details"))
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
        "stock_score": details.get("stock_score"),
        "crypto_score": details.get("crypto_score"),
        "stock_gate_state": details.get("stock_gate_state"),
        "crypto_gate_state": details.get("crypto_gate_state"),
        "overextension_pressure": details.get("overextension_pressure"),
        "stable_reason": details.get("stable_reason"),
    }


def _build_active_tactics(strategy_id: str) -> dict[str, Any]:
    del strategy_id
    return {}


def _build_record(
    point: dict[str, Any],
    *,
    ratio_metrics: dict[str, Any],
    strategy_id: str,
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
        "active_tactics": _build_active_tactics(strategy_id),
        "decision": decision,
        "execution": execution,
        "portfolio": portfolio,
        "consistency": consistency,
        "rule": rule,
    }
