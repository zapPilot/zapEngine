"""Pure allocation policy helpers for stock/crypto target weights."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass

from src.services.backtesting.target_allocation import (
    normalize_target_allocation,
    target_from_current_allocation,
)


def _clamp_unit(value: float) -> float:
    return max(0.0, min(1.0, float(value)))


def score_dma_distance(distance: float | None, *, band: float = 0.30) -> float | None:
    """Map DMA distance to a 0..1 attractiveness score.

    Negative distance means price is below DMA and should receive a higher score.
    Positive distance means price is above DMA and should receive a lower score.
    """

    if distance is None:
        return None
    resolved_band = max(1e-9, float(band))
    return _clamp_unit(0.5 - (float(distance) / (2.0 * resolved_band)))


def fgi_risk_multiplier(regime: str | None) -> float:
    normalized = str(regime or "neutral").strip().lower()
    return {
        "extreme_fear": 1.25,
        "fear": 1.10,
        "neutral": 1.00,
        "greed": 0.75,
        "extreme_greed": 0.55,
    }.get(normalized, 1.0)


def stock_macro_fgi_overlay(stock_score: float, macro_fgi_score: float | None) -> float:
    """Apply CNN US equity FGI as a SPY-only risk overlay."""
    if macro_fgi_score is None:
        return _clamp_unit(stock_score)
    score = max(0, min(100, macro_fgi_score))
    if score <= 24:
        return _clamp_unit(stock_score * 0.5)
    if score <= 44:
        return _clamp_unit(stock_score * 0.75)
    if score <= 75:
        return _clamp_unit(stock_score)
    return _clamp_unit(min(stock_score, 0.8))


@dataclass(frozen=True, slots=True)
class StockCryptoAllocationResult:
    allocation: dict[str, float]
    stock_score: float | None
    crypto_score: float | None
    stock_gate_state: str
    crypto_gate_state: str
    overextension_pressure: dict[str, float]
    stable_reason: str | None


def _ramp(value: float, *, start: float, saturation: float) -> float:
    width = max(1e-9, saturation - start)
    return _clamp_unit((value - start) / width)


def _overextension_pressure(
    distance: float | None, *, start: float, saturation: float
) -> float:
    if distance is None:
        return 0.0
    return _ramp(float(distance), start=start, saturation=saturation)


def _accumulation_score(distance: float | None) -> float:
    if distance is None:
        return 0.0
    return _ramp(-float(distance), start=0.05, saturation=0.25)


def _gate_state(
    *,
    cross_event: str | None,
    has_crossed_up: bool,
    accumulation_score: float,
    overextension_pressure: float,
) -> str:
    if cross_event == "cross_down":
        return "cross_down"
    if cross_event == "cross_up":
        return "cross_up"
    if overextension_pressure > 0.0:
        return "overextended"
    if has_crossed_up:
        return "risk_on"
    if accumulation_score > 0.0:
        return "accumulation"
    return "stable"


def _class_demand(
    *,
    current_share: float,
    gate_state: str,
    accumulation_score: float,
    accumulation_cap: float,
    overextension_pressure: float,
) -> tuple[float, float]:
    if gate_state == "cross_down":
        return 0.0, 0.0
    if gate_state == "overextended":
        return current_share * (1.0 - overextension_pressure), 0.0
    if gate_state in {"cross_up", "risk_on"}:
        return 1.0, max(1e-9, 1.0 - overextension_pressure)
    if gate_state == "accumulation":
        return accumulation_cap * accumulation_score, accumulation_score
    return 0.0, 0.0


def allocate_stock_crypto_target(
    *,
    stock_dma_distance: float | None,
    crypto_dma_distance: float | None,
    crypto_fgi_regime: str | None,
    eth_share_in_crypto: float,
    current_allocation: Mapping[str, float] | None,
    stock_macro_fgi_score: float | None = None,
    stock_cross_event: str | None = None,
    crypto_cross_event: str | None = None,
    stock_has_crossed_up: bool = False,
    crypto_has_crossed_up: bool = False,
) -> StockCryptoAllocationResult:
    """Allocate across SPY, BTC/ETH, and stable with one canonical target."""

    current = target_from_current_allocation(current_allocation)
    current_stock = float(current.get("spy", 0.0))
    current_crypto = float(current.get("btc", 0.0)) + float(current.get("eth", 0.0))
    stock_accumulation = _accumulation_score(stock_dma_distance)
    crypto_accumulation = _accumulation_score(crypto_dma_distance)
    stock_pressure = _overextension_pressure(
        stock_dma_distance, start=0.10, saturation=0.18
    )
    crypto_pressure = _overextension_pressure(
        crypto_dma_distance, start=0.20, saturation=0.30
    )
    stock_state = _gate_state(
        cross_event=stock_cross_event,
        has_crossed_up=stock_has_crossed_up,
        accumulation_score=stock_accumulation,
        overextension_pressure=stock_pressure,
    )
    crypto_state = _gate_state(
        cross_event=crypto_cross_event,
        has_crossed_up=crypto_has_crossed_up,
        accumulation_score=crypto_accumulation,
        overextension_pressure=crypto_pressure,
    )

    stock_base_score = score_dma_distance(stock_dma_distance)
    stock_score = (
        None
        if stock_base_score is None
        else stock_macro_fgi_overlay(stock_base_score, stock_macro_fgi_score)
    )
    crypto_base_score = score_dma_distance(crypto_dma_distance)
    crypto_score = (
        None
        if crypto_base_score is None
        else _clamp_unit(crypto_base_score * fgi_risk_multiplier(crypto_fgi_regime))
    )

    if stock_score is None and crypto_score is None:
        return StockCryptoAllocationResult(
            allocation=current,
            stock_score=None,
            crypto_score=None,
            stock_gate_state="unavailable",
            crypto_gate_state="unavailable",
            overextension_pressure={"stock": 0.0, "crypto": 0.0},
            stable_reason="signals_unavailable",
        )

    eth_share = _clamp_unit(eth_share_in_crypto)

    if stock_score is None:
        stock_state = "preserve_unavailable"
        stock_demand = current_stock
        stock_weight = 0.0
    else:
        stock_demand, stock_weight = _class_demand(
            current_share=current_stock,
            gate_state=stock_state,
            accumulation_score=stock_accumulation,
            accumulation_cap=0.35,
            overextension_pressure=stock_pressure,
        )

    if crypto_score is None:
        crypto_state = "preserve_unavailable"
        crypto_demand = current_crypto
        crypto_weight = 0.0
    else:
        crypto_demand, crypto_weight = _class_demand(
            current_share=current_crypto,
            gate_state=crypto_state,
            accumulation_score=crypto_accumulation
            * fgi_risk_multiplier(crypto_fgi_regime),
            accumulation_cap=0.45,
            overextension_pressure=crypto_pressure,
        )

    if stock_cross_event == "cross_up":
        preserved_crypto = (
            current_crypto if crypto_state == "accumulation" and current_crypto > 0 else 0.0
        )
        stock_demand = max(0.0, 1.0 - preserved_crypto)
        crypto_demand = preserved_crypto
    elif crypto_cross_event == "cross_up":
        preserved_stock = (
            current_stock if stock_state == "accumulation" and current_stock > 0 else 0.0
        )
        crypto_demand = max(0.0, 1.0 - preserved_stock)
        stock_demand = preserved_stock

    if stock_demand <= 0.0 and crypto_demand <= 0.0:
        allocation = normalize_target_allocation(
            {"btc": 0.0, "eth": 0.0, "spy": 0.0, "stable": 1.0, "alt": 0.0}
        )
        return StockCryptoAllocationResult(
            allocation=allocation,
            stock_score=stock_score,
            crypto_score=crypto_score,
            stock_gate_state=stock_state,
            crypto_gate_state=crypto_state,
            overextension_pressure={
                "stock": stock_pressure,
                "crypto": crypto_pressure,
            },
            stable_reason="no_positive_asset_class_score",
        )

    demand_total = stock_demand + crypto_demand
    if demand_total > 1.0:
        weight_total = stock_weight + crypto_weight
        if weight_total > 0.0:
            spy = stock_weight / weight_total
            crypto = crypto_weight / weight_total
        else:
            spy = stock_demand / demand_total
            crypto = crypto_demand / demand_total
        stable = 0.0
    else:
        spy = stock_demand
        crypto = crypto_demand
        stable = max(0.0, 1.0 - spy - crypto)

    btc = crypto * (1.0 - eth_share)
    eth = crypto * eth_share
    allocation = normalize_target_allocation(
        {"btc": btc, "eth": eth, "spy": spy, "stable": stable, "alt": 0.0}
    )
    if stable <= 1e-9:
        stable_reason = None
    elif stock_pressure > 0.0 or crypto_pressure > 0.0:
        stable_reason = "overextension_pressure"
    elif stock_state == "accumulation" or crypto_state == "accumulation":
        stable_reason = "pre_cross_up_accumulation_cap"
    elif stock_state == "cross_down" or crypto_state == "cross_down":
        stable_reason = "cross_down_proceeds"
    else:
        stable_reason = "partial_asset_class_score"
    return StockCryptoAllocationResult(
        allocation=allocation,
        stock_score=stock_score,
        crypto_score=crypto_score,
        stock_gate_state=stock_state,
        crypto_gate_state=crypto_state,
        overextension_pressure={"stock": stock_pressure, "crypto": crypto_pressure},
        stable_reason=stable_reason,
    )


__all__ = [
    "StockCryptoAllocationResult",
    "allocate_stock_crypto_target",
    "fgi_risk_multiplier",
    "score_dma_distance",
    "stock_macro_fgi_overlay",
]
