"""ETH/BTC attribution variants for isolating rotation feature impact."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field, replace
from datetime import date, timedelta
from typing import Any, Literal

from pydantic import JsonValue

from src.services.backtesting.asset_class_allocator import score_dma_distance
from src.services.backtesting.composition_types import (
    DecisionPolicy,
    StatefulSignalComponent,
)
from src.services.backtesting.constants import (
    STRATEGY_DISPLAY_NAMES,
    STRATEGY_DMA_FGI_ADAPTIVE_DMA_REF,
    STRATEGY_DMA_FGI_PROGRESSIVE_ROTATION,
    STRATEGY_DMA_FGI_RATIO_COOLDOWN,
    STRATEGY_DMA_FGI_RATIO_ZONE,
    STRATEGY_ETH_BTC_FULL_MINUS_ADAPTIVE_DMA,
    STRATEGY_ETH_BTC_FULL_MINUS_PROGRESSIVE_ROTATION,
    STRATEGY_ETH_BTC_FULL_MINUS_RATIO_COOLDOWN,
    STRATEGY_ETH_BTC_FULL_MINUS_RATIO_CROSS,
    STRATEGY_ETH_BTC_PROGRESSIVE_ADAPTIVE,
    STRATEGY_ETH_BTC_PROGRESSIVE_RATIO_CROSS,
    STRATEGY_ETH_BTC_PROGRESSIVE_RATIO_CROSS_COOLDOWN,
    STRATEGY_ETH_BTC_ROTATION_ATTRIBUTION_FULL,
)
from src.services.backtesting.decision import AllocationIntent
from src.services.backtesting.domain import RatioSignalDiagnostics, SignalObservation
from src.services.backtesting.execution.allocation_intent_executor import (
    AllocationIntentExecutor,
)
from src.services.backtesting.execution.contracts import ExecutionHints
from src.services.backtesting.features import (
    DMA_200_FEATURE,
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
    DmaGatedFgiDecisionPolicy,
    DmaGatedFgiSignalComponent,
)
from src.services.backtesting.strategies.eth_btc_rotation import (
    EthBtcRotationParams,
    _build_outer_dma_context,
    _classify_ratio_zone,
    _detect_ratio_cross,
    _normalize_asset_allocation,
    _requires_ratio_rotation,
    _risk_on_share,
    _rotation_distance,
    _suppress_ath_sell_intent,
)
from src.services.backtesting.target_allocation import normalize_target_allocation

AttributionRotationMode = Literal["fixed", "binary", "progressive"]


@dataclass(frozen=True)
class EthBtcAttributionVariant:
    strategy_id: str
    display_name: str
    description: str
    adaptive_dma_reference: bool
    rotation_mode: AttributionRotationMode
    ratio_cross_immediate: bool
    ratio_cooldown: bool
    fixed_eth_share_in_risk_on: float = 0.5


ATTRIBUTION_VARIANTS: dict[str, EthBtcAttributionVariant] = {
    STRATEGY_DMA_FGI_ADAPTIVE_DMA_REF: EthBtcAttributionVariant(
        strategy_id=STRATEGY_DMA_FGI_ADAPTIVE_DMA_REF,
        display_name=STRATEGY_DISPLAY_NAMES[STRATEGY_DMA_FGI_ADAPTIVE_DMA_REF],
        description="Attribution slice: control plus dominant-asset DMA reference.",
        adaptive_dma_reference=True,
        rotation_mode="fixed",
        ratio_cross_immediate=False,
        ratio_cooldown=False,
    ),
    STRATEGY_DMA_FGI_RATIO_ZONE: EthBtcAttributionVariant(
        strategy_id=STRATEGY_DMA_FGI_RATIO_ZONE,
        display_name=STRATEGY_DISPLAY_NAMES[STRATEGY_DMA_FGI_RATIO_ZONE],
        description="Attribution slice: control plus binary ETH/BTC ratio-zone rotation and cross rebalances.",
        adaptive_dma_reference=False,
        rotation_mode="binary",
        ratio_cross_immediate=True,
        ratio_cooldown=False,
    ),
    STRATEGY_DMA_FGI_RATIO_COOLDOWN: EthBtcAttributionVariant(
        strategy_id=STRATEGY_DMA_FGI_RATIO_COOLDOWN,
        display_name=STRATEGY_DISPLAY_NAMES[STRATEGY_DMA_FGI_RATIO_COOLDOWN],
        description="Attribution slice: ratio-zone rotation with an independent ETH/BTC ratio cooldown.",
        adaptive_dma_reference=False,
        rotation_mode="binary",
        ratio_cross_immediate=True,
        ratio_cooldown=True,
    ),
    STRATEGY_DMA_FGI_PROGRESSIVE_ROTATION: EthBtcAttributionVariant(
        strategy_id=STRATEGY_DMA_FGI_PROGRESSIVE_ROTATION,
        display_name=STRATEGY_DISPLAY_NAMES[STRATEGY_DMA_FGI_PROGRESSIVE_ROTATION],
        description="Attribution slice: control plus continuous ETH/BTC ratio-distance rotation.",
        adaptive_dma_reference=False,
        rotation_mode="progressive",
        ratio_cross_immediate=False,
        ratio_cooldown=False,
    ),
    STRATEGY_ETH_BTC_ROTATION_ATTRIBUTION_FULL: EthBtcAttributionVariant(
        strategy_id=STRATEGY_ETH_BTC_ROTATION_ATTRIBUTION_FULL,
        display_name=STRATEGY_DISPLAY_NAMES[STRATEGY_ETH_BTC_ROTATION_ATTRIBUTION_FULL],
        description="Attribution full: adaptive DMA, progressive ETH/BTC rotation, ratio crosses, and ratio cooldown.",
        adaptive_dma_reference=True,
        rotation_mode="progressive",
        ratio_cross_immediate=True,
        ratio_cooldown=True,
    ),
    STRATEGY_ETH_BTC_FULL_MINUS_ADAPTIVE_DMA: EthBtcAttributionVariant(
        strategy_id=STRATEGY_ETH_BTC_FULL_MINUS_ADAPTIVE_DMA,
        display_name=STRATEGY_DISPLAY_NAMES[STRATEGY_ETH_BTC_FULL_MINUS_ADAPTIVE_DMA],
        description="Leave-one-out: full attribution stack without adaptive dominant-asset DMA reference.",
        adaptive_dma_reference=False,
        rotation_mode="progressive",
        ratio_cross_immediate=True,
        ratio_cooldown=True,
    ),
    STRATEGY_ETH_BTC_FULL_MINUS_RATIO_CROSS: EthBtcAttributionVariant(
        strategy_id=STRATEGY_ETH_BTC_FULL_MINUS_RATIO_CROSS,
        display_name=STRATEGY_DISPLAY_NAMES[STRATEGY_ETH_BTC_FULL_MINUS_RATIO_CROSS],
        description="Leave-one-out: full attribution stack without immediate ETH/BTC ratio-cross rebalances.",
        adaptive_dma_reference=True,
        rotation_mode="progressive",
        ratio_cross_immediate=False,
        ratio_cooldown=True,
    ),
    STRATEGY_ETH_BTC_FULL_MINUS_RATIO_COOLDOWN: EthBtcAttributionVariant(
        strategy_id=STRATEGY_ETH_BTC_FULL_MINUS_RATIO_COOLDOWN,
        display_name=STRATEGY_DISPLAY_NAMES[STRATEGY_ETH_BTC_FULL_MINUS_RATIO_COOLDOWN],
        description="Leave-one-out: full attribution stack without independent ETH/BTC ratio cooldown.",
        adaptive_dma_reference=True,
        rotation_mode="progressive",
        ratio_cross_immediate=True,
        ratio_cooldown=False,
    ),
    STRATEGY_ETH_BTC_FULL_MINUS_PROGRESSIVE_ROTATION: EthBtcAttributionVariant(
        strategy_id=STRATEGY_ETH_BTC_FULL_MINUS_PROGRESSIVE_ROTATION,
        display_name=STRATEGY_DISPLAY_NAMES[
            STRATEGY_ETH_BTC_FULL_MINUS_PROGRESSIVE_ROTATION
        ],
        description="Leave-one-out: full attribution stack with binary ratio-zone rotation instead of progressive sizing.",
        adaptive_dma_reference=True,
        rotation_mode="binary",
        ratio_cross_immediate=True,
        ratio_cooldown=True,
    ),
    STRATEGY_ETH_BTC_PROGRESSIVE_ADAPTIVE: EthBtcAttributionVariant(
        strategy_id=STRATEGY_ETH_BTC_PROGRESSIVE_ADAPTIVE,
        display_name=STRATEGY_DISPLAY_NAMES[STRATEGY_ETH_BTC_PROGRESSIVE_ADAPTIVE],
        description="Pairwise slice: progressive ratio-distance rotation plus adaptive dominant-asset DMA reference.",
        adaptive_dma_reference=True,
        rotation_mode="progressive",
        ratio_cross_immediate=False,
        ratio_cooldown=False,
    ),
    STRATEGY_ETH_BTC_PROGRESSIVE_RATIO_CROSS: EthBtcAttributionVariant(
        strategy_id=STRATEGY_ETH_BTC_PROGRESSIVE_RATIO_CROSS,
        display_name=STRATEGY_DISPLAY_NAMES[STRATEGY_ETH_BTC_PROGRESSIVE_RATIO_CROSS],
        description="Pairwise slice: progressive ratio-distance rotation plus immediate ratio-cross rebalances.",
        adaptive_dma_reference=False,
        rotation_mode="progressive",
        ratio_cross_immediate=True,
        ratio_cooldown=False,
    ),
    STRATEGY_ETH_BTC_PROGRESSIVE_RATIO_CROSS_COOLDOWN: EthBtcAttributionVariant(
        strategy_id=STRATEGY_ETH_BTC_PROGRESSIVE_RATIO_CROSS_COOLDOWN,
        display_name=STRATEGY_DISPLAY_NAMES[
            STRATEGY_ETH_BTC_PROGRESSIVE_RATIO_CROSS_COOLDOWN
        ],
        description="Pairwise slice: progressive ratio-distance rotation plus immediate ratio-cross rebalances and ratio cooldown.",
        adaptive_dma_reference=False,
        rotation_mode="progressive",
        ratio_cross_immediate=True,
        ratio_cooldown=True,
    ),
}


def default_eth_btc_attribution_params() -> dict[str, JsonValue]:
    return EthBtcRotationParams().to_public_params()


def build_initial_attribution_asset_allocation(
    *,
    aggregate_allocation: Mapping[str, float],
    eth_share_in_risk_on: float = 0.5,
) -> dict[str, float]:
    spot = max(0.0, float(aggregate_allocation.get("spot", 0.0)))
    stable = max(0.0, float(aggregate_allocation.get("stable", 0.0)))
    total = spot + stable
    if total <= 0.0:
        return normalize_target_allocation(None)
    risk_on = spot / total
    eth_share = max(0.0, min(1.0, float(eth_share_in_risk_on)))
    return normalize_target_allocation(
        {
            "btc": risk_on * (1.0 - eth_share),
            "eth": risk_on * eth_share,
            "spy": 0.0,
            "stable": stable / total,
            "alt": 0.0,
        }
    )


@dataclass(frozen=True)
class EthBtcAttributionState:
    dma_state: DmaMarketState
    ratio: float | None
    ratio_dma_200: float | None
    ratio_distance: float | None
    ratio_zone: Zone | None
    ratio_cross_event: CrossEvent | None
    ratio_cooldown_state: DmaCooldownState
    current_asset_allocation: dict[str, float]


@dataclass
class EthBtcAttributionSignalComponent(StatefulSignalComponent):
    config: DmaGatedFgiConfig = field(default_factory=DmaGatedFgiConfig)
    variant: EthBtcAttributionVariant = field(
        default_factory=lambda: ATTRIBUTION_VARIANTS[STRATEGY_DMA_FGI_ADAPTIVE_DMA_REF]
    )
    ratio_cross_cooldown_days: int = 30
    signal_id: str = "eth_btc_attribution_signal"
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

    def _dma_context(self, context: StrategyContext) -> StrategyContext:
        if self.variant.adaptive_dma_reference:
            return _build_outer_dma_context(context)
        return context

    def initialize(self, context: StrategyContext) -> None:
        self._dma_signal.initialize(self._dma_context(context))
        ratio, ratio_dma_200, _distance = _rotation_distance(context.extra_data)
        self._last_ratio_zone = _classify_ratio_zone(
            ratio=ratio,
            ratio_dma_200=ratio_dma_200,
        )

    def warmup(self, context: StrategyContext) -> None:
        self._dma_signal.warmup(self._dma_context(context))
        ratio, ratio_dma_200, _distance = _rotation_distance(context.extra_data)
        self._last_ratio_zone = _classify_ratio_zone(
            ratio=ratio,
            ratio_dma_200=ratio_dma_200,
        )

    def observe(self, context: StrategyContext) -> EthBtcAttributionState:
        self._release_ratio_cooldown_if_expired(context.date)
        dma_state = self._dma_signal.observe(self._dma_context(context))
        ratio, ratio_dma_200, ratio_distance = _rotation_distance(context.extra_data)
        ratio_zone = _classify_ratio_zone(ratio=ratio, ratio_dma_200=ratio_dma_200)
        ratio_cross_event = _detect_ratio_cross(
            previous_zone=self._last_ratio_zone,
            current_zone=ratio_zone,
            cross_on_touch=self.config.cross_on_touch,
        )
        if not self.variant.ratio_cross_immediate:
            ratio_cross_event = None
        return EthBtcAttributionState(
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
        snapshot: EthBtcAttributionState,
        intent: AllocationIntent,
    ) -> EthBtcAttributionState:
        committed_dma_state = self._dma_signal.apply_intent(
            current_date=current_date,
            snapshot=snapshot.dma_state,
            intent=intent,
        )
        if snapshot.ratio_zone is not None:
            self._last_ratio_zone = snapshot.ratio_zone
        updated_snapshot = replace(snapshot, dma_state=committed_dma_state)
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
        snapshot: EthBtcAttributionState,
        intent: AllocationIntent,
    ) -> SignalObservation:
        observation = self._dma_signal.build_signal_observation(
            snapshot=snapshot.dma_state,
            intent=intent,
        )
        alloc = snapshot.current_asset_allocation
        outer_asset = (
            "ETH"
            if self.variant.adaptive_dma_reference
            and float(alloc.get("eth", 0.0)) > float(alloc.get("btc", 0.0))
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
        snapshot: EthBtcAttributionState,
        intent: AllocationIntent,
        signal_confidence: float,
    ) -> ExecutionHints:
        return replace(
            self._dma_signal.build_execution_hints(
                snapshot=snapshot.dma_state,
                intent=intent,
                signal_confidence=signal_confidence,
            ),
            signal_id=self.signal_id,
        )

    def _should_start_ratio_cooldown(
        self,
        *,
        snapshot: EthBtcAttributionState,
        intent: AllocationIntent,
    ) -> bool:
        if not self.variant.ratio_cooldown:
            return False
        if snapshot.ratio_cross_event is None or intent.target_allocation is None:
            return False
        return _risk_on_share(intent.target_allocation) > 0.0

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
            or current_date <= self._ratio_cooldown_end_date
        ):
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
class EthBtcAttributionDecisionPolicy(DecisionPolicy):
    variant: EthBtcAttributionVariant
    decision_policy_id: str = "eth_btc_attribution_policy"
    rotation_drift_threshold: float = 0.03
    rotation_max_deviation: float = 0.20
    _dma_policy: DmaGatedFgiDecisionPolicy = field(
        default_factory=DmaGatedFgiDecisionPolicy
    )

    def decide(self, snapshot: EthBtcAttributionState) -> AllocationIntent:
        dma_intent = _suppress_ath_sell_intent(
            intent=self._dma_policy.decide(snapshot.dma_state),
            snapshot=snapshot.dma_state,
        )
        current_allocation = _normalize_asset_allocation(
            snapshot.current_asset_allocation
        )
        stable_share = (
            float(current_allocation.get("stable", 1.0))
            if dma_intent.target_allocation is None
            else float(dma_intent.target_allocation.get("stable", 0.0))
        )
        ratio_target = self._resolve_eth_share(snapshot, current_allocation)
        target_allocation = _compose_asset_target(
            stable_share=stable_share,
            eth_share_in_risk_on=ratio_target.eth_share_in_risk_on,
        )
        if dma_intent.target_allocation is not None:
            return AllocationIntent(
                action=dma_intent.action,
                target_allocation=target_allocation,
                allocation_name=dma_intent.allocation_name,
                immediate=dma_intent.immediate,
                reason=dma_intent.reason,
                rule_group=dma_intent.rule_group,
                decision_score=dma_intent.decision_score,
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
        if (
            self.variant.ratio_cross_immediate
            and snapshot.ratio_cross_event is not None
        ):
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
        if ratio_target.should_rebalance and _requires_ratio_rotation(
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
            allocation_name=dma_intent.allocation_name,
            immediate=dma_intent.immediate,
            reason=dma_intent.reason,
            rule_group=dma_intent.rule_group,
            decision_score=dma_intent.decision_score,
        )

    def _resolve_eth_share(
        self,
        snapshot: EthBtcAttributionState,
        current_allocation: Mapping[str, float],
    ) -> _AttributionRatioTarget:
        if snapshot.ratio_cooldown_state.active:
            return _AttributionRatioTarget(
                eth_share_in_risk_on=_eth_share_in_risk_on(current_allocation),
                cooldown_blocked=True,
            )
        if self.variant.rotation_mode == "fixed":
            return _AttributionRatioTarget(
                eth_share_in_risk_on=self.variant.fixed_eth_share_in_risk_on
            )
        if self.variant.rotation_mode == "binary":
            if snapshot.ratio_zone == "below":
                return _AttributionRatioTarget(
                    eth_share_in_risk_on=1.0,
                    should_rebalance=True,
                )
            if snapshot.ratio_zone == "above":
                return _AttributionRatioTarget(
                    eth_share_in_risk_on=0.0,
                    should_rebalance=True,
                )
            return _AttributionRatioTarget(
                eth_share_in_risk_on=_eth_share_in_risk_on(current_allocation)
            )
        progressive_eth_share = score_dma_distance(
            snapshot.ratio_distance,
            band=self.rotation_max_deviation,
        )
        if progressive_eth_share is None:
            return _AttributionRatioTarget(
                eth_share_in_risk_on=_eth_share_in_risk_on(current_allocation)
            )
        return _AttributionRatioTarget(
            eth_share_in_risk_on=progressive_eth_share,
            should_rebalance=True,
        )


@dataclass(frozen=True)
class _AttributionRatioTarget:
    eth_share_in_risk_on: float
    should_rebalance: bool = False
    cooldown_blocked: bool = False


def _eth_share_in_risk_on(allocation: Mapping[str, float]) -> float:
    risk_on = _risk_on_share(allocation)
    if risk_on <= 0.0:
        return 0.5
    return max(0.0, min(1.0, float(allocation.get("eth", 0.0)) / risk_on))


def _compose_asset_target(
    *,
    stable_share: float,
    eth_share_in_risk_on: float,
) -> dict[str, float]:
    stable = max(0.0, min(1.0, float(stable_share)))
    risk_on = max(0.0, 1.0 - stable)
    eth_share = max(0.0, min(1.0, float(eth_share_in_risk_on)))
    return normalize_target_allocation(
        {
            "btc": risk_on * (1.0 - eth_share),
            "eth": risk_on * eth_share,
            "spy": 0.0,
            "stable": stable,
            "alt": 0.0,
        }
    )


@dataclass
class EthBtcAttributionStrategy(ComposedSignalStrategy):
    total_capital: float
    variant: EthBtcAttributionVariant = field(
        default_factory=lambda: ATTRIBUTION_VARIANTS[STRATEGY_DMA_FGI_ADAPTIVE_DMA_REF]
    )
    signal_id: str = "eth_btc_attribution_signal"
    summary_signal_id: str = "eth_btc_attribution_signal"
    params: EthBtcRotationParams | dict[str, Any] = field(
        default_factory=EthBtcRotationParams
    )
    signal_component: StatefulSignalComponent = field(init=False, repr=False)
    decision_policy: DecisionPolicy = field(init=False, repr=False)
    execution_engine: AllocationIntentExecutor = field(init=False, repr=False)
    public_params: dict[str, Any] = field(default_factory=dict)
    strategy_id: str = STRATEGY_DMA_FGI_ADAPTIVE_DMA_REF
    display_name: str = STRATEGY_DISPLAY_NAMES[STRATEGY_DMA_FGI_ADAPTIVE_DMA_REF]
    canonical_strategy_id: str = STRATEGY_DMA_FGI_ADAPTIVE_DMA_REF
    initial_spot_asset: str = "BTC"
    initial_asset_allocation: dict[str, float] | None = None

    def __post_init__(self) -> None:
        resolved_params = (
            self.params
            if isinstance(self.params, EthBtcRotationParams)
            else EthBtcRotationParams.from_public_params(self.params)
        )
        self.params = resolved_params
        self.canonical_strategy_id = self.variant.strategy_id
        self.signal_component = EthBtcAttributionSignalComponent(
            config=resolved_params.build_signal_config(),
            variant=self.variant,
            ratio_cross_cooldown_days=resolved_params.ratio_cross_cooldown_days,
        )
        self.decision_policy = EthBtcAttributionDecisionPolicy(
            variant=self.variant,
            rotation_drift_threshold=resolved_params.rotation_drift_threshold,
            rotation_max_deviation=resolved_params.rotation_max_deviation,
            _dma_policy=DmaGatedFgiDecisionPolicy(
                dma_overextension_threshold=resolved_params.dma_overextension_threshold,
                fgi_slope_reversal_threshold=resolved_params.fgi_slope_reversal_threshold,
                fgi_slope_recovery_threshold=resolved_params.fgi_slope_recovery_threshold,
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
    "ATTRIBUTION_VARIANTS",
    "EthBtcAttributionDecisionPolicy",
    "EthBtcAttributionSignalComponent",
    "EthBtcAttributionState",
    "EthBtcAttributionStrategy",
    "EthBtcAttributionVariant",
    "build_initial_attribution_asset_allocation",
    "default_eth_btc_attribution_params",
]
