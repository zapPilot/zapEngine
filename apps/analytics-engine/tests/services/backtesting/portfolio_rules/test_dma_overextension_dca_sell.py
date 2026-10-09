from __future__ import annotations

from dataclasses import replace

import pytest

from src.services.backtesting.portfolio_rules.base import (
    FgiRegime,
    PortfolioRuleConfig,
    ProceedsRouting,
)
from src.services.backtesting.portfolio_rules.dma_overextension_dca_sell import (
    DmaOverextensionDcaSellRule,
)
from tests.services.backtesting.portfolio_rules.helpers import snapshot, state
from tests.services.backtesting.support.reference_rules import reference_rule


def _rule_with_multiplier(
    regime: FgiRegime,
    multiplier: float,
) -> DmaOverextensionDcaSellRule:
    default = reference_rule("dma_overextension_dca_sell")
    return replace(
        default,
        fgi_threshold_multipliers={
            **default.fgi_threshold_multipliers,
            regime: multiplier,
        },
    )


def test_btc_overextension_routes_50_50_spy_stable() -> None:
    rule = reference_rule("dma_overextension_dca_sell")
    initial_spy = 0.20
    initial_stable = 0.10
    rule_snapshot = snapshot(
        assets={
            "SPY": state(symbol="SPY", zone="above", dma_distance=0.10),
            "BTC": state(symbol="BTC", zone="above", dma_distance=0.21),
            "ETH": state(symbol="ETH", zone="above", dma_distance=0.49),
        },
        current={
            "btc": 0.40,
            "eth": 0.30,
            "spy": initial_spy,
            "stable": initial_stable,
            "alt": 0.0,
        },
    )

    intent = rule.build_intent(rule_snapshot, config=PortfolioRuleConfig())

    assert rule.matches(rule_snapshot, config=PortfolioRuleConfig())
    assert intent.action == "sell"
    assert intent.reason == "portfolio_dma_overextension_dca_sell"
    assert intent.target_allocation == pytest.approx(
        {
            "btc": 0.35,
            "eth": 0.30,
            "spy": initial_spy + 0.025,
            "stable": initial_stable + 0.025,
            "alt": 0.0,
        }
    )
    assert intent.diagnostics is not None
    assert intent.diagnostics["portfolio_rule_assets"] == ["BTC"]


def test_spy_overextension_self_rebuys_half() -> None:
    rule = reference_rule("dma_overextension_dca_sell")
    initial_stable = 0.10
    rule_snapshot = snapshot(
        assets={
            "SPY": state(symbol="SPY", zone="above", dma_distance=0.11),
            "BTC": state(symbol="BTC", zone="above", dma_distance=0.19),
            "ETH": state(symbol="ETH", zone="above", dma_distance=0.50),
        },
        current={"btc": 0.30, "eth": 0.30, "spy": 0.30, "stable": 0.10, "alt": 0.0},
    )

    intent = rule.build_intent(rule_snapshot, config=PortfolioRuleConfig())

    # SPY sells 0.05 but receives half of the proceeds, so the net sell is 0.025.
    assert intent.target_allocation == pytest.approx(
        {
            "btc": 0.30,
            "eth": 0.30,
            "spy": 0.275,
            "stable": initial_stable + 0.025,
            "alt": 0.0,
        }
    )
    assert intent.diagnostics is not None
    assert intent.diagnostics["portfolio_rule_assets"] == ["SPY"]


def test_default_greed_multiplier_tightens_btc_overextension_threshold() -> None:
    rule = reference_rule("dma_overextension_dca_sell")
    rule_snapshot = snapshot(
        assets={
            "BTC": state(
                symbol="BTC",
                zone="above",
                dma_distance=0.15,
                fgi_regime="greed",
            )
        },
        current={"btc": 0.40, "eth": 0.0, "spy": 0.0, "stable": 0.60, "alt": 0.0},
    )

    assert rule.matches(rule_snapshot, config=PortfolioRuleConfig())


def test_greed_multiplier_tightens_btc_overextension_threshold() -> None:
    rule = _rule_with_multiplier(FgiRegime.GREED, 0.67)
    rule_snapshot = snapshot(
        assets={
            "BTC": state(
                symbol="BTC",
                zone="above",
                dma_distance=0.15,
                fgi_regime="greed",
            )
        },
        current={"btc": 0.40, "eth": 0.0, "spy": 0.0, "stable": 0.60, "alt": 0.0},
    )

    intent = rule.build_intent(rule_snapshot, config=PortfolioRuleConfig())

    assert rule.matches(rule_snapshot, config=PortfolioRuleConfig())
    assert intent.reason == "portfolio_dma_overextension_dca_sell"
    assert intent.diagnostics is not None
    assert intent.diagnostics["portfolio_rule_assets"] == ["BTC"]


def test_extreme_greed_multiplier_tightens_btc_overextension_threshold() -> None:
    rule = _rule_with_multiplier(FgiRegime.EXTREME_GREED, 0.50)
    rule_snapshot = snapshot(
        assets={
            "BTC": state(
                symbol="BTC",
                zone="above",
                dma_distance=0.11,
                fgi_regime="extreme_greed",
            )
        },
        current={"btc": 0.40, "eth": 0.0, "spy": 0.0, "stable": 0.60, "alt": 0.0},
    )

    intent = rule.build_intent(rule_snapshot, config=PortfolioRuleConfig())

    assert rule.matches(rule_snapshot, config=PortfolioRuleConfig())
    assert intent.reason == "portfolio_dma_overextension_dca_sell"
    assert intent.diagnostics is not None
    assert intent.diagnostics["portfolio_rule_assets"] == ["BTC"]


def test_overextension_proceeds_can_be_routed_to_stable_only() -> None:
    rule = reference_rule("dma_overextension_dca_sell", proceeds=ProceedsRouting())
    rule_snapshot = snapshot(
        assets={"BTC": state(symbol="BTC", zone="above", dma_distance=0.21)},
        current={"btc": 0.40, "eth": 0.0, "spy": 0.0, "stable": 0.60, "alt": 0.0},
    )

    intent = rule.build_intent(rule_snapshot, config=PortfolioRuleConfig())

    assert intent.target_allocation == pytest.approx(
        {"btc": 0.35, "eth": 0.0, "spy": 0.0, "stable": 0.65, "alt": 0.0}
    )


def test_an_asset_without_a_regime_uses_its_plain_threshold() -> None:
    rule = reference_rule("dma_overextension_dca_sell")
    rule_snapshot = snapshot(
        assets={
            "BTC": state(
                symbol="BTC", zone="above", dma_distance=0.15, fgi_regime="greed"
            )
        },
    )
    unknown_regime = replace(
        rule_snapshot,
        crypto_fgi_regime=None,
        assets={
            "BTC": replace(rule_snapshot.assets["BTC"], fgi_regime=None),
        },
    )

    assert rule.matches(rule_snapshot, config=PortfolioRuleConfig())
    assert not rule.matches(unknown_regime, config=PortfolioRuleConfig())


def test_every_regime_has_its_own_multiplier() -> None:
    rule = replace(
        reference_rule("dma_overextension_dca_sell"),
        fgi_threshold_multipliers={
            FgiRegime.EXTREME_FEAR: 2.0,
            FgiRegime.FEAR: 1.0,
            FgiRegime.NEUTRAL: 1.0,
            FgiRegime.GREED: 0.5,
            FgiRegime.EXTREME_GREED: 0.33,
        },
    )
    snapshot_in_extreme_fear = snapshot(
        assets={
            "BTC": state(
                symbol="BTC",
                zone="above",
                dma_distance=0.30,
                fgi_regime="extreme_fear",
            )
        },
        crypto_regime="extreme_fear",
    )

    # 0.20 * 2.0 = 0.40 > 0.30: no sale in extreme fear.
    assert not rule.matches(snapshot_in_extreme_fear, config=PortfolioRuleConfig())
