"""Generic two-unit rotation template layered on DMA/FGI stable gating."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field, replace
from datetime import date
from typing import Any

from pydantic import JsonValue

from src.services.backtesting.composition_types import (
    DecisionPolicy,
    StatefulSignalComponent,
)
from src.services.backtesting.constants import (
    STRATEGY_DISPLAY_NAMES,
    STRATEGY_DMA_FGI_ADAPTIVE_BINARY_ETH_BTC,
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
    ETH_DMA_200_FEATURE,
    MarketDataRequirements,
)
from src.services.backtesting.signals.dma_gated_fgi.config import DmaGatedFgiConfig
from src.services.backtesting.signals.dma_gated_fgi.types import (
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
    _suppress_ath_sell_intent,
)
from src.services.backtesting.target_allocation import normalize_target_allocation


@dataclass(frozen=True)
class PairRotationUnit:
    """A leaf asset or future sleeve treated as one side of a pair template."""

    symbol: str
    allocation_key: str
    price_key: str
    dma_feature_key: str


@dataclass(frozen=True)
class PairRotationTemplateSpec:
    """Configuration for a two-unit DMA-gated binary relative-strength sleeve."""

    template_id: str
    signal_id: str
    left_unit: PairRotationUnit
    right_unit: PairRotationUnit
    ratio_feature_key: str
    ratio_dma_feature_key: str
    required_aux_series: frozenset[str]
    neutral_left_share_in_risk_on: float = 0.5
    below_dma_left_share_in_risk_on: float = 1.0
    above_dma_left_share_in_risk_on: float = 0.0

    def market_data_requirements(self) -> MarketDataRequirements:
        return MarketDataRequirements(
            requires_sentiment=True,
            required_price_features=frozenset({DMA_200_FEATURE}),
            required_aux_series=self.required_aux_series,
        )


ADAPTIVE_BINARY_ETH_BTC_TEMPLATE = PairRotationTemplateSpec(
    template_id=STRATEGY_DMA_FGI_ADAPTIVE_BINARY_ETH_BTC,
    signal_id="adaptive_binary_eth_btc_signal",
    left_unit=PairRotationUnit(
        symbol="ETH",
        allocation_key="eth",
        price_key="eth",
        dma_feature_key=ETH_DMA_200_FEATURE,
    ),
    right_unit=PairRotationUnit(
        symbol="BTC",
        allocation_key="btc",
        price_key="btc",
        dma_feature_key=DMA_200_FEATURE,
    ),
    ratio_feature_key=ETH_BTC_RATIO_FEATURE,
    ratio_dma_feature_key=ETH_BTC_RATIO_DMA_200_FEATURE,
    required_aux_series=frozenset({ETH_BTC_RELATIVE_STRENGTH_AUX_SERIES}),
)


def default_pair_rotation_params() -> dict[str, JsonValue]:
    return EthBtcRotationParams().to_public_params()


def build_initial_pair_asset_allocation(
    *,
    aggregate_allocation: Mapping[str, float],
    template: PairRotationTemplateSpec,
) -> dict[str, float]:
    spot = max(0.0, float(aggregate_allocation.get("spot", 0.0)))
    stable = max(0.0, float(aggregate_allocation.get("stable", 0.0)))
    total = spot + stable
    if total <= 0.0:
        return normalize_target_allocation(None)
    return _compose_pair_target(
        stable_share=stable / total,
        left_share_in_risk_on=template.neutral_left_share_in_risk_on,
        template=template,
    )


@dataclass(frozen=True)
class PairRotationTemplateState:
    dma_state: DmaMarketState
    ratio: float | None
    ratio_dma_200: float | None
    ratio_distance: float | None
    ratio_zone: Zone | None
    ratio_cooldown_state: DmaCooldownState
    current_asset_allocation: dict[str, float]
    outer_dma_unit: PairRotationUnit


@dataclass
class PairRotationTemplateSignalComponent(StatefulSignalComponent):
    config: DmaGatedFgiConfig = field(default_factory=DmaGatedFgiConfig)
    template: PairRotationTemplateSpec = ADAPTIVE_BINARY_ETH_BTC_TEMPLATE
    signal_id: str = "adaptive_binary_eth_btc_signal"
    market_data_requirements: MarketDataRequirements = field(init=False)
    warmup_lookback_days: int = 14
    _dma_signal: DmaGatedFgiSignalComponent = field(init=False, repr=False)

    def __post_init__(self) -> None:
        self.signal_id = self.template.signal_id
        self.market_data_requirements = self.template.market_data_requirements()
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

    def initialize(self, context: StrategyContext) -> None:
        self._dma_signal.initialize(self._build_dma_context(context)[0])

    def warmup(self, context: StrategyContext) -> None:
        self._dma_signal.warmup(self._build_dma_context(context)[0])

    def observe(self, context: StrategyContext) -> PairRotationTemplateState:
        dma_context, outer_unit = self._build_dma_context(context)
        dma_state = self._dma_signal.observe(dma_context)
        ratio, ratio_dma_200, ratio_distance = _rotation_distance(
            context.extra_data,
            template=self.template,
        )
        return PairRotationTemplateState(
            dma_state=dma_state,
            ratio=ratio,
            ratio_dma_200=ratio_dma_200,
            ratio_distance=ratio_distance,
            ratio_zone=_classify_ratio_zone(
                ratio=ratio,
                ratio_dma_200=ratio_dma_200,
            ),
            ratio_cooldown_state=DmaCooldownState(
                active=False,
                remaining_days=0,
                blocked_zone=None,
            ),
            current_asset_allocation=_normalize_pair_allocation(
                context.portfolio.asset_allocation_percentages(context.portfolio_price),
                template=self.template,
            ),
            outer_dma_unit=outer_unit,
        )

    def apply_intent(
        self,
        *,
        current_date: date,
        snapshot: PairRotationTemplateState,
        intent: AllocationIntent,
    ) -> PairRotationTemplateState:
        committed_dma_state = self._dma_signal.apply_intent(
            current_date=current_date,
            snapshot=snapshot.dma_state,
            intent=intent,
        )
        return replace(snapshot, dma_state=committed_dma_state)

    def build_signal_observation(
        self,
        *,
        snapshot: PairRotationTemplateState,
        intent: AllocationIntent,
    ) -> SignalObservation:
        observation = self._dma_signal.build_signal_observation(
            snapshot=snapshot.dma_state,
            intent=intent,
        )
        dma_with_unit = (
            replace(observation.dma, outer_dma_asset=snapshot.outer_dma_unit.symbol)
            if observation.dma
            else None
        )
        return replace(
            observation,
            signal_id=self.signal_id,
            dma=dma_with_unit,
            ratio=RatioSignalDiagnostics(
                ratio=snapshot.ratio,
                ratio_dma_200=snapshot.ratio_dma_200,
                distance=snapshot.ratio_distance,
                zone=snapshot.ratio_zone,
                cross_event=None,
                cooldown_active=False,
                cooldown_remaining_days=0,
                cooldown_blocked_zone=None,
            ),
        )

    def build_execution_hints(
        self,
        *,
        snapshot: PairRotationTemplateState,
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

    def _build_dma_context(
        self, context: StrategyContext
    ) -> tuple[StrategyContext, PairRotationUnit]:
        allocation = context.portfolio.asset_allocation_percentages(
            context.portfolio_price
        )
        outer_unit = _dominant_pair_unit(allocation, template=self.template)
        price = context.price_map.get(outer_unit.price_key)
        if not isinstance(price, int | float) or float(price) <= 0.0:
            return context, outer_unit
        dma_value = context.extra_data.get(outer_unit.dma_feature_key)
        if not isinstance(dma_value, int | float) or float(dma_value) <= 0.0:
            return replace(context, price=float(price)), outer_unit
        new_extra = {**context.extra_data, DMA_200_FEATURE: float(dma_value)}
        return replace(context, price=float(price), extra_data=new_extra), outer_unit


@dataclass(frozen=True)
class PairRotationTemplateDecisionPolicy(DecisionPolicy):
    template: PairRotationTemplateSpec
    decision_policy_id: str = "pair_rotation_template_policy"
    rotation_drift_threshold: float = 0.03
    _dma_policy: DmaGatedFgiDecisionPolicy = field(
        default_factory=DmaGatedFgiDecisionPolicy
    )

    def decide(self, snapshot: PairRotationTemplateState) -> AllocationIntent:
        dma_intent = _suppress_ath_sell_intent(
            intent=self._dma_policy.decide(snapshot.dma_state),
            snapshot=snapshot.dma_state,
        )
        current_allocation = _normalize_pair_allocation(
            snapshot.current_asset_allocation,
            template=self.template,
        )
        stable_share = (
            float(current_allocation.get("stable", 1.0))
            if dma_intent.target_allocation is None
            else float(dma_intent.target_allocation.get("stable", 0.0))
        )
        left_share = _resolve_binary_left_share(
            current_allocation=current_allocation,
            ratio_zone=snapshot.ratio_zone,
            template=self.template,
        )
        target_allocation = _compose_pair_target(
            stable_share=stable_share,
            left_share_in_risk_on=left_share,
            template=self.template,
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
        if snapshot.ratio_zone in {"below", "above"} and _requires_pair_rotation(
            current_allocation=current_allocation,
            target_allocation=target_allocation,
            template=self.template,
            tolerance=self.rotation_drift_threshold,
        ):
            return AllocationIntent(
                action="hold",
                target_allocation=target_allocation,
                allocation_name="pair_ratio_rebalance",
                immediate=False,
                reason="pair_ratio_rebalance",
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


def _coerce_optional_float(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, int | float):
        return float(value)
    if isinstance(value, str):
        normalized = value.strip()
        if not normalized:
            return None
        return float(normalized)
    raise ValueError("Pair rotation ratio inputs must be numeric")


def _rotation_distance(
    extra_data: Mapping[str, Any],
    *,
    template: PairRotationTemplateSpec,
) -> tuple[float | None, float | None, float | None]:
    ratio = _coerce_optional_float(extra_data.get(template.ratio_feature_key))
    dma_200 = _coerce_optional_float(extra_data.get(template.ratio_dma_feature_key))
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


def _dominant_pair_unit(
    allocation: Mapping[str, float],
    *,
    template: PairRotationTemplateSpec,
) -> PairRotationUnit:
    left_share = float(allocation.get(template.left_unit.allocation_key, 0.0))
    right_share = float(allocation.get(template.right_unit.allocation_key, 0.0))
    return template.left_unit if left_share > right_share else template.right_unit


def _normalize_pair_allocation(
    raw: Mapping[str, float],
    *,
    template: PairRotationTemplateSpec,
) -> dict[str, float]:
    left_key = template.left_unit.allocation_key
    right_key = template.right_unit.allocation_key
    left = max(0.0, float(raw.get(left_key, 0.0)))
    right = max(0.0, float(raw.get(right_key, 0.0)))
    stable = max(0.0, float(raw.get("stable", 0.0))) + max(
        0.0, float(raw.get("alt", 0.0))
    )
    for key, value in raw.items():
        if key not in {left_key, right_key, "stable", "alt"}:
            stable += max(0.0, float(value))
    total = left + right + stable
    if total <= 0.0:
        return normalize_target_allocation(None)
    normalized = {
        "btc": 0.0,
        "eth": 0.0,
        "spy": 0.0,
        "stable": stable / total,
        "alt": 0.0,
        left_key: left / total,
        right_key: right / total,
    }
    return normalize_target_allocation(normalized)


def _risk_on_share(
    allocation: Mapping[str, float],
    *,
    template: PairRotationTemplateSpec,
) -> float:
    return max(
        0.0,
        float(allocation.get(template.left_unit.allocation_key, 0.0))
        + float(allocation.get(template.right_unit.allocation_key, 0.0)),
    )


def _left_share_in_risk_on(
    allocation: Mapping[str, float],
    *,
    template: PairRotationTemplateSpec,
) -> float:
    risk_on = _risk_on_share(allocation, template=template)
    if risk_on <= 0.0:
        return template.neutral_left_share_in_risk_on
    return max(
        0.0,
        min(
            1.0, float(allocation.get(template.left_unit.allocation_key, 0.0)) / risk_on
        ),
    )


def _resolve_binary_left_share(
    *,
    current_allocation: Mapping[str, float],
    ratio_zone: Zone | None,
    template: PairRotationTemplateSpec,
) -> float:
    if ratio_zone == "below":
        return template.below_dma_left_share_in_risk_on
    if ratio_zone == "above":
        return template.above_dma_left_share_in_risk_on
    return _left_share_in_risk_on(current_allocation, template=template)


def _compose_pair_target(
    *,
    stable_share: float,
    left_share_in_risk_on: float,
    template: PairRotationTemplateSpec,
) -> dict[str, float]:
    stable = max(0.0, min(1.0, float(stable_share)))
    risk_on = max(0.0, 1.0 - stable)
    left_share = max(0.0, min(1.0, float(left_share_in_risk_on)))
    target = {
        "btc": 0.0,
        "eth": 0.0,
        "spy": 0.0,
        "stable": stable,
        "alt": 0.0,
        template.left_unit.allocation_key: risk_on * left_share,
        template.right_unit.allocation_key: risk_on * (1.0 - left_share),
    }
    return normalize_target_allocation(target)


def _requires_pair_rotation(
    *,
    current_allocation: Mapping[str, float],
    target_allocation: Mapping[str, float],
    template: PairRotationTemplateSpec,
    tolerance: float,
) -> bool:
    return any(
        abs(
            float(current_allocation.get(bucket, 0.0))
            - float(target_allocation.get(bucket, 0.0))
        )
        > tolerance
        for bucket in (
            template.left_unit.allocation_key,
            template.right_unit.allocation_key,
            "stable",
        )
    )


@dataclass
class DmaFgiAdaptiveBinaryEthBtcStrategy(ComposedSignalStrategy):
    """Clean ETH/BTC template: adaptive DMA reference plus binary ratio-zone split."""

    total_capital: float
    signal_id: str = ADAPTIVE_BINARY_ETH_BTC_TEMPLATE.signal_id
    summary_signal_id: str = ADAPTIVE_BINARY_ETH_BTC_TEMPLATE.signal_id
    params: EthBtcRotationParams | dict[str, Any] = field(
        default_factory=EthBtcRotationParams
    )
    signal_component: StatefulSignalComponent = field(init=False, repr=False)
    decision_policy: DecisionPolicy = field(init=False, repr=False)
    execution_engine: AllocationIntentExecutor = field(init=False, repr=False)
    public_params: dict[str, Any] = field(default_factory=dict)
    strategy_id: str = STRATEGY_DMA_FGI_ADAPTIVE_BINARY_ETH_BTC
    display_name: str = STRATEGY_DISPLAY_NAMES[STRATEGY_DMA_FGI_ADAPTIVE_BINARY_ETH_BTC]
    canonical_strategy_id: str = STRATEGY_DMA_FGI_ADAPTIVE_BINARY_ETH_BTC
    initial_spot_asset: str = "BTC"
    initial_asset_allocation: dict[str, float] | None = None
    template: PairRotationTemplateSpec = ADAPTIVE_BINARY_ETH_BTC_TEMPLATE

    def __post_init__(self) -> None:
        resolved_params = (
            self.params
            if isinstance(self.params, EthBtcRotationParams)
            else EthBtcRotationParams.from_public_params(self.params)
        )
        self.params = resolved_params
        self.signal_id = self.template.signal_id
        self.summary_signal_id = self.template.signal_id
        self.signal_component = PairRotationTemplateSignalComponent(
            config=resolved_params.build_signal_config(),
            template=self.template,
        )
        self.decision_policy = PairRotationTemplateDecisionPolicy(
            template=self.template,
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
    "ADAPTIVE_BINARY_ETH_BTC_TEMPLATE",
    "DmaFgiAdaptiveBinaryEthBtcStrategy",
    "PairRotationTemplateDecisionPolicy",
    "PairRotationTemplateSignalComponent",
    "PairRotationTemplateSpec",
    "PairRotationTemplateState",
    "PairRotationUnit",
    "build_initial_pair_asset_allocation",
    "default_pair_rotation_params",
]
