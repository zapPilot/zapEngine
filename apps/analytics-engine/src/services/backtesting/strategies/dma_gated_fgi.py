"""Canonical dma_gated_fgi strategy with direct signal and execution wiring."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field
from datetime import date
from typing import Any, cast

from pydantic import BaseModel, ConfigDict, Field, JsonValue

from src.services.backtesting.composition_types import (
    DecisionPolicy,
    StatefulSignalComponent,
)
from src.services.backtesting.constants import (
    STRATEGY_DISPLAY_NAMES,
    STRATEGY_DMA_GATED_FGI,
)
from src.services.backtesting.decision import (
    AllocationIntent,
    DecisionAction,
    RuleGroup,
)
from src.services.backtesting.domain import (
    DmaSignalDiagnostics,
    SignalObservation,
)
from src.services.backtesting.execution.allocation_intent_executor import (
    AllocationIntentExecutor,
)
from src.services.backtesting.execution.ath_tracker import ATHTracker
from src.services.backtesting.execution.contracts import ExecutionHints
from src.services.backtesting.execution.dma_buy_gate_plugin import (
    DmaBuyGateExecutionPlugin,
)
from src.services.backtesting.execution.pacing.base import compute_dma_buy_strength
from src.services.backtesting.execution.pacing.fgi_exponential import (
    FgiExponentialPacingPolicy,
)
from src.services.backtesting.execution.plugins import ExecutionPlugin
from src.services.backtesting.execution.trade_quota_guard_plugin import (
    TradeQuotaGuardExecutionPlugin,
)
from src.services.backtesting.features import DMA_200_FEATURE, MarketDataRequirements
from src.services.backtesting.public_params import runtime_params_to_public_params
from src.services.backtesting.signals.contracts import SignalContext
from src.services.backtesting.signals.dma_gated_fgi.config import DmaGatedFgiConfig
from src.services.backtesting.signals.dma_gated_fgi.constants import (
    BUY_TARGET,
    SCORE_BY_REASON,
    SELL_TARGET,
)
from src.services.backtesting.signals.dma_gated_fgi.metadata import build_signal_output
from src.services.backtesting.signals.dma_gated_fgi.runtime import (
    DmaGatedFgiSignalRuntime,
)
from src.services.backtesting.signals.dma_gated_fgi.types import (
    DmaMarketState,
    SignalId,
    Zone,
)
from src.services.backtesting.signals.dma_gated_fgi.utils import _cross_target_zone
from src.services.backtesting.strategies.base import (
    StrategyContext,
)
from src.services.backtesting.strategies.composed_signal import ComposedSignalStrategy
from src.services.backtesting.utils import (
    coerce_bool,
    coerce_float,
    coerce_float_list,
    coerce_int,
    coerce_nullable_int,
    coerce_params,
    normalize_regime_label,
)

DMA_GATED_FGI_PUBLIC_PARAM_KEYS = frozenset(
    {
        "cross_cooldown_days",
        "cross_on_touch",
        "pacing_k",
        "pacing_r_max",
        "buy_sideways_window_days",
        "buy_sideways_max_range",
        "buy_leg_caps",
        "min_trade_interval_days",
        "max_trades_7d",
        "max_trades_30d",
        "dma_overextension_threshold",
        "fgi_slope_reversal_threshold",
    }
)

_DMA_COERCION_SPEC: dict[str, Any] = {
    "cross_cooldown_days": coerce_int,
    "cross_on_touch": coerce_bool,
    "pacing_k": coerce_float,
    "pacing_r_max": coerce_float,
    "buy_sideways_window_days": coerce_int,
    "buy_sideways_max_range": coerce_float,
    "buy_leg_caps": coerce_float_list,
    "min_trade_interval_days": coerce_nullable_int,
    "max_trades_7d": coerce_nullable_int,
    "max_trades_30d": coerce_nullable_int,
    "dma_overextension_threshold": coerce_float,
    "fgi_slope_reversal_threshold": coerce_float,
}


class DmaGatedFgiParams(BaseModel):
    """Single public parameter surface for the DMA strategy."""

    model_config = ConfigDict(extra="forbid")

    cross_cooldown_days: int = Field(
        default=30,
        ge=0,
        description="Days to suppress repeat DMA cross actions after an actionable cross.",
    )
    cross_on_touch: bool = Field(
        default=True,
        description="Treat touching the DMA threshold as a cross trigger.",
    )
    pacing_k: float = Field(
        default=5.0,
        description="Steepness parameter for the shared fgi_exponential pacing curve.",
    )
    pacing_r_max: float = Field(
        default=1.0,
        description="Upper multiplier cap for the shared fgi_exponential pacing curve.",
    )
    buy_sideways_window_days: int = Field(
        default=5,
        ge=1,
        description="Observation window for the DMA sideways buy-gate plugin.",
    )
    buy_sideways_max_range: float = Field(
        default=0.04,
        ge=0.0,
        description="Maximum sideways range allowed before the DMA buy-gate opens.",
    )
    buy_leg_caps: list[float] = Field(
        default_factory=lambda: [0.05, 0.10, 0.20],
        description="Per-leg portfolio caps enforced by the DMA buy-gate plugin.",
    )
    min_trade_interval_days: int | None = Field(
        default=None,
        ge=1,
        description="Minimum days required between any two executed trades.",
    )
    max_trades_7d: int | None = Field(
        default=None,
        ge=1,
        description="Maximum executed trades allowed within a rolling 7-day window.",
    )
    max_trades_30d: int | None = Field(
        default=None,
        ge=1,
        description="Maximum executed trades allowed within a rolling 30-day window.",
    )
    dma_overextension_threshold: float = Field(
        default=0.30,
        ge=0.0,
        le=1.0,
        description="DMA distance threshold above which overextension sell triggers.",
    )
    fgi_slope_reversal_threshold: float = Field(
        default=-0.05,
        le=0.0,
        description="FGI slope threshold below which greed-fading sell triggers.",
    )

    @classmethod
    def from_public_params(
        cls, params: Mapping[str, Any] | None = None
    ) -> DmaGatedFgiParams:
        raw_params = {} if params is None else dict(params)
        invalid_keys = sorted(set(raw_params) - DMA_GATED_FGI_PUBLIC_PARAM_KEYS)
        if invalid_keys:
            joined = ", ".join(invalid_keys)
            raise ValueError("Unsupported dma_gated_fgi params: " + joined)

        normalized = coerce_params(raw_params, _DMA_COERCION_SPEC)
        return cls(**normalized)

    def to_public_params(self) -> dict[str, JsonValue]:
        return cast(dict[str, JsonValue], self.model_dump(exclude_none=True))

    def build_signal_config(self) -> DmaGatedFgiConfig:
        return DmaGatedFgiConfig(
            cross_cooldown_days=self.cross_cooldown_days,
            cross_on_touch=self.cross_on_touch,
        )

    def build_pacing_policy(self) -> FgiExponentialPacingPolicy:
        return FgiExponentialPacingPolicy(k=self.pacing_k, r_max=self.pacing_r_max)

    def build_trade_quota_plugin_params(self) -> dict[str, JsonValue]:
        params: dict[str, JsonValue] = {}
        if self.min_trade_interval_days is not None:
            params["min_trade_interval_days"] = self.min_trade_interval_days
        if self.max_trades_7d is not None:
            params["max_trades_7d"] = self.max_trades_7d
        if self.max_trades_30d is not None:
            params["max_trades_30d"] = self.max_trades_30d
        return params

    def build_execution_plugins(self) -> tuple[ExecutionPlugin, ...]:
        return (
            DmaBuyGateExecutionPlugin(
                window_days=self.buy_sideways_window_days,
                sideways_max_range=self.buy_sideways_max_range,
                leg_caps=tuple(self.buy_leg_caps),
            ),
            TradeQuotaGuardExecutionPlugin(
                min_trade_interval_days=self.min_trade_interval_days,
                max_trades_7d=self.max_trades_7d,
                max_trades_30d=self.max_trades_30d,
            ),
        )


def default_dma_gated_fgi_params() -> dict[str, JsonValue]:
    return DmaGatedFgiParams().to_public_params()


def _hold_reason(zone: Zone) -> str:
    return "regime_no_signal" if zone != "at" else "price_equal_dma_hold"


def _hold_intent(*, reason: str, rule_group: RuleGroup) -> AllocationIntent:
    return AllocationIntent(
        action="hold",
        target_allocation=None,
        allocation_name=None,
        immediate=False,
        reason=reason,
        rule_group=rule_group,
        decision_score=0.0,
    )


def _target_intent(
    *,
    action: DecisionAction,
    target: dict[str, float],
    allocation_name: str,
    reason: str,
    rule_group: RuleGroup,
    immediate: bool = False,
) -> AllocationIntent:
    return AllocationIntent(
        action=action,
        target_allocation=dict(target),
        allocation_name=allocation_name,
        immediate=immediate,
        reason=reason,
        rule_group=rule_group,
        decision_score=SCORE_BY_REASON.get(reason, 0.0),
    )


def _resolve_dma_allocation_intent(
    snapshot: DmaMarketState,
    *,
    dma_overextension_threshold: float = 0.30,
    fgi_slope_reversal_threshold: float = -0.05,
) -> AllocationIntent:
    actionable_cross = snapshot.actionable_cross_event
    if actionable_cross == snapshot.cross_event and actionable_cross is not None:
        target_zone = _cross_target_zone(actionable_cross)
        if (
            snapshot.cooldown_state.active
            and target_zone == snapshot.cooldown_state.blocked_zone
        ):
            return _hold_intent(
                reason=f"{target_zone}_side_cooldown_active",
                rule_group="cooldown",
            )
        if actionable_cross == "cross_down":
            return _target_intent(
                action="sell",
                target=SELL_TARGET,
                allocation_name="dma_cross_down_exit",
                reason="dma_cross_down",
                rule_group="cross",
                immediate=True,
            )
        return _target_intent(
            action="buy",
            target=BUY_TARGET,
            allocation_name="dma_cross_up_entry",
            reason="dma_cross_up",
            rule_group="cross",
            immediate=True,
        )

    if (
        snapshot.cooldown_state.active
        and snapshot.zone == snapshot.cooldown_state.blocked_zone
    ):
        return _hold_intent(
            reason=f"{snapshot.zone}_side_cooldown_active",
            rule_group="cooldown",
        )

    if (
        snapshot.zone == "above"
        and snapshot.dma_distance >= dma_overextension_threshold
    ):
        return _target_intent(
            action="sell",
            target=SELL_TARGET,
            allocation_name="dma_above_overextended_sell",
            reason="above_dma_overextended_sell",
            rule_group="dma_fgi",
        )
    if snapshot.zone == "above" and snapshot.fgi_regime == "extreme_greed":
        return _target_intent(
            action="sell",
            target=SELL_TARGET,
            allocation_name="dma_above_extreme_greed_sell",
            reason="above_extreme_greed_sell",
            rule_group="dma_fgi",
        )
    if (
        snapshot.zone == "above"
        and snapshot.fgi_regime in ("greed", "extreme_greed")
        and snapshot.fgi_slope < fgi_slope_reversal_threshold
    ):
        return _target_intent(
            action="sell",
            target=SELL_TARGET,
            allocation_name="dma_above_greed_fading_sell",
            reason="above_greed_fading_sell",
            rule_group="dma_fgi",
        )
    if snapshot.zone == "above" and snapshot.fgi_regime == "greed":
        return _target_intent(
            action="sell",
            target=SELL_TARGET,
            allocation_name="dma_above_greed_sell",
            reason="above_greed_sell",
            rule_group="dma_fgi",
        )
    if snapshot.zone == "below" and snapshot.fgi_regime == "extreme_fear":
        return _target_intent(
            action="buy",
            target=BUY_TARGET,
            allocation_name="dma_below_extreme_fear_buy",
            reason="below_extreme_fear_buy",
            rule_group="dma_fgi",
        )
    if snapshot.ath_event is not None and snapshot.zone == "above":
        return _target_intent(
            action="sell",
            target=SELL_TARGET,
            allocation_name="dma_ath_sell",
            reason="ath_sell",
            rule_group="ath",
        )
    return _hold_intent(reason=_hold_reason(snapshot.zone), rule_group="none")


def _build_signal_observation(
    *,
    snapshot: DmaMarketState,
    intent: AllocationIntent,
) -> SignalObservation:
    signal_output = build_signal_output(market_state=snapshot, intent=intent)
    cross_event = (
        snapshot.actionable_cross_event if intent.rule_group == "cross" else None
    )
    return SignalObservation(
        signal_id=snapshot.signal_id,
        regime=snapshot.fgi_regime,
        confidence=float(signal_output.confidence),
        raw_value=snapshot.fgi_value,
        ath_event=snapshot.ath_event,
        dma=DmaSignalDiagnostics(
            dma_200=snapshot.dma_200,
            distance=snapshot.dma_distance,
            zone=snapshot.zone,
            cross_event=cross_event,
            cooldown_active=snapshot.cooldown_state.active,
            cooldown_remaining_days=snapshot.cooldown_state.remaining_days,
            cooldown_blocked_zone=snapshot.cooldown_state.blocked_zone,
            fgi_slope=snapshot.fgi_slope,
        ),
    )


def _build_execution_hints(
    *,
    signal_id: SignalId,
    snapshot: DmaMarketState,
    intent: AllocationIntent,
    signal_confidence: float,
) -> ExecutionHints:
    enable_buy_gate = intent.action == "buy" and snapshot.signal_id == signal_id
    buy_strength = (
        compute_dma_buy_strength(snapshot.dma_distance) if enable_buy_gate else None
    )
    return ExecutionHints(
        signal_id=snapshot.signal_id,
        current_regime=snapshot.fgi_regime,
        signal_value=snapshot.fgi_value,
        signal_confidence=float(signal_confidence),
        decision_score=intent.decision_score,
        decision_action=intent.action,
        dma_distance=snapshot.dma_distance,
        fgi_slope=snapshot.fgi_slope,
        buy_strength=buy_strength,
        enable_buy_gate=enable_buy_gate,
        reset_buy_gate=intent.rule_group == "cross",
    )


@dataclass
class DmaGatedFgiSignalComponent(StatefulSignalComponent):
    """Stateful DMA signal component used by composed strategies."""

    config: DmaGatedFgiConfig = field(default_factory=DmaGatedFgiConfig)
    signal_id: SignalId = "dma_gated_fgi"
    market_data_requirements: MarketDataRequirements = field(
        default_factory=lambda: MarketDataRequirements(
            requires_sentiment=True,
            required_price_features=frozenset({DMA_200_FEATURE}),
        )
    )
    warmup_lookback_days: int = 14

    _runtime: DmaGatedFgiSignalRuntime = field(init=False, repr=False)
    _ath_tracker: ATHTracker = field(init=False, repr=False)
    _regime_history: list[str] = field(default_factory=list, init=False, repr=False)

    def __post_init__(self) -> None:
        self._runtime = DmaGatedFgiSignalRuntime(config=self.config)
        self._ath_tracker = ATHTracker(cooldown_days=7)

    def reset(self) -> None:
        self._runtime.reset()
        self._ath_tracker = ATHTracker(cooldown_days=7)
        self._regime_history = []

    def initialize(self, context: StrategyContext) -> None:
        self._ath_tracker.initialize_from_context(context)

    def warmup(self, context: StrategyContext) -> None:
        sentiment = context.sentiment or {}
        regime = normalize_regime_label(str(sentiment.get("label", "neutral")))
        self._regime_history.append(regime)
        self._runtime.warmup(
            SignalContext.from_strategy_context(
                context,
                regime_history=self._regime_history,
            )
        )

    def observe(self, context: StrategyContext) -> DmaMarketState:
        self._ath_tracker.process_ath_event(context)
        signal_context = SignalContext.from_strategy_context(
            context,
            ath_tracker=self._ath_tracker,
            regime_history=self._regime_history,
        )
        market_state = self._runtime.observe(signal_context)
        self._regime_history.append(market_state.fgi_regime)
        return market_state

    def apply_intent(
        self,
        *,
        current_date: date,
        snapshot: DmaMarketState,
        intent: AllocationIntent,
    ) -> DmaMarketState:
        return self._runtime.apply_intent(
            current_date=current_date,
            snapshot=snapshot,
            intent=intent,
        )

    def build_signal_observation(
        self,
        *,
        snapshot: DmaMarketState,
        intent: AllocationIntent,
    ) -> SignalObservation:
        return _build_signal_observation(
            snapshot=snapshot,
            intent=intent,
        )

    def build_execution_hints(
        self,
        *,
        snapshot: DmaMarketState,
        intent: AllocationIntent,
        signal_confidence: float,
    ) -> ExecutionHints:
        return _build_execution_hints(
            signal_id=self.signal_id,
            snapshot=snapshot,
            intent=intent,
            signal_confidence=signal_confidence,
        )


@dataclass(frozen=True)
class DmaGatedFgiDecisionPolicy(DecisionPolicy):
    """Decision policy for the DMA/FGI signal family."""

    decision_policy_id: str = "dma_fgi_policy"
    dma_overextension_threshold: float = 0.30
    fgi_slope_reversal_threshold: float = -0.05

    def decide(self, snapshot: DmaMarketState) -> AllocationIntent:
        return _resolve_dma_allocation_intent(
            snapshot,
            dma_overextension_threshold=self.dma_overextension_threshold,
            fgi_slope_reversal_threshold=self.fgi_slope_reversal_threshold,
        )


@dataclass
class DmaGatedFgiStrategy(ComposedSignalStrategy):
    """Thin wrapper around the generic composed signal strategy."""

    total_capital: float
    signal_id: SignalId = "dma_gated_fgi"
    summary_signal_id: SignalId = "dma_gated_fgi"
    params: DmaGatedFgiParams | dict[str, Any] = field(
        default_factory=DmaGatedFgiParams
    )
    signal_component: StatefulSignalComponent = field(init=False, repr=False)
    decision_policy: DecisionPolicy = field(init=False, repr=False)
    execution_engine: AllocationIntentExecutor = field(init=False, repr=False)
    public_params: dict[str, Any] = field(default_factory=dict)
    strategy_id: str = STRATEGY_DMA_GATED_FGI
    display_name: str = STRATEGY_DISPLAY_NAMES[STRATEGY_DMA_GATED_FGI]
    canonical_strategy_id: str = STRATEGY_DMA_GATED_FGI

    def __post_init__(self) -> None:
        if self.signal_id != "dma_gated_fgi":
            raise ValueError("signal_id must be 'dma_gated_fgi'")
        resolved_params = (
            self.params
            if isinstance(self.params, DmaGatedFgiParams)
            else DmaGatedFgiParams.from_public_params(self.params)
        )
        self.params = resolved_params
        self.signal_component = DmaGatedFgiSignalComponent(
            config=resolved_params.build_signal_config()
        )
        self.decision_policy = DmaGatedFgiDecisionPolicy(
            dma_overextension_threshold=resolved_params.dma_overextension_threshold,
            fgi_slope_reversal_threshold=resolved_params.fgi_slope_reversal_threshold,
        )
        self.execution_engine = AllocationIntentExecutor(
            pacing_policy=resolved_params.build_pacing_policy(),
            plugins=resolved_params.build_execution_plugins(),
        )
        self.public_params = runtime_params_to_public_params(
            STRATEGY_DMA_GATED_FGI,
            resolved_params.to_public_params(),
        )

    def parameters(self) -> dict[str, Any]:
        return dict(self.public_params)


__all__ = [
    "DmaGatedFgiDecisionPolicy",
    "DmaGatedFgiParams",
    "DmaGatedFgiSignalComponent",
    "DmaGatedFgiStrategy",
    "default_dma_gated_fgi_params",
]
