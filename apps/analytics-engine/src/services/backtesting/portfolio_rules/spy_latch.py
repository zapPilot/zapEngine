"""Post-intent SPY cross-up latch adjustment."""

from __future__ import annotations

from dataclasses import dataclass, field, replace
from datetime import date, timedelta

from src.services.backtesting.decision import AllocationIntent, RuleGroup
from src.services.backtesting.portfolio_rules.base import (
    PortfolioRuleConfig,
    PortfolioSnapshot,
)
from src.services.backtesting.target_allocation import normalize_target_allocation

_EPSILON = 1e-9


@dataclass
class SpyLatchRule:
    name: str = "spy_latch"
    priority: int = 25
    cooldown_days: int = 0
    follow_through_days: int = 14
    rule_group: RuleGroup = "cross"
    description: str = (
        "Redeploy stable to SPY on cross-up; absorb fresh stable for 14 days."
    )
    _activated_on: date | None = field(default=None, init=False)
    _pre_existing_stable_share: float = field(default=0.0, init=False)

    def reset(self) -> None:
        self._activated_on = None
        self._pre_existing_stable_share = 0.0

    def observe(
        self,
        snapshot: PortfolioSnapshot,
        *,
        config: PortfolioRuleConfig,
    ) -> None:
        del config
        current_date = snapshot.current_date
        if current_date is None:
            return
        if self._is_expired(current_date):
            self.reset()

        spy_state = snapshot.assets.get("SPY")
        if spy_state is None:
            return
        if spy_state.actionable_cross_event == "cross_up":
            self._activated_on = current_date
            self._pre_existing_stable_share = _current_stable_share(snapshot)
            return
        if spy_state.actionable_cross_event == "cross_down" or spy_state.zone in {
            "below",
            "at",
        }:
            self.reset()
            return
        if self._is_active(current_date):
            self._pre_existing_stable_share = _current_stable_share(snapshot)

    def matches(
        self,
        snapshot: PortfolioSnapshot,
        *,
        config: PortfolioRuleConfig,
    ) -> bool:
        del snapshot, config
        return False

    def build_intent(
        self,
        snapshot: PortfolioSnapshot,
        *,
        config: PortfolioRuleConfig,
    ) -> AllocationIntent:
        del snapshot, config
        raise ValueError("SpyLatchRule only supports post-intent adjustments")

    def apply_post_intent_adjustments(
        self,
        *,
        intent: AllocationIntent,
        snapshot: PortfolioSnapshot,
        config: PortfolioRuleConfig,
    ) -> AllocationIntent:
        del config
        if (
            intent.target_allocation is None
            or snapshot.current_date is None
            or not self._is_active(snapshot.current_date)
        ):
            return intent

        is_activation_tick = snapshot.current_date == self._activated_on
        target_before = normalize_target_allocation(intent.target_allocation)
        target_after = _apply_spy_latch_to_target(
            target_allocation=target_before,
            pre_existing_stable_share=self._pre_existing_stable_share,
            redeploy_existing_stable=is_activation_tick,
        )
        redeployed = max(
            0.0,
            float(target_after.get("spy", 0.0)) - float(target_before.get("spy", 0.0)),
        )
        if redeployed <= _EPSILON:
            return intent

        diagnostics = dict(intent.diagnostics or {})
        existing = diagnostics.get("post_intent_adjustments")
        existing_adjustments = existing if isinstance(existing, list) else []
        adjustment_name = (
            "spy_latch_redeploy_existing_stable"
            if is_activation_tick
            else "spy_latch_absorb_fresh_stable"
        )
        diagnostics["post_intent_adjustments"] = [
            *existing_adjustments,
            adjustment_name,
        ]
        diagnostics["spy_latch_redeployed_stable"] = redeployed
        diagnostics["spy_latch_target_share"] = 1.0
        if self._activated_on is not None:
            diagnostics["spy_latch_activated_on"] = self._activated_on.isoformat()
        return replace(
            intent,
            target_allocation=target_after,
            diagnostics=diagnostics,
        )

    def _is_active(self, current_date: date) -> bool:
        return self._activated_on is not None and not self._is_expired(current_date)

    def _is_expired(self, current_date: date) -> bool:
        return (
            self._activated_on is not None
            and current_date - self._activated_on
            > timedelta(days=self.follow_through_days)
        )


def _current_stable_share(snapshot: PortfolioSnapshot) -> float:
    return max(
        0.0, min(1.0, float(snapshot.current_asset_allocation.get("stable", 0.0)))
    )


def _apply_spy_latch_to_target(
    *,
    target_allocation: dict[str, float],
    pre_existing_stable_share: float,
    redeploy_existing_stable: bool,
) -> dict[str, float]:
    target = normalize_target_allocation(target_allocation)
    if redeploy_existing_stable:
        stable_to_redeploy = max(0.0, float(target.get("stable", 0.0)))
    else:
        stable_target = max(0.0, float(target.get("stable", 0.0)))
        stable_before_tick = max(0.0, min(1.0, pre_existing_stable_share))
        stable_to_redeploy = max(0.0, stable_target - stable_before_tick)
    spy_target = max(0.0, float(target.get("spy", 0.0)))
    spy_deficit = max(0.0, 1.0 - spy_target)
    redeploy_to_spy = min(stable_to_redeploy, spy_deficit)
    if redeploy_to_spy <= _EPSILON:
        return target
    target["stable"] = max(0.0, float(target.get("stable", 0.0)) - redeploy_to_spy)
    target["spy"] = spy_target + redeploy_to_spy
    return normalize_target_allocation(target)


__all__ = ["SpyLatchRule"]
