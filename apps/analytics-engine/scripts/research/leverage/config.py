"""Configuration for the offline leverage experiment."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

LeverageMode = Literal["off", "risk_on", "fear_dip", "both"]


@dataclass(frozen=True)
class LeverageConfig:
    mode: LeverageMode = "off"
    target_ltv: float = 0.35
    max_ltv: float = 0.65
    deleverage_trigger_ltv: float = 0.70
    liq_ltv: float = 0.75
    liquidation_penalty: float = 0.10
    borrow_apr: float = 0.08
    releverage_band: float = 0.10
    dip_borrow_fraction: float = 0.10
    dip_cooldown_days: int = 7

    def __post_init__(self) -> None:
        if self.mode not in {"off", "risk_on", "fear_dip", "both"}:
            raise ValueError(f"Unsupported leverage mode: {self.mode}")
        if not (
            0.0
            <= self.target_ltv
            < self.max_ltv
            <= self.deleverage_trigger_ltv
            < self.liq_ltv
            < 1.0
        ):
            raise ValueError(
                "LTV thresholds must satisfy 0 <= target < max <= "
                "deleverage_trigger < liquidation < 1"
            )
        if self.liquidation_penalty < 0.0 or self.borrow_apr < 0.0:
            raise ValueError("Rates and penalties must be non-negative")
        if self.releverage_band < 0.0 or self.dip_borrow_fraction < 0.0:
            raise ValueError("Leverage fractions must be non-negative")
        if self.dip_cooldown_days < 0:
            raise ValueError("dip_cooldown_days must be non-negative")


__all__ = ["LeverageConfig", "LeverageMode"]
