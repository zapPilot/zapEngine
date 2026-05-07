"""Composable outer decision policies for hierarchical SPY/crypto rotation."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field, replace
from datetime import date
from typing import Any, Protocol

from src.services.backtesting.decision import AllocationIntent, RuleGroup
from src.services.backtesting.signals.dma_gated_fgi.types import DmaMarketState
from src.services.backtesting.strategies.dma_gated_fgi import (
    DmaGatedFgiDecisionPolicy,
)
from src.services.backtesting.strategies.eth_btc_rotation import (
    _suppress_ath_sell_intent,
)
from src.services.backtesting.strategies.hierarchical_attribution import (
    CURRENT_DMA_BUY_STRENGTH_FLOOR,
    FEAR_RECOVERY_BUY_RULE,
    FULL_DISABLED_RULES,
    PLAIN_GREED_SELL_RULE,
)
from src.services.backtesting.strategies.pair_rotation_template import (
    PairRotationTemplateSpec,
    PairRotationTemplateState,
    PairRotationUnit,
    _compose_pair_target,
    _resolve_binary_left_share,
)
from src.services.backtesting.target_allocation import (
    normalize_target_allocation,
    target_from_current_allocation,
)

OUTER_CROSS_UP_FOLLOW_THROUGH_DAYS = 14


@dataclass(frozen=True)
class HierarchicalOuterSnapshot:
    """Outer policy input isolated from the full hierarchical signal state."""

    template: PairRotationTemplateSpec
    outer_state: PairRotationTemplateState
    spy_dma_state: DmaMarketState | None
    crypto_dma_state: DmaMarketState | None
    crypto_dma_reference_asset: str
    spy_latch_active: bool
    pre_existing_stable_share: float
    spy_latch_target_share: float | None = None
    btc_dma_state: DmaMarketState | None = None
    eth_dma_state: DmaMarketState | None = None
    current_asset_allocation: dict[str, float] = field(default_factory=dict)
    spy_days_since_cross_down: int | None = None
    btc_days_since_cross_down: int | None = None
    eth_days_since_cross_down: int | None = None


class HierarchicalOuterDecisionPolicy(Protocol):
    """Decides SPY-vs-crypto-vs-stable allocation from DMA + FGI state."""

    def decide(self, snapshot: HierarchicalOuterSnapshot) -> AllocationIntent:
        """Return an outer-sleeve intent whose target is the outer allocation."""
        ...

    def apply_post_intent_adjustments(
        self,
        *,
        intent: AllocationIntent,
        snapshot: HierarchicalOuterSnapshot,
    ) -> AllocationIntent:
        """Adjust a composed final intent after inner/outer target composition."""
        ...

    def feature_summary(self) -> dict[str, Any]:
        """Return the active runtime feature surface for auditability."""
        ...


@dataclass(frozen=True)
class FullFeaturedOuterPolicy:
    """Production outer policy extracted from hierarchical rotation."""

    adaptive_crypto_dma_reference: bool = True
    spy_cross_up_latch: bool = True
    disabled_rules: frozenset[str] = FULL_DISABLED_RULES
    dma_buy_strength_floor: float = CURRENT_DMA_BUY_STRENGTH_FLOOR
    rotation_drift_threshold: float = 0.03
    dma_overextension_threshold: float = 0.30
    fgi_slope_reversal_threshold: float = -0.05
    fgi_slope_recovery_threshold: float = 0.05

    def decide(self, snapshot: HierarchicalOuterSnapshot) -> AllocationIntent:
        return _resolve_dual_dma_outer_decision(
            snapshot=snapshot,
            dma_policy=self._dma_policy(),
            rotation_drift_threshold=self.rotation_drift_threshold,
        )

    def apply_post_intent_adjustments(
        self,
        *,
        intent: AllocationIntent,
        snapshot: HierarchicalOuterSnapshot,
    ) -> AllocationIntent:
        if (
            not self.spy_cross_up_latch
            or not snapshot.spy_latch_active
            or intent.target_allocation is None
        ):
            return intent
        return replace(
            intent,
            target_allocation=_apply_spy_latch_to_target(
                target_allocation=intent.target_allocation,
                pre_existing_stable_share=snapshot.pre_existing_stable_share,
            ),
        )

    def feature_summary(self) -> dict[str, Any]:
        active = ["dma_stable_gating"]
        if self.adaptive_crypto_dma_reference:
            active.append("adaptive_dma_reference")
        if self.spy_cross_up_latch:
            active.append("spy_cross_up_latch")
        if PLAIN_GREED_SELL_RULE in self.disabled_rules:
            active.append("greed_sell_suppression")
        if FEAR_RECOVERY_BUY_RULE not in self.disabled_rules:
            active.append("fear_recovery_buy")
        if self.dma_buy_strength_floor > 0.0:
            active.append(f"buy_floor={self.dma_buy_strength_floor:g}")
        return {
            "policy": "FullFeaturedOuterPolicy",
            "active_features": active,
        }

    def _dma_policy(self) -> DmaGatedFgiDecisionPolicy:
        return DmaGatedFgiDecisionPolicy(
            dma_overextension_threshold=self.dma_overextension_threshold,
            fgi_slope_reversal_threshold=self.fgi_slope_reversal_threshold,
            fgi_slope_recovery_threshold=self.fgi_slope_recovery_threshold,
            disabled_rules=self.disabled_rules,
        )


@dataclass(frozen=True)
class MinimumHierarchicalOuterPolicy:
    """Two-feature minimum: DMA gating plus greed-sell suppression."""

    def decide(self, snapshot: HierarchicalOuterSnapshot) -> AllocationIntent:
        return _resolve_dual_dma_outer_decision(
            snapshot=snapshot,
            dma_policy=self._dma_policy(),
            rotation_drift_threshold=0.03,
        )

    def apply_post_intent_adjustments(
        self,
        *,
        intent: AllocationIntent,
        snapshot: HierarchicalOuterSnapshot,
    ) -> AllocationIntent:
        if not snapshot.spy_latch_active or intent.target_allocation is None:
            return intent
        return _apply_spy_latch_to_intent(intent=intent, snapshot=snapshot)

    def feature_summary(self) -> dict[str, Any]:
        return {
            "policy": "MinimumHierarchicalOuterPolicy",
            "active_features": [
                "dma_stable_gating",
                "greed_sell_suppression",
                "persistent_spy_latch",
            ],
        }

    def _dma_policy(self) -> DmaGatedFgiDecisionPolicy:
        disabled_rules = frozenset({FEAR_RECOVERY_BUY_RULE}) | FULL_DISABLED_RULES
        return DmaGatedFgiDecisionPolicy(disabled_rules=disabled_rules)


def is_spy_latch_expired(
    *,
    current_date: date,
    activated_on: date | None,
) -> bool:
    if activated_on is None:
        return False
    return (current_date - activated_on).days > OUTER_CROSS_UP_FOLLOW_THROUGH_DAYS


def selected_outer_dma_assets(intent: AllocationIntent) -> frozenset[str]:
    diagnostics = intent.diagnostics or {}
    assets = diagnostics.get("outer_dma_assets")
    if isinstance(assets, list):
        return frozenset(asset for asset in assets if isinstance(asset, str))
    asset = diagnostics.get("outer_dma_asset")
    if not isinstance(asset, str):
        asset = diagnostics.get("outer_dma_action_unit")
    return frozenset({asset}) if isinstance(asset, str) else frozenset()


def selected_outer_dma_reference_asset(
    intent: AllocationIntent,
    action_unit: str,
) -> str | None:
    diagnostics = intent.diagnostics or {}
    reference_by_asset = diagnostics.get("outer_dma_reference_by_asset")
    if isinstance(reference_by_asset, Mapping):
        asset_reference = reference_by_asset.get(action_unit)
        if isinstance(asset_reference, str):
            return asset_reference
    reference_asset = diagnostics.get("outer_dma_reference_asset")
    return reference_asset if isinstance(reference_asset, str) else None


def selected_outer_dma_asset(intent: AllocationIntent) -> str | None:
    diagnostics = intent.diagnostics or {}
    asset = diagnostics.get("outer_dma_asset")
    if not isinstance(asset, str):
        asset = diagnostics.get("outer_dma_action_unit")
    return asset if isinstance(asset, str) else None


def max_allocation_drift(
    *,
    current_allocation: Mapping[str, float],
    target_allocation: Mapping[str, float],
) -> float:
    current = target_from_current_allocation(current_allocation)
    target = normalize_target_allocation(target_allocation)
    return max(
        abs(float(current.get(bucket, 0.0)) - float(target.get(bucket, 0.0)))
        for bucket in ("btc", "eth", "spy", "stable")
    )


def _resolve_dual_dma_outer_decision(
    *,
    snapshot: HierarchicalOuterSnapshot,
    dma_policy: DmaGatedFgiDecisionPolicy,
    rotation_drift_threshold: float,
    dma_entry_buffer: float = 0.0,
) -> AllocationIntent:
    template = snapshot.template
    spy_intent = _resolve_optional_outer_dma_intent(
        dma_state=snapshot.spy_dma_state,
        dma_policy=dma_policy,
        dma_entry_buffer=dma_entry_buffer,
    )
    spy_intent = _with_outer_dma_reference_diagnostics(
        intent=spy_intent,
        action_unit=template.left_unit.symbol,
        reference_asset=template.left_unit.symbol,
    )
    crypto_intent = _resolve_optional_outer_dma_intent(
        dma_state=snapshot.crypto_dma_state,
        dma_policy=dma_policy,
        dma_entry_buffer=dma_entry_buffer,
    )
    crypto_intent = _with_outer_dma_reference_diagnostics(
        intent=crypto_intent,
        action_unit=template.right_unit.symbol,
        reference_asset=snapshot.crypto_dma_reference_asset,
    )
    sell_specs = [
        (unit, intent)
        for unit, intent in (
            (template.left_unit, spy_intent),
            (template.right_unit, crypto_intent),
        )
        if _is_outer_dma_sell_intent(intent)
    ]
    if sell_specs:
        target = normalize_target_allocation(
            snapshot.outer_state.current_asset_allocation
        )
        for unit, _intent in sell_specs:
            target = _zero_outer_unit_share(target_allocation=target, unit=unit)
        return _build_outer_dma_intent(
            specs=sell_specs,
            target_allocation=target,
        )

    buy_specs = [
        (unit, intent)
        for unit, intent in (
            (template.left_unit, spy_intent),
            (template.right_unit, crypto_intent),
        )
        if _is_outer_dma_buy_intent(intent)
    ]
    if buy_specs:
        target = normalize_target_allocation(
            snapshot.outer_state.current_asset_allocation
        )
        target = _raise_outer_units_from_stable(
            target_allocation=target,
            specs=buy_specs,
        )
        return _build_outer_dma_intent(specs=buy_specs, target_allocation=target)

    target = _resolve_outer_ratio_target(
        outer_state=snapshot.outer_state,
        template=snapshot.template,
    )
    return _build_outer_ratio_intent(
        current_allocation=snapshot.outer_state.current_asset_allocation,
        target_allocation=target,
        rotation_drift_threshold=rotation_drift_threshold,
    )


def _resolve_optional_outer_dma_intent(
    *,
    dma_state: DmaMarketState | None,
    dma_policy: DmaGatedFgiDecisionPolicy,
    dma_entry_buffer: float = 0.0,
) -> AllocationIntent:
    if dma_state is None:
        return AllocationIntent(
            action="hold",
            target_allocation=None,
            allocation_name=None,
            immediate=False,
            reason="dma_data_unavailable",
            rule_group="none",
            decision_score=0.0,
        )
    intent = _suppress_ath_sell_intent(
        intent=dma_policy.decide(dma_state),
        snapshot=dma_state,
    )
    if (
        dma_entry_buffer > 0.0
        and _is_outer_dma_buy_intent(intent)
        and dma_state.zone == "above"
        and dma_state.dma_distance < dma_entry_buffer
    ):
        diagnostics = dict(intent.diagnostics or {})
        diagnostics["dma_entry_buffer"] = dma_entry_buffer
        diagnostics["dma_entry_buffer_distance"] = dma_state.dma_distance
        return replace(
            intent,
            action="hold",
            target_allocation=None,
            allocation_name=None,
            immediate=False,
            reason="dma_entry_buffer_hold",
            rule_group="none",
            decision_score=0.0,
            diagnostics=diagnostics,
        )
    return intent


def _with_outer_dma_reference_diagnostics(
    *,
    intent: AllocationIntent,
    action_unit: str,
    reference_asset: str,
) -> AllocationIntent:
    diagnostics = dict(intent.diagnostics or {})
    diagnostics["outer_dma_action_unit"] = action_unit
    diagnostics["outer_dma_reference_asset"] = reference_asset
    diagnostics["outer_dma_reference_by_asset"] = {action_unit: reference_asset}
    return replace(intent, diagnostics=diagnostics)


def _resolve_outer_ratio_target(
    *,
    outer_state: PairRotationTemplateState,
    template: PairRotationTemplateSpec,
) -> dict[str, float]:
    current_allocation = outer_state.current_asset_allocation
    left_share = _resolve_binary_left_share(
        current_allocation=current_allocation,
        ratio_zone=outer_state.ratio_zone,
        template=template,
    )
    return _compose_pair_target(
        stable_share=float(current_allocation.get("stable", 0.0)),
        left_share_in_risk_on=left_share,
        template=template,
    )


def _build_outer_ratio_intent(
    *,
    current_allocation: Mapping[str, float],
    target_allocation: Mapping[str, float],
    rotation_drift_threshold: float,
) -> AllocationIntent:
    if (
        max_allocation_drift(
            current_allocation=current_allocation,
            target_allocation=target_allocation,
        )
        > rotation_drift_threshold
    ):
        return AllocationIntent(
            action="hold",
            target_allocation=dict(target_allocation),
            allocation_name="pair_ratio_rebalance",
            immediate=False,
            reason="pair_ratio_rebalance",
            rule_group="rotation",
            decision_score=0.0,
        )
    return AllocationIntent(
        action="hold",
        target_allocation=dict(target_allocation),
        allocation_name=None,
        immediate=False,
        reason="regime_no_signal",
        rule_group="none",
        decision_score=0.0,
    )


def _is_outer_dma_sell_intent(intent: AllocationIntent) -> bool:
    return (
        intent.action == "sell"
        and intent.target_allocation is not None
        and intent.rule_group in {"cross", "dma_fgi", "ath"}
    )


def _is_outer_dma_buy_intent(intent: AllocationIntent) -> bool:
    return (
        intent.action == "buy"
        and intent.target_allocation is not None
        and intent.rule_group in {"cross", "dma_fgi"}
    )


def _build_outer_dma_intent(
    *,
    specs: list[tuple[PairRotationUnit, AllocationIntent]],
    target_allocation: Mapping[str, float],
) -> AllocationIntent:
    primary_unit, primary_intent = min(
        specs,
        key=lambda spec: _dma_rule_priority(spec[1].rule_group),
    )
    reason = (
        primary_intent.reason
        if len(specs) == 1
        else "+".join(_asset_dma_reason(unit, intent) for unit, intent in specs)
    )
    allocation_name = (
        primary_intent.allocation_name
        if len(specs) == 1
        else "+".join(
            _asset_dma_allocation_name(unit, intent) for unit, intent in specs
        )
    )
    diagnostics: dict[str, Any] = {
        "outer_dma_asset": primary_unit.symbol,
        "outer_dma_action_unit": primary_unit.symbol,
        "outer_dma_reference_asset": _intent_reference_asset(
            primary_unit,
            primary_intent,
        ),
        "outer_dma_assets": [unit.symbol for unit, _intent in specs],
        "outer_dma_reference_assets": [
            _intent_reference_asset(unit, intent) for unit, intent in specs
        ],
        "outer_dma_reference_by_asset": {
            unit.symbol: _intent_reference_asset(unit, intent) for unit, intent in specs
        },
    }
    cross_up_assets = [
        _intent_reference_asset(unit, intent)
        for unit, intent in specs
        if intent.action == "buy"
        and intent.rule_group == "cross"
        and intent.reason == "dma_cross_up"
    ]
    if cross_up_assets:
        diagnostics["cross_up_asset"] = cross_up_assets[0]
        diagnostics["cross_up_assets"] = cross_up_assets
    return AllocationIntent(
        action=primary_intent.action,
        target_allocation=dict(target_allocation),
        allocation_name=allocation_name,
        immediate=any(intent.immediate for _unit, intent in specs),
        reason=reason,
        rule_group=primary_intent.rule_group,
        decision_score=primary_intent.decision_score,
        diagnostics=diagnostics,
    )


def _intent_reference_asset(
    unit: PairRotationUnit,
    intent: AllocationIntent,
) -> str:
    diagnostics = intent.diagnostics or {}
    reference_asset = diagnostics.get("outer_dma_reference_asset")
    return reference_asset if isinstance(reference_asset, str) else unit.symbol


def _dma_rule_priority(rule_group: RuleGroup) -> int:
    if rule_group == "cross":
        return 0
    if rule_group == "dma_fgi":
        return 1
    if rule_group == "ath":
        return 2
    return 3


def _asset_dma_reason(unit: PairRotationUnit, intent: AllocationIntent) -> str:
    return f"{unit.symbol.lower()}_{intent.reason}"


def _asset_dma_allocation_name(
    unit: PairRotationUnit,
    intent: AllocationIntent,
) -> str:
    allocation_name = intent.allocation_name or intent.reason
    return f"{unit.symbol.lower()}_{allocation_name}"


def _raise_outer_units_from_stable(
    *,
    target_allocation: Mapping[str, float],
    specs: list[tuple[PairRotationUnit, AllocationIntent]],
) -> dict[str, float]:
    target = normalize_target_allocation(target_allocation)
    stable_share = max(0.0, float(target.get("stable", 0.0)))
    if stable_share <= 0.0 or not specs:
        return target

    weights = [
        (unit, _outer_unit_buy_weight(unit=unit, intent=intent))
        for unit, intent in specs
    ]
    total_weight = sum(weight for _unit, weight in weights)
    if total_weight <= 0.0:
        return target
    scale = 1.0 / max(1.0, total_weight)
    deployed = 0.0
    for unit, weight in weights:
        amount = stable_share * weight * scale
        unit_room = max(0.0, 1.0 - _outer_unit_share(target, unit))
        increase = min(amount, unit_room, stable_share - deployed)
        if increase <= 0.0:
            continue
        _add_outer_unit_share(target=target, unit=unit, amount=increase)
        deployed += increase
    target["stable"] = stable_share - deployed
    return normalize_target_allocation(target)


def _outer_unit_buy_weight(
    *,
    unit: PairRotationUnit,
    intent: AllocationIntent,
) -> float:
    if intent.target_allocation is None:
        return 0.0
    unit_target_share = _outer_unit_share(intent.target_allocation, unit)
    if unit_target_share > 0.0:
        return min(1.0, unit_target_share)
    return 1.0 if intent.action == "buy" else 0.0


def _outer_unit_share(
    allocation: Mapping[str, float],
    unit: PairRotationUnit,
) -> float:
    return max(
        0.0,
        sum(
            max(0.0, float(allocation.get(key, 0.0)))
            for key in unit.aggregate_allocation_keys()
        ),
    )


def _add_outer_unit_share(
    *,
    target: dict[str, float],
    unit: PairRotationUnit,
    amount: float,
) -> None:
    key = unit.allocation_key
    target[key] = max(0.0, float(target.get(key, 0.0))) + max(0.0, float(amount))


def _apply_spy_latch_to_target(
    *,
    target_allocation: Mapping[str, float],
    pre_existing_stable_share: float,
    desired_spy_share: float = 1.0,
) -> dict[str, float]:
    target = normalize_target_allocation(target_allocation)
    stable_target = max(0.0, float(target.get("stable", 0.0)))
    stable_before_tick = max(0.0, min(1.0, pre_existing_stable_share))
    freshly_created_stable_today = max(0.0, stable_target - stable_before_tick)
    spy_target = max(0.0, float(target.get("spy", 0.0)))
    spy_deficit = max(0.0, min(1.0, desired_spy_share) - spy_target)
    redeploy_to_spy = min(freshly_created_stable_today, spy_deficit)
    if redeploy_to_spy <= 0.0:
        return target
    target["stable"] = stable_target - redeploy_to_spy
    target["spy"] = spy_target + redeploy_to_spy
    return normalize_target_allocation(target)


def _apply_spy_latch_to_intent(
    *,
    intent: AllocationIntent,
    snapshot: HierarchicalOuterSnapshot,
) -> AllocationIntent:
    assert intent.target_allocation is not None
    target_before = normalize_target_allocation(intent.target_allocation)
    desired_spy_share = (
        snapshot.spy_latch_target_share
        if snapshot.spy_latch_target_share is not None
        else 1.0
    )
    target_after = _apply_spy_latch_to_target(
        target_allocation=target_before,
        pre_existing_stable_share=snapshot.pre_existing_stable_share,
        desired_spy_share=desired_spy_share,
    )
    redeployed = max(
        0.0,
        float(target_after.get("spy", 0.0)) - float(target_before.get("spy", 0.0)),
    )
    if redeployed <= 1e-9:
        return intent
    diagnostics = dict(intent.diagnostics or {})
    existing = diagnostics.get("post_intent_adjustments")
    existing_adjustments = existing if isinstance(existing, list) else []
    diagnostics["post_intent_adjustments"] = [
        *existing_adjustments,
        "spy_latch_absorb_fresh_stable",
    ]
    diagnostics["spy_latch_redeployed_stable"] = redeployed
    diagnostics["spy_latch_target_share"] = desired_spy_share
    return replace(
        intent,
        target_allocation=target_after,
        diagnostics=diagnostics,
    )


def _zero_outer_unit_share(
    *,
    target_allocation: Mapping[str, float],
    unit: PairRotationUnit,
) -> dict[str, float]:
    target = normalize_target_allocation(target_allocation)
    unit_keys = unit.aggregate_allocation_keys()
    released_share = sum(float(target.get(key, 0.0)) for key in unit_keys)
    for key in unit_keys:
        target[key] = 0.0
    target["stable"] = float(target.get("stable", 0.0)) + released_share
    return normalize_target_allocation(target)


__all__ = [
    "FullFeaturedOuterPolicy",
    "HierarchicalOuterDecisionPolicy",
    "HierarchicalOuterSnapshot",
    "MinimumHierarchicalOuterPolicy",
    "is_spy_latch_expired",
    "max_allocation_drift",
    "selected_outer_dma_asset",
    "selected_outer_dma_assets",
    "selected_outer_dma_reference_asset",
]
