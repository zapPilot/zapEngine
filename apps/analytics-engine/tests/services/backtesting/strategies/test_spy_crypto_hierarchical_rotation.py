from __future__ import annotations

from datetime import date

import pytest

from src.services.backtesting.decision import AllocationIntent
from src.services.backtesting.execution.pacing.base import compute_dma_buy_strength
from src.services.backtesting.execution.portfolio import Portfolio
from src.services.backtesting.features import (
    ETH_BTC_RATIO_DMA_200_FEATURE,
    ETH_BTC_RATIO_FEATURE,
    SPY_CRYPTO_RATIO_DMA_200_FEATURE,
    SPY_CRYPTO_RATIO_FEATURE,
    SPY_DMA_200_FEATURE,
)
from src.services.backtesting.strategies.base import StrategyContext
from src.services.backtesting.strategies.spy_crypto_hierarchical_rotation import (
    HierarchicalPairRotationDecisionPolicy,
    HierarchicalPairRotationParams,
    HierarchicalPairRotationSignalComponent,
    HierarchicalSpyCryptoRotationStrategy,
)


def _portfolio(allocation: dict[str, float]) -> Portfolio:
    return Portfolio.from_asset_allocation(
        10_000.0,
        {**allocation, "alt": 0.0},
        {"btc": 100_000.0, "eth": 5_000.0, "spy": 600.0},
        spot_asset="BTC",
    )


def _build_context(
    *,
    portfolio: Portfolio,
    btc_price: float = 100_000.0,
    eth_price: float = 5_000.0,
    spy_price: float = 600.0,
    dma_200: float = 95_000.0,
    eth_dma_200: float = 4_500.0,
    spy_dma_200: float = 580.0,
    eth_btc_ratio: float = 0.05,
    eth_btc_ratio_dma_200: float = 0.05,
    spy_crypto_ratio: float = 0.006,
    spy_crypto_ratio_dma_200: float = 0.006,
    fgi_value: float = 50.0,
    snapshot_date: date = date(2026, 4, 27),
) -> StrategyContext:
    return StrategyContext(
        date=snapshot_date,
        price=btc_price,
        sentiment={"value": fgi_value},
        price_history=[btc_price],
        portfolio=portfolio,
        price_map={"btc": btc_price, "eth": eth_price, "spy": spy_price},
        extra_data={
            "dma_200": dma_200,
            "eth_dma_200": eth_dma_200,
            SPY_DMA_200_FEATURE: spy_dma_200,
            ETH_BTC_RATIO_FEATURE: eth_btc_ratio,
            ETH_BTC_RATIO_DMA_200_FEATURE: eth_btc_ratio_dma_200,
            SPY_CRYPTO_RATIO_FEATURE: spy_crypto_ratio,
            SPY_CRYPTO_RATIO_DMA_200_FEATURE: spy_crypto_ratio_dma_200,
        },
    )


def _decide(
    *,
    warmup_context: StrategyContext | None = None,
    context: StrategyContext,
) -> AllocationIntent:
    params = HierarchicalPairRotationParams(cross_cooldown_days=0)
    component = HierarchicalPairRotationSignalComponent(params=params)
    policy = HierarchicalPairRotationDecisionPolicy()
    component.initialize(warmup_context or context)
    if warmup_context is not None:
        component.warmup(warmup_context)
    else:
        component.warmup(context)
    snapshot = component.observe(context)
    return policy.decide(snapshot)


def _decide_after_warmups(
    *,
    warmup_contexts: list[StrategyContext],
    context: StrategyContext,
) -> AllocationIntent:
    params = HierarchicalPairRotationParams(cross_cooldown_days=0)
    component = HierarchicalPairRotationSignalComponent(params=params)
    policy = HierarchicalPairRotationDecisionPolicy()
    component.initialize(warmup_contexts[0] if warmup_contexts else context)
    for warmup_context in warmup_contexts:
        component.warmup(warmup_context)
    snapshot = component.observe(context)
    return policy.decide(snapshot)


def test_inner_only_behavior_splits_crypto_sleeve_from_child_template() -> None:
    portfolio = _portfolio({"btc": 0.5, "eth": 0.5, "spy": 0.0, "stable": 0.0})
    intent = _decide(
        context=_build_context(
            portfolio=portfolio,
            spy_crypto_ratio=0.005,
            spy_crypto_ratio_dma_200=0.006,
            eth_btc_ratio=0.060,
            eth_btc_ratio_dma_200=0.050,
        ),
    )

    assert intent.target_allocation is not None
    assert intent.target_allocation["btc"] == pytest.approx(1.0)
    assert intent.target_allocation["eth"] == pytest.approx(0.0)
    assert intent.target_allocation["spy"] == pytest.approx(0.0)


def test_spy_dma_cross_down_moves_spy_share_to_stable() -> None:
    portfolio = _portfolio({"spy": 1.0, "btc": 0.0, "eth": 0.0, "stable": 0.0})
    warmup = _build_context(
        portfolio=portfolio,
        spy_price=600.0,
        spy_dma_200=580.0,
        spy_crypto_ratio=0.007,
        spy_crypto_ratio_dma_200=0.006,
    )
    context = _build_context(
        portfolio=portfolio,
        spy_price=600.0,
        spy_dma_200=620.0,
        spy_crypto_ratio=0.007,
        spy_crypto_ratio_dma_200=0.006,
        snapshot_date=date(2026, 4, 28),
    )
    intent = _decide(warmup_context=warmup, context=context)

    assert intent.target_allocation is not None
    assert intent.target_allocation["spy"] == pytest.approx(0.0)
    assert intent.target_allocation["stable"] == pytest.approx(1.0)


def test_spy_dma_cross_down_leaves_crypto_winner_intact() -> None:
    portfolio = _portfolio({"spy": 0.75, "btc": 0.25, "eth": 0.0, "stable": 0.0})
    warmup = _build_context(
        portfolio=portfolio,
        spy_price=600.0,
        spy_dma_200=580.0,
        spy_crypto_ratio=0.005,
        spy_crypto_ratio_dma_200=0.006,
        eth_btc_ratio=0.060,
        eth_btc_ratio_dma_200=0.050,
    )
    context = _build_context(
        portfolio=portfolio,
        spy_price=600.0,
        spy_dma_200=620.0,
        spy_crypto_ratio=0.005,
        spy_crypto_ratio_dma_200=0.006,
        eth_btc_ratio=0.060,
        eth_btc_ratio_dma_200=0.050,
        snapshot_date=date(2026, 4, 28),
    )
    intent = _decide(warmup_context=warmup, context=context)

    assert intent.target_allocation is not None
    assert intent.target_allocation["spy"] == pytest.approx(0.0)
    assert intent.target_allocation["btc"] == pytest.approx(0.25)
    assert intent.target_allocation["stable"] == pytest.approx(0.75)


def test_crypto_dma_cross_down_moves_crypto_sleeve_to_stable() -> None:
    portfolio = _portfolio({"btc": 1.0, "eth": 0.0, "spy": 0.0, "stable": 0.0})
    warmup = _build_context(
        portfolio=portfolio,
        btc_price=100_000.0,
        dma_200=95_000.0,
        spy_crypto_ratio=0.005,
        spy_crypto_ratio_dma_200=0.006,
    )
    context = _build_context(
        portfolio=portfolio,
        btc_price=100_000.0,
        dma_200=105_000.0,
        spy_crypto_ratio=0.005,
        spy_crypto_ratio_dma_200=0.006,
        snapshot_date=date(2026, 4, 28),
    )
    intent = _decide(warmup_context=warmup, context=context)

    assert intent.target_allocation is not None
    assert intent.target_allocation["btc"] + intent.target_allocation[
        "eth"
    ] == pytest.approx(0.0)
    assert intent.target_allocation["stable"] == pytest.approx(1.0)


def test_crypto_dma_cross_down_leaves_spy_winner_intact() -> None:
    portfolio = _portfolio({"btc": 0.75, "eth": 0.0, "spy": 0.25, "stable": 0.0})
    warmup = _build_context(
        portfolio=portfolio,
        btc_price=100_000.0,
        dma_200=95_000.0,
        spy_crypto_ratio=0.007,
        spy_crypto_ratio_dma_200=0.006,
    )
    context = _build_context(
        portfolio=portfolio,
        btc_price=100_000.0,
        dma_200=105_000.0,
        spy_crypto_ratio=0.007,
        spy_crypto_ratio_dma_200=0.006,
        snapshot_date=date(2026, 4, 28),
    )
    intent = _decide(warmup_context=warmup, context=context)

    assert intent.target_allocation is not None
    assert intent.target_allocation["spy"] == pytest.approx(0.25)
    assert intent.target_allocation["btc"] + intent.target_allocation[
        "eth"
    ] == pytest.approx(0.0)
    assert intent.target_allocation["stable"] == pytest.approx(0.75)


def test_crypto_cross_down_with_spy_dominant_still_liquidates_crypto() -> None:
    portfolio = _portfolio({"spy": 0.7, "btc": 0.3, "eth": 0.0, "stable": 0.0})
    warmup = _build_context(
        portfolio=portfolio,
        btc_price=100_000.0,
        dma_200=95_000.0,
        spy_price=600.0,
        spy_dma_200=580.0,
        snapshot_date=date(2025, 10, 17),
    )
    context = _build_context(
        portfolio=portfolio,
        btc_price=100_000.0,
        dma_200=105_000.0,
        spy_price=600.0,
        spy_dma_200=580.0,
        snapshot_date=date(2025, 10, 18),
    )
    intent = _decide(warmup_context=warmup, context=context)

    assert intent.target_allocation is not None
    assert intent.target_allocation["btc"] + intent.target_allocation[
        "eth"
    ] == pytest.approx(0.0)
    assert intent.target_allocation["spy"] == pytest.approx(0.7)
    assert intent.target_allocation["stable"] == pytest.approx(0.3)


def test_spy_cross_up_with_crypto_dominant_still_buys_spy() -> None:
    portfolio = _portfolio({"btc": 0.3, "eth": 0.0, "spy": 0.0, "stable": 0.7})
    warmup = _build_context(
        portfolio=portfolio,
        spy_price=560.0,
        spy_dma_200=580.0,
        btc_price=100_000.0,
        dma_200=95_000.0,
        snapshot_date=date(2026, 4, 5),
    )
    context = _build_context(
        portfolio=portfolio,
        spy_price=600.0,
        spy_dma_200=580.0,
        btc_price=100_000.0,
        dma_200=95_000.0,
        snapshot_date=date(2026, 4, 6),
    )
    intent = _decide(warmup_context=warmup, context=context)

    assert intent.target_allocation is not None
    assert intent.target_allocation["spy"] > 0.0
    assert intent.target_allocation["spy"] == pytest.approx(0.7)
    assert intent.target_allocation["btc"] + intent.target_allocation[
        "eth"
    ] == pytest.approx(0.3)
    assert intent.target_allocation["stable"] == pytest.approx(0.0)


def test_below_dma_extreme_fear_produces_nonzero_buy_pacing() -> None:
    portfolio = _portfolio({"btc": 0.5, "eth": 0.0, "spy": 0.0, "stable": 0.5})
    context = _build_context(
        portfolio=portfolio,
        btc_price=95_000.0,
        dma_200=100_000.0,
        fgi_value=15.0,
    )
    intent = _decide(context=context)

    assert intent.action == "buy"
    assert compute_dma_buy_strength(-0.05) > 0.0


def test_below_dma_fear_with_rising_fgi_slope_triggers_buy() -> None:
    portfolio = _portfolio({"btc": 0.5, "eth": 0.0, "spy": 0.0, "stable": 0.5})
    intent = _decide_after_warmups(
        warmup_contexts=[
            _build_context(
                portfolio=portfolio,
                btc_price=95_000.0,
                dma_200=100_000.0,
                fgi_value=25.0,
                snapshot_date=date(2026, 2, 4),
            ),
            _build_context(
                portfolio=portfolio,
                btc_price=95_000.0,
                dma_200=100_000.0,
                fgi_value=32.0,
                snapshot_date=date(2026, 2, 5),
            ),
        ],
        context=_build_context(
            portfolio=portfolio,
            btc_price=95_000.0,
            dma_200=100_000.0,
            fgi_value=40.0,
            snapshot_date=date(2026, 2, 6),
        ),
    )

    assert intent.action == "buy"
    assert intent.reason == "below_fear_recovering_buy"


def test_below_dma_extreme_fear_with_falling_fgi_no_premature_buy() -> None:
    portfolio = _portfolio({"btc": 0.5, "eth": 0.0, "spy": 0.0, "stable": 0.5})
    intent = _decide_after_warmups(
        warmup_contexts=[
            _build_context(
                portfolio=portfolio,
                btc_price=95_000.0,
                dma_200=100_000.0,
                fgi_value=22.0,
                snapshot_date=date(2026, 2, 4),
            ),
            _build_context(
                portfolio=portfolio,
                btc_price=95_000.0,
                dma_200=100_000.0,
                fgi_value=18.0,
                snapshot_date=date(2026, 2, 5),
            ),
        ],
        context=_build_context(
            portfolio=portfolio,
            btc_price=95_000.0,
            dma_200=100_000.0,
            fgi_value=12.0,
            snapshot_date=date(2026, 2, 6),
        ),
    )

    assert intent.action == "buy"
    assert intent.reason == "below_extreme_fear_buy"


def test_outer_binary_ratio_zone_switches_between_spy_and_crypto() -> None:
    portfolio = _portfolio({"btc": 0.5, "eth": 0.0, "spy": 0.5, "stable": 0.0})
    spy_intent = _decide(
        context=_build_context(
            portfolio=portfolio,
            spy_crypto_ratio=0.007,
            spy_crypto_ratio_dma_200=0.006,
            eth_btc_ratio=0.060,
            eth_btc_ratio_dma_200=0.050,
        ),
    )
    crypto_intent = _decide(
        context=_build_context(
            portfolio=portfolio,
            spy_crypto_ratio=0.005,
            spy_crypto_ratio_dma_200=0.006,
            eth_btc_ratio=0.060,
            eth_btc_ratio_dma_200=0.050,
        ),
    )

    assert spy_intent.target_allocation is not None
    assert crypto_intent.target_allocation is not None
    assert spy_intent.target_allocation["spy"] == pytest.approx(1.0)
    assert crypto_intent.target_allocation["btc"] == pytest.approx(1.0)
    assert crypto_intent.target_allocation["spy"] == pytest.approx(0.0)


def test_neutral_outer_pair_and_inner_eth_winner_composes_half_spy_half_eth() -> None:
    portfolio = _portfolio({"spy": 0.5, "btc": 0.25, "eth": 0.25, "stable": 0.0})
    intent = _decide(
        context=_build_context(
            portfolio=portfolio,
            spy_crypto_ratio=0.006,
            spy_crypto_ratio_dma_200=0.006,
            eth_btc_ratio=0.040,
            eth_btc_ratio_dma_200=0.050,
        ),
    )

    assert intent.target_allocation is not None
    assert intent.target_allocation["spy"] == pytest.approx(0.5)
    assert intent.target_allocation["btc"] == pytest.approx(0.0)
    assert intent.target_allocation["eth"] == pytest.approx(0.5)
    assert intent.target_allocation["stable"] == pytest.approx(0.0)


def test_strategy_constructs_with_default_params() -> None:
    strategy = HierarchicalSpyCryptoRotationStrategy(total_capital=10_000.0)

    assert strategy.strategy_id == "dma_fgi_hierarchical_spy_crypto"
    assert strategy.signal_id == "hierarchical_spy_crypto_signal"
