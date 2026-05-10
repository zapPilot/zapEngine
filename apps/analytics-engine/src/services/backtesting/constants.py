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
STRATEGY_DMA_FGI_PORTFOLIO_RULES = "dma_fgi_portfolio_rules"
STRATEGY_DMA_FGI_PORTFOLIO_RULES_MINUS_DMA_STABLE_GATING = (
    "dma_fgi_portfolio_rules_minus_dma_stable_gating"
)
STRATEGY_DMA_FGI_PORTFOLIO_RULES_MINUS_GREED_SELL_SUPPRESSION = (
    "dma_fgi_portfolio_rules_minus_greed_sell_suppression"
)
STRATEGY_DMA_FGI_PORTFOLIO_RULES_MINUS_ETH_BTC_DEVIATION_DCA = (
    "dma_fgi_portfolio_rules_minus_eth_btc_deviation_dca"
)
STRATEGY_DMA_FGI_PORTFOLIO_RULES_MINUS_SPY_LATCH = (
    "dma_fgi_portfolio_rules_minus_spy_latch"
)

STRATEGY_DISPLAY_NAMES = {
    STRATEGY_ETH_BTC_ROTATION: "ETH/BTC Relative Strength Rotation",
    STRATEGY_DMA_FGI_PORTFOLIO_RULES: "[RESEARCH] Portfolio Rules",
    STRATEGY_DMA_FGI_PORTFOLIO_RULES_MINUS_DMA_STABLE_GATING: (
        "[RESEARCH] Portfolio Rules - DMA Stable Gating"
    ),
    STRATEGY_DMA_FGI_PORTFOLIO_RULES_MINUS_GREED_SELL_SUPPRESSION: (
        "[RESEARCH] Portfolio Rules - Greed Sell Suppression"
    ),
    STRATEGY_DMA_FGI_PORTFOLIO_RULES_MINUS_ETH_BTC_DEVIATION_DCA: (
        "[RESEARCH] Portfolio Rules - ETH/BTC Deviation DCA"
    ),
    STRATEGY_DMA_FGI_PORTFOLIO_RULES_MINUS_SPY_LATCH: (
        "[RESEARCH] Portfolio Rules - SPY Latch"
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
