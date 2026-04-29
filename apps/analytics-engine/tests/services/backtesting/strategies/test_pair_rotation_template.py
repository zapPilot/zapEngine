from __future__ import annotations

from datetime import date

import pytest

from src.services.backtesting.execution.portfolio import Portfolio
from src.services.backtesting.features import (
    ETH_BTC_RATIO_DMA_200_FEATURE,
    ETH_BTC_RATIO_FEATURE,
)
from src.services.backtesting.strategies.base import StrategyContext
from src.services.backtesting.strategies.dma_gated_fgi import DmaGatedFgiParams
from src.services.backtesting.strategies.pair_rotation_template import (
    ADAPTIVE_BINARY_ETH_BTC_TEMPLATE,
    PairRotationTemplateDecisionPolicy,
    PairRotationTemplateSignalComponent,
    build_initial_pair_asset_allocation,
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


def _component() -> PairRotationTemplateSignalComponent:
    return PairRotationTemplateSignalComponent(
        config=DmaGatedFgiParams(cross_cooldown_days=0).build_signal_config(),
        template=ADAPTIVE_BINARY_ETH_BTC_TEMPLATE,
    )


def _policy() -> PairRotationTemplateDecisionPolicy:
    return PairRotationTemplateDecisionPolicy(
        template=ADAPTIVE_BINARY_ETH_BTC_TEMPLATE,
    )


def test_initial_pair_allocation_uses_neutral_eth_btc_risk_split() -> None:
    allocation = build_initial_pair_asset_allocation(
        aggregate_allocation={"spot": 0.6, "stable": 0.4},
        template=ADAPTIVE_BINARY_ETH_BTC_TEMPLATE,
    )

    assert allocation["btc"] == pytest.approx(0.3)
    assert allocation["eth"] == pytest.approx(0.3)
    assert allocation["stable"] == pytest.approx(0.4)


def test_adaptive_dma_reference_uses_eth_when_eth_is_dominant() -> None:
    component = _component()
    portfolio = Portfolio(stable_balance=0.0, btc_balance=0.0, eth_balance=1.0)
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

    assert snapshot.outer_dma_unit.symbol == "ETH"
    assert snapshot.dma_state.dma_200 == pytest.approx(5_000.0)
    assert snapshot.dma_state.dma_distance == pytest.approx(0.04)
    assert snapshot.dma_state.zone == "above"


def test_adaptive_dma_reference_uses_btc_when_btc_is_dominant() -> None:
    component = _component()
    portfolio = Portfolio(stable_balance=0.0, btc_balance=0.1, eth_balance=0.0)
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

    assert snapshot.outer_dma_unit.symbol == "BTC"
    assert snapshot.dma_state.dma_200 == pytest.approx(100_000.0)
    assert snapshot.dma_state.dma_distance == pytest.approx(-0.1)
    assert snapshot.dma_state.zone == "below"


def test_binary_ratio_zone_below_dma_targets_eth() -> None:
    component = _component()
    policy = _policy()
    portfolio = Portfolio(stable_balance=4_000.0, btc_balance=0.03, eth_balance=0.6)
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
            ratio=0.040,
            ratio_dma_200=0.050,
        )
    )
    intent = policy.decide(snapshot)

    assert snapshot.ratio_zone == "below"
    assert intent.target_allocation is not None
    assert intent.target_allocation["btc"] == pytest.approx(0.0)
    assert intent.target_allocation["eth"] == pytest.approx(0.6)
    assert intent.immediate is False


def test_binary_ratio_zone_above_dma_targets_btc() -> None:
    component = _component()
    policy = _policy()
    portfolio = Portfolio(stable_balance=4_000.0, btc_balance=0.03, eth_balance=0.6)
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
            ratio=0.060,
            ratio_dma_200=0.050,
        )
    )
    intent = policy.decide(snapshot)

    assert snapshot.ratio_zone == "above"
    assert intent.target_allocation is not None
    assert intent.target_allocation["btc"] == pytest.approx(0.6)
    assert intent.target_allocation["eth"] == pytest.approx(0.0)
    assert intent.immediate is False


def test_template_does_not_emit_ratio_cross_or_cooldown() -> None:
    component = _component()
    policy = _policy()
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
    observation = component.build_signal_observation(
        snapshot=committed,
        intent=intent,
    )

    assert committed.ratio_cooldown_state.active is False
    assert observation.ratio is not None
    assert observation.ratio.cross_event is None
    assert observation.ratio.cooldown_active is False
