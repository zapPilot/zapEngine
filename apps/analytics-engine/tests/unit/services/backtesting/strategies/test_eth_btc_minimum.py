from __future__ import annotations

from typing import cast

import pytest

from src.services.backtesting.constants import STRATEGY_DMA_FGI_ETH_BTC_MINIMUM
from src.services.backtesting.signals.dma_gated_fgi.types import (
    DmaCooldownState,
    DmaMarketState,
)
from src.services.backtesting.strategies.eth_btc_minimum import (
    DmaFgiEthBtcMinimumStrategy,
)
from src.services.backtesting.strategies.eth_btc_rotation import (
    EthBtcRotationParams,
)
from src.services.backtesting.strategies.hierarchical_attribution import (
    PLAIN_GREED_SELL_RULE,
)
from src.services.backtesting.strategies.pair_rotation_template import (
    ADAPTIVE_BINARY_ETH_BTC_TEMPLATE,
    DmaFgiAdaptiveBinaryEthBtcStrategy,
    PairRotationTemplateDecisionPolicy,
    PairRotationTemplateState,
)


def _state(*, fgi_regime: str) -> PairRotationTemplateState:
    return PairRotationTemplateState(
        dma_state=DmaMarketState(
            signal_id="dma_gated_fgi",
            dma_200=100.0,
            dma_distance=0.10,
            zone="above",
            cross_event=None,
            actionable_cross_event=None,
            cooldown_state=DmaCooldownState(
                active=False,
                remaining_days=0,
                blocked_zone=None,
            ),
            fgi_value=65.0 if fgi_regime == "greed" else 50.0,
            fgi_slope=0.0,
            fgi_regime=fgi_regime,
            regime_source="value",
            ath_event=None,
        ),
        ratio=0.06,
        ratio_dma_200=0.05,
        ratio_distance=0.20,
        ratio_zone="above",
        ratio_cooldown_state=DmaCooldownState(
            active=False,
            remaining_days=0,
            blocked_zone=None,
        ),
        current_asset_allocation={"btc": 1.0, "eth": 0.0, "stable": 0.0},
        outer_dma_unit=ADAPTIVE_BINARY_ETH_BTC_TEMPLATE.right_unit,
    )


def _pair_policy(
    strategy: DmaFgiAdaptiveBinaryEthBtcStrategy,
) -> PairRotationTemplateDecisionPolicy:
    return cast(PairRotationTemplateDecisionPolicy, strategy.decision_policy)


def test_strategy_instantiates_with_expected_disabled_rules() -> None:
    strategy = DmaFgiEthBtcMinimumStrategy(total_capital=10_000.0)
    explicit_empty_params = DmaFgiEthBtcMinimumStrategy(
        total_capital=10_000.0,
        params={},
    )

    assert strategy.strategy_id == STRATEGY_DMA_FGI_ETH_BTC_MINIMUM
    assert isinstance(strategy.params, EthBtcRotationParams)
    assert strategy.params.disabled_rules == frozenset({PLAIN_GREED_SELL_RULE})
    assert isinstance(explicit_empty_params.params, EthBtcRotationParams)
    assert explicit_empty_params.params.disabled_rules == frozenset(
        {PLAIN_GREED_SELL_RULE}
    )
    assert _pair_policy(strategy)._dma_policy.disabled_rules == frozenset(
        {PLAIN_GREED_SELL_RULE}
    )


def test_feature_summary_reports_research_no_spy_surface() -> None:
    strategy = DmaFgiEthBtcMinimumStrategy(total_capital=10_000.0)

    assert strategy.feature_summary() == {
        "policy": "DmaFgiEthBtcMinimumStrategy",
        "active_features": ["dma_stable_gating", "greed_sell_suppression"],
        "spy_layer": False,
        "research_only": True,
    }
    assert strategy.parameters()["feature_summary"] == strategy.feature_summary()


def test_decision_matches_adaptive_binary_outside_greed_sell_regime() -> None:
    adaptive = DmaFgiAdaptiveBinaryEthBtcStrategy(total_capital=10_000.0)
    minimum = DmaFgiEthBtcMinimumStrategy(total_capital=10_000.0)
    state = _state(fgi_regime="neutral")

    assert _pair_policy(minimum).decide(state) == _pair_policy(adaptive).decide(state)


def test_decision_suppresses_plain_greed_sell_vs_adaptive_binary() -> None:
    adaptive = DmaFgiAdaptiveBinaryEthBtcStrategy(total_capital=10_000.0)
    minimum = DmaFgiEthBtcMinimumStrategy(total_capital=10_000.0)
    state = _state(fgi_regime="greed")

    suppressed = _pair_policy(minimum).decide(state)
    unsuppressed = _pair_policy(adaptive).decide(state)

    assert suppressed.reason != "above_greed_sell"
    assert suppressed.target_allocation is not None
    assert suppressed.target_allocation["stable"] == pytest.approx(0.0)
    assert unsuppressed.reason == "above_greed_sell"
    assert unsuppressed.target_allocation is not None
    assert unsuppressed.target_allocation["stable"] == pytest.approx(1.0)
