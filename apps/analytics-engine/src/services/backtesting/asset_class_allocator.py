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


def stock_macro_fgi_overlay(stock_score: float, normalized_score: int | None) -> float:
    """Apply CNN US equity FGI as a SPY-only risk overlay."""
    if normalized_score is None:
        return _clamp_unit(stock_score)
    score = max(0, min(100, int(normalized_score)))
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


def allocate_stock_crypto_target(
    *,
    stock_dma_distance: float | None,
    crypto_dma_distance: float | None,
    crypto_fgi_regime: str | None,
    eth_share_in_crypto: float,
    current_allocation: Mapping[str, float] | None,
    stock_macro_fgi_score: int | None = None,
) -> StockCryptoAllocationResult:
    """Allocate across SPY, BTC/ETH, and stable with one canonical target."""

    current = target_from_current_allocation(current_allocation)
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
        )

    eth_share = _clamp_unit(eth_share_in_crypto)
    if stock_score is None:
        spy = float(current["spy"])
        remaining = max(0.0, 1.0 - spy)
        crypto = min(remaining, 0.0 if crypto_score is None else crypto_score)
        btc = crypto * (1.0 - eth_share)
        eth = crypto * eth_share
        stable = max(0.0, 1.0 - spy - crypto)
        allocation = normalize_target_allocation(
            {"btc": btc, "eth": eth, "spy": spy, "stable": stable, "alt": 0.0}
        )
        return StockCryptoAllocationResult(
            allocation=allocation,
            stock_score=stock_score,
            crypto_score=crypto_score,
        )

    if crypto_score is None:
        crypto = float(current["btc"]) + float(current["eth"])
        remaining = max(0.0, 1.0 - crypto)
        spy = min(remaining, stock_score)
        current_eth_share = 0.0 if crypto <= 0.0 else float(current["eth"]) / crypto
        btc = crypto * (1.0 - current_eth_share)
        eth = crypto * current_eth_share
        stable = max(0.0, 1.0 - spy - crypto)
        allocation = normalize_target_allocation(
            {"btc": btc, "eth": eth, "spy": spy, "stable": stable, "alt": 0.0}
        )
        return StockCryptoAllocationResult(
            allocation=allocation,
            stock_score=stock_score,
            crypto_score=crypto_score,
        )

    score_total = stock_score + crypto_score
    if score_total <= 0.0:
        allocation = normalize_target_allocation(
            {"btc": 0.0, "eth": 0.0, "spy": 0.0, "stable": 1.0, "alt": 0.0}
        )
        return StockCryptoAllocationResult(
            allocation=allocation,
            stock_score=stock_score,
            crypto_score=crypto_score,
        )

    risk_budget = max(stock_score, crypto_score)
    spy = risk_budget * (stock_score / score_total)
    crypto = risk_budget * (crypto_score / score_total)
    btc = crypto * (1.0 - eth_share)
    eth = crypto * eth_share
    stable = max(0.0, 1.0 - risk_budget)
    allocation = normalize_target_allocation(
        {"btc": btc, "eth": eth, "spy": spy, "stable": stable, "alt": 0.0}
    )
    return StockCryptoAllocationResult(
        allocation=allocation,
        stock_score=stock_score,
        crypto_score=crypto_score,
    )


__all__ = [
    "StockCryptoAllocationResult",
    "allocate_stock_crypto_target",
    "fgi_risk_multiplier",
    "score_dma_distance",
    "stock_macro_fgi_overlay",
]
