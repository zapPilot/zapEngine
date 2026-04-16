# pyright: reportImplicitStringConcatenation=false
"""Configuration models for the DMA-first backtesting runtime."""

from __future__ import annotations

from dataclasses import dataclass, field

from src.services.backtesting.constants import APR_BY_REGIME


@dataclass
class RegimeConfig:
    """Configuration for engine-level runtime behavior."""

    trading_slippage_percent: float = 0.003
    apr_by_regime: dict[str, dict[str, float | dict[str, float]]] = field(
        default_factory=dict
    )

    @classmethod
    def default(cls) -> RegimeConfig:
        return cls(apr_by_regime=APR_BY_REGIME)
