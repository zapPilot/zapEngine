from __future__ import annotations

from dataclasses import replace
from datetime import date

import pytest

from src.services.backtesting.decision import AllocationIntent
from src.services.backtesting.execution.portfolio import Portfolio
from src.services.backtesting.features import (
    ETH_BTC_RATIO_DMA_200_FEATURE,
    ETH_BTC_RATIO_FEATURE,
    MACRO_FEAR_GREED_FEATURE,
    SPY_CRYPTO_RATIO_DMA_200_FEATURE,
    SPY_CRYPTO_RATIO_FEATURE,
    SPY_DMA_200_FEATURE,
)
from src.services.backtesting.strategies.base import StrategyContext
from src.services.backtesting.strategies.hierarchical_attribution import (
    CURRENT_DMA_BUY_STRENGTH_FLOOR,
    FEAR_RECOVERY_BUY_RULE,
    FULL_DISABLED_RULES,
    LEGACY_DMA_BUY_STRENGTH_FLOOR,
)
from src.services.backtesting.strategies.hierarchical_outer_policy import (
    FullFeaturedOuterPolicy,
    HierarchicalOuterDecisionPolicy,
    HierarchicalOuterSnapshot,
    MinimumHierarchicalOuterPolicy,
    MinimumHierarchicalOuterPolicyBelowDmaHold,
    MinimumHierarchicalOuterPolicyCrossCooldown,
    MinimumHierarchicalOuterPolicyDmaDisciplined,
    MinimumHierarchicalOuterPolicyDualAboveHold,
    MinimumHierarchicalOuterPolicyWithBuffer,
)
from src.services.backtesting.strategies.spy_crypto_hierarchical_rotation import (
    SPY_CRYPTO_TEMPLATE,
    HierarchicalPairRotationParams,
    HierarchicalPairRotationSignalComponent,
)


def _portfolio(allocation: dict[str, float]) -> Portfolio:
    return Portfolio.from_asset_allocation(
        10_000.0,
        {**allocation, "alt": 0.0},
        {"btc": 100_000.0, "eth": 5_000.0, "spy": 600.0},
        spot_asset="BTC",
    )


def _context(
    *,
    portfolio: Portfolio,
    btc_price: float = 100_000.0,
    eth_price: float = 5_000.0,
    spy_price: float = 600.0,
    dma_200: float = 95_000.0,
    eth_dma_200: float = 4_500.0,
    spy_dma_200: float = 580.0,
    fgi_value: float = 50.0,
    macro_fear_greed: dict[str, object] | None = None,
    snapshot_date: date = date(2026, 4, 27),
) -> StrategyContext:
    extra_data = {
        "dma_200": dma_200,
        "eth_dma_200": eth_dma_200,
        SPY_DMA_200_FEATURE: spy_dma_200,
        ETH_BTC_RATIO_FEATURE: 0.05,
        ETH_BTC_RATIO_DMA_200_FEATURE: 0.05,
        SPY_CRYPTO_RATIO_FEATURE: 0.006,
        SPY_CRYPTO_RATIO_DMA_200_FEATURE: 0.006,
    }
    if macro_fear_greed is not None:
        extra_data[MACRO_FEAR_GREED_FEATURE] = macro_fear_greed
    return StrategyContext(
        date=snapshot_date,
        price=btc_price,
        sentiment={"value": fgi_value},
        price_history=[btc_price],
        portfolio=portfolio,
        price_map={"btc": btc_price, "eth": eth_price, "spy": spy_price},
        extra_data=extra_data,
    )


def _outer_snapshot(
    *,
    policy: HierarchicalOuterDecisionPolicy,
    contexts: list[StrategyContext],
) -> tuple[HierarchicalOuterSnapshot, HierarchicalPairRotationSignalComponent]:
    component = HierarchicalPairRotationSignalComponent(
        params=HierarchicalPairRotationParams(cross_cooldown_days=0),
        adaptive_crypto_dma_reference=(
            policy.adaptive_crypto_dma_reference
            if isinstance(policy, FullFeaturedOuterPolicy)
            else False
        ),
        spy_cross_up_latch_enabled=(
            policy.spy_cross_up_latch
            if isinstance(policy, FullFeaturedOuterPolicy)
            else False
        ),
        dma_buy_strength_floor=(
            policy.dma_buy_strength_floor
            if isinstance(policy, FullFeaturedOuterPolicy)
            else 0.0
        ),
    )
    component.initialize(contexts[0])
    for warmup_context in contexts[:-1]:
        component.warmup(warmup_context)
    state = component.observe(contexts[-1])
    snapshot = HierarchicalOuterSnapshot(
        template=SPY_CRYPTO_TEMPLATE,
        outer_state=state.outer_state,
        spy_dma_state=state.spy_dma_state,
        crypto_dma_state=state.crypto_dma_state,
        crypto_dma_reference_asset=state.crypto_dma_reference_asset,
        spy_latch_active=state.spy_latch_active,
        pre_existing_stable_share=float(
            state.current_asset_allocation.get("stable", 0.0)
        ),
    )
    return snapshot, component


@pytest.mark.parametrize(
    "policy",
    [
        FullFeaturedOuterPolicy(disabled_rules=FULL_DISABLED_RULES),
        MinimumHierarchicalOuterPolicy(),
    ],
)
def test_policy_buys_spy_on_spy_cross_up(
    policy: HierarchicalOuterDecisionPolicy,
) -> None:
    portfolio = _portfolio({"spy": 0.0, "btc": 0.0, "eth": 0.0, "stable": 1.0})
    snapshot, _component = _outer_snapshot(
        policy=policy,
        contexts=[
            _context(
                portfolio=portfolio,
                spy_price=560.0,
                spy_dma_200=580.0,
                snapshot_date=date(2026, 4, 5),
            ),
            _context(
                portfolio=portfolio,
                spy_price=600.0,
                spy_dma_200=580.0,
                snapshot_date=date(2026, 4, 6),
            ),
        ],
    )

    intent = policy.decide(snapshot)

    assert intent.target_allocation is not None
    assert intent.target_allocation["spy"] == pytest.approx(1.0)
    assert intent.target_allocation["stable"] == pytest.approx(0.0)


@pytest.mark.parametrize(
    "policy",
    [
        FullFeaturedOuterPolicy(disabled_rules=FULL_DISABLED_RULES),
        MinimumHierarchicalOuterPolicy(),
    ],
)
def test_policy_lifts_crypto_to_stable_on_crypto_cross_down(
    policy: HierarchicalOuterDecisionPolicy,
) -> None:
    portfolio = _portfolio({"spy": 0.4, "btc": 0.6, "eth": 0.0, "stable": 0.0})
    snapshot, _component = _outer_snapshot(
        policy=policy,
        contexts=[
            _context(
                portfolio=portfolio,
                btc_price=100_000.0,
                dma_200=95_000.0,
                snapshot_date=date(2026, 4, 5),
            ),
            _context(
                portfolio=portfolio,
                btc_price=100_000.0,
                dma_200=105_000.0,
                snapshot_date=date(2026, 4, 6),
            ),
        ],
    )

    intent = policy.decide(snapshot)

    assert intent.target_allocation is not None
    assert intent.target_allocation["btc"] + intent.target_allocation[
        "eth"
    ] == pytest.approx(0.0)
    assert intent.target_allocation["spy"] == pytest.approx(0.4)
    assert intent.target_allocation["stable"] == pytest.approx(0.6)


def test_minimum_policy_suppresses_plain_greed_sell() -> None:
    portfolio = _portfolio({"spy": 0.5, "btc": 0.5, "eth": 0.0, "stable": 0.0})
    snapshot, _component = _outer_snapshot(
        policy=MinimumHierarchicalOuterPolicy(),
        contexts=[_context(portfolio=portfolio, fgi_value=65.0)],
    )

    suppressed = MinimumHierarchicalOuterPolicy().decide(snapshot)

    assert suppressed.reason != "above_greed_sell"
    assert suppressed.target_allocation is not None
    assert suppressed.target_allocation["stable"] == pytest.approx(0.0)


def test_minimum_policy_does_not_fire_fear_recovery_buy() -> None:
    portfolio = _portfolio({"spy": 0.0, "btc": 0.5, "eth": 0.0, "stable": 0.5})
    policy = MinimumHierarchicalOuterPolicy()
    snapshot, _component = _outer_snapshot(
        policy=policy,
        contexts=[
            _context(
                portfolio=portfolio,
                btc_price=95_000.0,
                dma_200=100_000.0,
                fgi_value=25.0,
                snapshot_date=date(2026, 2, 4),
            ),
            _context(
                portfolio=portfolio,
                btc_price=95_000.0,
                dma_200=100_000.0,
                fgi_value=32.0,
                snapshot_date=date(2026, 2, 5),
            ),
            _context(
                portfolio=portfolio,
                btc_price=95_000.0,
                dma_200=100_000.0,
                fgi_value=40.0,
                snapshot_date=date(2026, 2, 6),
            ),
        ],
    )

    intent = policy.decide(snapshot)

    assert intent.action == "hold"
    assert intent.reason != "below_fear_recovering_buy"
    assert intent.target_allocation is not None
    assert intent.target_allocation["stable"] == pytest.approx(
        snapshot.outer_state.current_asset_allocation["stable"]
    )


def test_minimum_policy_buys_spy_on_macro_extreme_fear_below_dma() -> None:
    portfolio = _portfolio({"spy": 0.0, "btc": 0.0, "eth": 0.0, "stable": 1.0})
    policy = MinimumHierarchicalOuterPolicy()
    snapshot, _component = _outer_snapshot(
        policy=policy,
        contexts=[
            _context(
                portfolio=portfolio,
                spy_price=500.0,
                spy_dma_200=580.0,
                macro_fear_greed={"score": 4.0, "label": "Extreme Fear"},
            )
        ],
    )

    intent = policy.decide(snapshot)

    assert intent.reason == "spy_below_extreme_fear_buy"
    assert intent.target_allocation is not None
    assert intent.target_allocation["spy"] == pytest.approx(0.2)
    assert intent.target_allocation["stable"] == pytest.approx(0.8)


def test_minimum_policy_latch_absorbs_freshly_created_stable() -> None:
    portfolio = _portfolio({"spy": 0.0, "btc": 1.0, "eth": 0.0, "stable": 0.0})
    snapshot, _component = _outer_snapshot(
        policy=MinimumHierarchicalOuterPolicy(),
        contexts=[_context(portfolio=portfolio)],
    )
    latched_snapshot = replace(
        snapshot,
        spy_latch_active=True,
        spy_latch_target_share=1.0,
        pre_existing_stable_share=0.0,
    )
    intent = AllocationIntent(
        action="sell",
        target_allocation={
            "btc": 0.0,
            "eth": 0.0,
            "spy": 0.0,
            "stable": 1.0,
            "alt": 0.0,
        },
        allocation_name="test_crypto_sale",
        immediate=False,
        reason="crypto_test_sell",
        rule_group="dma_fgi",
        decision_score=-1.0,
    )

    adjusted = MinimumHierarchicalOuterPolicy().apply_post_intent_adjustments(
        intent=intent,
        snapshot=latched_snapshot,
    )

    assert adjusted.target_allocation is not None
    assert adjusted.target_allocation["spy"] == pytest.approx(1.0)
    assert adjusted.target_allocation["stable"] == pytest.approx(0.0)
    assert adjusted.diagnostics is not None
    assert adjusted.diagnostics["post_intent_adjustments"] == [
        "spy_latch_absorb_fresh_stable"
    ]


def test_minimum_policy_post_adjustment_noops_without_active_latch() -> None:
    portfolio = _portfolio({"spy": 0.0, "btc": 1.0, "eth": 0.0, "stable": 0.0})
    snapshot, _component = _outer_snapshot(
        policy=MinimumHierarchicalOuterPolicy(),
        contexts=[_context(portfolio=portfolio)],
    )
    intent = AllocationIntent(
        action="hold",
        target_allocation={
            "btc": 0.0,
            "eth": 0.0,
            "spy": 0.0,
            "stable": 1.0,
            "alt": 0.0,
        },
        allocation_name="test",
        immediate=False,
        reason="test",
        rule_group="none",
        decision_score=0.0,
    )

    adjusted = MinimumHierarchicalOuterPolicy().apply_post_intent_adjustments(
        intent=intent,
        snapshot=snapshot,
    )

    assert adjusted is intent


def test_minimum_policy_latch_uses_default_target_share_and_appends_diagnostics() -> None:
    portfolio = _portfolio({"spy": 0.0, "btc": 1.0, "eth": 0.0, "stable": 0.0})
    snapshot, _component = _outer_snapshot(
        policy=MinimumHierarchicalOuterPolicy(),
        contexts=[_context(portfolio=portfolio)],
    )
    latched_snapshot = replace(
        snapshot,
        spy_latch_active=True,
        spy_latch_target_share=None,
        pre_existing_stable_share=0.0,
    )
    intent = AllocationIntent(
        action="sell",
        target_allocation={
            "btc": 0.0,
            "eth": 0.0,
            "spy": 0.25,
            "stable": 0.75,
            "alt": 0.0,
        },
        allocation_name="test_crypto_sale",
        immediate=False,
        reason="crypto_test_sell",
        rule_group="dma_fgi",
        decision_score=-1.0,
        diagnostics={"post_intent_adjustments": ["existing_adjustment"]},
    )

    adjusted = MinimumHierarchicalOuterPolicy().apply_post_intent_adjustments(
        intent=intent,
        snapshot=latched_snapshot,
    )

    assert adjusted.target_allocation is not None
    assert adjusted.target_allocation["spy"] == pytest.approx(1.0)
    assert adjusted.target_allocation["stable"] == pytest.approx(0.0)
    assert adjusted.diagnostics is not None
    assert adjusted.diagnostics["post_intent_adjustments"] == [
        "existing_adjustment",
        "spy_latch_absorb_fresh_stable",
    ]
    assert adjusted.diagnostics["spy_latch_target_share"] == pytest.approx(1.0)


def test_minimum_policy_feature_summary() -> None:
    assert MinimumHierarchicalOuterPolicy().feature_summary() == {
        "policy": "MinimumHierarchicalOuterPolicy",
        "active_features": [
            "dma_stable_gating",
            "greed_sell_suppression",
            "persistent_spy_latch",
        ],
    }


@pytest.mark.parametrize(
    ("policy", "expected"),
    [
        (
            MinimumHierarchicalOuterPolicyWithBuffer(dma_entry_buffer=0.03),
            {
                "policy": "MinimumHierarchicalOuterPolicyWithBuffer",
                "active_features": [
                    "dma_stable_gating",
                    "greed_sell_suppression",
                    "persistent_spy_latch",
                    "dma_entry_buffer=0.03",
                ],
            },
        ),
        (
            MinimumHierarchicalOuterPolicyDualAboveHold(),
            {
                "policy": "MinimumHierarchicalOuterPolicyDualAboveHold",
                "active_features": [
                    "dma_stable_gating",
                    "greed_sell_suppression",
                    "persistent_spy_latch",
                    "dual_above_hold",
                ],
            },
        ),
        (
            MinimumHierarchicalOuterPolicyCrossCooldown(cooldown_days=30),
            {
                "policy": "MinimumHierarchicalOuterPolicyCrossCooldown",
                "active_features": [
                    "dma_stable_gating",
                    "greed_sell_suppression",
                    "persistent_spy_latch",
                    "cross_down_cooldown=30d",
                ],
            },
        ),
        (
            MinimumHierarchicalOuterPolicyBelowDmaHold(),
            {
                "policy": "MinimumHierarchicalOuterPolicyBelowDmaHold",
                "active_features": [
                    "dma_stable_gating",
                    "greed_sell_suppression",
                    "persistent_spy_latch",
                    "below_dma_hold",
                    "extreme_fear_dca_carve_out",
                ],
            },
        ),
        (
            MinimumHierarchicalOuterPolicyDmaDisciplined(cooldown_days=30),
            {
                "policy": "MinimumHierarchicalOuterPolicyDmaDisciplined",
                "active_features": [
                    "dma_stable_gating",
                    "greed_sell_suppression",
                    "persistent_spy_latch",
                    "cross_down_cooldown=30d",
                    "below_dma_hold",
                    "extreme_fear_dca_carve_out",
                ],
            },
        ),
    ],
)
def test_minimum_variant_feature_summaries(
    policy: MinimumHierarchicalOuterPolicy,
    expected: dict[str, object],
) -> None:
    assert policy.feature_summary() == expected


@pytest.mark.parametrize(
    "policy",
    [
        MinimumHierarchicalOuterPolicyCrossCooldown(cooldown_days=30),
        MinimumHierarchicalOuterPolicyBelowDmaHold(),
        MinimumHierarchicalOuterPolicyDmaDisciplined(cooldown_days=30),
    ],
)
def test_minimum_variant_post_adjustment_noops_on_aligned_above_dma_target(
    policy: MinimumHierarchicalOuterPolicy,
) -> None:
    portfolio = _portfolio({"spy": 0.4, "btc": 0.6, "eth": 0.0, "stable": 0.0})
    snapshot, _component = _outer_snapshot(
        policy=policy,
        contexts=[_context(portfolio=portfolio)],
    )
    intent = AllocationIntent(
        action="hold",
        target_allocation={
            "btc": 0.6,
            "eth": 0.0,
            "spy": 0.4,
            "stable": 0.0,
            "alt": 0.0,
        },
        allocation_name="test",
        immediate=False,
        reason="test",
        rule_group="none",
        decision_score=0.0,
    )

    adjusted = policy.apply_post_intent_adjustments(intent=intent, snapshot=snapshot)

    assert adjusted.target_allocation == pytest.approx(intent.target_allocation)


def test_minimum_buffer_policy_requires_dma_distance_for_entry() -> None:
    portfolio = _portfolio({"spy": 0.0, "btc": 0.0, "eth": 0.0, "stable": 1.0})
    policy = MinimumHierarchicalOuterPolicyWithBuffer(dma_entry_buffer=0.03)
    snapshot, _component = _outer_snapshot(
        policy=policy,
        contexts=[
            _context(
                portfolio=portfolio,
                spy_price=560.0,
                spy_dma_200=580.0,
                snapshot_date=date(2026, 4, 5),
            ),
            _context(
                portfolio=portfolio,
                spy_price=590.0,
                spy_dma_200=580.0,
                snapshot_date=date(2026, 4, 6),
            ),
        ],
    )

    intent = policy.decide(snapshot)

    assert intent.reason == "regime_no_signal"
    assert intent.target_allocation is not None
    assert intent.target_allocation["spy"] == pytest.approx(0.0)
    assert intent.target_allocation["stable"] == pytest.approx(1.0)


def test_minimum_buffer_policy_allows_entry_past_dma_distance() -> None:
    portfolio = _portfolio({"spy": 0.0, "btc": 0.0, "eth": 0.0, "stable": 1.0})
    policy = MinimumHierarchicalOuterPolicyWithBuffer(dma_entry_buffer=0.03)
    snapshot, _component = _outer_snapshot(
        policy=policy,
        contexts=[
            _context(
                portfolio=portfolio,
                spy_price=560.0,
                spy_dma_200=580.0,
                snapshot_date=date(2026, 4, 5),
            ),
            _context(
                portfolio=portfolio,
                spy_price=604.0,
                spy_dma_200=580.0,
                snapshot_date=date(2026, 4, 6),
            ),
        ],
    )

    intent = policy.decide(snapshot)

    assert intent.target_allocation is not None
    assert intent.target_allocation["spy"] == pytest.approx(1.0)
    assert intent.target_allocation["stable"] == pytest.approx(0.0)


def test_minimum_dual_above_policy_holds_existing_outer_allocation() -> None:
    portfolio = _portfolio({"spy": 0.4, "btc": 0.6, "eth": 0.0, "stable": 0.0})
    policy = MinimumHierarchicalOuterPolicyDualAboveHold()
    snapshot, _component = _outer_snapshot(
        policy=policy,
        contexts=[_context(portfolio=portfolio)],
    )

    intent = policy.decide(snapshot)

    assert intent.reason == "dual_above_hold"
    assert intent.target_allocation is not None
    assert intent.target_allocation["spy"] == pytest.approx(0.4)
    assert intent.target_allocation["btc"] == pytest.approx(0.6)
    assert intent.target_allocation["stable"] == pytest.approx(0.0)


@pytest.mark.parametrize(
    ("policy", "expected_features"),
    [
        (
            FullFeaturedOuterPolicy(disabled_rules=FULL_DISABLED_RULES),
            [
                "dma_stable_gating",
                "adaptive_dma_reference",
                "spy_cross_up_latch",
                "greed_sell_suppression",
                "fear_recovery_buy",
                f"buy_floor={CURRENT_DMA_BUY_STRENGTH_FLOOR:g}",
            ],
        ),
        (
            FullFeaturedOuterPolicy(
                adaptive_crypto_dma_reference=False,
                spy_cross_up_latch=False,
                disabled_rules=FULL_DISABLED_RULES
                | frozenset({FEAR_RECOVERY_BUY_RULE}),
                dma_buy_strength_floor=0.0,
            ),
            ["dma_stable_gating", "greed_sell_suppression"],
        ),
        (
            FullFeaturedOuterPolicy(
                disabled_rules=frozenset(),
                dma_buy_strength_floor=LEGACY_DMA_BUY_STRENGTH_FLOOR,
            ),
            [
                "dma_stable_gating",
                "adaptive_dma_reference",
                "spy_cross_up_latch",
                "fear_recovery_buy",
                f"buy_floor={LEGACY_DMA_BUY_STRENGTH_FLOOR:g}",
            ],
        ),
    ],
)
def test_full_featured_policy_feature_summary_reflects_config(
    policy: FullFeaturedOuterPolicy,
    expected_features: list[str],
) -> None:
    assert policy.feature_summary() == {
        "policy": "FullFeaturedOuterPolicy",
        "active_features": expected_features,
    }


def test_minimum_policy_intent_matches_legacy_buy_floor_free_config() -> None:
    class LegacyMinimumPolicyWithBuyFloorZero:
        dma_buy_strength_floor = 0.0

        def decide(self, snapshot: HierarchicalOuterSnapshot) -> object:
            return MinimumHierarchicalOuterPolicy().decide(snapshot)

    portfolio = _portfolio({"spy": 0.4, "btc": 0.0, "eth": 0.0, "stable": 0.6})
    snapshot, _component = _outer_snapshot(
        policy=MinimumHierarchicalOuterPolicy(),
        contexts=[
            _context(
                portfolio=portfolio,
                spy_price=560.0,
                spy_dma_200=580.0,
                btc_price=95_000.0,
                dma_200=100_000.0,
                snapshot_date=date(2026, 4, 5),
            ),
            _context(
                portfolio=portfolio,
                spy_price=600.0,
                spy_dma_200=580.0,
                btc_price=100_000.0,
                dma_200=95_000.0,
                snapshot_date=date(2026, 4, 6),
            ),
        ],
    )

    assert MinimumHierarchicalOuterPolicy().decide(
        snapshot
    ) == LegacyMinimumPolicyWithBuyFloorZero().decide(snapshot)
