"""Core constants for the DMA-first backtesting framework."""

from __future__ import annotations

PRIMER_DAYS = 7
# The model window: the live suggestion, the published snapshot and the daily
# backtest refresh all replay this many days ending at a reference date, so the
# strategy a user is told to follow is the one the track record was measured on.
MODEL_WINDOW_DAYS = 500
MODEL_TOTAL_CAPITAL = 10_000.0
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
STRATEGY_DMA_FGI_PORTFOLIO_RULES = "dma_fgi_portfolio_rules"

# The spec the production strategy runs: a locked reference.
DMA_FGI_REFERENCE_SPEC = "reference/dma_fgi"

STRATEGY_DISPLAY_NAMES = {
    STRATEGY_DCA_CLASSIC: "DCA Classic",
    STRATEGY_DMA_FGI_PORTFOLIO_RULES: "DMA/FGI Portfolio Rules",
}

# Default simulation assumptions. Every backtest runs under a BacktestAssumptions
# and echoes it on the response, so a number is never shown without its premises.
#
# Signals read the day's close, so nobody can act on them before the next day: an
# order placed on bar i fills on bar i + 1. 0 fills on the decision bar and exists
# only to measure what the lag costs.
DEFAULT_FILL_LAG_DAYS = 1
# Fees plus spread on a retail swap, charged on every transfer's gross amount.
DEFAULT_SLIPPAGE_RATE = 0.003
# A conservative lending-market rate for idle stablecoins. The previous model paid
# 5-25% depending on the FGI label, which flatters a strategy that sits in stable
# for most of the window. BTC, ETH and SPY earn no yield.
DEFAULT_STABLE_APR = 0.03

ATH_OVERRIDE_COOLDOWN_DAYS = 7
