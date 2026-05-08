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

STRATEGY_ETH_BTC_ROTATION = "eth_btc_rotation"
STRATEGY_DMA_FGI_ETH_BTC_MINIMUM_SURGICAL = "dma_fgi_eth_btc_minimum_surgical"
STRATEGY_DMA_FGI_HIERARCHICAL_CONTROL = "dma_fgi_hierarchical_control"
STRATEGY_DMA_FGI_HIERARCHICAL_MINIMUM = "dma_fgi_hierarchical_minimum"
STRATEGY_DMA_FGI_PORTFOLIO_RULES = "dma_fgi_portfolio_rules"
STRATEGY_DMA_FGI_PORTFOLIO_RULES_MINUS_ADAPTIVE_SIZING = (
    "dma_fgi_portfolio_rules_minus_adaptive_sizing"
)
STRATEGY_DMA_FGI_PORTFOLIO_RULES_MINUS_CROSS_DOWN_EXIT = (
    "dma_fgi_portfolio_rules_minus_cross_down_exit"
)
STRATEGY_DMA_FGI_PORTFOLIO_RULES_MINUS_CROSS_UP_EQ_WEIGHT = (
    "dma_fgi_portfolio_rules_minus_cross_up_eq_weight"
)
STRATEGY_DMA_FGI_PORTFOLIO_RULES_MINUS_EXTREME_FEAR_BUY = (
    "dma_fgi_portfolio_rules_minus_extreme_fear_buy"
)
STRATEGY_DMA_FGI_PORTFOLIO_RULES_MINUS_OVEREXTENSION_SELL = (
    "dma_fgi_portfolio_rules_minus_overextension_sell"
)
STRATEGY_DMA_FGI_PORTFOLIO_RULES_MINUS_FGI_DOWNSHIFT_SELL = (
    "dma_fgi_portfolio_rules_minus_fgi_downshift_sell"
)

STRATEGY_DISPLAY_NAMES = {
    STRATEGY_ETH_BTC_ROTATION: "ETH/BTC Relative Strength Rotation",
    STRATEGY_DMA_FGI_ETH_BTC_MINIMUM_SURGICAL: (
        "[RESEARCH] ETH/BTC Minimum - Surgical Composer"
    ),
    STRATEGY_DMA_FGI_HIERARCHICAL_CONTROL: "84% Hierarchical Attribution Control",
    STRATEGY_DMA_FGI_HIERARCHICAL_MINIMUM: "Hierarchical Minimum",
    STRATEGY_DMA_FGI_PORTFOLIO_RULES: "[RESEARCH] Portfolio Rules",
    STRATEGY_DMA_FGI_PORTFOLIO_RULES_MINUS_ADAPTIVE_SIZING: (
        "[RESEARCH] Portfolio Rules - Adaptive Sizing"
    ),
    STRATEGY_DMA_FGI_PORTFOLIO_RULES_MINUS_CROSS_DOWN_EXIT: (
        "[RESEARCH] Portfolio Rules - Cross-Down Exit"
    ),
    STRATEGY_DMA_FGI_PORTFOLIO_RULES_MINUS_CROSS_UP_EQ_WEIGHT: (
        "[RESEARCH] Portfolio Rules - Cross-Up Equal Weight"
    ),
    STRATEGY_DMA_FGI_PORTFOLIO_RULES_MINUS_EXTREME_FEAR_BUY: (
        "[RESEARCH] Portfolio Rules - Extreme-Fear Buy"
    ),
    STRATEGY_DMA_FGI_PORTFOLIO_RULES_MINUS_OVEREXTENSION_SELL: (
        "[RESEARCH] Portfolio Rules - Overextension Sell"
    ),
    STRATEGY_DMA_FGI_PORTFOLIO_RULES_MINUS_FGI_DOWNSHIFT_SELL: (
        "[RESEARCH] Portfolio Rules - FGI Downshift Sell"
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
