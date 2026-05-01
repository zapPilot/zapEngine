from __future__ import annotations

from datetime import date

import pytest

from src.services.backtesting.constants import (
    STRATEGY_DMA_FGI_ADAPTIVE_DMA_REF,
    STRATEGY_DMA_FGI_PROGRESSIVE_ROTATION,
    STRATEGY_DMA_FGI_RATIO_COOLDOWN,
    STRATEGY_DMA_FGI_RATIO_ZONE,
    STRATEGY_ETH_BTC_FULL_MINUS_ADAPTIVE_DMA,
    STRATEGY_ETH_BTC_FULL_MINUS_PROGRESSIVE_ROTATION,
    STRATEGY_ETH_BTC_FULL_MINUS_RATIO_COOLDOWN,
    STRATEGY_ETH_BTC_FULL_MINUS_RATIO_CROSS,
    STRATEGY_ETH_BTC_PROGRESSIVE_RATIO_CROSS_COOLDOWN,
)
from src.services.backtesting.execution.portfolio import Portfolio
from src.services.backtesting.features import (
    ETH_BTC_RATIO_DMA_200_FEATURE,
    ETH_BTC_RATIO_FEATURE,
)
from src.services.backtesting.strategies.base import StrategyContext
from src.services.backtesting.strategies.dma_gated_fgi import DmaGatedFgiParams
from src.services.backtesting.strategies.eth_btc_attribution import (
    ATTRIBUTION_VARIANTS,
    EthBtcAttributionDecisionPolicy,
    EthBtcAttributionSignalComponent,
    build_initial_attribution_asset_allocation,
)


def _context(
    *,
    snapshot_date: date,
    portfolio: Portfolio,
    btc_price: float = 100_000.0,
    eth_price: float = 5_000.0,
    dma_200: float = 95_000.0,
    eth_dma_200: float = 4_500.0,
    ratio: float = 0.050,
    ratio_dma_200: float = 0.050,
    sentiment_label: str = "neutral",
    sentiment_value: int = 50,
) -> StrategyContext:
    return StrategyContext(
        date=snapshot_date,
        price=btc_price,
        sentiment={"label": sentiment_label, "value": sentiment_value},
        price_history=[btc_price],
        portfolio=portfolio,
        price_map={"btc": btc_price, "eth": eth_price},
        extra_data={
            "dma_200": dma_200,
            "eth_dma_200": eth_dma_200,
            ETH_BTC_RATIO_FEATURE: ratio,
            ETH_BTC_RATIO_DMA_200_FEATURE: ratio_dma_200,
        },
    )


def _component(strategy_id: str) -> EthBtcAttributionSignalComponent:
    return EthBtcAttributionSignalComponent(
        config=DmaGatedFgiParams(cross_cooldown_days=0).build_signal_config(),
        variant=ATTRIBUTION_VARIANTS[strategy_id],
    )


def test_initial_attribution_allocation_uses_fixed_half_btc_half_eth_risk_split() -> (
    None
):
    allocation = build_initial_attribution_asset_allocation(
        aggregate_allocation={"spot": 0.6, "stable": 0.4}
    )

    assert allocation["btc"] == pytest.approx(0.3)
    assert allocation["eth"] == pytest.approx(0.3)
    assert allocation["stable"] == pytest.approx(0.4)


def test_initial_attribution_allocation_can_use_btc_only_risk_split() -> None:
    allocation = build_initial_attribution_asset_allocation(
        aggregate_allocation={"spot": 0.6, "stable": 0.4},
        eth_share_in_risk_on=0.0,
    )

    assert allocation["btc"] == pytest.approx(0.6)
    assert allocation["eth"] == pytest.approx(0.0)
    assert allocation["stable"] == pytest.approx(0.4)


def test_fixed_adaptive_dma_ref_keeps_eth_btc_split_despite_ratio_signal() -> None:
    component = _component(STRATEGY_DMA_FGI_ADAPTIVE_DMA_REF)
    policy = EthBtcAttributionDecisionPolicy(
        variant=ATTRIBUTION_VARIANTS[STRATEGY_DMA_FGI_ADAPTIVE_DMA_REF]
    )
    portfolio = Portfolio(
        stable_balance=4_000.0,
        btc_balance=0.03,
        eth_balance=0.6,
    )
    warmup_context = _context(
        snapshot_date=date(2025, 1, 1),
        portfolio=portfolio,
        ratio=0.040,
        ratio_dma_200=0.050,
    )
    component.initialize(warmup_context)
    component.warmup(warmup_context)

    snapshot = component.observe(
        _context(
            snapshot_date=date(2025, 1, 2),
            portfolio=portfolio,
            ratio=0.070,
            ratio_dma_200=0.050,
        )
    )
    intent = policy.decide(snapshot)

    assert intent.target_allocation is not None
    assert intent.target_allocation["btc"] == pytest.approx(0.3)
    assert intent.target_allocation["eth"] == pytest.approx(0.3)
    assert intent.target_allocation["stable"] == pytest.approx(0.4)


def test_full_minus_adaptive_dma_uses_btc_dma_when_eth_is_dominant() -> None:
    component = _component(STRATEGY_ETH_BTC_FULL_MINUS_ADAPTIVE_DMA)
    portfolio = Portfolio(
        stable_balance=0.0,
        btc_balance=0.0,
        eth_balance=1.0,
    )
    warmup_context = _context(
        snapshot_date=date(2025, 1, 1),
        portfolio=portfolio,
        btc_price=99_000.0,
        eth_price=4_950.0,
        dma_200=100_000.0,
        eth_dma_200=4_500.0,
    )
    component.initialize(warmup_context)
    component.warmup(warmup_context)

    snapshot = component.observe(
        _context(
            snapshot_date=date(2025, 1, 2),
            portfolio=portfolio,
            btc_price=90_000.0,
            eth_price=5_200.0,
            dma_200=100_000.0,
            eth_dma_200=5_000.0,
        )
    )

    assert snapshot.dma_state.dma_200 == pytest.approx(100_000.0)
    assert snapshot.dma_state.dma_distance == pytest.approx(-0.1)
    assert snapshot.dma_state.zone == "below"


def test_adaptive_dma_variant_uses_eth_dma_when_eth_is_dominant() -> None:
    component = _component(STRATEGY_DMA_FGI_ADAPTIVE_DMA_REF)
    portfolio = Portfolio(
        stable_balance=0.0,
        btc_balance=0.0,
        eth_balance=1.0,
    )
    warmup_context = _context(
        snapshot_date=date(2025, 1, 1),
        portfolio=portfolio,
        btc_price=99_000.0,
        eth_price=4_950.0,
        dma_200=100_000.0,
        eth_dma_200=4_500.0,
    )
    component.initialize(warmup_context)
    component.warmup(warmup_context)

    snapshot = component.observe(
        _context(
            snapshot_date=date(2025, 1, 2),
            portfolio=portfolio,
            btc_price=90_000.0,
            eth_price=5_200.0,
            dma_200=100_000.0,
            eth_dma_200=5_000.0,
        )
    )

    assert snapshot.dma_state.dma_200 == pytest.approx(5_000.0)
    assert snapshot.dma_state.dma_distance == pytest.approx(0.04)
    assert snapshot.dma_state.zone == "above"


def test_full_minus_ratio_cross_suppresses_immediate_cross_event() -> None:
    component = _component(STRATEGY_ETH_BTC_FULL_MINUS_RATIO_CROSS)
    portfolio = Portfolio(stable_balance=4_000.0, btc_balance=0.06)
    warmup_context = _context(
        snapshot_date=date(2025, 1, 1),
        portfolio=portfolio,
        ratio=0.040,
        ratio_dma_200=0.050,
    )
    component.initialize(warmup_context)
    component.warmup(warmup_context)

    snapshot = component.observe(
        _context(
            snapshot_date=date(2025, 1, 2),
            portfolio=portfolio,
            ratio=0.060,
            ratio_dma_200=0.050,
        )
    )

    assert snapshot.ratio_cross_event is None


def test_ratio_zone_variant_binary_rotates_on_ratio_cross_without_cooldown() -> None:
    component = _component(STRATEGY_DMA_FGI_RATIO_ZONE)
    policy = EthBtcAttributionDecisionPolicy(
        variant=ATTRIBUTION_VARIANTS[STRATEGY_DMA_FGI_RATIO_ZONE]
    )
    portfolio = Portfolio(stable_balance=4_000.0, btc_balance=0.06)
    warmup_context = _context(
        snapshot_date=date(2025, 1, 1),
        portfolio=portfolio,
        ratio=0.040,
        ratio_dma_200=0.050,
    )
    component.initialize(warmup_context)
    component.warmup(warmup_context)
    snapshot = component.observe(
        _context(
            snapshot_date=date(2025, 1, 2),
            portfolio=portfolio,
            ratio=0.060,
            ratio_dma_200=0.050,
        )
    )
    intent = policy.decide(snapshot)
    committed = component.apply_intent(
        current_date=date(2025, 1, 2),
        snapshot=snapshot,
        intent=intent,
    )

    assert snapshot.ratio_cross_event == "cross_up"
    assert intent.immediate is True
    assert intent.target_allocation is not None
    assert intent.target_allocation["btc"] == pytest.approx(0.6)
    assert intent.target_allocation["eth"] == pytest.approx(0.0)
    assert committed.ratio_cooldown_state.active is False


def test_full_minus_ratio_cooldown_crosses_without_starting_cooldown() -> None:
    component = _component(STRATEGY_ETH_BTC_FULL_MINUS_RATIO_COOLDOWN)
    policy = EthBtcAttributionDecisionPolicy(
        variant=ATTRIBUTION_VARIANTS[STRATEGY_ETH_BTC_FULL_MINUS_RATIO_COOLDOWN]
    )
    portfolio = Portfolio(stable_balance=4_000.0, btc_balance=0.06)
    warmup_context = _context(
        snapshot_date=date(2025, 1, 1),
        portfolio=portfolio,
        ratio=0.040,
        ratio_dma_200=0.050,
    )
    component.initialize(warmup_context)
    component.warmup(warmup_context)
    snapshot = component.observe(
        _context(
            snapshot_date=date(2025, 1, 2),
            portfolio=portfolio,
            ratio=0.060,
            ratio_dma_200=0.050,
        )
    )
    intent = policy.decide(snapshot)
    committed = component.apply_intent(
        current_date=date(2025, 1, 2),
        snapshot=snapshot,
        intent=intent,
    )

    assert snapshot.ratio_cross_event == "cross_up"
    assert committed.ratio_cooldown_state.active is False


def test_ratio_cooldown_variant_freezes_ratio_reverts_after_cross() -> None:
    component = _component(STRATEGY_DMA_FGI_RATIO_COOLDOWN)
    policy = EthBtcAttributionDecisionPolicy(
        variant=ATTRIBUTION_VARIANTS[STRATEGY_DMA_FGI_RATIO_COOLDOWN]
    )
    portfolio = Portfolio(stable_balance=4_000.0, btc_balance=0.06)
    warmup_context = _context(
        snapshot_date=date(2025, 1, 1),
        portfolio=portfolio,
        ratio=0.040,
        ratio_dma_200=0.050,
    )
    component.initialize(warmup_context)
    component.warmup(warmup_context)
    cross_snapshot = component.observe(
        _context(
            snapshot_date=date(2025, 1, 2),
            portfolio=portfolio,
            ratio=0.060,
            ratio_dma_200=0.050,
        )
    )
    cross_intent = policy.decide(cross_snapshot)
    component.apply_intent(
        current_date=date(2025, 1, 2),
        snapshot=cross_snapshot,
        intent=cross_intent,
    )

    eth_portfolio = Portfolio(stable_balance=4_000.0, eth_balance=1.2)
    blocked_snapshot = component.observe(
        _context(
            snapshot_date=date(2025, 1, 3),
            portfolio=eth_portfolio,
            ratio=0.061,
            ratio_dma_200=0.050,
        )
    )
    blocked_intent = policy.decide(blocked_snapshot)

    assert blocked_snapshot.ratio_cooldown_state.active is True
    assert blocked_intent.reason == "eth_btc_ratio_above_side_cooldown_active"
    assert blocked_intent.target_allocation is not None
    assert blocked_intent.target_allocation["btc"] == pytest.approx(0.0)
    assert blocked_intent.target_allocation["eth"] == pytest.approx(0.6)


def test_full_minus_progressive_rotation_uses_binary_ratio_zone_target() -> None:
    component = _component(STRATEGY_ETH_BTC_FULL_MINUS_PROGRESSIVE_ROTATION)
    policy = EthBtcAttributionDecisionPolicy(
        variant=ATTRIBUTION_VARIANTS[STRATEGY_ETH_BTC_FULL_MINUS_PROGRESSIVE_ROTATION]
    )
    portfolio = Portfolio(stable_balance=4_000.0, btc_balance=0.06)
    warmup_context = _context(
        snapshot_date=date(2025, 1, 1),
        portfolio=portfolio,
        ratio=0.040,
        ratio_dma_200=0.050,
    )
    component.initialize(warmup_context)
    component.warmup(warmup_context)

    snapshot = component.observe(
        _context(
            snapshot_date=date(2025, 1, 2),
            portfolio=portfolio,
            ratio=0.060,
            ratio_dma_200=0.050,
        )
    )
    intent = policy.decide(snapshot)

    assert intent.target_allocation is not None
    assert intent.target_allocation["btc"] == pytest.approx(0.6)
    assert intent.target_allocation["eth"] == pytest.approx(0.0)


def test_progressive_variant_uses_ratio_distance_for_continuous_eth_share() -> None:
    component = _component(STRATEGY_DMA_FGI_PROGRESSIVE_ROTATION)
    policy = EthBtcAttributionDecisionPolicy(
        variant=ATTRIBUTION_VARIANTS[STRATEGY_DMA_FGI_PROGRESSIVE_ROTATION],
        rotation_max_deviation=0.20,
    )
    portfolio = Portfolio(stable_balance=4_000.0, btc_balance=0.06)
    warmup_context = _context(
        snapshot_date=date(2025, 1, 1),
        portfolio=portfolio,
        ratio=0.050,
        ratio_dma_200=0.050,
    )
    component.initialize(warmup_context)
    component.warmup(warmup_context)
    snapshot = component.observe(
        _context(
            snapshot_date=date(2025, 1, 2),
            portfolio=portfolio,
            ratio=0.045,
            ratio_dma_200=0.050,
        )
    )
    intent = policy.decide(snapshot)

    assert snapshot.ratio_cross_event is None
    assert intent.immediate is False
    assert intent.reason == "eth_btc_ratio_rebalance"
    assert intent.target_allocation is not None
    assert intent.target_allocation["eth"] == pytest.approx(0.45)
    assert intent.target_allocation["btc"] == pytest.approx(0.15)


def test_progressive_ratio_cross_cooldown_pair_starts_ratio_cooldown() -> None:
    component = _component(STRATEGY_ETH_BTC_PROGRESSIVE_RATIO_CROSS_COOLDOWN)
    policy = EthBtcAttributionDecisionPolicy(
        variant=ATTRIBUTION_VARIANTS[STRATEGY_ETH_BTC_PROGRESSIVE_RATIO_CROSS_COOLDOWN],
        rotation_max_deviation=0.20,
    )
    portfolio = Portfolio(stable_balance=4_000.0, btc_balance=0.06)
    warmup_context = _context(
        snapshot_date=date(2025, 1, 1),
        portfolio=portfolio,
        ratio=0.040,
        ratio_dma_200=0.050,
    )
    component.initialize(warmup_context)
    component.warmup(warmup_context)
    snapshot = component.observe(
        _context(
            snapshot_date=date(2025, 1, 2),
            portfolio=portfolio,
            ratio=0.060,
            ratio_dma_200=0.050,
        )
    )
    intent = policy.decide(snapshot)
    committed = component.apply_intent(
        current_date=date(2025, 1, 2),
        snapshot=snapshot,
        intent=intent,
    )

    assert snapshot.ratio_cross_event == "cross_up"
    assert intent.immediate is True
    assert committed.ratio_cooldown_state.active is True
    assert committed.ratio_cooldown_state.blocked_zone == "above"
