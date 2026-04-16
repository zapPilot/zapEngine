"""ETH/BTC relative-strength rotation layered on top of DMA allocation."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field, replace
from datetime import date, timedelta
from typing import Any

from pydantic import Field, JsonValue

from src.services.backtesting.composition_types import (
    DecisionPolicy,
    StatefulSignalComponent,
)
from src.services.backtesting.constants import (
    STRATEGY_DISPLAY_NAMES,
    STRATEGY_ETH_BTC_ROTATION,
)
from src.services.backtesting.decision import AllocationIntent
from src.services.backtesting.domain import RatioSignalDiagnostics, SignalObservation
from src.services.backtesting.execution.allocation_intent_executor import (
    AllocationIntentExecutor,
)
from src.services.backtesting.execution.contracts import ExecutionHints
from src.services.backtesting.features import (
    DMA_200_FEATURE,
    ETH_BTC_RATIO_DMA_200_FEATURE,
    ETH_BTC_RATIO_FEATURE,
    ETH_BTC_RELATIVE_STRENGTH_AUX_SERIES,
    MarketDataRequirements,
)
from src.services.backtesting.signals.dma_gated_fgi.config import DmaGatedFgiConfig
from src.services.backtesting.signals.dma_gated_fgi.types import (
    BlockedZone,
    CrossEvent,
    DmaCooldownState,
    DmaMarketState,
    Zone,
)
from src.services.backtesting.strategies.base import StrategyContext
from src.services.backtesting.strategies.composed_signal import ComposedSignalStrategy
from src.services.backtesting.strategies.dma_gated_fgi import (
    DMA_GATED_FGI_PUBLIC_PARAM_KEYS,
    DmaGatedFgiDecisionPolicy,
    DmaGatedFgiParams,
    DmaGatedFgiSignalComponent,
)
from src.services.backtesting.utils import coerce_float, coerce_int, coerce_params

ETH_BTC_ROTATION_PUBLIC_PARAM_KEYS = frozenset(
    set(DMA_GATED_FGI_PUBLIC_PARAM_KEYS)
    | {
        "ratio_cross_cooldown_days",
        "rotation_neutral_band",
        "rotation_max_deviation",
        "rotation_drift_threshold",
        "rotation_cooldown_days",
    }
)

_ROTATION_COERCION_SPEC: dict[str, Any] = {
    "ratio_cross_cooldown_days": coerce_int,
    "rotation_neutral_band": coerce_float,
    "rotation_max_deviation": coerce_float,
    "rotation_drift_threshold": coerce_float,
    "rotation_cooldown_days": coerce_int,
}


def _coerce_optional_float(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        normalized = value.strip()
        if not normalized:
            return None
        return float(normalized)
    raise ValueError("ETH/BTC ratio inputs must be numeric")


def _normalize_asset_allocation(raw: Mapping[str, float]) -> dict[str, float]:
    btc = max(0.0, float(raw.get("btc", 0.0)))
    eth = max(0.0, float(raw.get("eth", 0.0)))
    stable = max(0.0, float(raw.get("stable", 0.0)))
    total = btc + eth + stable
    if total <= 0.0:
        return {"btc": 0.0, "eth": 0.0, "stable": 1.0}
    normalized = {
        "btc": btc / total,
        "eth": eth / total,
        "stable": stable / total,
    }
    for bucket, value in tuple(normalized.items()):
        if abs(value) < 1e-12:
            normalized[bucket] = 0.0
    if any(abs(value - 1.0) < 1e-12 for value in normalized.values()):
        dominant = max(("btc", "eth", "stable"), key=lambda bucket: normalized[bucket])
        return {
            "btc": 1.0 if dominant == "btc" else 0.0,
            "eth": 1.0 if dominant == "eth" else 0.0,
            "stable": 1.0 if dominant == "stable" else 0.0,
        }
    total = sum(normalized.values())
    return {bucket: value / total for bucket, value in normalized.items()}


def _risk_on_share(allocation: Mapping[str, float]) -> float:
    return max(
        0.0, float(allocation.get("btc", 0.0)) + float(allocation.get("eth", 0.0))
    )


def _eth_share_in_risk_on(allocation: Mapping[str, float]) -> float:
    risk_on = _risk_on_share(allocation)
    if risk_on <= 0.0:
        return 0.0
    return max(0.0, min(1.0, float(allocation.get("eth", 0.0)) / risk_on))


def _compose_asset_target(
    *,
    stable_share: float,
    eth_share_in_risk_on: float,
) -> dict[str, float]:
    stable = max(0.0, min(1.0, float(stable_share)))
    risk_on = max(0.0, 1.0 - stable)
    eth_share = max(0.0, min(1.0, float(eth_share_in_risk_on)))
    return _normalize_asset_allocation(
        {
            "btc": risk_on * (1.0 - eth_share),
            "eth": risk_on * eth_share,
            "stable": stable,
        }
    )


def _rotation_distance(
    extra_data: Mapping[str, Any],
) -> tuple[float | None, float | None, float | None]:
    ratio = _coerce_optional_float(extra_data.get(ETH_BTC_RATIO_FEATURE))
    dma_200 = _coerce_optional_float(extra_data.get(ETH_BTC_RATIO_DMA_200_FEATURE))
    if ratio is None or dma_200 is None or dma_200 <= 0.0:
        return ratio, dma_200, None
    return ratio, dma_200, (ratio - dma_200) / dma_200


def _classify_ratio_zone(
    *,
    ratio: float | None,
    ratio_dma_200: float | None,
) -> Zone | None:
    if ratio is None or ratio_dma_200 is None or ratio_dma_200 <= 0.0:
        return None
    if ratio > ratio_dma_200:
        return "above"
    if ratio < ratio_dma_200:
        return "below"
    return "at"


def _detect_ratio_cross(
    *,
    previous_zone: Zone | None,
    current_zone: Zone | None,
    cross_on_touch: bool,
) -> CrossEvent | None:
    if previous_zone is None or current_zone is None:
        return None
    if previous_zone == "above":
        if cross_on_touch and current_zone in {"at", "below"}:
            return "cross_down"
        if not cross_on_touch and current_zone == "below":
            return "cross_down"
    if previous_zone == "below":
        if cross_on_touch and current_zone in {"at", "above"}:
            return "cross_up"
        if not cross_on_touch and current_zone == "above":
            return "cross_up"
    return None


def _build_outer_dma_context(context: StrategyContext) -> StrategyContext:
    """Build context for the outer DMA gate using the majority spot asset."""
    alloc = context.portfolio.asset_allocation_percentages(context.price_map)
    asset = (
        "ETH" if float(alloc.get("eth", 0.0)) > float(alloc.get("btc", 0.0)) else "BTC"
    )
    spot_price = context.price_map.get(asset.lower())
    if not isinstance(spot_price, int | float) or float(spot_price) <= 0.0:
        return context
    if asset == "ETH":
        eth_dma = context.extra_data.get("eth_dma_200")
        if isinstance(eth_dma, int | float) and float(eth_dma) > 0.0:
            new_extra = {**context.extra_data, "dma_200": float(eth_dma)}
            return replace(context, price=float(spot_price), extra_data=new_extra)
    return replace(context, price=float(spot_price))


def _suppress_ath_sell_intent(
    *,
    intent: AllocationIntent,
    snapshot: DmaMarketState,
) -> AllocationIntent:
    if intent.reason != "ath_sell":
        return intent
    return AllocationIntent(
        action="hold",
        target_allocation=None,
        allocation_name=None,
        immediate=False,
        reason="price_equal_dma_hold" if snapshot.zone == "at" else "regime_no_signal",
        rule_group="none",
        decision_score=0.0,
    )


def build_initial_eth_btc_asset_allocation(
    *,
    aggregate_allocation: Mapping[str, float],
    extra_data: Mapping[str, Any] | None,
    params: EthBtcRotationParams,
) -> dict[str, float]:
    normalized = {
        "spot": max(0.0, float(aggregate_allocation.get("spot", 0.0))),
        "stable": max(0.0, float(aggregate_allocation.get("stable", 0.0))),
    }
    total = normalized["spot"] + normalized["stable"]
    if total <= 0.0:
        normalized = {"spot": 0.0, "stable": 1.0}
    else:
        normalized = {
            "spot": normalized["spot"] / total,
            "stable": normalized["stable"] / total,
        }
    ratio, ratio_dma_200, _distance = _rotation_distance(
        {} if extra_data is None else extra_data
    )
    ratio_zone = _classify_ratio_zone(ratio=ratio, ratio_dma_200=ratio_dma_200)
    eth_share = 1.0 if ratio_zone == "below" else 0.0
    return _compose_asset_target(
        stable_share=normalized["stable"],
        eth_share_in_risk_on=eth_share,
    )


class EthBtcRotationParams(DmaGatedFgiParams):
    """Public params extend dma_gated_fgi with ratio-rotation controls."""

    ratio_cross_cooldown_days: int = Field(
        default=30,
        ge=0,
        description="Days to suppress same-side ETH/BTC zone reverts after a ratio cross.",
    )
    rotation_neutral_band: float = Field(
        default=0.05,
        ge=0.0,
        description="ETH/BTC ratio distance band that keeps BTC/ETH risk split neutral.",
    )
    rotation_max_deviation: float = Field(
        default=0.20,
        gt=0.0,
        description="Absolute ETH/BTC ratio distance that saturates BTC/ETH rotation.",
    )
    rotation_drift_threshold: float = Field(
        default=0.03,
        ge=0.0,
        le=0.20,
        description="Minimum BTC/ETH allocation drift (per bucket) to trigger rotation rebalance.",
    )
    rotation_cooldown_days: int = Field(
        default=7,
        ge=0,
        description="Minimum days between rotation-triggered rebalances.",
    )

    @classmethod
    def from_public_params(
        cls, params: Mapping[str, Any] | None = None
    ) -> EthBtcRotationParams:
        raw_params = {} if params is None else dict(params)
        invalid_keys = sorted(set(raw_params) - ETH_BTC_ROTATION_PUBLIC_PARAM_KEYS)
        if invalid_keys:
            joined = ", ".join(invalid_keys)
            raise ValueError("Unsupported eth_btc_rotation params: " + joined)

        normalized = DmaGatedFgiParams.from_public_params(
            {
                key: value
                for key, value in raw_params.items()
                if key in DMA_GATED_FGI_PUBLIC_PARAM_KEYS
            }
        ).model_dump()
        normalized.update(coerce_params(raw_params, _ROTATION_COERCION_SPEC))
        return cls(**normalized)


def default_eth_btc_rotation_params() -> dict[str, JsonValue]:
    return EthBtcRotationParams().to_public_params()


@dataclass(frozen=True)
class EthBtcRotationState:
    dma_state: DmaMarketState
    ratio: float | None
    ratio_dma_200: float | None
    ratio_distance: float | None
    ratio_zone: Zone | None
    ratio_cross_event: CrossEvent | None
    ratio_cooldown_state: DmaCooldownState
    current_asset_allocation: dict[str, float]


@dataclass
class EthBtcRelativeStrengthSignalComponent(StatefulSignalComponent):
    """DMA market-state extraction plus ETH/BTC split resolution."""

    config: DmaGatedFgiConfig = field(default_factory=DmaGatedFgiConfig)
    ratio_cross_cooldown_days: int = 30
    rotation_neutral_band: float = 0.05
    rotation_max_deviation: float = 0.20
    signal_id: str = "eth_btc_rs_signal"
    market_data_requirements: MarketDataRequirements = field(
        default_factory=lambda: MarketDataRequirements(
            requires_sentiment=True,
            required_price_features=frozenset({DMA_200_FEATURE}),
            required_aux_series=frozenset({ETH_BTC_RELATIVE_STRENGTH_AUX_SERIES}),
        )
    )
    warmup_lookback_days: int = 14
    _last_ratio_zone: Zone | None = field(default=None, init=False, repr=False)
    _ratio_cooldown_end_date: date | None = field(default=None, init=False, repr=False)
    _ratio_cooldown_blocked_zone: BlockedZone | None = field(
        default=None, init=False, repr=False
    )
    _dma_signal: DmaGatedFgiSignalComponent = field(init=False, repr=False)

    def __post_init__(self) -> None:
        self._dma_signal = DmaGatedFgiSignalComponent(
            config=self.config,
            market_data_requirements=MarketDataRequirements(
                requires_sentiment=True,
                required_price_features=frozenset({DMA_200_FEATURE}),
            ),
            warmup_lookback_days=self.warmup_lookback_days,
        )

    def reset(self) -> None:
        self._dma_signal.reset()
        self._last_ratio_zone = None
        self._ratio_cooldown_end_date = None
        self._ratio_cooldown_blocked_zone = None

    def initialize(self, context: StrategyContext) -> None:
        self._dma_signal.initialize(_build_outer_dma_context(context))
        ratio, ratio_dma_200, _distance = _rotation_distance(context.extra_data)
        self._last_ratio_zone = _classify_ratio_zone(
            ratio=ratio,
            ratio_dma_200=ratio_dma_200,
        )

    def warmup(self, context: StrategyContext) -> None:
        self._dma_signal.warmup(_build_outer_dma_context(context))
        ratio, ratio_dma_200, _distance = _rotation_distance(context.extra_data)
        self._last_ratio_zone = _classify_ratio_zone(
            ratio=ratio,
            ratio_dma_200=ratio_dma_200,
        )

    def observe(self, context: StrategyContext) -> EthBtcRotationState:
        self._release_ratio_cooldown_if_expired(context.date)
        dma_state = self._dma_signal.observe(_build_outer_dma_context(context))
        ratio, ratio_dma_200, ratio_distance = _rotation_distance(context.extra_data)
        ratio_zone = _classify_ratio_zone(ratio=ratio, ratio_dma_200=ratio_dma_200)
        ratio_cross_event = _detect_ratio_cross(
            previous_zone=self._last_ratio_zone,
            current_zone=ratio_zone,
            cross_on_touch=self.config.cross_on_touch,
        )
        return EthBtcRotationState(
            dma_state=dma_state,
            ratio=ratio,
            ratio_dma_200=ratio_dma_200,
            ratio_distance=ratio_distance,
            ratio_zone=ratio_zone,
            ratio_cross_event=ratio_cross_event,
            ratio_cooldown_state=self._ratio_cooldown_state(context.date),
            current_asset_allocation=_normalize_asset_allocation(
                context.portfolio.asset_allocation_percentages(context.portfolio_price)
            ),
        )

    def apply_intent(
        self,
        *,
        current_date: date,
        snapshot: EthBtcRotationState,
        intent: AllocationIntent,
    ) -> EthBtcRotationState:
        committed_dma_state = self._dma_signal.apply_intent(
            current_date=current_date,
            snapshot=snapshot.dma_state,
            intent=intent,
        )
        if snapshot.ratio_zone is not None:
            self._last_ratio_zone = snapshot.ratio_zone
        updated_snapshot = replace(
            snapshot,
            dma_state=committed_dma_state,
        )
        if self._should_start_ratio_cooldown(snapshot=snapshot, intent=intent):
            self._start_ratio_cooldown(
                current_date=current_date,
                cross_event=snapshot.ratio_cross_event,
            )
            updated_snapshot = replace(
                updated_snapshot,
                ratio_cooldown_state=self._ratio_cooldown_state(current_date),
            )
        return updated_snapshot

    def build_signal_observation(
        self,
        *,
        snapshot: EthBtcRotationState,
        intent: AllocationIntent,
    ) -> SignalObservation:
        observation = self._dma_signal.build_signal_observation(
            snapshot=snapshot.dma_state,
            intent=intent,
        )
        alloc = snapshot.current_asset_allocation
        outer_asset = (
            "ETH"
            if float(alloc.get("eth", 0.0)) > float(alloc.get("btc", 0.0))
            else "BTC"
        )
        dma_with_asset = (
            replace(observation.dma, outer_dma_asset=outer_asset)
            if observation.dma
            else None
        )
        return replace(
            observation,
            signal_id=self.signal_id,
            dma=dma_with_asset,
            ratio=RatioSignalDiagnostics(
                ratio=snapshot.ratio,
                ratio_dma_200=snapshot.ratio_dma_200,
                distance=snapshot.ratio_distance,
                zone=snapshot.ratio_zone,
                cross_event=snapshot.ratio_cross_event,
                cooldown_active=snapshot.ratio_cooldown_state.active,
                cooldown_remaining_days=snapshot.ratio_cooldown_state.remaining_days,
                cooldown_blocked_zone=snapshot.ratio_cooldown_state.blocked_zone,
            ),
        )

    def build_execution_hints(
        self,
        *,
        snapshot: EthBtcRotationState,
        intent: AllocationIntent,
        signal_confidence: float,
    ) -> ExecutionHints:
        hints = self._dma_signal.build_execution_hints(
            snapshot=snapshot.dma_state,
            intent=intent,
            signal_confidence=signal_confidence,
        )
        return replace(
            hints,
            signal_id=self.signal_id,
            target_spot_asset=None,
        )

    def _should_start_ratio_cooldown(
        self,
        *,
        snapshot: EthBtcRotationState,
        intent: AllocationIntent,
    ) -> bool:
        if snapshot.ratio_cross_event is None or intent.target_allocation is None:
            return False
        risk_on_share = _risk_on_share(intent.target_allocation)
        if risk_on_share <= 0.0:
            return False
        target_eth_share = _eth_share_in_risk_on(intent.target_allocation)
        if snapshot.ratio_cross_event == "cross_up":
            return abs(target_eth_share - 1.0) <= 1e-9
        return abs(target_eth_share) <= 1e-9

    def _ratio_cooldown_state(self, current_date: date) -> DmaCooldownState:
        return DmaCooldownState(
            active=self._is_ratio_cooldown_active(current_date),
            remaining_days=self._ratio_cooldown_remaining_days(current_date),
            blocked_zone=self._ratio_cooldown_blocked_zone,
        )

    def _is_ratio_cooldown_active(self, current_date: date) -> bool:
        return (
            self._ratio_cooldown_end_date is not None
            and self._ratio_cooldown_blocked_zone is not None
            and current_date <= self._ratio_cooldown_end_date
        )

    def _ratio_cooldown_remaining_days(self, current_date: date) -> int:
        if (
            self._ratio_cooldown_end_date is None
            or self._ratio_cooldown_blocked_zone is None
        ):
            return 0
        return max(0, (self._ratio_cooldown_end_date - current_date).days)

    def _release_ratio_cooldown_if_expired(self, current_date: date) -> None:
        if (
            self._ratio_cooldown_end_date is None
            or self._ratio_cooldown_blocked_zone is None
        ):
            return
        if current_date <= self._ratio_cooldown_end_date:
            return
        self._ratio_cooldown_end_date = None
        self._ratio_cooldown_blocked_zone = None

    def _start_ratio_cooldown(
        self,
        *,
        current_date: date,
        cross_event: CrossEvent | None,
    ) -> None:
        if cross_event is None:
            return
        self._ratio_cooldown_blocked_zone = (
            "above" if cross_event == "cross_up" else "below"
        )
        self._ratio_cooldown_end_date = current_date + timedelta(
            days=self.ratio_cross_cooldown_days
        )


@dataclass(frozen=True)
class EthBtcRotationDecisionPolicy(DecisionPolicy):
    """Reuse DMA stable gating while composing BTC/ETH split targets."""

    decision_policy_id: str = "eth_btc_rotation_policy"
    rotation_drift_threshold: float = 0.03
    _dma_policy: DmaGatedFgiDecisionPolicy = field(
        default_factory=DmaGatedFgiDecisionPolicy
    )

    def decide(self, snapshot: EthBtcRotationState) -> AllocationIntent:
        dma_intent = _suppress_ath_sell_intent(
            intent=self._dma_policy.decide(snapshot.dma_state),
            snapshot=snapshot.dma_state,
        )
        current_allocation = _normalize_asset_allocation(
            snapshot.current_asset_allocation
        )
        if dma_intent.target_allocation is None:
            stable_share = float(current_allocation.get("stable", 1.0))
        else:
            stable_share = float(dma_intent.target_allocation.get("stable", 0.0))
        ratio_target = _resolve_ratio_target(
            current_allocation=current_allocation,
            ratio_zone=snapshot.ratio_zone,
            ratio_cross_event=snapshot.ratio_cross_event,
            ratio_cooldown_state=snapshot.ratio_cooldown_state,
        )
        target_allocation = _compose_asset_target(
            stable_share=stable_share,
            eth_share_in_risk_on=ratio_target.eth_share_in_risk_on,
        )
        if dma_intent.target_allocation is not None:
            return AllocationIntent(
                action=dma_intent.action,
                target_allocation=target_allocation,
                allocation_name=dma_intent.allocation_name,
                immediate=dma_intent.immediate or ratio_target.immediate,
                reason=dma_intent.reason,
                rule_group=dma_intent.rule_group,
                decision_score=dma_intent.decision_score,
            )
        if snapshot.ratio_cross_event is not None and not ratio_target.cooldown_blocked:
            cross_reason = f"eth_btc_ratio_{snapshot.ratio_cross_event}"
            return AllocationIntent(
                action="hold",
                target_allocation=target_allocation,
                allocation_name=cross_reason,
                immediate=True,
                reason=cross_reason,
                rule_group="rotation",
                decision_score=0.0,
            )
        if ratio_target.cooldown_blocked:
            return AllocationIntent(
                action="hold",
                target_allocation=target_allocation,
                allocation_name="eth_btc_ratio_cooldown",
                immediate=False,
                reason=(
                    f"eth_btc_ratio_{snapshot.ratio_cooldown_state.blocked_zone}_side_cooldown_active"
                    if snapshot.ratio_cooldown_state.blocked_zone is not None
                    else "eth_btc_ratio_cooldown_active"
                ),
                rule_group="rotation",
                decision_score=0.0,
            )
        if snapshot.ratio_zone in {"below", "above"}:
            if _requires_ratio_rotation(
                current_allocation=current_allocation,
                target_allocation=target_allocation,
                tolerance=self.rotation_drift_threshold,
            ):
                return AllocationIntent(
                    action="hold",
                    target_allocation=target_allocation,
                    allocation_name="eth_btc_ratio_rebalance",
                    immediate=False,
                    reason="eth_btc_ratio_rebalance",
                    rule_group="rotation",
                    decision_score=0.0,
                )
            return AllocationIntent(
                action=dma_intent.action,
                target_allocation=target_allocation,
                allocation_name="eth_btc_ratio_rebalance",
                immediate=False,
                reason=dma_intent.reason,
                rule_group="rotation",
                decision_score=dma_intent.decision_score,
            )
        return AllocationIntent(
            action=dma_intent.action,
            target_allocation=target_allocation,
            allocation_name=dma_intent.allocation_name,
            immediate=dma_intent.immediate,
            reason=dma_intent.reason,
            rule_group=dma_intent.rule_group,
            decision_score=dma_intent.decision_score,
        )


def _resolve_ratio_target(
    *,
    current_allocation: Mapping[str, float],
    ratio_zone: Zone | None,
    ratio_cross_event: CrossEvent | None,
    ratio_cooldown_state: DmaCooldownState,
) -> _ResolvedRatioTarget:
    # Cooldown freezes ALL ratio actions (crosses AND zone rebalancing)
    # to prevent whipsaw when the ratio oscillates around DMA-200.
    if ratio_cooldown_state.active:
        return _ResolvedRatioTarget(
            eth_share_in_risk_on=_eth_share_in_risk_on(current_allocation),
            cooldown_blocked=True,
        )
    if ratio_cross_event == "cross_up":
        return _ResolvedRatioTarget(eth_share_in_risk_on=1.0, immediate=True)
    if ratio_cross_event == "cross_down":
        return _ResolvedRatioTarget(eth_share_in_risk_on=0.0, immediate=True)
    if ratio_zone == "below":
        return _ResolvedRatioTarget(eth_share_in_risk_on=1.0)
    if ratio_zone == "above":
        return _ResolvedRatioTarget(eth_share_in_risk_on=0.0)
    return _ResolvedRatioTarget(
        eth_share_in_risk_on=_eth_share_in_risk_on(current_allocation)
    )


@dataclass(frozen=True)
class _ResolvedRatioTarget:
    eth_share_in_risk_on: float
    immediate: bool = False
    cooldown_blocked: bool = False


def _requires_ratio_rotation(
    *,
    current_allocation: Mapping[str, float],
    target_allocation: Mapping[str, float],
    tolerance: float = 1e-6,
) -> bool:
    return any(
        abs(
            float(current_allocation.get(bucket, 0.0))
            - float(target_allocation.get(bucket, 0.0))
        )
        > tolerance
        for bucket in ("btc", "eth", "stable")
    )


@dataclass
class EthBtcRotationStrategy(ComposedSignalStrategy):
    """DMA stable-gated strategy with BTC/ETH relative-strength rotation."""

    total_capital: float
    signal_id: str = "eth_btc_rs_signal"
    summary_signal_id: str = "eth_btc_rs_signal"
    params: EthBtcRotationParams | dict[str, Any] = field(
        default_factory=EthBtcRotationParams
    )
    signal_component: StatefulSignalComponent = field(init=False, repr=False)
    decision_policy: DecisionPolicy = field(init=False, repr=False)
    execution_engine: AllocationIntentExecutor = field(init=False, repr=False)
    public_params: dict[str, Any] = field(default_factory=dict)
    strategy_id: str = STRATEGY_ETH_BTC_ROTATION
    display_name: str = STRATEGY_DISPLAY_NAMES[STRATEGY_ETH_BTC_ROTATION]
    canonical_strategy_id: str = STRATEGY_ETH_BTC_ROTATION
    initial_spot_asset: str = "BTC"
    initial_asset_allocation: dict[str, float] | None = None

    def __post_init__(self) -> None:
        if self.signal_id != "eth_btc_rs_signal":
            raise ValueError("signal_id must be 'eth_btc_rs_signal'")
        resolved_params = (
            self.params
            if isinstance(self.params, EthBtcRotationParams)
            else EthBtcRotationParams.from_public_params(self.params)
        )
        self.params = resolved_params
        self.signal_component = EthBtcRelativeStrengthSignalComponent(
            config=resolved_params.build_signal_config(),
            ratio_cross_cooldown_days=resolved_params.ratio_cross_cooldown_days,
            rotation_neutral_band=resolved_params.rotation_neutral_band,
            rotation_max_deviation=resolved_params.rotation_max_deviation,
        )
        self.decision_policy = EthBtcRotationDecisionPolicy(
            rotation_drift_threshold=resolved_params.rotation_drift_threshold,
            _dma_policy=DmaGatedFgiDecisionPolicy(
                dma_overextension_threshold=resolved_params.dma_overextension_threshold,
                fgi_slope_reversal_threshold=resolved_params.fgi_slope_reversal_threshold,
            ),
        )
        self.execution_engine = AllocationIntentExecutor(
            pacing_policy=resolved_params.build_pacing_policy(),
            plugins=resolved_params.build_execution_plugins(),
            rotation_cooldown_days=resolved_params.rotation_cooldown_days,
        )
        self.public_params = {
            "signal_id": self.signal_id,
            **resolved_params.to_public_params(),
        }

    def parameters(self) -> dict[str, Any]:
        return dict(self.public_params)


__all__ = [
    "EthBtcRelativeStrengthSignalComponent",
    "EthBtcRotationDecisionPolicy",
    "EthBtcRotationParams",
    "EthBtcRotationState",
    "EthBtcRotationStrategy",
    "build_initial_eth_btc_asset_allocation",
    "default_eth_btc_rotation_params",
]
