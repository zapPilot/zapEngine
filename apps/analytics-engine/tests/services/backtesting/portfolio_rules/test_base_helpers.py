from __future__ import annotations

from dataclasses import fields
from datetime import date

import pytest

from src.services.backtesting.decision import RuleGroup
from src.services.backtesting.portfolio_rules import (
    DEFAULT_PORTFOLIO_RULES,
)
from src.services.backtesting.portfolio_rules.base import (
    DIAG_SIGNALS_CONSULTED,
    DcaBuyRuleBase,
    DcaSellRuleBase,
    FgiRegime,
    PortfolioRuleConfig,
    PortfolioSnapshot,
    add_split_proceeds,
    add_stable,
    allocation_key_for_symbol,
    build_dca_buy_intent,
    cross_down_cooldown_days_for,
    current_fgi_regime_for_symbol,
    normalize_regime,
    ratio_signals_consulted,
    rule_cooldown_remaining_days,
    signals_consulted_for_symbols,
)
from src.services.backtesting.portfolio_rules.cross_down_exit import CrossDownExitRule
from src.services.backtesting.risk import DmaBuyGateGuard, TradeQuotaGuard
from src.services.backtesting.signals.ratio_state import EthBtcRatioState
from tests.services.backtesting.portfolio_rules.helpers import snapshot, state


class _FlatSizing:
    @property
    def name(self) -> str:
        return "flat"

    def adjust_step(
        self,
        base_step: float,
        *,
        snapshot: PortfolioSnapshot,
        asset: str,
    ) -> float:
        del snapshot, asset
        return base_step


class _ConcreteDcaBuyRule(DcaBuyRuleBase):
    allocation_name = "test_buy"
    buy_step = 0.10
    reason = "test_buy_reason"
    rule_group: RuleGroup = "dma_fgi"
    sizing = _FlatSizing()

    def _matching_symbols(self, snapshot: PortfolioSnapshot) -> list[str]:
        return ["BTC"] if "BTC" in snapshot.assets else []


class _ConcreteDcaSellRule(DcaSellRuleBase):
    allocation_name = "test_sell"
    sell_step = 0.10
    reason = "test_sell_reason"
    rule_group: RuleGroup = "dma_fgi"
    sizing = _FlatSizing()

    def _matching_symbols(self, snapshot: PortfolioSnapshot) -> list[str]:
        return ["BTC"] if "BTC" in snapshot.assets else []

    def proceeds_handler(self, target: dict[str, float], sold: float) -> None:
        add_stable(target, sold)


def test_default_rule_priorities_leave_room_for_new_rule_layers() -> None:
    assert [(rule.name, rule.priority) for rule in DEFAULT_PORTFOLIO_RULES] == [
        ("cross_down_exit", 10),
        ("cross_up_equal_weight", 20),
        ("eth_btc_ratio_rotation", 21),
        ("eth_btc_deviation_dca", 22),
        ("dma_overextension_dca_sell", 30),
        ("fgi_downshift_dca_sell", 50),
    ]


def test_risk_guard_priorities_preserve_existing_ordering() -> None:
    assert TradeQuotaGuard().priority == 0
    assert DmaBuyGateGuard().priority == 35


def test_add_split_proceeds_default_50_50() -> None:
    target = {"spy": 0.10, "stable": 0.20}

    add_split_proceeds(target, 0.10)

    assert target["spy"] == pytest.approx(0.15)
    assert target["stable"] == pytest.approx(0.25)


def test_add_split_proceeds_custom_share() -> None:
    target = {"spy": 0.0, "stable": 0.0}

    add_split_proceeds(target, 0.10, spy_share=0.25)

    assert target["spy"] == pytest.approx(0.025)
    assert target["stable"] == pytest.approx(0.075)


def test_add_split_proceeds_skips_zero_amount() -> None:
    target = {"spy": 0.10, "stable": 0.20}

    add_split_proceeds(target, 0.0)

    assert target["spy"] == pytest.approx(0.10)
    assert target["stable"] == pytest.approx(0.20)


def test_add_stable_skips_zero_amount() -> None:
    target = {"stable": 0.20}

    add_stable(target, 0.0)

    assert target == {"stable": 0.20}


def test_portfolio_rule_config_only_contains_cross_cutting_diagnostics_flag() -> None:
    assert [field.name for field in fields(PortfolioRuleConfig)] == [
        "emit_signals_consulted"
    ]


def test_cross_down_cooldown_default_map() -> None:
    rule = CrossDownExitRule()

    assert rule.cooldown_days_for("BTC") == 30
    assert rule.cooldown_days_for("ETH") == 30
    assert rule.cooldown_days_for("SPY") == 14


def test_cross_down_cooldown_unknown_symbol_falls_back_to_default() -> None:
    rule = CrossDownExitRule()

    assert rule.cooldown_days_for("DOGE") == 30


def test_cross_down_cooldown_normalizes_symbol_case() -> None:
    rule = CrossDownExitRule()

    assert rule.cooldown_days_for("spy") == 14
    assert rule.cooldown_days_for(" btc ") == 30


def test_cross_down_cooldown_custom_override() -> None:
    rule = CrossDownExitRule(
        cross_down_cooldown_days_per_symbol={"SPY": 14, "BTC": 21},
        cooldown_days=10,
    )

    assert rule.cooldown_days_for("SPY") == 14
    assert rule.cooldown_days_for("BTC") == 21
    assert rule.cooldown_days_for("ETH") == 10


def test_cross_down_cooldown_helper_accepts_rule_local_values() -> None:
    assert (
        cross_down_cooldown_days_for(
            "spy",
            per_symbol={"SPY": 14},
            default=30,
        )
        == 14
    )


def test_allocation_key_for_symbol_rejects_unknown_asset() -> None:
    with pytest.raises(ValueError, match="Unsupported portfolio rule asset"):
        allocation_key_for_symbol("doge")


def test_rule_cooldown_remaining_uses_full_window_for_future_execution_date() -> None:
    remaining = rule_cooldown_remaining_days(
        cooldown_days=14,
        last_executed_at=date(2025, 5, 14),
        current_date=date(2025, 5, 12),
    )

    assert remaining == 14


def test_normalize_regime_accepts_enum_blank_and_rejects_unknown() -> None:
    assert normalize_regime(None) is None
    assert normalize_regime(FgiRegime.GREED) is FgiRegime.GREED
    assert normalize_regime("  ") is None

    with pytest.raises(ValueError, match="Unsupported FGI regime"):
        normalize_regime("panic")


def test_current_fgi_regime_prefers_spy_macro_regime() -> None:
    snap = snapshot(
        assets={
            "SPY": state(
                symbol="SPY",
                fgi_regime="greed",
                macro_fear_greed_regime="fear",
            )
        },
        crypto_regime="extreme_greed",
    )

    assert current_fgi_regime_for_symbol(snap, "SPY") is FgiRegime.FEAR


def test_signals_consulted_skips_missing_symbols_and_reports_active_cooldown() -> None:
    snap = snapshot(
        assets={
            "BTC": state(
                symbol="BTC",
                zone="below",
                cross_event="cross_down",
                fgi_regime="fear",
            )
        },
        cycle_open={"BTC": True},
    )

    signals = signals_consulted_for_symbols(snap, ["BTC", "DOGE"])

    assert signals == {
        "btc.zone": "below",
        "btc.cross": "cross_down",
        "btc.dma_distance": pytest.approx(0.05),
        "btc.fgi": FgiRegime.FEAR,
        "btc.cycle_open": True,
        "btc.cooldown_active": False,
    }
    assert not any(key.startswith("doge.") for key in signals)


def test_ratio_signals_consulted_handles_missing_and_zero_dma_ratio() -> None:
    assert ratio_signals_consulted(snapshot()) == {}

    snap = snapshot(
        eth_btc_ratio_state=EthBtcRatioState(
            ratio=0.08,
            ratio_dma_200=0.0,
            zone="above",
            cross_event="cross_up",
            actionable_cross_event=None,
            cooldown_state=state(symbol="ETH").cooldown_state,
        )
    )

    assert ratio_signals_consulted(snap) == {
        "eth_btc_ratio.zone": "above",
        "eth_btc_ratio.cross": "cross_up",
        "eth_btc_ratio.distance": None,
        "eth_btc_ratio.cooldown_active": False,
    }


def test_build_dca_buy_intent_scales_desired_steps_to_available_stable() -> None:
    snap = snapshot(
        current={"btc": 0.20, "eth": 0.20, "spy": 0.57, "stable": 0.03, "alt": 0.0}
    )

    intent = build_dca_buy_intent(
        snapshot=snap,
        matching_symbols=["BTC", "ETH"],
        sizing=_FlatSizing(),
        buy_step=0.05,
        allocation_name="test_buy",
        reason="test_buy_reason",
        rule_group="dma_fgi",
        emit_signals_consulted=True,
    )

    assert intent.action == "buy"
    assert intent.target_allocation == pytest.approx(
        {"btc": 0.215, "eth": 0.215, "spy": 0.57, "stable": 0.0, "alt": 0.0}
    )
    assert intent.diagnostics is not None
    assert intent.diagnostics[DIAG_SIGNALS_CONSULTED]["btc.zone"] == "above"


def test_dca_rule_base_mixins_delegate_matching_and_intent_building() -> None:
    snap = snapshot(
        current={"btc": 0.20, "eth": 0.20, "spy": 0.20, "stable": 0.40, "alt": 0.0}
    )
    config = PortfolioRuleConfig()

    buy_rule = _ConcreteDcaBuyRule()
    sell_rule = _ConcreteDcaSellRule()

    assert buy_rule.matches(snap, config=config) is True
    assert buy_rule.build_intent(
        snap, config=config
    ).target_allocation == pytest.approx(
        {"btc": 0.30, "eth": 0.20, "spy": 0.20, "stable": 0.30, "alt": 0.0}
    )
    assert sell_rule.matches(snap, config=config) is True
    assert sell_rule.build_intent(
        snap, config=config
    ).target_allocation == pytest.approx(
        {"btc": 0.10, "eth": 0.20, "spy": 0.20, "stable": 0.50, "alt": 0.0}
    )


def test_dca_rule_base_abstract_hooks_raise_when_not_implemented() -> None:
    with pytest.raises(NotImplementedError):
        DcaBuyRuleBase()._matching_symbols(snapshot())
    with pytest.raises(NotImplementedError):
        DcaSellRuleBase()._matching_symbols(snapshot())
    with pytest.raises(NotImplementedError):
        DcaSellRuleBase().proceeds_handler({}, 0.10)
