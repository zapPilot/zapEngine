"""Default DMA/FGI rule registry.

Each rule is a frozen dataclass that satisfies the Rule protocol. TargetRule
wraps buy/sell intents with a static target allocation; HoldRule wraps hold
intents whose reason depends on snapshot state.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

from src.services.backtesting.decision import (
    AllocationIntent,
    DecisionAction,
    RuleGroup,
)
from src.services.backtesting.signals.dma_gated_fgi.constants import (
    BUY_TARGET,
    SELL_TARGET,
)
from src.services.backtesting.signals.dma_gated_fgi.types import DmaMarketState
from src.services.backtesting.signals.dma_gated_fgi.utils import _cross_target_zone
from src.services.backtesting.tactics.base import (
    Rule,
    RuleConfig,
    hold_intent,
    hold_reason,
    target_intent,
)

SPY_BUY_TARGET: dict[str, float] = {
    "btc": 0.0,
    "eth": 0.0,
    "spy": 0.20,
    "stable": 0.80,
    "alt": 0.0,
}


@dataclass(frozen=True)
class TargetRule:
    name: str
    priority: int
    rule_group: RuleGroup
    description: str
    predicate: Callable[[DmaMarketState, RuleConfig], bool]
    action: DecisionAction
    target: dict[str, float]
    allocation_name: str
    reason: str
    immediate: bool = False

    def matches(self, snapshot: DmaMarketState, *, config: RuleConfig) -> bool:
        return _matches_predicate(self.predicate, snapshot, config)

    def build_intent(
        self, snapshot: DmaMarketState, *, config: RuleConfig
    ) -> AllocationIntent:
        return target_intent(
            action=self.action,
            target=self.target,
            allocation_name=self.allocation_name,
            reason=self.reason,
            rule_group=self.rule_group,
            immediate=self.immediate,
        )


@dataclass(frozen=True)
class HoldRule:
    name: str
    priority: int
    rule_group: RuleGroup
    description: str
    predicate: Callable[[DmaMarketState, RuleConfig], bool]
    reason_fn: Callable[[DmaMarketState], str]

    # jscpd:ignore-start
    # Reason: rule implementations intentionally share the Rule protocol shape.
    def matches(self, snapshot: DmaMarketState, *, config: RuleConfig) -> bool:
        return _matches_predicate(self.predicate, snapshot, config)

    def build_intent(
        self, snapshot: DmaMarketState, *, config: RuleConfig
    ) -> AllocationIntent:
        return hold_intent(reason=self.reason_fn(snapshot), rule_group=self.rule_group)

    # jscpd:ignore-end


def _matches_predicate(
    predicate: Callable[[DmaMarketState, RuleConfig], bool],
    snapshot: DmaMarketState,
    config: RuleConfig,
) -> bool:
    return predicate(snapshot, config)


# ---------------------------------------------------------------------------
# Predicates — one per rule, named so they appear in stack traces.
# ---------------------------------------------------------------------------


def _matches_actionable_cross_cooldown_block(
    snapshot: DmaMarketState, config: RuleConfig
) -> bool:
    actionable_cross = snapshot.actionable_cross_event
    if actionable_cross != snapshot.cross_event or actionable_cross is None:
        return False
    target_zone = _cross_target_zone(actionable_cross)
    return (
        snapshot.cooldown_state.active
        and target_zone == snapshot.cooldown_state.blocked_zone
    )


def _matches_actionable_cross_down_sell(
    snapshot: DmaMarketState, config: RuleConfig
) -> bool:
    actionable_cross = snapshot.actionable_cross_event
    return actionable_cross == snapshot.cross_event and actionable_cross == "cross_down"


def _matches_actionable_cross_up_buy(
    snapshot: DmaMarketState, config: RuleConfig
) -> bool:
    actionable_cross = snapshot.actionable_cross_event
    return actionable_cross == snapshot.cross_event and actionable_cross == "cross_up"


def _matches_zone_cooldown_hold(snapshot: DmaMarketState, config: RuleConfig) -> bool:
    return (
        snapshot.cooldown_state.active
        and snapshot.zone == snapshot.cooldown_state.blocked_zone
    )


def _matches_above_overextended_sell(
    snapshot: DmaMarketState, config: RuleConfig
) -> bool:
    return (
        snapshot.zone == "above"
        and snapshot.dma_distance >= config.dma_overextension_threshold
    )


def _matches_above_extreme_greed_sell(
    snapshot: DmaMarketState, config: RuleConfig
) -> bool:
    return snapshot.zone == "above" and snapshot.fgi_regime == "extreme_greed"


def _matches_above_greed_fading_sell(
    snapshot: DmaMarketState, config: RuleConfig
) -> bool:
    return (
        snapshot.zone == "above"
        and snapshot.fgi_regime in ("greed", "extreme_greed")
        and snapshot.fgi_slope < config.fgi_slope_reversal_threshold
    )


def _matches_above_greed_sell(snapshot: DmaMarketState, config: RuleConfig) -> bool:
    return snapshot.zone == "above" and snapshot.fgi_regime == "greed"


def _matches_spy_below_extreme_fear_buy(
    snapshot: DmaMarketState, config: RuleConfig
) -> bool:
    return (
        snapshot.asset_symbol == "SPY"
        and snapshot.zone == "below"
        and snapshot.macro_fear_greed_regime == "extreme_fear"
    )


def _matches_below_extreme_fear_buy(
    snapshot: DmaMarketState, config: RuleConfig
) -> bool:
    return (
        snapshot.asset_symbol != "SPY"
        and snapshot.zone == "below"
        and snapshot.fgi_regime == "extreme_fear"
    )


def _matches_below_fear_recovering_buy(
    snapshot: DmaMarketState, config: RuleConfig
) -> bool:
    return (
        snapshot.zone == "below"
        and snapshot.fgi_regime in ("fear", "extreme_fear")
        and snapshot.fgi_slope > config.fgi_slope_recovery_threshold
    )


def _matches_above_ath_sell(snapshot: DmaMarketState, config: RuleConfig) -> bool:
    return snapshot.ath_event is not None and snapshot.zone == "above"


def _matches_regime_no_signal_hold(
    snapshot: DmaMarketState, config: RuleConfig
) -> bool:
    return True


# ---------------------------------------------------------------------------
# Hold-rule reason functions (computed per snapshot).
# ---------------------------------------------------------------------------


def _reason_actionable_cross_cooldown_block(snapshot: DmaMarketState) -> str:
    actionable_cross = snapshot.actionable_cross_event
    assert actionable_cross is not None
    target_zone = _cross_target_zone(actionable_cross)
    return f"{target_zone}_side_cooldown_active"


def _reason_zone_cooldown_hold(snapshot: DmaMarketState) -> str:
    return f"{snapshot.zone}_side_cooldown_active"


def _reason_regime_no_signal_hold(snapshot: DmaMarketState) -> str:
    return hold_reason(snapshot.zone)


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------


_UNSORTED_DEFAULT_RULES: tuple[Rule, ...] = (
    HoldRule(
        name="actionable_cross_cooldown_block",
        priority=10,
        rule_group="cooldown",
        description=(
            "Hold when an actionable DMA cross targets a cooldown-blocked side."
        ),
        predicate=_matches_actionable_cross_cooldown_block,
        reason_fn=_reason_actionable_cross_cooldown_block,
    ),
    TargetRule(
        name="actionable_cross_down_sell",
        priority=20,
        rule_group="cross",
        description="Sell immediately on an actionable DMA cross-down.",
        predicate=_matches_actionable_cross_down_sell,
        action="sell",
        target=SELL_TARGET,
        allocation_name="dma_cross_down_exit",
        reason="dma_cross_down",
        immediate=True,
    ),
    TargetRule(
        name="actionable_cross_up_buy",
        priority=30,
        rule_group="cross",
        description="Buy immediately on an actionable DMA cross-up.",
        predicate=_matches_actionable_cross_up_buy,
        action="buy",
        target=BUY_TARGET,
        allocation_name="dma_cross_up_entry",
        reason="dma_cross_up",
        immediate=True,
    ),
    HoldRule(
        name="zone_cooldown_hold",
        priority=40,
        rule_group="cooldown",
        description="Hold while the current DMA side is still cooldown-blocked.",
        predicate=_matches_zone_cooldown_hold,
        reason_fn=_reason_zone_cooldown_hold,
    ),
    TargetRule(
        name="above_overextended_sell",
        priority=50,
        rule_group="dma_fgi",
        description=(
            "Sell when price is above DMA and overextension exceeds the configured threshold."
        ),
        predicate=_matches_above_overextended_sell,
        action="sell",
        target=SELL_TARGET,
        allocation_name="dma_above_overextended_sell",
        reason="above_dma_overextended_sell",
    ),
    TargetRule(
        name="above_extreme_greed_sell",
        priority=60,
        rule_group="dma_fgi",
        description="Sell when price is above DMA and FGI is extreme greed.",
        predicate=_matches_above_extreme_greed_sell,
        action="sell",
        target=SELL_TARGET,
        allocation_name="dma_above_extreme_greed_sell",
        reason="above_extreme_greed_sell",
    ),
    TargetRule(
        name="above_greed_fading_sell",
        priority=70,
        rule_group="dma_fgi",
        description="Sell when price is above DMA and greed momentum is fading.",
        predicate=_matches_above_greed_fading_sell,
        action="sell",
        target=SELL_TARGET,
        allocation_name="dma_above_greed_fading_sell",
        reason="above_greed_fading_sell",
    ),
    TargetRule(
        name="above_greed_sell",
        priority=80,
        rule_group="dma_fgi",
        description="Sell when price is above DMA and FGI is greed.",
        predicate=_matches_above_greed_sell,
        action="sell",
        target=SELL_TARGET,
        allocation_name="dma_above_greed_sell",
        reason="above_greed_sell",
    ),
    TargetRule(
        name="spy_below_extreme_fear_buy",
        priority=89,
        rule_group="dma_fgi",
        description="Buy SPY when SPY is below DMA and macro FGI is extreme fear.",
        predicate=_matches_spy_below_extreme_fear_buy,
        action="buy",
        target=SPY_BUY_TARGET,
        allocation_name="spy_dma_below_extreme_fear_buy",
        reason="spy_below_extreme_fear_buy",
    ),
    TargetRule(
        name="below_extreme_fear_buy",
        priority=90,
        rule_group="dma_fgi",
        description="Buy when price is below DMA and FGI is extreme fear.",
        predicate=_matches_below_extreme_fear_buy,
        action="buy",
        target=BUY_TARGET,
        allocation_name="dma_below_extreme_fear_buy",
        reason="below_extreme_fear_buy",
    ),
    TargetRule(
        name="below_fear_recovering_buy",
        priority=100,
        rule_group="dma_fgi",
        description="Buy when price is below DMA and fear momentum is recovering.",
        predicate=_matches_below_fear_recovering_buy,
        action="buy",
        target=BUY_TARGET,
        allocation_name="dma_below_fear_recovering_buy",
        reason="below_fear_recovering_buy",
    ),
    TargetRule(
        name="above_ath_sell",
        priority=110,
        rule_group="ath",
        description="Sell on an ATH event while price is above DMA.",
        predicate=_matches_above_ath_sell,
        action="sell",
        target=SELL_TARGET,
        allocation_name="dma_ath_sell",
        reason="ath_sell",
    ),
    HoldRule(
        name="regime_no_signal_hold",
        priority=120,
        rule_group="none",
        description="Hold when no higher-priority DMA/FGI rule matches.",
        predicate=_matches_regime_no_signal_hold,
        reason_fn=_reason_regime_no_signal_hold,
    ),
)

DEFAULT_RULES: tuple[Rule, ...] = tuple(
    sorted(_UNSORTED_DEFAULT_RULES, key=lambda rule: rule.priority)
)

RULE_DESCRIPTIONS: dict[str, str] = {
    rule.name: rule.description for rule in DEFAULT_RULES
}
RULE_NAMES: frozenset[str] = frozenset(rule.name for rule in DEFAULT_RULES)

__all__ = ["DEFAULT_RULES", "RULE_DESCRIPTIONS", "RULE_NAMES"]
