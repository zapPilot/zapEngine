from __future__ import annotations

from datetime import date

import pytest

from src.services.backtesting.execution.portfolio import Portfolio
from src.services.backtesting.features import (
    ETH_BTC_RATIO_DMA_200_FEATURE,
    ETH_BTC_RATIO_FEATURE,
)
from src.services.backtesting.strategies.base import StrategyAction, StrategyContext
from src.services.backtesting.strategies.dma_gated_fgi import DmaGatedFgiParams
from src.services.backtesting.strategies.eth_btc_rotation import (
    EthBtcRelativeStrengthSignalComponent,
    EthBtcRotationDecisionPolicy,
    EthBtcRotationParams,
    EthBtcRotationStrategy,
    _coerce_optional_float,
    _normalize_asset_allocation,
    build_initial_eth_btc_asset_allocation,
    default_eth_btc_rotation_params,
)


def _build_context(
    *,
    snapshot_date: date,
    portfolio: Portfolio,
    btc_price: float,
    eth_price: float,
    dma_200: float,
    sentiment_label: str,
    sentiment_value: int,
    ratio: float | None,
    ratio_dma_200: float | None,
    context_price: float | None = None,
    eth_dma_200: float | None = None,
) -> StrategyContext:
    extra_data: dict[str, object] = {"dma_200": dma_200}
    if ratio is not None:
        extra_data[ETH_BTC_RATIO_FEATURE] = ratio
    if ratio_dma_200 is not None:
        extra_data[ETH_BTC_RATIO_DMA_200_FEATURE] = ratio_dma_200
    if eth_dma_200 is not None:
        extra_data["eth_dma_200"] = eth_dma_200
    return StrategyContext(
        date=snapshot_date,
        price=btc_price if context_price is None else context_price,
        sentiment={"label": sentiment_label, "value": sentiment_value},
        price_history=[btc_price],
        portfolio=portfolio,
        price_map={"btc": btc_price, "eth": eth_price},
        extra_data=extra_data,
    )


def _buy_gate_payload(action: StrategyAction) -> dict[str, object] | None:
    for diagnostic in action.snapshot.execution.plugin_diagnostics:
        if diagnostic.plugin_id == "dma_buy_gate":
            return dict(diagnostic.payload)
    return None


def test_signal_component_marks_ratio_state_unavailable_when_ratio_missing() -> None:
    component = EthBtcRelativeStrengthSignalComponent()
    portfolio = Portfolio(spot_balance=0.05, stable_balance=5_000.0, spot_asset="BTC")

    init_context = _build_context(
        snapshot_date=date(2025, 1, 1),
        portfolio=portfolio,
        btc_price=100_000.0,
        eth_price=5_000.0,
        dma_200=95_000.0,
        sentiment_label="neutral",
        sentiment_value=50,
        ratio=0.040,
        ratio_dma_200=0.050,
    )
    component.initialize(init_context)
    component.warmup(init_context)

    missing_context = _build_context(
        snapshot_date=date(2025, 1, 2),
        portfolio=portfolio,
        btc_price=101_000.0,
        eth_price=5_100.0,
        dma_200=95_000.0,
        sentiment_label="neutral",
        sentiment_value=50,
        ratio=None,
        ratio_dma_200=None,
    )
    snapshot = component.observe(missing_context)

    assert snapshot.ratio_distance is None
    assert snapshot.ratio_zone is None
    assert snapshot.ratio_cross_event is None
    assert (
        snapshot.current_asset_allocation["btc"]
        > snapshot.current_asset_allocation["eth"]
    )


def test_signal_component_uses_eth_dma_for_outer_gate_when_holding_eth() -> None:
    """When portfolio holds ETH, outer DMA gate uses ETH price vs ETH DMA-200."""
    component = EthBtcRelativeStrengthSignalComponent(
        config=DmaGatedFgiParams(cross_cooldown_days=0).build_signal_config()
    )
    portfolio = Portfolio(
        stable_balance=0.0,
        spot_asset="ETH",
        btc_balance=0.0,
        eth_balance=1.0,
    )

    warmup_context = _build_context(
        snapshot_date=date(2025, 1, 1),
        portfolio=portfolio,
        btc_price=99_000.0,
        eth_price=1_980.0,
        dma_200=100_000.0,
        eth_dma_200=1_800.0,
        sentiment_label="neutral",
        sentiment_value=50,
        ratio=0.020,
        ratio_dma_200=0.050,
        context_price=1_980.0,
    )
    component.initialize(warmup_context)
    component.warmup(warmup_context)

    # ETH price 2120 > ETH DMA 2000 → above, distance = 0.06
    context = _build_context(
        snapshot_date=date(2025, 1, 2),
        portfolio=portfolio,
        btc_price=106_000.0,
        eth_price=2_120.0,
        dma_200=100_000.0,
        eth_dma_200=2_000.0,
        sentiment_label="neutral",
        sentiment_value=52,
        ratio=0.020,
        ratio_dma_200=0.050,
        context_price=2_120.0,
    )
    snapshot = component.observe(context)

    # Outer DMA should use ETH price (2120) vs ETH DMA (2000)
    assert snapshot.dma_state.dma_200 == pytest.approx(2_000.0)
    assert snapshot.dma_state.dma_distance == pytest.approx(0.06)
    assert snapshot.dma_state.zone == "above"


def test_signal_component_uses_btc_dma_for_outer_gate_when_holding_btc() -> None:
    """When portfolio holds BTC, outer DMA gate uses BTC price vs BTC DMA-200."""
    component = EthBtcRelativeStrengthSignalComponent(
        config=DmaGatedFgiParams(cross_cooldown_days=0).build_signal_config()
    )
    portfolio = Portfolio(
        stable_balance=0.0,
        spot_asset="BTC",
        btc_balance=0.06,
        eth_balance=0.0,
    )

    warmup_context = _build_context(
        snapshot_date=date(2025, 1, 1),
        portfolio=portfolio,
        btc_price=99_000.0,
        eth_price=1_980.0,
        dma_200=100_000.0,
        sentiment_label="neutral",
        sentiment_value=50,
        ratio=0.020,
        ratio_dma_200=0.050,
    )
    component.initialize(warmup_context)
    component.warmup(warmup_context)

    # BTC price 106k > BTC DMA 100k → above, distance = 0.06
    context = _build_context(
        snapshot_date=date(2025, 1, 2),
        portfolio=portfolio,
        btc_price=106_000.0,
        eth_price=1_908.0,
        dma_200=100_000.0,
        sentiment_label="neutral",
        sentiment_value=52,
        ratio=0.018,
        ratio_dma_200=0.050,
    )
    snapshot = component.observe(context)

    assert snapshot.dma_state.dma_200 == pytest.approx(100_000.0)
    assert snapshot.dma_state.dma_distance == pytest.approx(0.06)
    assert snapshot.dma_state.zone == "above"


def test_decision_policy_reuses_dma_stable_gate_and_builds_asset_target() -> None:
    component = EthBtcRelativeStrengthSignalComponent(
        config=DmaGatedFgiParams(cross_cooldown_days=0).build_signal_config()
    )
    decision_policy = EthBtcRotationDecisionPolicy()
    portfolio = Portfolio(spot_balance=0.0, stable_balance=10_000.0, spot_asset="BTC")

    warmup_context = _build_context(
        snapshot_date=date(2025, 1, 1),
        portfolio=portfolio,
        btc_price=90_000.0,
        eth_price=4_500.0,
        dma_200=100_000.0,
        sentiment_label="fear",
        sentiment_value=25,
        ratio=0.050,
        ratio_dma_200=0.050,
    )
    component.initialize(warmup_context)
    component.warmup(warmup_context)

    context = _build_context(
        snapshot_date=date(2025, 1, 2),
        portfolio=portfolio,
        btc_price=89_000.0,
        eth_price=4_450.0,
        dma_200=100_000.0,
        sentiment_label="extreme_fear",
        sentiment_value=10,
        ratio=0.060,
        ratio_dma_200=0.050,
    )
    snapshot = component.observe(context)
    intent = decision_policy.decide(snapshot)

    assert intent.action == "buy"
    assert intent.target_allocation == {"btc": 1.0, "eth": 0.0, "stable": 0.0}


def test_decision_policy_non_cross_buy_keeps_full_risk_target_not_immediate() -> None:
    component = EthBtcRelativeStrengthSignalComponent(
        config=DmaGatedFgiParams(cross_cooldown_days=0).build_signal_config()
    )
    decision_policy = EthBtcRotationDecisionPolicy()
    portfolio = Portfolio(spot_balance=0.0, stable_balance=10_000.0, spot_asset="BTC")

    warmup_context = _build_context(
        snapshot_date=date(2025, 11, 18),
        portfolio=portfolio,
        btc_price=85_000.0,
        eth_price=3_400.0,
        dma_200=100_000.0,
        sentiment_label="fear",
        sentiment_value=25,
        ratio=0.040,
        ratio_dma_200=0.050,
    )
    component.initialize(warmup_context)
    component.warmup(warmup_context)

    context = _build_context(
        snapshot_date=date(2025, 11, 19),
        portfolio=portfolio,
        btc_price=84_000.0,
        eth_price=5_040.0,
        dma_200=100_000.0,
        sentiment_label="extreme_fear",
        sentiment_value=10,
        ratio=0.060,
        ratio_dma_200=0.050,
    )
    snapshot = component.observe(context)
    intent = decision_policy.decide(snapshot)

    assert snapshot.dma_state.cross_event is None
    assert snapshot.ratio_cross_event == "cross_up"
    assert intent.action == "buy"
    assert intent.reason == "below_extreme_fear_buy"
    assert intent.immediate is False
    assert intent.target_allocation == {"btc": 0.0, "eth": 1.0, "stable": 0.0}


def test_decision_policy_dma_cross_up_remains_immediate_full_risk_on() -> None:
    component = EthBtcRelativeStrengthSignalComponent(
        config=DmaGatedFgiParams(cross_cooldown_days=0).build_signal_config()
    )
    decision_policy = EthBtcRotationDecisionPolicy()
    portfolio = Portfolio(spot_balance=0.0, stable_balance=10_000.0, spot_asset="BTC")

    warmup_context = _build_context(
        snapshot_date=date(2025, 1, 1),
        portfolio=portfolio,
        btc_price=90_000.0,
        eth_price=3_600.0,
        dma_200=100_000.0,
        sentiment_label="neutral",
        sentiment_value=50,
        ratio=0.040,
        ratio_dma_200=0.050,
    )
    component.initialize(warmup_context)
    component.warmup(warmup_context)

    context = _build_context(
        snapshot_date=date(2025, 1, 2),
        portfolio=portfolio,
        btc_price=101_000.0,
        eth_price=4_040.0,
        dma_200=100_000.0,
        sentiment_label="neutral",
        sentiment_value=50,
        ratio=0.040,
        ratio_dma_200=0.050,
    )
    snapshot = component.observe(context)
    intent = decision_policy.decide(snapshot)

    assert snapshot.dma_state.cross_event == "cross_up"
    assert intent.action == "buy"
    assert intent.reason == "dma_cross_up"
    assert intent.immediate is True
    assert intent.target_allocation == {"btc": 0.0, "eth": 1.0, "stable": 0.0}


def test_decision_policy_ignores_token_ath_sell_when_above_dma_and_neutral() -> None:
    component = EthBtcRelativeStrengthSignalComponent(
        config=DmaGatedFgiParams(cross_cooldown_days=0).build_signal_config()
    )
    decision_policy = EthBtcRotationDecisionPolicy()
    portfolio = Portfolio(
        stable_balance=0.0,
        spot_asset="ETH",
        btc_balance=0.0,
        eth_balance=1.0,
    )

    warmup_context = _build_context(
        snapshot_date=date(2025, 4, 30),
        portfolio=portfolio,
        btc_price=95_000.0,
        eth_price=1_900.0,
        dma_200=90_000.0,
        eth_dma_200=1_800.0,
        sentiment_label="neutral",
        sentiment_value=50,
        ratio=0.020,
        ratio_dma_200=0.050,
        context_price=1_900.0,
    )
    component.initialize(warmup_context)
    component.warmup(warmup_context)

    context = _build_context(
        snapshot_date=date(2025, 5, 1),
        portfolio=portfolio,
        btc_price=96_000.0,
        eth_price=2_100.0,
        dma_200=90_000.0,
        eth_dma_200=1_800.0,
        sentiment_label="neutral",
        sentiment_value=52,
        ratio=0.019,
        ratio_dma_200=0.050,
        context_price=2_100.0,
    )
    snapshot = component.observe(context)
    intent = decision_policy.decide(snapshot)

    assert snapshot.dma_state.ath_event in ("token_ath", "both_ath")
    assert snapshot.dma_state.zone == "above"
    assert intent.action == "hold"
    assert intent.reason == "regime_no_signal"


def test_decision_policy_ignores_both_ath_sell_when_above_dma_and_neutral() -> None:
    component = EthBtcRelativeStrengthSignalComponent(
        config=DmaGatedFgiParams(cross_cooldown_days=0).build_signal_config()
    )
    decision_policy = EthBtcRotationDecisionPolicy()
    portfolio = Portfolio(
        stable_balance=0.0,
        spot_asset="ETH",
        btc_balance=0.0,
        eth_balance=1.0,
    )

    warmup_context = _build_context(
        snapshot_date=date(2025, 5, 7),
        portfolio=portfolio,
        btc_price=96_000.0,
        eth_price=2_000.0,
        dma_200=90_000.0,
        eth_dma_200=1_800.0,
        sentiment_label="neutral",
        sentiment_value=50,
        ratio=0.020,
        ratio_dma_200=0.050,
        context_price=2_000.0,
    )
    component.initialize(warmup_context)
    component.warmup(warmup_context)

    context = _build_context(
        snapshot_date=date(2025, 5, 8),
        portfolio=portfolio,
        btc_price=97_000.0,
        eth_price=2_300.0,
        dma_200=90_000.0,
        eth_dma_200=1_800.0,
        sentiment_label="neutral",
        sentiment_value=52,
        ratio=0.021,
        ratio_dma_200=0.050,
        context_price=2_300.0,
    )
    snapshot = component.observe(context)
    intent = decision_policy.decide(snapshot)

    assert snapshot.dma_state.ath_event == "both_ath"
    assert snapshot.dma_state.zone == "above"
    assert intent.action == "hold"
    assert intent.reason == "regime_no_signal"


def test_decision_policy_preserves_greed_sell_priority_over_ath() -> None:
    component = EthBtcRelativeStrengthSignalComponent(
        config=DmaGatedFgiParams(cross_cooldown_days=0).build_signal_config()
    )
    decision_policy = EthBtcRotationDecisionPolicy()
    portfolio = Portfolio(
        stable_balance=0.0,
        spot_asset="ETH",
        btc_balance=0.0,
        eth_balance=1.0,
    )

    warmup_context = _build_context(
        snapshot_date=date(2025, 5, 7),
        portfolio=portfolio,
        btc_price=96_000.0,
        eth_price=1_900.0,
        dma_200=90_000.0,
        eth_dma_200=1_800.0,
        sentiment_label="neutral",
        sentiment_value=50,
        ratio=0.020,
        ratio_dma_200=0.050,
        context_price=1_900.0,
    )
    component.initialize(warmup_context)
    component.warmup(warmup_context)

    context = _build_context(
        snapshot_date=date(2025, 5, 8),
        portfolio=portfolio,
        btc_price=97_000.0,
        eth_price=2_100.0,
        dma_200=90_000.0,
        eth_dma_200=1_800.0,
        sentiment_label="greed",
        sentiment_value=72,
        ratio=0.019,
        ratio_dma_200=0.050,
        context_price=2_100.0,
    )
    snapshot = component.observe(context)
    intent = decision_policy.decide(snapshot)

    assert snapshot.dma_state.ath_event in ("token_ath", "both_ath")
    assert snapshot.dma_state.zone == "above"
    assert intent.action == "sell"
    assert intent.reason == "above_greed_sell"


def test_decision_policy_rotates_btc_into_eth_without_changing_stable_gate() -> None:
    component = EthBtcRelativeStrengthSignalComponent()
    decision_policy = EthBtcRotationDecisionPolicy()
    portfolio = Portfolio(
        stable_balance=4_000.0,
        spot_asset="BTC",
        btc_balance=0.06,
        eth_balance=0.0,
    )

    warmup_context = _build_context(
        snapshot_date=date(2025, 1, 1),
        portfolio=portfolio,
        btc_price=100_000.0,
        eth_price=5_000.0,
        dma_200=95_000.0,
        sentiment_label="neutral",
        sentiment_value=50,
        ratio=0.050,
        ratio_dma_200=0.050,
    )
    component.initialize(warmup_context)
    component.warmup(warmup_context)

    context = _build_context(
        snapshot_date=date(2025, 1, 2),
        portfolio=portfolio,
        btc_price=99_000.0,
        eth_price=4_950.0,
        dma_200=95_000.0,
        sentiment_label="neutral",
        sentiment_value=50,
        ratio=0.040,
        ratio_dma_200=0.050,
    )
    snapshot = component.observe(context)
    intent = decision_policy.decide(snapshot)

    assert intent.action == "hold"
    assert intent.rule_group == "rotation"
    assert intent.reason == "eth_btc_ratio_rebalance"
    assert intent.target_allocation is not None
    assert intent.target_allocation["stable"] == pytest.approx(
        snapshot.current_asset_allocation["stable"]
    )
    assert intent.target_allocation["eth"] == pytest.approx(
        1.0 - snapshot.current_asset_allocation["stable"]
    )
    assert intent.target_allocation["btc"] == pytest.approx(0.0)


def test_decision_policy_below_ratio_dma_holds_full_eth_without_trimming() -> None:
    component = EthBtcRelativeStrengthSignalComponent()
    decision_policy = EthBtcRotationDecisionPolicy()
    portfolio = Portfolio(
        stable_balance=4_000.0,
        spot_asset="ETH",
        btc_balance=0.0,
        eth_balance=1.2,
    )

    warmup_context = _build_context(
        snapshot_date=date(2025, 1, 1),
        portfolio=portfolio,
        btc_price=100_000.0,
        eth_price=5_000.0,
        dma_200=95_000.0,
        eth_dma_200=4_500.0,
        sentiment_label="neutral",
        sentiment_value=50,
        ratio=0.040,
        ratio_dma_200=0.050,
    )
    component.initialize(warmup_context)
    component.warmup(warmup_context)

    context = _build_context(
        snapshot_date=date(2025, 1, 2),
        portfolio=portfolio,
        btc_price=99_000.0,
        eth_price=4_950.0,
        dma_200=95_000.0,
        eth_dma_200=4_500.0,
        sentiment_label="neutral",
        sentiment_value=50,
        ratio=0.039,
        ratio_dma_200=0.050,
    )
    snapshot = component.observe(context)
    intent = decision_policy.decide(snapshot)

    assert intent.action == "hold"
    assert intent.rule_group == "rotation"
    assert intent.allocation_name == "eth_btc_ratio_rebalance"
    assert intent.reason == "regime_no_signal"
    assert intent.target_allocation is not None
    assert intent.target_allocation["btc"] == pytest.approx(0.0)
    assert intent.target_allocation["eth"] == pytest.approx(
        1.0 - snapshot.current_asset_allocation["stable"]
    )
    assert intent.target_allocation["stable"] == pytest.approx(
        snapshot.current_asset_allocation["stable"]
    )


def test_decision_policy_above_ratio_dma_rotates_eth_into_btc() -> None:
    component = EthBtcRelativeStrengthSignalComponent()
    decision_policy = EthBtcRotationDecisionPolicy()
    portfolio = Portfolio(
        stable_balance=4_000.0,
        spot_asset="ETH",
        btc_balance=0.0,
        eth_balance=1.2,
    )

    warmup_context = _build_context(
        snapshot_date=date(2025, 1, 1),
        portfolio=portfolio,
        btc_price=100_000.0,
        eth_price=5_000.0,
        dma_200=95_000.0,
        eth_dma_200=4_500.0,
        sentiment_label="neutral",
        sentiment_value=50,
        ratio=0.060,
        ratio_dma_200=0.050,
    )
    component.initialize(warmup_context)
    component.warmup(warmup_context)

    context = _build_context(
        snapshot_date=date(2025, 1, 2),
        portfolio=portfolio,
        btc_price=99_000.0,
        eth_price=4_950.0,
        dma_200=95_000.0,
        eth_dma_200=4_500.0,
        sentiment_label="neutral",
        sentiment_value=50,
        ratio=0.061,
        ratio_dma_200=0.050,
    )
    snapshot = component.observe(context)
    intent = decision_policy.decide(snapshot)

    assert intent.action == "hold"
    assert intent.rule_group == "rotation"
    assert intent.reason == "eth_btc_ratio_rebalance"
    assert intent.target_allocation is not None
    assert intent.target_allocation["btc"] == pytest.approx(
        1.0 - snapshot.current_asset_allocation["stable"]
    )
    assert intent.target_allocation["eth"] == pytest.approx(0.0)
    assert intent.target_allocation["stable"] == pytest.approx(
        snapshot.current_asset_allocation["stable"]
    )


def test_decision_policy_above_ratio_dma_holds_full_btc_without_buying_eth() -> None:
    component = EthBtcRelativeStrengthSignalComponent()
    decision_policy = EthBtcRotationDecisionPolicy()
    portfolio = Portfolio(
        stable_balance=4_000.0,
        spot_asset="BTC",
        btc_balance=0.06,
        eth_balance=0.0,
    )

    warmup_context = _build_context(
        snapshot_date=date(2025, 1, 1),
        portfolio=portfolio,
        btc_price=100_000.0,
        eth_price=5_000.0,
        dma_200=95_000.0,
        sentiment_label="neutral",
        sentiment_value=50,
        ratio=0.060,
        ratio_dma_200=0.050,
    )
    component.initialize(warmup_context)
    component.warmup(warmup_context)

    context = _build_context(
        snapshot_date=date(2025, 1, 2),
        portfolio=portfolio,
        btc_price=99_000.0,
        eth_price=4_950.0,
        dma_200=95_000.0,
        sentiment_label="neutral",
        sentiment_value=50,
        ratio=0.061,
        ratio_dma_200=0.050,
    )
    snapshot = component.observe(context)
    intent = decision_policy.decide(snapshot)

    assert intent.action == "hold"
    assert intent.rule_group == "rotation"
    assert intent.reason == "regime_no_signal"
    assert intent.target_allocation is not None
    assert intent.target_allocation["btc"] == pytest.approx(
        1.0 - snapshot.current_asset_allocation["stable"]
    )
    assert intent.target_allocation["eth"] == pytest.approx(0.0)
    assert intent.target_allocation["stable"] == pytest.approx(
        snapshot.current_asset_allocation["stable"]
    )


def test_decision_policy_ratio_cross_up_forces_immediate_full_eth_rotation() -> None:
    component = EthBtcRelativeStrengthSignalComponent()
    decision_policy = EthBtcRotationDecisionPolicy()
    portfolio = Portfolio(
        stable_balance=4_000.0,
        spot_asset="BTC",
        btc_balance=0.06,
        eth_balance=0.0,
    )

    warmup_context = _build_context(
        snapshot_date=date(2025, 1, 1),
        portfolio=portfolio,
        btc_price=100_000.0,
        eth_price=5_000.0,
        dma_200=95_000.0,
        sentiment_label="neutral",
        sentiment_value=50,
        ratio=0.040,
        ratio_dma_200=0.050,
    )
    component.initialize(warmup_context)
    component.warmup(warmup_context)

    context = _build_context(
        snapshot_date=date(2025, 1, 2),
        portfolio=portfolio,
        btc_price=99_000.0,
        eth_price=4_950.0,
        dma_200=95_000.0,
        sentiment_label="neutral",
        sentiment_value=50,
        ratio=0.060,
        ratio_dma_200=0.050,
    )
    snapshot = component.observe(context)
    intent = decision_policy.decide(snapshot)

    assert snapshot.ratio_cross_event == "cross_up"
    assert intent.action == "hold"
    assert intent.immediate is True
    assert intent.reason == "eth_btc_ratio_cross_up"
    assert intent.target_allocation is not None
    assert intent.target_allocation["btc"] == pytest.approx(0.0)
    assert intent.target_allocation["eth"] == pytest.approx(
        1.0 - snapshot.current_asset_allocation["stable"]
    )
    assert intent.target_allocation["stable"] == pytest.approx(
        snapshot.current_asset_allocation["stable"]
    )


def test_signal_component_ratio_cross_up_commit_starts_cooldown_blocking_above() -> (
    None
):
    component = EthBtcRelativeStrengthSignalComponent(ratio_cross_cooldown_days=30)
    decision_policy = EthBtcRotationDecisionPolicy()
    portfolio = Portfolio(
        stable_balance=4_000.0,
        spot_asset="BTC",
        btc_balance=0.06,
        eth_balance=0.0,
    )

    warmup_context = _build_context(
        snapshot_date=date(2025, 1, 1),
        portfolio=portfolio,
        btc_price=100_000.0,
        eth_price=5_000.0,
        dma_200=95_000.0,
        sentiment_label="neutral",
        sentiment_value=50,
        ratio=0.040,
        ratio_dma_200=0.050,
    )
    component.initialize(warmup_context)
    component.warmup(warmup_context)

    context = _build_context(
        snapshot_date=date(2025, 1, 2),
        portfolio=portfolio,
        btc_price=99_000.0,
        eth_price=4_950.0,
        dma_200=95_000.0,
        sentiment_label="neutral",
        sentiment_value=50,
        ratio=0.060,
        ratio_dma_200=0.050,
    )
    snapshot = component.observe(context)
    intent = decision_policy.decide(snapshot)
    committed = component.apply_intent(
        current_date=context.date,
        snapshot=snapshot,
        intent=intent,
    )

    assert snapshot.ratio_cross_event == "cross_up"
    assert committed.ratio_cooldown_state.active is True
    assert committed.ratio_cooldown_state.remaining_days == 30
    assert committed.ratio_cooldown_state.blocked_zone == "above"


def test_decision_policy_ratio_cross_down_forces_immediate_full_btc_rotation() -> None:
    component = EthBtcRelativeStrengthSignalComponent()
    decision_policy = EthBtcRotationDecisionPolicy()
    portfolio = Portfolio(
        stable_balance=4_000.0,
        spot_asset="ETH",
        btc_balance=0.0,
        eth_balance=1.2,
    )

    warmup_context = _build_context(
        snapshot_date=date(2025, 1, 1),
        portfolio=portfolio,
        btc_price=100_000.0,
        eth_price=5_000.0,
        dma_200=95_000.0,
        eth_dma_200=4_500.0,
        sentiment_label="neutral",
        sentiment_value=50,
        ratio=0.060,
        ratio_dma_200=0.050,
    )
    component.initialize(warmup_context)
    component.warmup(warmup_context)

    context = _build_context(
        snapshot_date=date(2025, 1, 2),
        portfolio=portfolio,
        btc_price=99_000.0,
        eth_price=4_950.0,
        dma_200=95_000.0,
        eth_dma_200=4_500.0,
        sentiment_label="neutral",
        sentiment_value=50,
        ratio=0.040,
        ratio_dma_200=0.050,
    )
    snapshot = component.observe(context)
    intent = decision_policy.decide(snapshot)

    assert snapshot.ratio_cross_event == "cross_down"
    assert intent.action == "hold"
    assert intent.immediate is True
    assert intent.reason == "eth_btc_ratio_cross_down"
    assert intent.target_allocation is not None
    assert intent.target_allocation["btc"] == pytest.approx(
        1.0 - snapshot.current_asset_allocation["stable"]
    )
    assert intent.target_allocation["eth"] == pytest.approx(0.0)
    assert intent.target_allocation["stable"] == pytest.approx(
        snapshot.current_asset_allocation["stable"]
    )


def test_signal_component_ratio_cross_down_commit_starts_cooldown_blocking_below() -> (
    None
):
    component = EthBtcRelativeStrengthSignalComponent(ratio_cross_cooldown_days=30)
    decision_policy = EthBtcRotationDecisionPolicy()
    portfolio = Portfolio(
        stable_balance=4_000.0,
        spot_asset="ETH",
        btc_balance=0.0,
        eth_balance=1.2,
    )

    warmup_context = _build_context(
        snapshot_date=date(2025, 1, 1),
        portfolio=portfolio,
        btc_price=100_000.0,
        eth_price=5_000.0,
        dma_200=95_000.0,
        eth_dma_200=4_500.0,
        sentiment_label="neutral",
        sentiment_value=50,
        ratio=0.060,
        ratio_dma_200=0.050,
    )
    component.initialize(warmup_context)
    component.warmup(warmup_context)

    context = _build_context(
        snapshot_date=date(2025, 1, 2),
        portfolio=portfolio,
        btc_price=99_000.0,
        eth_price=4_950.0,
        dma_200=95_000.0,
        eth_dma_200=4_500.0,
        sentiment_label="neutral",
        sentiment_value=50,
        ratio=0.040,
        ratio_dma_200=0.050,
    )
    snapshot = component.observe(context)
    intent = decision_policy.decide(snapshot)
    committed = component.apply_intent(
        current_date=context.date,
        snapshot=snapshot,
        intent=intent,
    )

    assert snapshot.ratio_cross_event == "cross_down"
    assert committed.ratio_cooldown_state.active is True
    assert committed.ratio_cooldown_state.remaining_days == 30
    assert committed.ratio_cooldown_state.blocked_zone == "below"


def test_decision_policy_at_ratio_dma_holds_current_btc_eth_split() -> None:
    component = EthBtcRelativeStrengthSignalComponent()
    decision_policy = EthBtcRotationDecisionPolicy()
    portfolio = Portfolio(
        stable_balance=4_000.0,
        spot_asset="BTC",
        btc_balance=0.03,
        eth_balance=0.6,
    )

    warmup_context = _build_context(
        snapshot_date=date(2025, 1, 1),
        portfolio=portfolio,
        btc_price=100_000.0,
        eth_price=5_000.0,
        dma_200=95_000.0,
        sentiment_label="neutral",
        sentiment_value=50,
        ratio=0.050,
        ratio_dma_200=0.050,
    )
    component.initialize(warmup_context)
    component.warmup(warmup_context)

    context = _build_context(
        snapshot_date=date(2025, 1, 2),
        portfolio=portfolio,
        btc_price=99_000.0,
        eth_price=4_950.0,
        dma_200=95_000.0,
        sentiment_label="neutral",
        sentiment_value=50,
        ratio=0.050,
        ratio_dma_200=0.050,
    )
    snapshot = component.observe(context)
    intent = decision_policy.decide(snapshot)

    assert snapshot.ratio_zone == "at"
    assert snapshot.ratio_cross_event is None
    assert intent.action == "hold"
    assert intent.rule_group == "none"
    assert intent.reason == "regime_no_signal"
    assert intent.target_allocation == {
        "btc": pytest.approx(snapshot.current_asset_allocation["btc"]),
        "eth": pytest.approx(snapshot.current_asset_allocation["eth"]),
        "stable": pytest.approx(snapshot.current_asset_allocation["stable"]),
    }


def test_rotation_neutral_band_and_max_deviation_do_not_affect_runtime_decisions() -> (
    None
):
    portfolio = Portfolio(
        stable_balance=4_000.0,
        spot_asset="BTC",
        btc_balance=0.06,
        eth_balance=0.0,
    )
    default_component = EthBtcRelativeStrengthSignalComponent(
        rotation_neutral_band=0.01,
        rotation_max_deviation=0.10,
    )
    wide_component = EthBtcRelativeStrengthSignalComponent(
        rotation_neutral_band=0.25,
        rotation_max_deviation=0.80,
    )
    decision_policy = EthBtcRotationDecisionPolicy()

    warmup_context = _build_context(
        snapshot_date=date(2025, 1, 1),
        portfolio=portfolio,
        btc_price=100_000.0,
        eth_price=5_000.0,
        dma_200=95_000.0,
        sentiment_label="neutral",
        sentiment_value=50,
        ratio=0.050,
        ratio_dma_200=0.050,
    )
    context = _build_context(
        snapshot_date=date(2025, 1, 2),
        portfolio=portfolio,
        btc_price=99_000.0,
        eth_price=4_950.0,
        dma_200=95_000.0,
        sentiment_label="neutral",
        sentiment_value=50,
        ratio=0.040,
        ratio_dma_200=0.050,
    )

    default_component.initialize(warmup_context)
    default_component.warmup(warmup_context)
    wide_component.initialize(warmup_context)
    wide_component.warmup(warmup_context)

    default_intent = decision_policy.decide(default_component.observe(context))
    wide_intent = decision_policy.decide(wide_component.observe(context))

    assert default_intent.target_allocation == wide_intent.target_allocation
    assert default_intent.reason == wide_intent.reason


def test_decision_policy_ratio_cooldown_blocks_above_zone_revert_after_cross_up() -> (
    None
):
    component = EthBtcRelativeStrengthSignalComponent(ratio_cross_cooldown_days=30)
    decision_policy = EthBtcRotationDecisionPolicy()
    btc_portfolio = Portfolio(
        stable_balance=4_000.0,
        spot_asset="BTC",
        btc_balance=0.06,
        eth_balance=0.0,
    )

    warmup_context = _build_context(
        snapshot_date=date(2025, 1, 1),
        portfolio=btc_portfolio,
        btc_price=100_000.0,
        eth_price=5_000.0,
        dma_200=95_000.0,
        sentiment_label="neutral",
        sentiment_value=50,
        ratio=0.040,
        ratio_dma_200=0.050,
    )
    component.initialize(warmup_context)
    component.warmup(warmup_context)

    cross_context = _build_context(
        snapshot_date=date(2025, 1, 2),
        portfolio=btc_portfolio,
        btc_price=99_000.0,
        eth_price=4_950.0,
        dma_200=95_000.0,
        sentiment_label="neutral",
        sentiment_value=50,
        ratio=0.060,
        ratio_dma_200=0.050,
    )
    cross_snapshot = component.observe(cross_context)
    cross_intent = decision_policy.decide(cross_snapshot)
    component.apply_intent(
        current_date=cross_context.date,
        snapshot=cross_snapshot,
        intent=cross_intent,
    )

    eth_portfolio = Portfolio(
        stable_balance=4_000.0,
        spot_asset="ETH",
        btc_balance=0.0,
        eth_balance=1.2,
    )
    blocked_context = _build_context(
        snapshot_date=date(2025, 1, 3),
        portfolio=eth_portfolio,
        btc_price=100_000.0,
        eth_price=5_100.0,
        dma_200=95_000.0,
        eth_dma_200=4_500.0,
        sentiment_label="neutral",
        sentiment_value=50,
        ratio=0.061,
        ratio_dma_200=0.050,
    )
    blocked_snapshot = component.observe(blocked_context)
    blocked_intent = decision_policy.decide(blocked_snapshot)

    assert blocked_snapshot.ratio_cooldown_state.active is True
    assert blocked_snapshot.ratio_cooldown_state.blocked_zone == "above"
    assert blocked_intent.action == "hold"
    assert blocked_intent.reason == "eth_btc_ratio_above_side_cooldown_active"
    assert blocked_intent.target_allocation is not None
    assert blocked_intent.target_allocation["btc"] == pytest.approx(0.0)
    assert blocked_intent.target_allocation["eth"] == pytest.approx(
        1.0 - blocked_snapshot.current_asset_allocation["stable"]
    )


def test_decision_policy_ratio_cooldown_blocks_below_zone_revert_after_cross_down() -> (
    None
):
    component = EthBtcRelativeStrengthSignalComponent(ratio_cross_cooldown_days=30)
    decision_policy = EthBtcRotationDecisionPolicy()
    eth_portfolio = Portfolio(
        stable_balance=4_000.0,
        spot_asset="ETH",
        btc_balance=0.0,
        eth_balance=1.2,
    )

    warmup_context = _build_context(
        snapshot_date=date(2025, 1, 1),
        portfolio=eth_portfolio,
        btc_price=100_000.0,
        eth_price=5_000.0,
        dma_200=95_000.0,
        eth_dma_200=4_500.0,
        sentiment_label="neutral",
        sentiment_value=50,
        ratio=0.060,
        ratio_dma_200=0.050,
    )
    component.initialize(warmup_context)
    component.warmup(warmup_context)

    cross_context = _build_context(
        snapshot_date=date(2025, 1, 2),
        portfolio=eth_portfolio,
        btc_price=99_000.0,
        eth_price=4_950.0,
        dma_200=95_000.0,
        eth_dma_200=4_500.0,
        sentiment_label="neutral",
        sentiment_value=50,
        ratio=0.040,
        ratio_dma_200=0.050,
    )
    cross_snapshot = component.observe(cross_context)
    cross_intent = decision_policy.decide(cross_snapshot)
    component.apply_intent(
        current_date=cross_context.date,
        snapshot=cross_snapshot,
        intent=cross_intent,
    )

    btc_portfolio = Portfolio(
        stable_balance=4_000.0,
        spot_asset="BTC",
        btc_balance=0.06,
        eth_balance=0.0,
    )
    blocked_context = _build_context(
        snapshot_date=date(2025, 1, 3),
        portfolio=btc_portfolio,
        btc_price=100_000.0,
        eth_price=3_900.0,
        dma_200=95_000.0,
        sentiment_label="neutral",
        sentiment_value=50,
        ratio=0.039,
        ratio_dma_200=0.050,
    )
    blocked_snapshot = component.observe(blocked_context)
    blocked_intent = decision_policy.decide(blocked_snapshot)

    assert blocked_snapshot.ratio_cooldown_state.active is True
    assert blocked_snapshot.ratio_cooldown_state.blocked_zone == "below"
    assert blocked_intent.action == "hold"
    assert blocked_intent.reason == "eth_btc_ratio_below_side_cooldown_active"
    assert blocked_intent.target_allocation is not None
    assert blocked_intent.target_allocation["eth"] == pytest.approx(0.0)
    assert blocked_intent.target_allocation["btc"] == pytest.approx(
        1.0 - blocked_snapshot.current_asset_allocation["stable"]
    )


def test_decision_policy_opposite_ratio_cross_blocked_during_cooldown() -> None:
    component = EthBtcRelativeStrengthSignalComponent(ratio_cross_cooldown_days=30)
    decision_policy = EthBtcRotationDecisionPolicy()
    btc_portfolio = Portfolio(
        stable_balance=4_000.0,
        spot_asset="BTC",
        btc_balance=0.06,
        eth_balance=0.0,
    )

    warmup_context = _build_context(
        snapshot_date=date(2025, 1, 1),
        portfolio=btc_portfolio,
        btc_price=100_000.0,
        eth_price=5_000.0,
        dma_200=95_000.0,
        sentiment_label="neutral",
        sentiment_value=50,
        ratio=0.040,
        ratio_dma_200=0.050,
    )
    component.initialize(warmup_context)
    component.warmup(warmup_context)

    cross_up_context = _build_context(
        snapshot_date=date(2025, 1, 2),
        portfolio=btc_portfolio,
        btc_price=99_000.0,
        eth_price=4_950.0,
        dma_200=95_000.0,
        sentiment_label="neutral",
        sentiment_value=50,
        ratio=0.060,
        ratio_dma_200=0.050,
    )
    cross_up_snapshot = component.observe(cross_up_context)
    cross_up_intent = decision_policy.decide(cross_up_snapshot)
    component.apply_intent(
        current_date=cross_up_context.date,
        snapshot=cross_up_snapshot,
        intent=cross_up_intent,
    )

    eth_portfolio = Portfolio(
        stable_balance=4_000.0,
        spot_asset="ETH",
        btc_balance=0.0,
        eth_balance=1.2,
    )
    opposite_cross_context = _build_context(
        snapshot_date=date(2025, 1, 3),
        portfolio=eth_portfolio,
        btc_price=99_000.0,
        eth_price=4_950.0,
        dma_200=95_000.0,
        eth_dma_200=4_500.0,
        sentiment_label="neutral",
        sentiment_value=50,
        ratio=0.040,
        ratio_dma_200=0.050,
    )
    opposite_cross_snapshot = component.observe(opposite_cross_context)
    opposite_cross_intent = decision_policy.decide(opposite_cross_snapshot)

    assert opposite_cross_snapshot.ratio_cooldown_state.active is True
    assert opposite_cross_snapshot.ratio_cross_event == "cross_down"
    # Cooldown now blocks ALL ratio actions including opposite crosses (anti-whipsaw).
    assert opposite_cross_intent.immediate is False
    assert opposite_cross_intent.action == "hold"
    assert "cooldown" in opposite_cross_intent.reason


def test_ratio_cooldown_expiry_resumes_gradual_zone_rotation() -> None:
    component = EthBtcRelativeStrengthSignalComponent(ratio_cross_cooldown_days=2)
    decision_policy = EthBtcRotationDecisionPolicy()
    btc_portfolio = Portfolio(
        stable_balance=4_000.0,
        spot_asset="BTC",
        btc_balance=0.06,
        eth_balance=0.0,
    )

    warmup_context = _build_context(
        snapshot_date=date(2025, 1, 1),
        portfolio=btc_portfolio,
        btc_price=100_000.0,
        eth_price=5_000.0,
        dma_200=95_000.0,
        sentiment_label="neutral",
        sentiment_value=50,
        ratio=0.040,
        ratio_dma_200=0.050,
    )
    component.initialize(warmup_context)
    component.warmup(warmup_context)

    cross_context = _build_context(
        snapshot_date=date(2025, 1, 2),
        portfolio=btc_portfolio,
        btc_price=99_000.0,
        eth_price=4_950.0,
        dma_200=95_000.0,
        sentiment_label="neutral",
        sentiment_value=50,
        ratio=0.060,
        ratio_dma_200=0.050,
    )
    cross_snapshot = component.observe(cross_context)
    cross_intent = decision_policy.decide(cross_snapshot)
    component.apply_intent(
        current_date=cross_context.date,
        snapshot=cross_snapshot,
        intent=cross_intent,
    )

    eth_portfolio = Portfolio(
        stable_balance=4_000.0,
        spot_asset="ETH",
        btc_balance=0.0,
        eth_balance=1.2,
    )
    blocked_context = _build_context(
        snapshot_date=date(2025, 1, 3),
        portfolio=eth_portfolio,
        btc_price=100_000.0,
        eth_price=5_100.0,
        dma_200=95_000.0,
        eth_dma_200=4_500.0,
        sentiment_label="neutral",
        sentiment_value=50,
        ratio=0.061,
        ratio_dma_200=0.050,
    )
    blocked_snapshot = component.observe(blocked_context)
    blocked_intent = decision_policy.decide(blocked_snapshot)
    component.apply_intent(
        current_date=blocked_context.date,
        snapshot=blocked_snapshot,
        intent=blocked_intent,
    )

    resumed_context = _build_context(
        snapshot_date=date(2025, 1, 5),
        portfolio=eth_portfolio,
        btc_price=101_000.0,
        eth_price=5_200.0,
        dma_200=95_000.0,
        eth_dma_200=4_500.0,
        sentiment_label="neutral",
        sentiment_value=50,
        ratio=0.062,
        ratio_dma_200=0.050,
    )
    resumed_snapshot = component.observe(resumed_context)
    resumed_intent = decision_policy.decide(resumed_snapshot)

    assert resumed_snapshot.ratio_cooldown_state.active is False
    assert resumed_intent.reason == "eth_btc_ratio_rebalance"
    assert resumed_intent.target_allocation is not None
    assert resumed_intent.target_allocation["btc"] == pytest.approx(
        1.0 - resumed_snapshot.current_asset_allocation["stable"]
    )
    assert resumed_intent.target_allocation["eth"] == pytest.approx(0.0)


def test_eth_btc_rotation_strategy_targets_full_stable_when_outer_gate_exits() -> None:
    strategy = EthBtcRotationStrategy(
        total_capital=10_000.0,
        strategy_id="eth_rotation_runtime",
        display_name="eth_rotation_runtime",
    )
    portfolio = Portfolio(
        stable_balance=0.0,
        spot_asset="BTC",
        btc_balance=0.05,
        eth_balance=1.0,
    )
    init_context = _build_context(
        snapshot_date=date(2025, 1, 1),
        portfolio=portfolio,
        btc_price=101_000.0,
        eth_price=5_050.0,
        dma_200=100_000.0,
        sentiment_label="neutral",
        sentiment_value=50,
        ratio=0.050,
        ratio_dma_200=0.050,
    )
    strategy.initialize(portfolio, None, init_context)
    strategy.warmup_day(init_context)

    context = _build_context(
        snapshot_date=date(2025, 1, 2),
        portfolio=portfolio,
        btc_price=102_000.0,
        eth_price=5_200.0,
        dma_200=100_000.0,
        eth_dma_200=4_800.0,
        sentiment_label="greed",
        sentiment_value=72,
        ratio=0.060,
        ratio_dma_200=0.050,
    )

    action = strategy.on_day(context)

    assert action.snapshot.decision.target_allocation == {
        "btc": 0.0,
        "eth": 0.0,
        "stable": 1.0,
    }
    assert action.snapshot.decision.target_spot_asset is None
    assert action.target_spot_asset is None


def test_eth_btc_rotation_non_cross_buy_uses_buy_gate_leg_cap() -> None:
    strategy = EthBtcRotationStrategy(
        total_capital=10_000.0,
        params=EthBtcRotationParams(
            cross_cooldown_days=0,
            ratio_cross_cooldown_days=0,
        ),
        strategy_id="eth_rotation_capped_buy",
        display_name="eth_rotation_capped_buy",
    )
    portfolio = Portfolio(spot_balance=0.0, stable_balance=10_000.0, spot_asset="BTC")
    init_context = _build_context(
        snapshot_date=date(2025, 11, 15),
        portfolio=portfolio,
        btc_price=85_000.0,
        eth_price=3_400.0,
        dma_200=100_000.0,
        sentiment_label="fear",
        sentiment_value=25,
        ratio=0.040,
        ratio_dma_200=0.050,
    )
    strategy.initialize(portfolio, None, init_context)
    strategy.warmup_day(init_context)

    action: StrategyAction | None = None
    for offset in range(5):
        is_buy_day = offset == 4
        context = _build_context(
            snapshot_date=date(2025, 11, 15 + offset),
            portfolio=portfolio,
            btc_price=85_000.0,
            eth_price=5_100.0 if is_buy_day else 3_400.0,
            dma_200=100_000.0,
            sentiment_label="extreme_fear" if is_buy_day else "fear",
            sentiment_value=10 if is_buy_day else 25,
            ratio=0.060 if is_buy_day else 0.040,
            ratio_dma_200=0.050,
        )
        action = strategy.on_day(context)

    assert action is not None
    assert action.snapshot.decision.reason == "below_extreme_fear_buy"
    assert action.snapshot.decision.immediate is False
    assert action.snapshot.decision.target_allocation == {
        "btc": 0.0,
        "eth": 1.0,
        "stable": 0.0,
    }
    assert action.transfers is not None
    stable_buy = sum(
        transfer.amount_usd
        for transfer in action.transfers
        if transfer.from_bucket == "stable" and transfer.to_bucket != "stable"
    )
    assert stable_buy == pytest.approx(500.0)
    buy_gate = _buy_gate_payload(action)
    assert buy_gate is not None
    assert buy_gate["sideways_confirmed"] is True
    assert buy_gate["leg_index"] == 1
    assert buy_gate["leg_cap_pct"] == pytest.approx(0.05)
    assert buy_gate["leg_spent_usd"] == pytest.approx(500.0)


def test_eth_btc_rotation_unconfirmed_buy_gate_blocks_stable_not_rotation() -> None:
    strategy = EthBtcRotationStrategy(
        total_capital=10_000.0,
        params=EthBtcRotationParams(cross_cooldown_days=0),
        strategy_id="eth_rotation_internal_rotation",
        display_name="eth_rotation_internal_rotation",
    )
    portfolio = Portfolio(
        stable_balance=5_000.0,
        spot_asset="BTC",
        btc_balance=0.05,
        eth_balance=0.0,
    )
    init_context = _build_context(
        snapshot_date=date(2025, 1, 1),
        portfolio=portfolio,
        btc_price=100_000.0,
        eth_price=4_000.0,
        dma_200=120_000.0,
        sentiment_label="fear",
        sentiment_value=25,
        ratio=0.040,
        ratio_dma_200=0.050,
    )
    strategy.initialize(portfolio, None, init_context)
    strategy.warmup_day(init_context)

    context = _build_context(
        snapshot_date=date(2025, 1, 2),
        portfolio=portfolio,
        btc_price=100_000.0,
        eth_price=4_000.0,
        dma_200=120_000.0,
        sentiment_label="extreme_fear",
        sentiment_value=10,
        ratio=0.040,
        ratio_dma_200=0.050,
    )
    action = strategy.on_day(context)

    assert action.snapshot.decision.reason == "below_extreme_fear_buy"
    assert action.snapshot.decision.target_allocation == {
        "btc": 0.0,
        "eth": 1.0,
        "stable": 0.0,
    }
    assert action.transfers is not None
    assert any(
        transfer.from_bucket == "btc" and transfer.to_bucket == "eth"
        for transfer in action.transfers
    )
    assert all(transfer.from_bucket != "stable" for transfer in action.transfers)
    assert action.snapshot.execution.blocked_reason is None
    buy_gate = _buy_gate_payload(action)
    assert buy_gate is not None
    assert buy_gate["sideways_confirmed"] is False


def test_build_initial_eth_btc_asset_allocation_uses_ratio_split() -> None:
    params = EthBtcRotationParams()

    result = build_initial_eth_btc_asset_allocation(
        aggregate_allocation={"spot": 0.5, "stable": 0.5},
        extra_data={
            ETH_BTC_RATIO_FEATURE: 0.040,
            ETH_BTC_RATIO_DMA_200_FEATURE: 0.050,
        },
        params=params,
    )

    assert result["stable"] == pytest.approx(0.5)
    assert result["eth"] == pytest.approx(0.5)
    assert result["btc"] == pytest.approx(0.0)


def test_build_initial_eth_btc_asset_allocation_defaults_to_neutral_without_ratio() -> (
    None
):
    params = EthBtcRotationParams()

    result = build_initial_eth_btc_asset_allocation(
        aggregate_allocation={"spot": 0.5, "stable": 0.5},
        extra_data={},
        params=params,
    )

    assert result == {"btc": 0.5, "eth": 0.0, "stable": 0.5}


def test_default_eth_btc_rotation_params_returns_dict() -> None:
    params = default_eth_btc_rotation_params()
    assert isinstance(params, dict)
    assert "cross_cooldown_days" in params
    assert "ratio_cross_cooldown_days" in params
    assert "rotation_neutral_band" in params
    assert "rotation_max_deviation" in params


def test_eth_btc_rotation_strategy_rejects_wrong_signal_id() -> None:
    with pytest.raises(ValueError, match="signal_id must be"):
        EthBtcRotationStrategy(
            total_capital=10_000.0,
            signal_id="wrong_signal_id",
        )


def test_eth_btc_rotation_strategy_parameters_returns_dict() -> None:
    strategy = EthBtcRotationStrategy(total_capital=10_000.0)
    params = strategy.parameters()
    assert isinstance(params, dict)
    assert params["signal_id"] == "eth_btc_rs_signal"
    assert params["ratio_cross_cooldown_days"] == 30
    assert params["rotation_neutral_band"] == pytest.approx(0.05)
    assert params["rotation_max_deviation"] == pytest.approx(0.20)
    assert params["rotation_drift_threshold"] == pytest.approx(0.03)
    assert params["rotation_cooldown_days"] == 7


# --- edge cases for _coerce_optional_float ---


class TestCoerceOptionalFloat:
    def test_string_input(self) -> None:
        assert _coerce_optional_float("3.14") == pytest.approx(3.14)

    def test_empty_string_returns_none(self) -> None:
        assert _coerce_optional_float("") is None

    def test_whitespace_string_returns_none(self) -> None:
        assert _coerce_optional_float("  ") is None

    def test_non_numeric_string_raises(self) -> None:
        with pytest.raises(ValueError, match="must be numeric"):
            _coerce_optional_float(object())


class TestNormalizeAssetAllocation:
    def test_zero_total_defaults_to_stable(self) -> None:
        result = _normalize_asset_allocation({"btc": 0.0, "eth": 0.0, "stable": 0.0})
        assert result["stable"] == 1.0
        assert result["btc"] == 0.0
        assert result["eth"] == 0.0


class TestBuildInitialEthBtcAssetAllocationZeroTotal:
    def test_zero_total_allocation_defaults(self) -> None:
        result = build_initial_eth_btc_asset_allocation(
            aggregate_allocation={"spot": 0.0, "stable": 0.0},
            extra_data=None,
            params=default_eth_btc_rotation_params(),
        )
        assert result["stable"] == pytest.approx(1.0)
