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
STRATEGY_DMA_FGI_ADAPTIVE_BINARY_ETH_BTC = "dma_fgi_adaptive_binary_eth_btc"
STRATEGY_DMA_FGI_HIERARCHICAL_SPY_CRYPTO = "dma_fgi_hierarchical_spy_crypto"
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
STRATEGY_DMA_FGI_HIERARCHICAL_CONTROL = "dma_fgi_hierarchical_control"
STRATEGY_DMA_FGI_HIERARCHICAL_FULL = "dma_fgi_hierarchical_full"
STRATEGY_DMA_FGI_HIERARCHICAL_FULL_MINUS_ADAPTIVE_DMA = (
    "dma_fgi_hierarchical_full_minus_adaptive_dma"
)
STRATEGY_DMA_FGI_HIERARCHICAL_FULL_MINUS_SPY_LATCH = (
    "dma_fgi_hierarchical_full_minus_spy_latch"
)
STRATEGY_DMA_FGI_HIERARCHICAL_FULL_MINUS_GREED_SELL_SUPPRESSION = (
    "dma_fgi_hierarchical_full_minus_greed_sell_suppression"
)
STRATEGY_DMA_FGI_HIERARCHICAL_FULL_MINUS_BUY_FLOOR = (
    "dma_fgi_hierarchical_full_minus_buy_floor"
)
STRATEGY_DMA_FGI_HIERARCHICAL_FULL_MINUS_FEAR_RECOVERY_BUY = (
    "dma_fgi_hierarchical_full_minus_fear_recovery_buy"
)
STRATEGY_DMA_FGI_HIERARCHICAL_NODMA_FULL_MINUS_SPY_LATCH = (
    "dma_fgi_hierarchical_nodma_full_minus_spy_latch"
)
STRATEGY_DMA_FGI_HIERARCHICAL_NODMA_FULL_MINUS_GREED_SELL_SUPPRESSION = (
    "dma_fgi_hierarchical_nodma_full_minus_greed_sell_suppression"
)
STRATEGY_DMA_FGI_HIERARCHICAL_NODMA_FULL_MINUS_BUY_FLOOR = (
    "dma_fgi_hierarchical_nodma_full_minus_buy_floor"
)
STRATEGY_DMA_FGI_HIERARCHICAL_NODMA_FULL_MINUS_FEAR_RECOVERY_BUY = (
    "dma_fgi_hierarchical_nodma_full_minus_fear_recovery_buy"
)
STRATEGY_DMA_FGI_HIERARCHICAL_ADAPTIVE_DMA_ONLY = (
    "dma_fgi_hierarchical_adaptive_dma_only"
)
STRATEGY_DMA_FGI_HIERARCHICAL_SPY_LATCH_ONLY = "dma_fgi_hierarchical_spy_latch_only"
STRATEGY_DMA_FGI_HIERARCHICAL_GREED_SUPPRESSION_ONLY = (
    "dma_fgi_hierarchical_greed_suppression_only"
)
STRATEGY_DMA_FGI_HIERARCHICAL_BUY_FLOOR_ONLY = "dma_fgi_hierarchical_buy_floor_only"
STRATEGY_DMA_FGI_HIERARCHICAL_FEAR_RECOVERY_ONLY = (
    "dma_fgi_hierarchical_fear_recovery_only"
)
STRATEGY_DMA_FGI_HIERARCHICAL_PROD = "dma_fgi_hierarchical_prod"
STRATEGY_DMA_FGI_HIERARCHICAL_MINIMUM = "dma_fgi_hierarchical_minimum"
STRATEGY_DMA_FGI_HIERARCHICAL_MINIMUM_MINUS_GREED_SUPPRESSION = (
    "dma_fgi_hierarchical_minimum_minus_greed_suppression"
)
STRATEGY_DMA_FGI_HIERARCHICAL_MINIMUM_MINUS_DMA_GATING = (
    "dma_fgi_hierarchical_minimum_minus_dma_gating"
)

STRATEGY_DISPLAY_NAMES = {
    STRATEGY_DCA_CLASSIC: "DCA Classic",
    STRATEGY_DMA_GATED_FGI: "DMA Gated FGI",
    STRATEGY_ETH_BTC_ROTATION: "ETH/BTC Relative Strength Rotation",
    STRATEGY_SPY_ETH_BTC_ROTATION: "SPY/ETH/BTC Multi-Asset Rotation",
    STRATEGY_DMA_FGI_ADAPTIVE_BINARY_ETH_BTC: "126% DMA FGI Adaptive Binary ETH/BTC",
    STRATEGY_DMA_FGI_HIERARCHICAL_SPY_CRYPTO: "34% DMA FGI Hierarchical SPY/Crypto",
    STRATEGY_DMA_FGI_ADAPTIVE_DMA_REF: "(60%) DMA FGI + Adaptive DMA Ref",
    STRATEGY_DMA_FGI_RATIO_ZONE: "51% DMA FGI + Ratio Zone",
    STRATEGY_DMA_FGI_RATIO_COOLDOWN: "(60%) DMA FGI + Ratio Cooldown",
    STRATEGY_DMA_FGI_PROGRESSIVE_ROTATION: "(80%) DMA FGI + Progressive Rotation",
    STRATEGY_ETH_BTC_ROTATION_ATTRIBUTION_FULL: "(115%) ETH/BTC Attribution Full",
    STRATEGY_ETH_BTC_FULL_MINUS_ADAPTIVE_DMA: "79% ETH/BTC Full - Adaptive DMA",
    STRATEGY_ETH_BTC_FULL_MINUS_RATIO_CROSS: "118% ETH/BTC Full - Ratio Cross",
    STRATEGY_ETH_BTC_FULL_MINUS_RATIO_COOLDOWN: "116% ETH/BTC Full - Ratio Cooldown",
    STRATEGY_ETH_BTC_FULL_MINUS_PROGRESSIVE_ROTATION: (
        "126% ETH/BTC Full - Progressive Rotation"
    ),
    STRATEGY_ETH_BTC_PROGRESSIVE_ADAPTIVE: "118% ETH/BTC Progressive + Adaptive DMA",
    STRATEGY_ETH_BTC_PROGRESSIVE_RATIO_CROSS: "79% ETH/BTC Progressive + Ratio Cross",
    STRATEGY_ETH_BTC_PROGRESSIVE_RATIO_CROSS_COOLDOWN: (
        "79% ETH/BTC Progressive + Ratio Cross Cooldown"
    ),
    STRATEGY_DMA_FGI_HIERARCHICAL_CONTROL: "84% Hierarchical Attribution Control",
    STRATEGY_DMA_FGI_HIERARCHICAL_FULL: "34% Hierarchical Attribution Full",
    STRATEGY_DMA_FGI_HIERARCHICAL_FULL_MINUS_ADAPTIVE_DMA: (
        "102% Hierarchical Full - Adaptive DMA"
    ),
    STRATEGY_DMA_FGI_HIERARCHICAL_FULL_MINUS_SPY_LATCH: (
        "[DEPRECATED] 33% Hierarchical Full - SPY Latch"
    ),
    STRATEGY_DMA_FGI_HIERARCHICAL_FULL_MINUS_GREED_SELL_SUPPRESSION: (
        "[DEPRECATED] 33% Hierarchical Full - Greed Sell Suppression"
    ),
    STRATEGY_DMA_FGI_HIERARCHICAL_FULL_MINUS_BUY_FLOOR: (
        "[DEPRECATED] 34% Hierarchical Full - Buy Floor"
    ),
    STRATEGY_DMA_FGI_HIERARCHICAL_FULL_MINUS_FEAR_RECOVERY_BUY: (
        "[DEPRECATED] 32% Hierarchical Full - Fear Recovery Buy"
    ),
    STRATEGY_DMA_FGI_HIERARCHICAL_NODMA_FULL_MINUS_SPY_LATCH: (
        "106% Hierarchical NoDMA Full - SPY Latch"
    ),
    STRATEGY_DMA_FGI_HIERARCHICAL_NODMA_FULL_MINUS_GREED_SELL_SUPPRESSION: (
        "82% Hierarchical NoDMA Full - Greed Sell Suppression"
    ),
    STRATEGY_DMA_FGI_HIERARCHICAL_NODMA_FULL_MINUS_BUY_FLOOR: (
        "99% Hierarchical NoDMA Full - Buy Floor"
    ),
    STRATEGY_DMA_FGI_HIERARCHICAL_NODMA_FULL_MINUS_FEAR_RECOVERY_BUY: (
        "102% Hierarchical NoDMA Full - Fear Recovery Buy"
    ),
    STRATEGY_DMA_FGI_HIERARCHICAL_ADAPTIVE_DMA_ONLY: (
        "[DEPRECATED] 32% Hierarchical Adaptive DMA Only"
    ),
    STRATEGY_DMA_FGI_HIERARCHICAL_SPY_LATCH_ONLY: ("81% Hierarchical SPY Latch Only"),
    STRATEGY_DMA_FGI_HIERARCHICAL_GREED_SUPPRESSION_ONLY: (
        "105% Hierarchical Greed Suppression Only"
    ),
    STRATEGY_DMA_FGI_HIERARCHICAL_BUY_FLOOR_ONLY: ("85% Hierarchical Buy Floor Only"),
    STRATEGY_DMA_FGI_HIERARCHICAL_FEAR_RECOVERY_ONLY: (
        "[DEPRECATED] 13% Hierarchical Fear Recovery Only"
    ),
    STRATEGY_DMA_FGI_HIERARCHICAL_PROD: "34% Hierarchical Production",
    STRATEGY_DMA_FGI_HIERARCHICAL_MINIMUM: "Hierarchical Minimum",
    STRATEGY_DMA_FGI_HIERARCHICAL_MINIMUM_MINUS_GREED_SUPPRESSION: (
        "Hierarchical Minimum - Greed Sell Suppression"
    ),
    STRATEGY_DMA_FGI_HIERARCHICAL_MINIMUM_MINUS_DMA_GATING: (
        "Hierarchical Minimum - DMA Gating"
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
