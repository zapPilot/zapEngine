"""Research-only ETH/BTC minimum strategy without the SPY layer."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from src.services.backtesting.constants import (
    STRATEGY_DISPLAY_NAMES,
    STRATEGY_DMA_FGI_ETH_BTC_MINIMUM,
)
from src.services.backtesting.strategies.eth_btc_rotation import (
    EthBtcRotationParams,
)
from src.services.backtesting.strategies.hierarchical_attribution import (
    PLAIN_GREED_SELL_RULE,
)
from src.services.backtesting.strategies.pair_rotation_template import (
    ADAPTIVE_BINARY_ETH_BTC_TEMPLATE,
    DmaFgiAdaptiveBinaryEthBtcStrategy,
    PairRotationTemplateSpec,
)


@dataclass
class DmaFgiEthBtcMinimumStrategy(DmaFgiAdaptiveBinaryEthBtcStrategy):
    """ETH/BTC-only minimum policy used to decompose the SPY tax."""

    params: EthBtcRotationParams | dict[str, Any] = field(
        default_factory=lambda: EthBtcRotationParams(
            disabled_rules=frozenset({PLAIN_GREED_SELL_RULE})
        )
    )
    strategy_id: str = STRATEGY_DMA_FGI_ETH_BTC_MINIMUM
    display_name: str = STRATEGY_DISPLAY_NAMES[STRATEGY_DMA_FGI_ETH_BTC_MINIMUM]
    canonical_strategy_id: str = STRATEGY_DMA_FGI_ETH_BTC_MINIMUM
    template: PairRotationTemplateSpec = ADAPTIVE_BINARY_ETH_BTC_TEMPLATE

    def __post_init__(self) -> None:
        resolved_params = (
            self.params
            if isinstance(self.params, EthBtcRotationParams)
            else EthBtcRotationParams.from_public_params(self.params)
        )
        self.params = resolved_params.model_copy(
            update={"disabled_rules": frozenset({PLAIN_GREED_SELL_RULE})}
        )
        super().__post_init__()

    def feature_summary(self) -> dict[str, Any]:
        return {
            "policy": "DmaFgiEthBtcMinimumStrategy",
            "active_features": ["dma_stable_gating", "greed_sell_suppression"],
            "spy_layer": False,
            "research_only": True,
        }

    def parameters(self) -> dict[str, Any]:
        return {
            **super().parameters(),
            "feature_summary": self.feature_summary(),
        }


__all__ = ["DmaFgiEthBtcMinimumStrategy"]
