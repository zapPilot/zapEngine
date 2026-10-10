from __future__ import annotations

import pytest

from src.services.backtesting.portfolio_rules import technical_triggers
from src.services.backtesting.portfolio_rules.technical_triggers import (
    BollingerLowerBand,
    BollingerUpperBand,
    Breakdown20d,
    Breakout20d,
    MacdBearishCross,
    MacdBullishCross,
    MomentumBreakdown,
    RsiBearishDivergence,
    RsiBullishDivergence,
    RsiOverboughtTurningDown,
    RsiOversoldRecovering,
    TechnicalTrigger,
    VolatilitySpike,
)
from src.services.backtesting.signals.technical import TechnicalSignalSnapshot
from src.services.backtesting.spec.triggers import TRIGGER_SIGNALS

ALL_TRIGGERS: list[TechnicalTrigger] = [
    RsiBearishDivergence(),
    RsiBullishDivergence(),
    RsiOverboughtTurningDown(),
    RsiOversoldRecovering(),
    MacdBearishCross(),
    MacdBullishCross(),
    MomentumBreakdown(),
    VolatilitySpike(),
    BollingerUpperBand(),
    BollingerLowerBand(),
    Breakout20d(),
    Breakdown20d(),
]


def test_every_trigger_has_its_own_signal_name_and_the_spec_knows_it() -> None:
    names = [trigger.signal for trigger in ALL_TRIGGERS]

    assert len(set(names)) == len(names) == 12
    assert set(names) == TRIGGER_SIGNALS


@pytest.mark.parametrize(
    ("trigger", "field"),
    [
        (RsiBearishDivergence(), "bearish_rsi_divergence"),
        (RsiBullishDivergence(), "bullish_rsi_divergence"),
        (MacdBearishCross(), "macd_bearish_cross"),
        (MacdBullishCross(), "macd_bullish_cross"),
        (Breakout20d(), "breakout_20d"),
        (Breakdown20d(), "breakdown_20d"),
    ],
    ids=lambda value: value if isinstance(value, str) else value.signal,
)
def test_an_event_trigger_follows_its_flag(
    trigger: TechnicalTrigger, field: str
) -> None:
    assert trigger("BTC", TechnicalSignalSnapshot(**{field: True}))
    assert not trigger("BTC", TechnicalSignalSnapshot())


def test_the_rsi_triggers_take_their_level_and_need_a_slope() -> None:
    falling = TechnicalSignalSnapshot(rsi_14=65.0, rsi_slope_5d=-3.0)
    rising = TechnicalSignalSnapshot(rsi_14=38.0, rsi_slope_5d=3.0)

    assert not RsiOverboughtTurningDown()("BTC", falling)
    assert RsiOverboughtTurningDown(rsi_at_least=60.0)("BTC", falling)
    assert not RsiOversoldRecovering()("BTC", rising)
    assert RsiOversoldRecovering(rsi_at_most=40.0)("BTC", rising)
    for trigger in (
        RsiOverboughtTurningDown(rsi_at_least=0.0),
        RsiOversoldRecovering(100.0),
    ):
        assert not trigger("BTC", TechnicalSignalSnapshot(rsi_14=50.0))
        assert not trigger("BTC", TechnicalSignalSnapshot(rsi_slope_5d=1.0))


def test_momentum_breakdown_takes_both_levels() -> None:
    reversal = TechnicalSignalSnapshot(momentum_30d=-0.02, momentum_90d=0.15)

    assert MomentumBreakdown()("ETH", reversal)
    assert not MomentumBreakdown(short_momentum_below=-0.05)("ETH", reversal)
    assert not MomentumBreakdown(long_momentum_above=0.20)("ETH", reversal)
    assert not MomentumBreakdown()("ETH", TechnicalSignalSnapshot(momentum_30d=-0.02))
    assert not MomentumBreakdown()("ETH", TechnicalSignalSnapshot(momentum_90d=0.15))


def test_a_volatility_spike_is_judged_per_asset() -> None:
    technical = TechnicalSignalSnapshot(realized_volatility_20d=0.50)

    assert VolatilitySpike()("BTC", technical) is False
    assert VolatilitySpike(thresholds={"BTC": 0.50})("BTC", technical) is True
    assert VolatilitySpike()("SPY", technical) is True
    # An asset without a level never spikes, and neither does missing data.
    assert VolatilitySpike()("DOGE", technical) is False
    assert VolatilitySpike()("SPY", TechnicalSignalSnapshot()) is False


def test_the_bollinger_triggers_take_their_band() -> None:
    stretched_up = TechnicalSignalSnapshot(bollinger_zscore_20=1.6)
    stretched_down = TechnicalSignalSnapshot(bollinger_zscore_20=-1.6)

    assert not BollingerUpperBand()("BTC", stretched_up)
    assert BollingerUpperBand(zscore_at_least=1.5)("BTC", stretched_up)
    assert not BollingerLowerBand()("BTC", stretched_down)
    assert BollingerLowerBand(zscore_at_most=-1.5)("BTC", stretched_down)
    assert not BollingerUpperBand()("BTC", TechnicalSignalSnapshot())
    assert not BollingerLowerBand()("BTC", TechnicalSignalSnapshot())


def test_the_defaults_are_the_levels_the_research_rules_shipped_with() -> None:
    assert RsiOverboughtTurningDown().rsi_at_least == 70.0
    assert RsiOversoldRecovering().rsi_at_most == 35.0
    assert MomentumBreakdown() == MomentumBreakdown(0.0, 0.0)
    assert VolatilitySpike().thresholds == {"SPY": 0.30, "BTC": 0.80, "ETH": 1.00}
    assert BollingerUpperBand().zscore_at_least == 2.0
    assert BollingerLowerBand().zscore_at_most == -2.0


def test_every_trigger_is_a_value_that_compares_by_its_levels() -> None:
    assert RsiOverboughtTurningDown(75.0) == RsiOverboughtTurningDown(75.0)
    assert RsiOverboughtTurningDown(75.0) != RsiOverboughtTurningDown(70.0)
    assert VolatilitySpike() == VolatilitySpike()
    assert set(technical_triggers.__all__) >= {type(t).__name__ for t in ALL_TRIGGERS}
