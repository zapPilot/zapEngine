from __future__ import annotations

from typing import Any

from src.services.backtesting.portfolio_rules.base import (
    FgiRegime,
    PortfolioRule,
    ProceedsRouting,
)
from src.services.backtesting.portfolio_rules.components import SignalSettings
from src.services.backtesting.portfolio_rules.cross_down_exit import CrossDownExitRule
from src.services.backtesting.portfolio_rules.cross_up_equal_weight import (
    CrossUpEqualWeightRule,
)
from src.services.backtesting.portfolio_rules.dma_overextension_dca_sell import (
    DmaOverextensionDcaSellRule,
)
from src.services.backtesting.portfolio_rules.eth_btc_deviation_dca import (
    DeviationLeg,
    DeviationTier,
    EthBtcDeviationDcaRule,
)
from src.services.backtesting.portfolio_rules.eth_btc_ratio_rotation import (
    EthBtcRatioRotationRule,
)
from src.services.backtesting.portfolio_rules.fgi_downshift_dca_sell import (
    FgiDownshiftDcaSellRule,
)
from src.services.backtesting.portfolio_rules.spy_latch import SpyLatchRule
from src.services.backtesting.risk import TradeQuotaGuard
from src.services.backtesting.spec import compile_spec, parse_spec
from tests.services.backtesting.spec.helpers import reference_raw, rule_index


def _compiled(raw: dict[str, Any]) -> tuple[PortfolioRule, ...]:
    return compile_spec(parse_spec(raw)).rules


def _rule(raw: dict[str, Any], kind: str) -> PortfolioRule:
    return _compiled(raw)[rule_index(raw, kind)]


def test_priority_is_the_position_in_the_spec() -> None:
    rules = _compiled(reference_raw())

    assert [rule.priority for rule in rules] == [10, 20, 30, 40, 50, 60]


def test_reordering_the_spec_reorders_the_rules() -> None:
    raw = reference_raw()
    raw["rules"][0], raw["rules"][1] = raw["rules"][1], raw["rules"][0]

    assert [rule.name for rule in _compiled(raw)][:2] == [
        "cross_up_equal_weight",
        "cross_down_exit",
    ]


def test_an_overlay_follows_the_rules() -> None:
    raw = reference_raw()
    raw["overlays"] = [
        {"kind": "spy_latch", "id": "spy_latch", "follow_through_days": 21}
    ]

    latch = _compiled(raw)[-1]

    assert latch == SpyLatchRule(name="spy_latch", priority=70, follow_through_days=21)


def test_each_compile_builds_fresh_rules() -> None:
    raw = reference_raw()
    raw["overlays"] = [
        {"kind": "spy_latch", "id": "spy_latch", "follow_through_days": 14}
    ]

    first = _compiled(raw)[-1]
    second = _compiled(raw)[-1]

    assert first is not second


def test_a_guard_becomes_a_trade_quota_guard() -> None:
    raw = reference_raw()
    raw["guards"] = [
        {
            "kind": "trade_quota",
            "min_trade_interval_days": 2,
            "max_trades_7d": 3,
            "max_trades_30d": None,
        }
    ]

    components = compile_spec(parse_spec(raw))

    assert components.risk_guards == (
        TradeQuotaGuard(min_trade_interval_days=2, max_trades_7d=3),
    )


def test_signals_compile_to_signal_settings() -> None:
    raw = reference_raw()
    raw["signals"] = {
        "warmup_days": 20,
        "dma": {
            "feature": "dma_200",
            "cross_cooldown_days": {"SPY": 10, "BTC": 20, "ETH": 25},
            "cross_on_touch": False,
        },
        "ratio": {"cross_cooldown_days": 12},
    }

    assert compile_spec(parse_spec(raw)).signals == SignalSettings(
        warmup_days=20,
        cross_on_touch=False,
        dma_cross_cooldown_days={"SPY": 10, "BTC": 20, "ETH": 25},
        ratio_cross_cooldown_days=12,
    )


def test_a_compiled_spec_has_no_rule_filters() -> None:
    components = compile_spec(parse_spec(reference_raw()))

    assert components.disabled_rules == frozenset()
    assert components.enabled_rules is None


def test_cross_down_exit_kind() -> None:
    raw = reference_raw()
    index = rule_index(raw, "dma_cross_down_exit")
    raw["rules"][index].update(
        cooldown_days=12,
        peer_groups=[["SPY", "BTC", "ETH"]],
        proceeds={"to": [{"asset": "SPY", "share": 0.25}]},
    )

    assert _compiled(raw)[index] == CrossDownExitRule(
        priority=10 * (index + 1),
        cooldown_days=12,
        peer_groups=(("SPY", "BTC", "ETH"),),
        proceeds=ProceedsRouting(to=(("SPY", 0.25),)),
    )


def test_cross_up_rebalance_kind() -> None:
    raw = reference_raw()
    index = rule_index(raw, "dma_cross_up_rebalance")
    raw["rules"][index]["cooldown_days"] = 9

    assert _compiled(raw)[index] == CrossUpEqualWeightRule(
        priority=10 * (index + 1),
        cooldown_days=9,
    )


def test_ratio_cross_rotation_kind() -> None:
    raw = reference_raw()
    index = rule_index(raw, "ratio_cross_rotation")
    raw["rules"][index].update(
        cooldown_days=15,
        cross_up={"sources": ["BTC"], "destination": "ETH"},
        cross_down={"sources": ["ETH", "STABLE"], "destination": "BTC"},
    )

    assert _compiled(raw)[index] == EthBtcRatioRotationRule(
        priority=10 * (index + 1),
        cooldown_days=15,
        up_sources=("btc",),
        up_destination="eth",
        down_sources=("eth", "stable"),
        down_destination="btc",
    )


def test_ratio_deviation_rotation_kind() -> None:
    raw = reference_raw()
    index = rule_index(raw, "ratio_deviation_rotation")
    raw["rules"][index].update(
        tiers=[
            {
                "name": "only",
                "threshold": 0.4,
                "rotation_fraction": 0.5,
                "cooldown_days": 20,
            }
        ],
        below=None,
        above={"source": "ETH", "destination": "BTC"},
    )

    assert _compiled(raw)[index] == EthBtcDeviationDcaRule(
        priority=10 * (index + 1),
        tiers=(
            DeviationTier(
                name="only",
                threshold=0.4,
                rotation_fraction=0.5,
                cooldown_days=20,
            ),
        ),
        below=None,
        above=DeviationLeg(source="eth", destination="btc"),
    )


def test_overextension_trim_kind() -> None:
    raw = reference_raw()
    index = rule_index(raw, "dma_overextension_trim")
    raw["rules"][index].update(
        cooldown_days=5,
        sell_step=0.1,
        thresholds={"SPY": 0.2, "BTC": 0.3, "ETH": 0.6},
        fgi_multipliers={
            "extreme_fear": 1.5,
            "fear": 1.2,
            "neutral": 1.0,
            "greed": 0.7,
            "extreme_greed": 0.4,
        },
        proceeds={"to": [{"asset": "BTC", "share": 0.3}]},
    )

    assert _compiled(raw)[index] == DmaOverextensionDcaSellRule(
        priority=10 * (index + 1),
        cooldown_days=5,
        sell_step=0.1,
        proceeds=ProceedsRouting(to=(("BTC", 0.3),)),
        dma_overextension_thresholds={"SPY": 0.2, "BTC": 0.3, "ETH": 0.6},
        fgi_threshold_multipliers={
            FgiRegime.EXTREME_FEAR: 1.5,
            FgiRegime.FEAR: 1.2,
            FgiRegime.NEUTRAL: 1.0,
            FgiRegime.GREED: 0.7,
            FgiRegime.EXTREME_GREED: 0.4,
        },
    )


def test_fgi_downshift_trim_kind() -> None:
    raw = reference_raw()
    index = rule_index(raw, "fgi_downshift_trim")
    raw["rules"][index].update(
        cooldown_days=3,
        sell_step=0.02,
        from_regimes=["extreme_greed"],
        to_regimes=["greed", "neutral"],
        proceeds={"to": [{"asset": "SPY", "share": 1.0}]},
    )

    assert _compiled(raw)[index] == FgiDownshiftDcaSellRule(
        priority=10 * (index + 1),
        cooldown_days=3,
        sell_step=0.02,
        from_regimes=frozenset({FgiRegime.EXTREME_GREED}),
        to_regimes=frozenset({FgiRegime.GREED, FgiRegime.NEUTRAL}),
        proceeds=ProceedsRouting(to=(("SPY", 1.0),)),
    )
