from __future__ import annotations

from dataclasses import replace
from datetime import date

from src.services.backtesting.portfolio_rules import (
    ALL_PORTFOLIO_RULES,
    DEFAULT_PORTFOLIO_RULE_NAMES,
    DEFAULT_PORTFOLIO_RULES,
    RULE_NAMES,
    TECHNICAL_EXPERIMENT_RULE_NAMES,
)
from src.services.backtesting.portfolio_rules.base import (
    PortfolioRule,
    PortfolioRuleConfig,
    PortfolioSnapshot,
)
from src.services.backtesting.portfolio_rules.technical_experiments import (
    TECHNICAL_EXPERIMENT_RULES,
)
from src.services.backtesting.signals.dma_gated_fgi.types import DmaMarketState
from src.services.backtesting.signals.flat_minimum import FlatMinimumState
from src.services.backtesting.signals.technical import TechnicalSignalSnapshot
from src.services.backtesting.strategies.rule_based_portfolio import (
    RuleBasedPortfolioStrategy,
)
from tests.services.backtesting.portfolio_rules.helpers import snapshot, state

_CONFIG = PortfolioRuleConfig()
_CURRENT = {"btc": 0.5, "eth": 0.0, "spy": 0.0, "stable": 0.5, "alt": 0.0}
_TECHNICAL_REASONS = {f"portfolio_{name}" for name in TECHNICAL_EXPERIMENT_RULE_NAMES}
_EVERY_SIGNAL_FIRING = TechnicalSignalSnapshot(
    rsi_14=95.0,
    rsi_slope_5d=-10.0,
    realized_volatility_20d=5.0,
    momentum_30d=-0.10,
    momentum_90d=0.50,
    macd_12_26=1.0,
    macd_signal_9=2.0,
    macd_histogram=-1.0,
    bollinger_zscore_20=3.0,
    bearish_rsi_divergence=True,
    bullish_rsi_divergence=True,
    macd_bearish_cross=True,
    macd_bullish_cross=True,
    breakout_20d=True,
    breakdown_20d=True,
)


def _rule(name: str) -> PortfolioRule:
    return next(rule for rule in TECHNICAL_EXPERIMENT_RULES if rule.name == name)


def _btc_state(technical: TechnicalSignalSnapshot) -> DmaMarketState:
    return replace(state(symbol="BTC"), technical=technical)


def _snapshot_with_btc_technical(
    technical: TechnicalSignalSnapshot,
) -> PortfolioSnapshot:
    return snapshot(assets={"BTC": _btc_state(technical)}, current=dict(_CURRENT))


def _flat_state(technical: TechnicalSignalSnapshot) -> FlatMinimumState:
    return FlatMinimumState(
        spy_dma_state=state(symbol="SPY"),
        btc_dma_state=_btc_state(technical),
        eth_dma_state=state(symbol="ETH"),
        current_asset_allocation=dict(_CURRENT),
        current_date=date(2025, 3, 13),
    )


def test_technical_experiments_are_known_but_not_default_rules() -> None:
    assert TECHNICAL_EXPERIMENT_RULE_NAMES <= RULE_NAMES
    assert TECHNICAL_EXPERIMENT_RULE_NAMES.isdisjoint(DEFAULT_PORTFOLIO_RULE_NAMES)


def test_technical_experiments_rank_after_every_default_rule() -> None:
    priorities = [rule.priority for rule in TECHNICAL_EXPERIMENT_RULES]
    experiment_names = [rule.name for rule in TECHNICAL_EXPERIMENT_RULES]

    assert len(set(priorities)) == len(priorities)
    assert min(priorities) > max(rule.priority for rule in DEFAULT_PORTFOLIO_RULES)
    assert [rule.name for rule in ALL_PORTFOLIO_RULES][-len(priorities) :] == (
        experiment_names
    )


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
    rule = _rule("rsi_bearish_divergence_dca_sell")

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

    rule = _rule("rsi_overbought_dca_sell")
    assert rule.matches(matching, config=_CONFIG)
    assert not rule.matches(rising, config=_CONFIG)


def test_momentum_breakdown_sell_matches_short_term_reversal() -> None:
    market = _snapshot_with_btc_technical(
        TechnicalSignalSnapshot(momentum_30d=-0.04, momentum_90d=0.20)
    )

    assert _rule("momentum_breakdown_dca_sell").matches(market, config=_CONFIG)


def test_volatility_spike_sell_uses_asset_threshold() -> None:
    technical = TechnicalSignalSnapshot(realized_volatility_20d=0.90)
    btc_above_threshold = _snapshot_with_btc_technical(technical)
    eth_below_threshold = snapshot(
        assets={"ETH": replace(state(symbol="ETH"), technical=technical)},
        current=dict(_CURRENT),
    )

    rule = _rule("volatility_spike_dca_sell")
    assert rule.matches(btc_above_threshold, config=_CONFIG)
    assert not rule.matches(eth_below_threshold, config=_CONFIG)


def test_rsi_bullish_divergence_buy_matches_inside_uptrend() -> None:
    market = _snapshot_with_btc_technical(
        TechnicalSignalSnapshot(bullish_rsi_divergence=True)
    )

    assert _rule("rsi_bullish_divergence_dca_buy").matches(market, config=_CONFIG)


def test_rsi_oversold_recovery_buy_requires_positive_rsi_slope() -> None:
    matching = _snapshot_with_btc_technical(
        TechnicalSignalSnapshot(rsi_14=32.0, rsi_slope_5d=4.0)
    )
    falling = _snapshot_with_btc_technical(
        TechnicalSignalSnapshot(rsi_14=32.0, rsi_slope_5d=-2.0)
    )

    rule = _rule("rsi_oversold_recovery_dca_buy")
    assert rule.matches(matching, config=_CONFIG)
    assert not rule.matches(falling, config=_CONFIG)


def test_macd_cross_rules_match_directional_crosses() -> None:
    bearish = _snapshot_with_btc_technical(
        TechnicalSignalSnapshot(macd_bearish_cross=True)
    )
    bullish = _snapshot_with_btc_technical(
        TechnicalSignalSnapshot(macd_bullish_cross=True)
    )

    assert _rule("macd_bearish_cross_dca_sell").matches(bearish, config=_CONFIG)
    assert _rule("macd_bullish_cross_dca_buy").matches(bullish, config=_CONFIG)


def test_bollinger_rules_match_two_sigma_extremes() -> None:
    upper = _snapshot_with_btc_technical(
        TechnicalSignalSnapshot(bollinger_zscore_20=2.1)
    )
    lower = _snapshot_with_btc_technical(
        TechnicalSignalSnapshot(bollinger_zscore_20=-2.1)
    )

    assert _rule("bollinger_upper_band_dca_sell").matches(upper, config=_CONFIG)
    assert _rule("bollinger_lower_band_dca_buy").matches(lower, config=_CONFIG)


def test_channel_break_rules_match_20d_extremes() -> None:
    breakout = _snapshot_with_btc_technical(TechnicalSignalSnapshot(breakout_20d=True))
    breakdown = _snapshot_with_btc_technical(
        TechnicalSignalSnapshot(breakdown_20d=True)
    )

    assert _rule("breakout_20d_dca_buy").matches(breakout, config=_CONFIG)
    assert _rule("breakdown_20d_dca_sell").matches(breakdown, config=_CONFIG)


def test_technical_rules_ignore_assets_below_their_long_term_trend() -> None:
    below_trend = snapshot(
        assets={
            "BTC": replace(
                state(symbol="BTC", zone="below"),
                technical=_EVERY_SIGNAL_FIRING,
            )
        },
        current=dict(_CURRENT),
    )

    assert not any(
        rule.matches(below_trend, config=_CONFIG) for rule in TECHNICAL_EXPERIMENT_RULES
    )


def test_enabled_technical_rule_drives_a_strategy_decision() -> None:
    strategy = RuleBasedPortfolioStrategy(
        total_capital=10_000.0,
        params={"enabled_rules": ["breakout_20d_dca_buy"]},
    )

    intent = strategy.decision_policy.decide(
        _flat_state(TechnicalSignalSnapshot(breakout_20d=True))
    )

    assert intent.action == "buy"
    assert intent.reason == "portfolio_breakout_20d_dca_buy"
    assert intent.diagnostics is not None
    traced = intent.diagnostics["technical_signals"]
    assert isinstance(traced, dict)
    assert traced["BTC"]["breakout_20d"] is True


def test_default_strategy_never_selects_a_technical_rule() -> None:
    strategy = RuleBasedPortfolioStrategy(total_capital=10_000.0)

    intent = strategy.decision_policy.decide(_flat_state(_EVERY_SIGNAL_FIRING))

    assert intent.reason not in _TECHNICAL_REASONS
    assert "technical_signals" not in (intent.diagnostics or {})
