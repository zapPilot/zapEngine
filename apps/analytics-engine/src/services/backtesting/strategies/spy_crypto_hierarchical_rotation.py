"""Hierarchical SPY/crypto sleeve rotation composed from pair templates."""

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
    STRATEGY_DMA_FGI_HIERARCHICAL_SPY_CRYPTO,
)
from src.services.backtesting.decision import AllocationIntent, RuleGroup
from src.services.backtesting.domain import DmaSignalDiagnostics, SignalObservation
from src.services.backtesting.execution.allocation_intent_executor import (
    AllocationIntentExecutor,
)
from src.services.backtesting.execution.contracts import ExecutionHints
from src.services.backtesting.execution.pacing.base import compute_dma_buy_strength
from src.services.backtesting.features import (
    DMA_200_FEATURE,
    ETH_BTC_RELATIVE_STRENGTH_AUX_SERIES,
    ETH_DMA_200_FEATURE,
    SPY_AUX_SERIES,
    SPY_CRYPTO_RATIO_DMA_200_FEATURE,
    SPY_CRYPTO_RATIO_FEATURE,
    SPY_CRYPTO_RELATIVE_STRENGTH_AUX_SERIES,
    SPY_DMA_200_FEATURE,
    MarketDataRequirements,
)
from src.services.backtesting.signals.dma_gated_fgi.types import DmaMarketState
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
from src.services.backtesting.strategies.hierarchical_attribution import (
    CURRENT_DMA_BUY_STRENGTH_FLOOR,
    FULL_DISABLED_RULES,
)
from src.services.backtesting.strategies.hierarchical_outer_policy import (
    FullFeaturedOuterPolicy,
    HierarchicalOuterDecisionPolicy,
    HierarchicalOuterSnapshot,
    is_spy_latch_expired,
)
from src.services.backtesting.strategies.pair_rotation_template import (
    ADAPTIVE_BINARY_ETH_BTC_TEMPLATE,
    PairRotationTemplateDecisionPolicy,
    PairRotationTemplateSignalComponent,
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

SPY_CRYPTO_TEMPLATE = PairRotationTemplateSpec(
    template_id=STRATEGY_DMA_FGI_HIERARCHICAL_SPY_CRYPTO,
    signal_id="hierarchical_spy_crypto_signal",
    left_unit=PairRotationUnit(
        symbol="SPY",
        allocation_key="spy",
        price_key="spy",
        dma_feature_key=SPY_DMA_200_FEATURE,
    ),
    right_unit=PairRotationUnit(
        symbol="CRYPTO",
        allocation_key="btc",
        price_key="btc",
        dma_feature_key=DMA_200_FEATURE,
        member_allocation_keys=frozenset({"btc", "eth"}),
    ),
    ratio_feature_key=SPY_CRYPTO_RATIO_FEATURE,
    ratio_dma_feature_key=SPY_CRYPTO_RATIO_DMA_200_FEATURE,
    required_aux_series=frozenset(
        {
            SPY_AUX_SERIES,
            ETH_BTC_RELATIVE_STRENGTH_AUX_SERIES,
            SPY_CRYPTO_RELATIVE_STRENGTH_AUX_SERIES,
        }
    ),
    below_dma_left_share_in_risk_on=0.0,
    above_dma_left_share_in_risk_on=1.0,
)

_CRYPTO_DMA_REFERENCE_BTC = "BTC"
OUTER_CROSS_UP_FOLLOW_THROUGH_DAYS = 14
_CRYPTO_DMA_REFERENCE_ETH = "ETH"
_CRYPTO_REFERENCE_ETH_UPPER_THRESHOLD = 0.55
_CRYPTO_REFERENCE_ETH_LOWER_THRESHOLD = 0.45
_CRYPTO_BTC_REFERENCE_UNIT = PairRotationUnit(
    symbol=_CRYPTO_DMA_REFERENCE_BTC,
    allocation_key="btc",
    price_key="btc",
    dma_feature_key=DMA_200_FEATURE,
)
_CRYPTO_ETH_REFERENCE_UNIT = PairRotationUnit(
    symbol=_CRYPTO_DMA_REFERENCE_ETH,
    allocation_key="eth",
    price_key="eth",
    dma_feature_key=ETH_DMA_200_FEATURE,
)


class HierarchicalPairRotationParams(EthBtcRotationParams):
    """Same public knobs as ETH/BTC rotation; shared by both pair layers."""

    @classmethod
    def from_public_params(
        cls, params: Mapping[str, Any] | None = None
    ) -> HierarchicalPairRotationParams:
        normalized = EthBtcRotationParams.from_public_params(params).model_dump()
        return cls(**normalized)


def default_hierarchical_pair_rotation_params() -> dict[str, JsonValue]:
    return HierarchicalPairRotationParams().to_public_params()


@dataclass(frozen=True)
class HierarchicalPairRotationState:
    outer_state: PairRotationTemplateState
    inner_state: PairRotationTemplateState
    spy_dma_state: DmaMarketState | None
    btc_dma_state: DmaMarketState | None
    eth_dma_state: DmaMarketState | None
    crypto_dma_state: DmaMarketState | None
    crypto_dma_reference_asset: str
    spy_latch_active: bool
    spy_latch_activated_on: date | None
    current_asset_allocation: dict[str, float]


@dataclass
class HierarchicalPairRotationSignalComponent(StatefulSignalComponent):
    params: HierarchicalPairRotationParams = field(
        default_factory=HierarchicalPairRotationParams
    )
    signal_id: str = SPY_CRYPTO_TEMPLATE.signal_id
    market_data_requirements: MarketDataRequirements = field(init=False)
    warmup_lookback_days: int = 14
    adaptive_crypto_dma_reference: bool = True
    spy_cross_up_latch_enabled: bool = True
    dma_buy_strength_floor: float = CURRENT_DMA_BUY_STRENGTH_FLOOR
    _outer_signal: PairRotationTemplateSignalComponent = field(init=False, repr=False)
    _inner_signal: PairRotationTemplateSignalComponent = field(init=False, repr=False)
    _spy_dma_signal: DmaGatedFgiSignalComponent = field(init=False, repr=False)
    _btc_dma_signal: DmaGatedFgiSignalComponent = field(init=False, repr=False)
    _eth_dma_signal: DmaGatedFgiSignalComponent = field(init=False, repr=False)
    _crypto_dma_reference_asset: str = field(
        default=_CRYPTO_DMA_REFERENCE_BTC,
        init=False,
        repr=False,
    )
    _spy_latch_activated_on: date | None = field(
        default=None,
        init=False,
        repr=False,
    )
    _spy_latch_active: bool = field(default=False, init=False, repr=False)

    def __post_init__(self) -> None:
        config = self.params.build_signal_config()
        self.market_data_requirements = (
            SPY_CRYPTO_TEMPLATE.market_data_requirements().merge(
                ADAPTIVE_BINARY_ETH_BTC_TEMPLATE.market_data_requirements()
            )
        )
        self._outer_signal = PairRotationTemplateSignalComponent(
            config=config,
            template=SPY_CRYPTO_TEMPLATE,
            warmup_lookback_days=self.warmup_lookback_days,
        )
        self._inner_signal = PairRotationTemplateSignalComponent(
            config=config,
            template=ADAPTIVE_BINARY_ETH_BTC_TEMPLATE,
            warmup_lookback_days=self.warmup_lookback_days,
        )
        self._spy_dma_signal = DmaGatedFgiSignalComponent(
            config=config,
            market_data_requirements=MarketDataRequirements(
                requires_sentiment=True,
                required_price_features=frozenset({DMA_200_FEATURE}),
            ),
            warmup_lookback_days=self.warmup_lookback_days,
        )
        self._btc_dma_signal = DmaGatedFgiSignalComponent(
            config=config,
            market_data_requirements=MarketDataRequirements(
                requires_sentiment=True,
                required_price_features=frozenset({DMA_200_FEATURE}),
            ),
            warmup_lookback_days=self.warmup_lookback_days,
        )
        self._eth_dma_signal = DmaGatedFgiSignalComponent(
            config=config,
            market_data_requirements=MarketDataRequirements(
                requires_sentiment=True,
                required_price_features=frozenset({DMA_200_FEATURE}),
            ),
            warmup_lookback_days=self.warmup_lookback_days,
        )

    def reset(self) -> None:
        self._outer_signal.reset()
        self._inner_signal.reset()
        self._spy_dma_signal.reset()
        self._btc_dma_signal.reset()
        self._eth_dma_signal.reset()
        self._crypto_dma_reference_asset = _CRYPTO_DMA_REFERENCE_BTC
        self._spy_latch_activated_on = None
        self._spy_latch_active = False

    def initialize(self, context: StrategyContext) -> None:
        self._outer_signal.initialize(context)
        self._inner_signal.initialize(context)
        self._crypto_dma_reference_asset = _select_crypto_dma_reference_asset(
            context.portfolio.asset_allocation_percentages(context.portfolio_price),
            previous_reference_asset=self._crypto_dma_reference_asset,
            adaptive=self.adaptive_crypto_dma_reference,
        )
        spy_context = _build_outer_unit_dma_context(
            context, SPY_CRYPTO_TEMPLATE.left_unit
        )
        btc_context = _build_outer_unit_dma_context(context, _CRYPTO_BTC_REFERENCE_UNIT)
        eth_context = _build_outer_unit_dma_context(context, _CRYPTO_ETH_REFERENCE_UNIT)
        if spy_context is not None:
            self._spy_dma_signal.initialize(spy_context)
        if btc_context is not None:
            self._btc_dma_signal.initialize(btc_context)
        if eth_context is not None:
            self._eth_dma_signal.initialize(eth_context)

    def warmup(self, context: StrategyContext) -> None:
        self._outer_signal.warmup(context)
        self._inner_signal.warmup(context)
        self._crypto_dma_reference_asset = _select_crypto_dma_reference_asset(
            context.portfolio.asset_allocation_percentages(context.portfolio_price),
            previous_reference_asset=self._crypto_dma_reference_asset,
            adaptive=self.adaptive_crypto_dma_reference,
        )
        spy_context = _build_outer_unit_dma_context(
            context, SPY_CRYPTO_TEMPLATE.left_unit
        )
        btc_context = _build_outer_unit_dma_context(context, _CRYPTO_BTC_REFERENCE_UNIT)
        eth_context = _build_outer_unit_dma_context(context, _CRYPTO_ETH_REFERENCE_UNIT)
        if spy_context is not None:
            self._spy_dma_signal.warmup(spy_context)
        if btc_context is not None:
            self._btc_dma_signal.warmup(btc_context)
        if eth_context is not None:
            self._eth_dma_signal.warmup(eth_context)

    def observe(self, context: StrategyContext) -> HierarchicalPairRotationState:
        raw_allocation = context.portfolio.asset_allocation_percentages(
            context.portfolio_price
        )
        inner_state = self._inner_signal.observe(context)
        self._crypto_dma_reference_asset = _select_crypto_dma_reference_asset(
            raw_allocation,
            previous_reference_asset=self._crypto_dma_reference_asset,
            adaptive=self.adaptive_crypto_dma_reference,
        )
        spy_dma_state = _observe_optional_dma_state(
            self._spy_dma_signal,
            _build_outer_unit_dma_context(context, SPY_CRYPTO_TEMPLATE.left_unit),
        )
        btc_dma_state = _observe_optional_dma_state(
            self._btc_dma_signal,
            _build_outer_unit_dma_context(context, _CRYPTO_BTC_REFERENCE_UNIT),
        )
        eth_dma_state = _observe_optional_dma_state(
            self._eth_dma_signal,
            _build_outer_unit_dma_context(context, _CRYPTO_ETH_REFERENCE_UNIT),
        )
        crypto_dma_state = _select_crypto_dma_state(
            reference_asset=self._crypto_dma_reference_asset,
            btc_dma_state=btc_dma_state,
            eth_dma_state=eth_dma_state,
        )
        self._update_spy_latch(
            current_date=context.date,
            spy_dma_state=spy_dma_state,
        )
        return HierarchicalPairRotationState(
            outer_state=self._outer_signal.observe(context),
            inner_state=replace(
                inner_state,
                current_asset_allocation=_normalize_crypto_sleeve_allocation(
                    raw_allocation
                ),
            ),
            spy_dma_state=spy_dma_state,
            btc_dma_state=btc_dma_state,
            eth_dma_state=eth_dma_state,
            crypto_dma_state=crypto_dma_state,
            crypto_dma_reference_asset=self._crypto_dma_reference_asset,
            spy_latch_active=self._spy_latch_active,
            spy_latch_activated_on=self._spy_latch_activated_on,
            current_asset_allocation=target_from_current_allocation(raw_allocation),
        )

    def apply_intent(
        self,
        *,
        current_date: date,
        snapshot: HierarchicalPairRotationState,
        intent: AllocationIntent,
    ) -> HierarchicalPairRotationState:
        noop_intent = _hold_commit_intent(intent)
        committed_btc_dma = (
            None
            if snapshot.btc_dma_state is None
            else self._btc_dma_signal.apply_intent(
                current_date=current_date,
                snapshot=snapshot.btc_dma_state,
                intent=_outer_dma_commit_intent(
                    intent,
                    unit=SPY_CRYPTO_TEMPLATE.right_unit,
                    reference_asset=_CRYPTO_DMA_REFERENCE_BTC,
                ),
            )
        )
        committed_eth_dma = (
            None
            if snapshot.eth_dma_state is None
            else self._eth_dma_signal.apply_intent(
                current_date=current_date,
                snapshot=snapshot.eth_dma_state,
                intent=_outer_dma_commit_intent(
                    intent,
                    unit=SPY_CRYPTO_TEMPLATE.right_unit,
                    reference_asset=_CRYPTO_DMA_REFERENCE_ETH,
                ),
            )
        )
        return replace(
            snapshot,
            outer_state=self._outer_signal.apply_intent(
                current_date=current_date,
                snapshot=snapshot.outer_state,
                intent=noop_intent,
            ),
            inner_state=self._inner_signal.apply_intent(
                current_date=current_date,
                snapshot=snapshot.inner_state,
                intent=intent,
            ),
            spy_dma_state=(
                None
                if snapshot.spy_dma_state is None
                else self._spy_dma_signal.apply_intent(
                    current_date=current_date,
                    snapshot=snapshot.spy_dma_state,
                    intent=_outer_dma_commit_intent(
                        intent,
                        unit=SPY_CRYPTO_TEMPLATE.left_unit,
                    ),
                )
            ),
            btc_dma_state=committed_btc_dma,
            eth_dma_state=committed_eth_dma,
            crypto_dma_state=(
                _select_crypto_dma_state(
                    reference_asset=snapshot.crypto_dma_reference_asset,
                    btc_dma_state=committed_btc_dma,
                    eth_dma_state=committed_eth_dma,
                )
            ),
        )

    def _update_spy_latch(
        self,
        *,
        current_date: date,
        spy_dma_state: DmaMarketState | None,
    ) -> None:
        if not self.spy_cross_up_latch_enabled:
            self._spy_latch_active = False
            self._spy_latch_activated_on = None
            return
        if is_spy_latch_expired(
            current_date=current_date,
            activated_on=self._spy_latch_activated_on,
        ):
            self._spy_latch_active = False
            self._spy_latch_activated_on = None
        if spy_dma_state is None:
            return
        if spy_dma_state.actionable_cross_event == "cross_up":
            self._spy_latch_active = True
            self._spy_latch_activated_on = current_date
            return
        if (
            spy_dma_state.zone in {"below", "at"}
            or spy_dma_state.actionable_cross_event == "cross_down"
        ):
            self._spy_latch_active = False
            self._spy_latch_activated_on = None

    def build_signal_observation(
        self,
        *,
        snapshot: HierarchicalPairRotationState,
        intent: AllocationIntent,
    ) -> SignalObservation:
        observation = self._outer_signal.build_signal_observation(
            snapshot=snapshot.outer_state,
            intent=intent,
        )
        return replace(
            observation,
            signal_id=self.signal_id,
            dma=_convert_dma_to_diagnostics(
                snapshot.crypto_dma_state,
                outer_dma_action_unit=SPY_CRYPTO_TEMPLATE.right_unit.symbol,
                outer_dma_reference_asset=snapshot.crypto_dma_reference_asset,
            ),
            spy_dma=_convert_dma_to_diagnostics(
                snapshot.spy_dma_state,
                outer_dma_action_unit=SPY_CRYPTO_TEMPLATE.left_unit.symbol,
                outer_dma_reference_asset=SPY_CRYPTO_TEMPLATE.left_unit.symbol,
            ),
        )

    def build_execution_hints(
        self,
        *,
        snapshot: HierarchicalPairRotationState,
        intent: AllocationIntent,
        signal_confidence: float,
    ) -> ExecutionHints:
        selected_dma_asset = _selected_outer_dma_asset(intent)
        if (
            selected_dma_asset == SPY_CRYPTO_TEMPLATE.left_unit.symbol
            and snapshot.spy_dma_state is not None
        ):
            selected_dma_state = snapshot.spy_dma_state
            hints = self._spy_dma_signal.build_execution_hints(
                snapshot=snapshot.spy_dma_state,
                intent=intent,
                signal_confidence=signal_confidence,
            )
        elif (
            selected_dma_asset == SPY_CRYPTO_TEMPLATE.right_unit.symbol
            and snapshot.crypto_dma_state is not None
        ):
            crypto_signal = _select_crypto_dma_signal(
                reference_asset=snapshot.crypto_dma_reference_asset,
                btc_signal=self._btc_dma_signal,
                eth_signal=self._eth_dma_signal,
            )
            selected_dma_state = snapshot.crypto_dma_state
            hints = crypto_signal.build_execution_hints(
                snapshot=snapshot.crypto_dma_state,
                intent=intent,
                signal_confidence=signal_confidence,
            )
        else:
            selected_dma_state = None
            hints = self._outer_signal.build_execution_hints(
                snapshot=snapshot.outer_state,
                intent=intent,
                signal_confidence=signal_confidence,
            )
        if hints.enable_buy_gate and selected_dma_state is not None:
            hints = replace(
                hints,
                buy_strength=compute_dma_buy_strength(
                    selected_dma_state.dma_distance,
                    floor=self.dma_buy_strength_floor,
                ),
            )
        return replace(
            hints,
            signal_id=self.signal_id,
        )


@dataclass(frozen=True)
class HierarchicalPairRotationDecisionPolicy(DecisionPolicy):
    decision_policy_id: str = "hierarchical_spy_crypto_policy"
    rotation_drift_threshold: float = 0.03
    outer_policy: HierarchicalOuterDecisionPolicy = field(
        default_factory=FullFeaturedOuterPolicy
    )
    _inner_policy: PairRotationTemplateDecisionPolicy = field(
        default_factory=lambda: PairRotationTemplateDecisionPolicy(
            template=ADAPTIVE_BINARY_ETH_BTC_TEMPLATE
        )
    )

    def decide(self, snapshot: HierarchicalPairRotationState) -> AllocationIntent:
        outer_snapshot = _build_outer_snapshot(snapshot)
        outer_intent = self.outer_policy.decide(outer_snapshot)
        outer_target = (
            outer_intent.target_allocation
            or snapshot.outer_state.current_asset_allocation
        )
        inner_intent = self._inner_policy.decide(snapshot.inner_state)
        inner_target = (
            inner_intent.target_allocation
            or snapshot.inner_state.current_asset_allocation
        )
        target_allocation = _compose_hierarchical_target(
            outer_target=outer_target,
            inner_target=inner_target,
            spy_latch_active=False,
            pre_existing_stable_share=float(
                snapshot.current_asset_allocation.get("stable", 0.0)
            ),
        )
        target_adjustment_intent = self.outer_policy.apply_post_intent_adjustments(
            intent=AllocationIntent(
                action="hold",
                target_allocation=target_allocation,
                allocation_name=None,
                immediate=False,
                reason="hierarchical_target_adjustment",
                rule_group="none",
                decision_score=0.0,
            ),
            snapshot=outer_snapshot,
        )
        target_allocation = (
            target_adjustment_intent.target_allocation or target_allocation
        )
        selected_intent = _select_intent_metadata(
            outer_intent=outer_intent,
            inner_intent=inner_intent,
            current_allocation=snapshot.current_asset_allocation,
            target_allocation=target_allocation,
            rotation_drift_threshold=self.rotation_drift_threshold,
        )
        return AllocationIntent(
            action=selected_intent.action,
            target_allocation=target_allocation,
            allocation_name=selected_intent.allocation_name,
            immediate=selected_intent.immediate,
            reason=selected_intent.reason,
            rule_group=selected_intent.rule_group,
            decision_score=max(
                outer_intent.decision_score,
                inner_intent.decision_score,
            ),
            diagnostics={
                **(selected_intent.diagnostics or {}),
                "outer_reason": outer_intent.reason,
                "inner_reason": inner_intent.reason,
                "outer_ratio_zone": snapshot.outer_state.ratio_zone,
                "inner_ratio_zone": snapshot.inner_state.ratio_zone,
                "crypto_dma_reference_asset": snapshot.crypto_dma_reference_asset,
                "spy_latch_active": snapshot.spy_latch_active,
            },
        )


@dataclass
class HierarchicalSpyCryptoRotationStrategy(ComposedSignalStrategy):
    """Two-layer SPY-vs-crypto and BTC-vs-ETH pair-template rotation.

    The outer SPY-vs-crypto macro overlay can force-liquidate either outer
    unit when that unit's DMA/FGI signal de-risks, even if the inner crypto
    BTC-vs-ETH sleeve remains bullish. Use adaptive_binary_eth_btc when the
    desired behavior is pure crypto exposure without the SPY/crypto overlay.
    """

    total_capital: float
    signal_id: str = SPY_CRYPTO_TEMPLATE.signal_id
    summary_signal_id: str | None = SPY_CRYPTO_TEMPLATE.signal_id
    params: HierarchicalPairRotationParams | dict[str, Any] = field(
        default_factory=HierarchicalPairRotationParams
    )
    signal_component: StatefulSignalComponent = field(init=False, repr=False)
    decision_policy: DecisionPolicy = field(init=False, repr=False)
    execution_engine: AllocationIntentExecutor = field(init=False, repr=False)
    public_params: dict[str, Any] = field(default_factory=dict)
    strategy_id: str = STRATEGY_DMA_FGI_HIERARCHICAL_SPY_CRYPTO
    display_name: str = STRATEGY_DISPLAY_NAMES[STRATEGY_DMA_FGI_HIERARCHICAL_SPY_CRYPTO]
    canonical_strategy_id: str = STRATEGY_DMA_FGI_HIERARCHICAL_SPY_CRYPTO
    initial_spot_asset: str = "BTC"
    initial_asset_allocation: dict[str, float] | None = None
    adaptive_crypto_dma_reference: bool = True
    spy_cross_up_latch: bool = True
    outer_disabled_rules: frozenset[str] = FULL_DISABLED_RULES
    inner_disabled_rules: frozenset[str] = frozenset()
    dma_buy_strength_floor: float = CURRENT_DMA_BUY_STRENGTH_FLOOR
    outer_policy: HierarchicalOuterDecisionPolicy | None = None

    def __post_init__(self) -> None:
        if self.signal_id != SPY_CRYPTO_TEMPLATE.signal_id:
            raise ValueError(f"signal_id must be '{SPY_CRYPTO_TEMPLATE.signal_id}'")
        resolved_params = (
            self.params
            if isinstance(self.params, HierarchicalPairRotationParams)
            else HierarchicalPairRotationParams.from_public_params(self.params)
        )
        self.params = resolved_params
        resolved_outer_policy = self.outer_policy or FullFeaturedOuterPolicy(
            adaptive_crypto_dma_reference=self.adaptive_crypto_dma_reference,
            spy_cross_up_latch=self.spy_cross_up_latch,
            disabled_rules=self.outer_disabled_rules,
            dma_buy_strength_floor=self.dma_buy_strength_floor,
            rotation_drift_threshold=resolved_params.rotation_drift_threshold,
            dma_overextension_threshold=resolved_params.dma_overextension_threshold,
            fgi_slope_reversal_threshold=resolved_params.fgi_slope_reversal_threshold,
            fgi_slope_recovery_threshold=resolved_params.fgi_slope_recovery_threshold,
        )
        self.outer_policy = resolved_outer_policy
        if isinstance(resolved_outer_policy, FullFeaturedOuterPolicy):
            self.adaptive_crypto_dma_reference = (
                resolved_outer_policy.adaptive_crypto_dma_reference
            )
            self.spy_cross_up_latch = resolved_outer_policy.spy_cross_up_latch
            self.outer_disabled_rules = resolved_outer_policy.disabled_rules
            self.dma_buy_strength_floor = resolved_outer_policy.dma_buy_strength_floor
        self.signal_component = HierarchicalPairRotationSignalComponent(
            params=resolved_params,
            adaptive_crypto_dma_reference=self.adaptive_crypto_dma_reference,
            spy_cross_up_latch_enabled=self.spy_cross_up_latch,
            dma_buy_strength_floor=self.dma_buy_strength_floor,
        )
        self.decision_policy = HierarchicalPairRotationDecisionPolicy(
            rotation_drift_threshold=resolved_params.rotation_drift_threshold,
            outer_policy=resolved_outer_policy,
            _inner_policy=PairRotationTemplateDecisionPolicy(
                template=ADAPTIVE_BINARY_ETH_BTC_TEMPLATE,
                rotation_drift_threshold=resolved_params.rotation_drift_threshold,
                _dma_policy=DmaGatedFgiDecisionPolicy(
                    dma_overextension_threshold=resolved_params.dma_overextension_threshold,
                    fgi_slope_reversal_threshold=resolved_params.fgi_slope_reversal_threshold,
                    fgi_slope_recovery_threshold=resolved_params.fgi_slope_recovery_threshold,
                    disabled_rules=self.inner_disabled_rules
                    or resolved_params.disabled_rules,
                ),
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
        outer_policy = self.outer_policy
        assert outer_policy is not None
        return {
            **self.public_params,
            "feature_summary": outer_policy.feature_summary(),
        }


def _build_outer_unit_dma_context(
    context: StrategyContext,
    unit: PairRotationUnit,
) -> StrategyContext | None:
    price = context.price_map.get(unit.price_key)
    if not isinstance(price, int | float) or float(price) <= 0.0:
        return None
    dma_value = context.extra_data.get(unit.dma_feature_key)
    if not isinstance(dma_value, int | float) or float(dma_value) <= 0.0:
        return None
    new_extra = {**context.extra_data, DMA_200_FEATURE: float(dma_value)}
    return replace(context, price=float(price), extra_data=new_extra)


def _build_outer_snapshot(
    snapshot: HierarchicalPairRotationState,
) -> HierarchicalOuterSnapshot:
    return HierarchicalOuterSnapshot(
        template=SPY_CRYPTO_TEMPLATE,
        outer_state=snapshot.outer_state,
        spy_dma_state=snapshot.spy_dma_state,
        crypto_dma_state=snapshot.crypto_dma_state,
        crypto_dma_reference_asset=snapshot.crypto_dma_reference_asset,
        spy_latch_active=snapshot.spy_latch_active,
        pre_existing_stable_share=float(
            snapshot.current_asset_allocation.get("stable", 0.0)
        ),
    )


def _observe_optional_dma_state(
    signal: DmaGatedFgiSignalComponent,
    context: StrategyContext | None,
) -> DmaMarketState | None:
    if context is None:
        return None
    return signal.observe(context)


def _select_crypto_dma_reference_asset(
    allocation: Mapping[str, float],
    *,
    previous_reference_asset: str,
    adaptive: bool = True,
) -> str:
    previous = (
        previous_reference_asset
        if previous_reference_asset
        in {_CRYPTO_DMA_REFERENCE_BTC, _CRYPTO_DMA_REFERENCE_ETH}
        else _CRYPTO_DMA_REFERENCE_BTC
    )
    if not adaptive:
        return _CRYPTO_DMA_REFERENCE_BTC
    btc = max(0.0, float(allocation.get("btc", 0.0)))
    eth = max(0.0, float(allocation.get("eth", 0.0)))
    crypto_share = btc + eth
    if crypto_share <= 0.0:
        return previous
    eth_share = eth / crypto_share
    if eth_share > _CRYPTO_REFERENCE_ETH_UPPER_THRESHOLD:
        return _CRYPTO_DMA_REFERENCE_ETH
    if eth_share < _CRYPTO_REFERENCE_ETH_LOWER_THRESHOLD:
        return _CRYPTO_DMA_REFERENCE_BTC
    return previous


def _select_crypto_dma_state(
    *,
    reference_asset: str,
    btc_dma_state: DmaMarketState | None,
    eth_dma_state: DmaMarketState | None,
) -> DmaMarketState | None:
    if reference_asset == _CRYPTO_DMA_REFERENCE_ETH:
        return eth_dma_state
    return btc_dma_state


def _select_crypto_dma_signal(
    *,
    reference_asset: str,
    btc_signal: DmaGatedFgiSignalComponent,
    eth_signal: DmaGatedFgiSignalComponent,
) -> DmaGatedFgiSignalComponent:
    if reference_asset == _CRYPTO_DMA_REFERENCE_ETH:
        return eth_signal
    return btc_signal


def _is_spy_latch_expired(
    *,
    current_date: date,
    activated_on: date | None,
) -> bool:
    if activated_on is None:
        return False
    return (current_date - activated_on).days > OUTER_CROSS_UP_FOLLOW_THROUGH_DAYS


def _hold_commit_intent(intent: AllocationIntent) -> AllocationIntent:
    return AllocationIntent(
        action="hold",
        target_allocation=None,
        allocation_name=None,
        immediate=False,
        reason=intent.reason,
        rule_group="none",
        decision_score=0.0,
    )


def _outer_dma_commit_intent(
    intent: AllocationIntent,
    *,
    unit: PairRotationUnit,
    reference_asset: str | None = None,
) -> AllocationIntent:
    if unit.symbol not in _selected_outer_dma_assets(intent):
        return _hold_commit_intent(intent)
    if (
        reference_asset is not None
        and _selected_outer_dma_reference_asset(intent, unit.symbol) != reference_asset
    ):
        return _hold_commit_intent(intent)
    return intent


def _selected_outer_dma_assets(intent: AllocationIntent) -> frozenset[str]:
    diagnostics = intent.diagnostics or {}
    assets = diagnostics.get("outer_dma_assets")
    if isinstance(assets, list):
        return frozenset(asset for asset in assets if isinstance(asset, str))
    asset = diagnostics.get("outer_dma_asset")
    if not isinstance(asset, str):
        asset = diagnostics.get("outer_dma_action_unit")
    return frozenset({asset}) if isinstance(asset, str) else frozenset()


def _selected_outer_dma_reference_asset(
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


def _resolve_dual_dma_outer_decision(
    *,
    snapshot: HierarchicalPairRotationState,
    dma_policy: DmaGatedFgiDecisionPolicy,
    rotation_drift_threshold: float,
) -> tuple[AllocationIntent, dict[str, float]]:
    spy_intent = _resolve_optional_outer_dma_intent(
        dma_state=snapshot.spy_dma_state,
        dma_policy=dma_policy,
    )
    spy_intent = _with_outer_dma_reference_diagnostics(
        intent=spy_intent,
        action_unit=SPY_CRYPTO_TEMPLATE.left_unit.symbol,
        reference_asset=SPY_CRYPTO_TEMPLATE.left_unit.symbol,
    )
    crypto_intent = _resolve_optional_outer_dma_intent(
        dma_state=snapshot.crypto_dma_state,
        dma_policy=dma_policy,
    )
    crypto_intent = _with_outer_dma_reference_diagnostics(
        intent=crypto_intent,
        action_unit=SPY_CRYPTO_TEMPLATE.right_unit.symbol,
        reference_asset=snapshot.crypto_dma_reference_asset,
    )
    sell_specs = [
        (unit, intent)
        for unit, intent in (
            (SPY_CRYPTO_TEMPLATE.left_unit, spy_intent),
            (SPY_CRYPTO_TEMPLATE.right_unit, crypto_intent),
        )
        if _is_outer_dma_sell_intent(intent)
    ]
    if sell_specs:
        target = normalize_target_allocation(
            snapshot.outer_state.current_asset_allocation
        )
        for unit, _intent in sell_specs:
            target = _zero_outer_unit_share(target_allocation=target, unit=unit)
        return (
            _build_outer_dma_intent(specs=sell_specs, target_allocation=target),
            target,
        )

    buy_specs = [
        (unit, intent)
        for unit, intent in (
            (SPY_CRYPTO_TEMPLATE.left_unit, spy_intent),
            (SPY_CRYPTO_TEMPLATE.right_unit, crypto_intent),
        )
        if _is_outer_dma_buy_intent(intent)
    ]
    if buy_specs:
        target = normalize_target_allocation(
            snapshot.outer_state.current_asset_allocation
        )
        for unit, _intent in buy_specs:
            target = _raise_outer_unit_from_stable(
                target_allocation=target,
                unit=unit,
            )
        return (
            _build_outer_dma_intent(specs=buy_specs, target_allocation=target),
            target,
        )

    target = _resolve_outer_ratio_target(snapshot.outer_state)
    return (
        _build_outer_ratio_intent(
            current_allocation=snapshot.outer_state.current_asset_allocation,
            target_allocation=target,
            rotation_drift_threshold=rotation_drift_threshold,
        ),
        target,
    )


def _resolve_optional_outer_dma_intent(
    *,
    dma_state: DmaMarketState | None,
    dma_policy: DmaGatedFgiDecisionPolicy,
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
    return _suppress_ath_sell_intent(
        intent=dma_policy.decide(dma_state),
        snapshot=dma_state,
    )


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
    outer_state: PairRotationTemplateState,
) -> dict[str, float]:
    current_allocation = outer_state.current_asset_allocation
    left_share = _resolve_binary_left_share(
        current_allocation=current_allocation,
        ratio_zone=outer_state.ratio_zone,
        template=SPY_CRYPTO_TEMPLATE,
    )
    return _compose_pair_target(
        stable_share=float(current_allocation.get("stable", 0.0)),
        left_share_in_risk_on=left_share,
        template=SPY_CRYPTO_TEMPLATE,
    )


def _build_outer_ratio_intent(
    *,
    current_allocation: Mapping[str, float],
    target_allocation: Mapping[str, float],
    rotation_drift_threshold: float,
) -> AllocationIntent:
    if (
        _max_allocation_drift(
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
    return AllocationIntent(
        action=primary_intent.action,
        target_allocation=dict(target_allocation),
        allocation_name=allocation_name,
        immediate=any(intent.immediate for _unit, intent in specs),
        reason=reason,
        rule_group=primary_intent.rule_group,
        decision_score=primary_intent.decision_score,
        diagnostics={
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
                unit.symbol: _intent_reference_asset(unit, intent)
                for unit, intent in specs
            },
        },
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


def _raise_outer_unit_from_stable(
    *,
    target_allocation: Mapping[str, float],
    unit: PairRotationUnit,
) -> dict[str, float]:
    target = normalize_target_allocation(target_allocation)
    stable_share = max(0.0, float(target.get("stable", 0.0)))
    unit_share = _outer_unit_share(target, unit)
    increase = min(stable_share, max(0.0, 1.0 - unit_share))
    if increase <= 0.0:
        return target
    _add_outer_unit_share(target=target, unit=unit, amount=increase)
    target["stable"] = stable_share - increase
    return normalize_target_allocation(target)


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


def _selected_outer_dma_asset(intent: AllocationIntent) -> str | None:
    diagnostics = intent.diagnostics or {}
    asset = diagnostics.get("outer_dma_asset")
    if not isinstance(asset, str):
        asset = diagnostics.get("outer_dma_action_unit")
    return asset if isinstance(asset, str) else None


def _normalize_crypto_sleeve_allocation(
    raw: Mapping[str, float],
) -> dict[str, float]:
    btc = max(0.0, float(raw.get("btc", 0.0)))
    eth = max(0.0, float(raw.get("eth", 0.0)))
    total = btc + eth
    if total <= 0.0:
        return normalize_target_allocation(
            {"btc": 0.5, "eth": 0.5, "spy": 0.0, "stable": 0.0, "alt": 0.0}
        )
    return normalize_target_allocation(
        {
            "btc": btc / total,
            "eth": eth / total,
            "spy": 0.0,
            "stable": 0.0,
            "alt": 0.0,
        }
    )


def _compose_hierarchical_target(
    *,
    outer_target: Mapping[str, float],
    inner_target: Mapping[str, float],
    spy_latch_active: bool,
    pre_existing_stable_share: float,
) -> dict[str, float]:
    outer = normalize_target_allocation(outer_target)
    inner = normalize_target_allocation(inner_target)
    crypto_share = max(0.0, float(outer.get("btc", 0.0))) + max(
        0.0,
        float(outer.get("eth", 0.0)),
    )
    inner_btc = max(0.0, float(inner.get("btc", 0.0)))
    inner_eth = max(0.0, float(inner.get("eth", 0.0)))
    inner_risk = inner_btc + inner_eth
    inner_stable = max(0.0, min(1.0, float(inner.get("stable", 0.0))))
    if inner_risk <= 0.0:
        btc_share = 0.0
        eth_share = 0.0
    else:
        investable_crypto = crypto_share * max(0.0, min(1.0, inner_risk))
        btc_share = investable_crypto * (inner_btc / inner_risk)
        eth_share = investable_crypto * (inner_eth / inner_risk)
    target = {
        "spy": float(outer.get("spy", 0.0)),
        "btc": btc_share,
        "eth": eth_share,
        "stable": float(outer.get("stable", 0.0)) + crypto_share * inner_stable,
        "alt": 0.0,
    }
    if spy_latch_active:
        target = _apply_spy_latch_to_target(
            target_allocation=target,
            pre_existing_stable_share=pre_existing_stable_share,
        )
    return normalize_target_allocation(target)


def _apply_spy_latch_to_target(
    *,
    target_allocation: Mapping[str, float],
    pre_existing_stable_share: float,
) -> dict[str, float]:
    target = normalize_target_allocation(target_allocation)
    stable_target = max(0.0, float(target.get("stable", 0.0)))
    stable_before_tick = max(0.0, min(1.0, pre_existing_stable_share))
    freshly_created_stable_today = max(0.0, stable_target - stable_before_tick)
    effective_stable_target = max(
        stable_target - stable_before_tick,
        freshly_created_stable_today,
    )
    redeploy_to_spy = max(0.0, stable_target - effective_stable_target)
    if redeploy_to_spy <= 0.0:
        return target
    target["stable"] = effective_stable_target
    target["spy"] = max(0.0, float(target.get("spy", 0.0))) + redeploy_to_spy
    return normalize_target_allocation(target)


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


def _select_intent_metadata(
    *,
    outer_intent: AllocationIntent,
    inner_intent: AllocationIntent,
    current_allocation: Mapping[str, float],
    target_allocation: Mapping[str, float],
    rotation_drift_threshold: float,
) -> AllocationIntent:
    if outer_intent.rule_group in {"cross", "cooldown", "dma_fgi", "ath"}:
        return outer_intent
    if outer_intent.rule_group == "rotation":
        return outer_intent
    if inner_intent.rule_group == "rotation":
        return AllocationIntent(
            action="hold",
            target_allocation=None,
            allocation_name=inner_intent.allocation_name
            or "hierarchical_inner_pair_rebalance",
            immediate=inner_intent.immediate,
            reason=inner_intent.reason,
            rule_group="rotation",
            decision_score=inner_intent.decision_score,
        )
    if (
        _max_allocation_drift(
            current_allocation=current_allocation,
            target_allocation=target_allocation,
        )
        > rotation_drift_threshold
    ):
        return AllocationIntent(
            action="hold",
            target_allocation=None,
            allocation_name="hierarchical_pair_rebalance",
            immediate=False,
            reason="hierarchical_pair_rebalance",
            rule_group="rotation",
            decision_score=max(
                outer_intent.decision_score,
                inner_intent.decision_score,
            ),
        )
    return outer_intent


def _max_allocation_drift(
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


def _convert_dma_to_diagnostics(
    dma_state: DmaMarketState | None,
    *,
    outer_dma_action_unit: str,
    outer_dma_reference_asset: str,
) -> DmaSignalDiagnostics | None:
    if dma_state is None:
        return None
    return DmaSignalDiagnostics(
        dma_200=dma_state.dma_200,
        distance=dma_state.dma_distance,
        zone=dma_state.zone,
        cross_event=dma_state.cross_event,
        cooldown_active=dma_state.cooldown_state.active,
        cooldown_remaining_days=dma_state.cooldown_state.remaining_days,
        cooldown_blocked_zone=dma_state.cooldown_state.blocked_zone,
        fgi_slope=dma_state.fgi_slope,
        outer_dma_asset=outer_dma_action_unit,
        outer_dma_action_unit=outer_dma_action_unit,
        outer_dma_reference_asset=outer_dma_reference_asset,
    )


__all__ = [
    "HierarchicalPairRotationDecisionPolicy",
    "HierarchicalPairRotationParams",
    "HierarchicalPairRotationSignalComponent",
    "HierarchicalPairRotationState",
    "HierarchicalSpyCryptoRotationStrategy",
    "SPY_CRYPTO_TEMPLATE",
    "default_hierarchical_pair_rotation_params",
]
