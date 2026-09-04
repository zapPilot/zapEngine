from __future__ import annotations

from dataclasses import replace

from src.services.backtesting.portfolio_rules import (
    DEFAULT_PORTFOLIO_RULE_NAMES,
    RULE_NAMES,
    TECHNICAL_EXPERIMENT_RULE_NAMES,
)
from src.services.backtesting.portfolio_rules.base import (
    PortfolioRuleConfig,
    PortfolioSnapshot,
)
from src.services.backtesting.portfolio_rules.technical_experiments import (
    BollingerLowerBandDcaBuyRule,
    BollingerUpperBandDcaSellRule,
    Breakdown20dDcaSellRule,
    Breakout20dDcaBuyRule,
    MacdBearishCrossDcaSellRule,
    MacdBullishCrossDcaBuyRule,
    MomentumBreakdownDcaSellRule,
    RsiBearishDivergenceDcaSellRule,
    RsiBullishDivergenceDcaBuyRule,
    RsiOverboughtDcaSellRule,
    RsiOversoldRecoveryDcaBuyRule,
    VolatilitySpikeDcaSellRule,
)
from src.services.backtesting.signals.technical import TechnicalSignalSnapshot
from tests.services.backtesting.portfolio_rules.helpers import snapshot, state

_CONFIG = PortfolioRuleConfig()


def _snapshot_with_btc_technical(
    technical: TechnicalSignalSnapshot,
) -> PortfolioSnapshot:
    btc_state = replace(state(symbol="BTC"), technical=technical)
    return snapshot(
        assets={"BTC": btc_state},
        current={"btc": 0.5, "eth": 0.0, "spy": 0.0, "stable": 0.5, "alt": 0.0},
    )


def test_technical_experiments_are_known_but_not_default_rules() -> None:
    assert TECHNICAL_EXPERIMENT_RULE_NAMES <= RULE_NAMES
    assert TECHNICAL_EXPERIMENT_RULE_NAMES.isdisjoint(DEFAULT_PORTFOLIO_RULE_NAMES)


def test_rsi_bearish_divergence_sell_matches_and_traces_inputs() -> None:
    technical = TechnicalSignalSnapshot(
        rsi_14=68.0,
        rsi_slope_5d=-5.0,
        momentum_30d=0.04,
        momentum_90d=0.20,
        realized_volatility_20d=0.60,
        macd_12_26=1200.0,
        macd_signal_9=1250.0,
        macd_histogram=-50.0,
        bollinger_zscore_20=1.2,
        bearish_rsi_divergence=True,
    )
    market = _snapshot_with_btc_technical(technical)
    rule = RsiBearishDivergenceDcaSellRule()

    assert rule.matches(market, config=_CONFIG)
    intent = rule.build_intent(market, config=_CONFIG)
    assert intent.diagnostics is not None
    traced = intent.diagnostics["technical_signals"]
    assert isinstance(traced, dict)
    assert traced["BTC"] == {
        "rsi_14": 68.0,
        "rsi_slope_5d": -5.0,
        "realized_volatility_20d": 0.60,
        "momentum_30d": 0.04,
        "momentum_90d": 0.20,
        "macd_12_26": 1200.0,
        "macd_signal_9": 1250.0,
        "macd_histogram": -50.0,
        "bollinger_zscore_20": 1.2,
        "bearish_rsi_divergence": True,
        "bullish_rsi_divergence": False,
        "macd_bearish_cross": False,
        "macd_bullish_cross": False,
        "breakout_20d": False,
        "breakdown_20d": False,
    }


def test_rsi_overbought_sell_requires_falling_rsi() -> None:
    matching = _snapshot_with_btc_technical(
        TechnicalSignalSnapshot(rsi_14=74.0, rsi_slope_5d=-6.0)
    )
    rising = _snapshot_with_btc_technical(
        TechnicalSignalSnapshot(rsi_14=74.0, rsi_slope_5d=2.0)
    )

    rule = RsiOverboughtDcaSellRule()
    assert rule.matches(matching, config=_CONFIG)
    assert not rule.matches(rising, config=_CONFIG)


def test_momentum_breakdown_sell_matches_short_term_reversal() -> None:
    market = _snapshot_with_btc_technical(
        TechnicalSignalSnapshot(momentum_30d=-0.04, momentum_90d=0.20)
    )

    assert MomentumBreakdownDcaSellRule().matches(market, config=_CONFIG)


def test_volatility_spike_sell_uses_asset_threshold() -> None:
    market = _snapshot_with_btc_technical(
        TechnicalSignalSnapshot(realized_volatility_20d=0.90)
    )

    assert VolatilitySpikeDcaSellRule().matches(market, config=_CONFIG)


def test_rsi_bullish_divergence_buy_matches_inside_uptrend() -> None:
    market = _snapshot_with_btc_technical(
        TechnicalSignalSnapshot(bullish_rsi_divergence=True)
    )

    assert RsiBullishDivergenceDcaBuyRule().matches(market, config=_CONFIG)


def test_rsi_oversold_recovery_buy_requires_positive_rsi_slope() -> None:
    matching = _snapshot_with_btc_technical(
        TechnicalSignalSnapshot(rsi_14=32.0, rsi_slope_5d=4.0)
    )
    falling = _snapshot_with_btc_technical(
        TechnicalSignalSnapshot(rsi_14=32.0, rsi_slope_5d=-2.0)
    )

    rule = RsiOversoldRecoveryDcaBuyRule()
    assert rule.matches(matching, config=_CONFIG)
    assert not rule.matches(falling, config=_CONFIG)


def test_macd_cross_rules_match_directional_crosses() -> None:
    bearish = _snapshot_with_btc_technical(
        TechnicalSignalSnapshot(macd_bearish_cross=True)
    )
    bullish = _snapshot_with_btc_technical(
        TechnicalSignalSnapshot(macd_bullish_cross=True)
    )

    assert MacdBearishCrossDcaSellRule().matches(bearish, config=_CONFIG)
    assert MacdBullishCrossDcaBuyRule().matches(bullish, config=_CONFIG)


def test_bollinger_rules_match_two_sigma_extremes() -> None:
    upper = _snapshot_with_btc_technical(
        TechnicalSignalSnapshot(bollinger_zscore_20=2.1)
    )
    lower = _snapshot_with_btc_technical(
        TechnicalSignalSnapshot(bollinger_zscore_20=-2.1)
    )

    assert BollingerUpperBandDcaSellRule().matches(upper, config=_CONFIG)
    assert BollingerLowerBandDcaBuyRule().matches(lower, config=_CONFIG)


def test_channel_break_rules_match_20d_extremes() -> None:
    breakout = _snapshot_with_btc_technical(
        TechnicalSignalSnapshot(breakout_20d=True)
    )
    breakdown = _snapshot_with_btc_technical(
        TechnicalSignalSnapshot(breakdown_20d=True)
    )

    assert Breakout20dDcaBuyRule().matches(breakout, config=_CONFIG)
    assert Breakdown20dDcaSellRule().matches(breakdown, config=_CONFIG)
