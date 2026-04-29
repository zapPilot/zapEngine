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
STRATEGY_SPY_ETH_BTC_ROTATION = "spy_eth_btc_rotation"
STRATEGY_DMA_FGI_BTC_ASSET_CONTROL = "dma_gated_fgi_btc_asset_control"
STRATEGY_DMA_FGI_ETH_BTC_CONTROL = "dma_gated_fgi_eth_btc_control"
STRATEGY_DMA_FGI_ADAPTIVE_DMA_REF = "dma_gated_fgi_adaptive_dma_ref"
STRATEGY_DMA_FGI_RATIO_ZONE = "dma_gated_fgi_ratio_zone"
STRATEGY_DMA_FGI_RATIO_COOLDOWN = "dma_gated_fgi_ratio_cooldown"
STRATEGY_DMA_FGI_PROGRESSIVE_ROTATION = "dma_gated_fgi_progressive_rotation"
STRATEGY_ETH_BTC_ROTATION_ATTRIBUTION_FULL = "eth_btc_rotation_attribution_full"
STRATEGY_ETH_BTC_FULL_MINUS_ADAPTIVE_DMA = "eth_btc_full_minus_adaptive_dma"
STRATEGY_ETH_BTC_FULL_MINUS_RATIO_CROSS = "eth_btc_full_minus_ratio_cross"
STRATEGY_ETH_BTC_FULL_MINUS_RATIO_COOLDOWN = "eth_btc_full_minus_ratio_cooldown"
STRATEGY_ETH_BTC_FULL_MINUS_PROGRESSIVE_ROTATION = (
    "eth_btc_full_minus_progressive_rotation"
)
STRATEGY_ETH_BTC_PROGRESSIVE_ADAPTIVE = "eth_btc_progressive_adaptive"
STRATEGY_ETH_BTC_PROGRESSIVE_RATIO_CROSS = "eth_btc_progressive_ratio_cross"
STRATEGY_ETH_BTC_PROGRESSIVE_RATIO_CROSS_COOLDOWN = (
    "eth_btc_progressive_ratio_cross_cooldown"
)

STRATEGY_DISPLAY_NAMES = {
    STRATEGY_DCA_CLASSIC: "DCA Classic",
    STRATEGY_DMA_GATED_FGI: "DMA Gated FGI",
    STRATEGY_ETH_BTC_ROTATION: "ETH/BTC Relative Strength Rotation",
    STRATEGY_SPY_ETH_BTC_ROTATION: "SPY/ETH/BTC Multi-Asset Rotation",
    STRATEGY_DMA_FGI_BTC_ASSET_CONTROL: "DMA FGI BTC Asset Control",
    STRATEGY_DMA_FGI_ETH_BTC_CONTROL: "DMA FGI ETH/BTC Control",
    STRATEGY_DMA_FGI_ADAPTIVE_DMA_REF: "DMA FGI + Adaptive DMA Ref",
    STRATEGY_DMA_FGI_RATIO_ZONE: "DMA FGI + Ratio Zone",
    STRATEGY_DMA_FGI_RATIO_COOLDOWN: "DMA FGI + Ratio Cooldown",
    STRATEGY_DMA_FGI_PROGRESSIVE_ROTATION: "DMA FGI + Progressive Rotation",
    STRATEGY_ETH_BTC_ROTATION_ATTRIBUTION_FULL: "ETH/BTC Attribution Full",
    STRATEGY_ETH_BTC_FULL_MINUS_ADAPTIVE_DMA: "ETH/BTC Full - Adaptive DMA",
    STRATEGY_ETH_BTC_FULL_MINUS_RATIO_CROSS: "ETH/BTC Full - Ratio Cross",
    STRATEGY_ETH_BTC_FULL_MINUS_RATIO_COOLDOWN: "ETH/BTC Full - Ratio Cooldown",
    STRATEGY_ETH_BTC_FULL_MINUS_PROGRESSIVE_ROTATION: (
        "ETH/BTC Full - Progressive Rotation"
    ),
    STRATEGY_ETH_BTC_PROGRESSIVE_ADAPTIVE: "ETH/BTC Progressive + Adaptive DMA",
    STRATEGY_ETH_BTC_PROGRESSIVE_RATIO_CROSS: "ETH/BTC Progressive + Ratio Cross",
    STRATEGY_ETH_BTC_PROGRESSIVE_RATIO_CROSS_COOLDOWN: (
        "ETH/BTC Progressive + Ratio Cross Cooldown"
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
