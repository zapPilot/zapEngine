"""Core constants for the DMA-first backtesting framework."""

from __future__ import annotations

PRIMER_DAYS = 7
REGIME_ORDER = ["extreme_fear", "fear", "neutral", "greed", "extreme_greed"]

ALLOCATION_STATES = {
    "risk_on": {"spot": 1.0, "stable": 0.0},
    "tilt_spot": {"spot": 0.75, "stable": 0.25},
    "balanced": {"spot": 0.50, "stable": 0.50},
    "tilt_stable": {"spot": 0.25, "stable": 0.75},
    "risk_off": {"spot": 0.0, "stable": 1.0},
    "neutral_start": {"spot": 0.5, "stable": 0.5},
}

STRATEGY_DCA_CLASSIC = "dca_classic"
STRATEGY_DMA_GATED_FGI = "dma_gated_fgi"
STRATEGY_ETH_BTC_ROTATION = "eth_btc_rotation"
STRATEGY_DMA_FGI_ADAPTIVE_BINARY_ETH_BTC = "dma_fgi_adaptive_binary_eth_btc"
STRATEGY_DMA_FGI_ETH_BTC_MINIMUM = "dma_fgi_eth_btc_minimum"
STRATEGY_DMA_FGI_ETH_BTC_MINIMUM_SURGICAL = "dma_fgi_eth_btc_minimum_surgical"
STRATEGY_DMA_FGI_ETH_BTC_MINIMUM_STRUCTURAL = "dma_fgi_eth_btc_minimum_structural"
STRATEGY_DMA_FGI_HIERARCHICAL_SPY_CRYPTO = "dma_fgi_hierarchical_spy_crypto"
STRATEGY_DMA_FGI_HIERARCHICAL_CONTROL = "dma_fgi_hierarchical_control"
STRATEGY_DMA_FGI_HIERARCHICAL_FULL = "dma_fgi_hierarchical_full"
STRATEGY_DMA_FGI_HIERARCHICAL_FULL_MINUS_ADAPTIVE_DMA = (
    "dma_fgi_hierarchical_full_minus_adaptive_dma"
)
STRATEGY_DMA_FGI_HIERARCHICAL_PROD = "dma_fgi_hierarchical_prod"
STRATEGY_DMA_FGI_HIERARCHICAL_MINIMUM = "dma_fgi_hierarchical_minimum"
STRATEGY_DMA_FGI_HIERARCHICAL_MINIMUM_DMA_BUFFER = (
    "dma_fgi_hierarchical_minimum_dma_buffer"
)
STRATEGY_DMA_FGI_HIERARCHICAL_MINIMUM_DUAL_ABOVE_HOLD = (
    "dma_fgi_hierarchical_minimum_dual_above_hold"
)
STRATEGY_DMA_FGI_HIERARCHICAL_MINIMUM_CROSS_COOLDOWN = (
    "dma_fgi_hierarchical_minimum_cross_cooldown"
)
STRATEGY_DMA_FGI_HIERARCHICAL_MINIMUM_BELOW_DMA_HOLD = (
    "dma_fgi_hierarchical_minimum_below_dma_hold"
)
STRATEGY_DMA_FGI_HIERARCHICAL_MINIMUM_DMA_DISCIPLINED = (
    "dma_fgi_hierarchical_minimum_dma_disciplined"
)

STRATEGY_DISPLAY_NAMES = {
    STRATEGY_DCA_CLASSIC: "DCA Classic",
    STRATEGY_DMA_GATED_FGI: "DMA Gated FGI",
    STRATEGY_ETH_BTC_ROTATION: "ETH/BTC Relative Strength Rotation",
    STRATEGY_DMA_FGI_ADAPTIVE_BINARY_ETH_BTC: "126% DMA FGI Adaptive Binary ETH/BTC",
    STRATEGY_DMA_FGI_ETH_BTC_MINIMUM: "[RESEARCH] ETH/BTC Minimum (no SPY)",
    STRATEGY_DMA_FGI_ETH_BTC_MINIMUM_SURGICAL: (
        "[RESEARCH] ETH/BTC Minimum - Surgical Composer"
    ),
    STRATEGY_DMA_FGI_ETH_BTC_MINIMUM_STRUCTURAL: (
        "[RESEARCH] ETH/BTC Minimum - Structural Composer"
    ),
    STRATEGY_DMA_FGI_HIERARCHICAL_SPY_CRYPTO: "34% DMA FGI Hierarchical SPY/Crypto",
    STRATEGY_DMA_FGI_HIERARCHICAL_CONTROL: "84% Hierarchical Attribution Control",
    STRATEGY_DMA_FGI_HIERARCHICAL_FULL: "34% Hierarchical Attribution Full",
    STRATEGY_DMA_FGI_HIERARCHICAL_FULL_MINUS_ADAPTIVE_DMA: (
        "102% Hierarchical Full - Adaptive DMA"
    ),
    STRATEGY_DMA_FGI_HIERARCHICAL_PROD: "34% Hierarchical Production",
    STRATEGY_DMA_FGI_HIERARCHICAL_MINIMUM: "Hierarchical Minimum",
    STRATEGY_DMA_FGI_HIERARCHICAL_MINIMUM_DMA_BUFFER: (
        "[RESEARCH] Hierarchical Minimum - DMA Buffer"
    ),
    STRATEGY_DMA_FGI_HIERARCHICAL_MINIMUM_DUAL_ABOVE_HOLD: (
        "[RESEARCH] Hierarchical Minimum - Dual Above Hold"
    ),
    STRATEGY_DMA_FGI_HIERARCHICAL_MINIMUM_CROSS_COOLDOWN: (
        "[RESEARCH] Hierarchical Minimum - Cross Cooldown 30d"
    ),
    STRATEGY_DMA_FGI_HIERARCHICAL_MINIMUM_BELOW_DMA_HOLD: (
        "[RESEARCH] Hierarchical Minimum - Below-DMA Hold"
    ),
    STRATEGY_DMA_FGI_HIERARCHICAL_MINIMUM_DMA_DISCIPLINED: (
        "[RESEARCH] Hierarchical Minimum - DMA Disciplined"
    ),
}

APR_BY_REGIME: dict[str, dict[str, float | dict[str, float]]] = {
    "extreme_fear": {"stable": 0.05, "spot": {"btc": 0.01}},
    "fear": {"stable": 0.08, "spot": {"btc": 0.02}},
    "neutral": {"stable": 0.15, "spot": {"btc": 0.03}},
    "greed": {"stable": 0.20, "spot": {"btc": 0.05}},
    "extreme_greed": {"stable": 0.25, "spot": {"btc": 0.05}},
}

ATH_OVERRIDE_COOLDOWN_DAYS = 7
