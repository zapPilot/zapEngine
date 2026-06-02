"""ETH/BTC ratio metric derivation and enrichment for compare-v3 diagnostics."""

from __future__ import annotations

from collections import deque
from typing import Any, Literal

from scripts._compare_common import (
    VerificationError,
    _parse_date,
    _safe_float,
    _safe_mapping,
)

EnrichMode = Literal["auto", "never", "required"]


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
