"""Canonical dma_gated_fgi strategy with direct signal and execution wiring."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field, replace
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
from src.services.backtesting.signals.dma_gated_fgi.metadata import build_signal_output
from src.services.backtesting.signals.dma_gated_fgi.runtime import (
    DmaGatedFgiSignalRuntime,
)
from src.services.backtesting.signals.dma_gated_fgi.types import (
    DmaMarketState,
    SignalId,
    Zone,
)
from src.services.backtesting.strategies.base import (
    StrategyContext,
)
from src.services.backtesting.strategies.composed_signal import ComposedSignalStrategy
from src.services.backtesting.tactics.base import (
    Rule,
    RuleConfig,
    hold_intent,
    hold_reason,
    target_intent,
)
from src.services.backtesting.tactics.rules import DEFAULT_RULES, RULE_NAMES
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
        "fgi_slope_recovery_threshold",
        "disabled_rules",
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
    "fgi_slope_recovery_threshold": coerce_float,
}


def _coerce_rule_name_set(value: Any, *, field_name: str) -> frozenset[str]:
    if not isinstance(value, list | tuple | set | frozenset):
        raise ValueError(f"{field_name} must be an array of rule names")
    names = frozenset(str(item) for item in value)
    invalid_names = sorted(names - RULE_NAMES)
    if invalid_names:
        joined = ", ".join(invalid_names)
        raise ValueError(f"{field_name} contains unsupported rule names: {joined}")
    return names


_DMA_COERCION_SPEC["disabled_rules"] = _coerce_rule_name_set


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
    fgi_slope_recovery_threshold: float = Field(
        default=0.05,
        ge=0.0,
        description="FGI slope threshold above which fear-recovery buy triggers.",
    )
    disabled_rules: frozenset[str] = Field(
        default_factory=frozenset,
        description="DMA/FGI tactical rule names to skip during policy evaluation.",
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
        params = self.model_dump(exclude_none=True)
        if self.disabled_rules:
            params["disabled_rules"] = sorted(self.disabled_rules)
        else:
            params.pop("disabled_rules", None)
        return cast(dict[str, JsonValue], params)

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
    return hold_reason(zone)


def _hold_intent(*, reason: str, rule_group: RuleGroup) -> AllocationIntent:
    return hold_intent(reason=reason, rule_group=rule_group)


def _target_intent(
    *,
    action: DecisionAction,
    target: dict[str, float],
    allocation_name: str,
    reason: str,
    rule_group: RuleGroup,
    immediate: bool = False,
) -> AllocationIntent:
    return target_intent(
        action=action,
        target=target,
        allocation_name=allocation_name,
        reason=reason,
        rule_group=rule_group,
        immediate=immediate,
    )


def _resolve_dma_allocation_intent(
    snapshot: DmaMarketState,
    *,
    dma_overextension_threshold: float = 0.30,
    fgi_slope_reversal_threshold: float = -0.05,
    fgi_slope_recovery_threshold: float = 0.05,
    rules: tuple[Rule, ...] = DEFAULT_RULES,
    config: RuleConfig | None = None,
    disabled_rules: frozenset[str] = frozenset(),
) -> AllocationIntent:
    resolved_config = config or RuleConfig(
        dma_overextension_threshold=dma_overextension_threshold,
        fgi_slope_reversal_threshold=fgi_slope_reversal_threshold,
        fgi_slope_recovery_threshold=fgi_slope_recovery_threshold,
    )
    for rule in rules:
        if rule.name in disabled_rules:
            continue
        if rule.matches(snapshot, config=resolved_config):
            intent = rule.build_intent(snapshot, config=resolved_config)
            diagnostics = dict(intent.diagnostics or {})
            diagnostics.setdefault("matched_rule_name", rule.name)
            return replace(intent, diagnostics=diagnostics)
    intent = hold_intent(reason=hold_reason(snapshot.zone), rule_group="none")
    return replace(
        intent,
        diagnostics={"matched_rule_name": "regime_no_signal_hold"},
    )


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
    current_regime = snapshot.fgi_regime
    signal_value = snapshot.fgi_value
    if (
        "spy_below_extreme_fear_buy" in intent.reason
        and snapshot.macro_fear_greed_regime is not None
    ):
        current_regime = snapshot.macro_fear_greed_regime
        signal_value = snapshot.macro_fear_greed_value
    return ExecutionHints(
        signal_id=snapshot.signal_id,
        current_regime=current_regime,
        signal_value=signal_value,
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
    fgi_slope_recovery_threshold: float = 0.05
    disabled_rules: frozenset[str] = frozenset()

    def decide(self, snapshot: DmaMarketState) -> AllocationIntent:
        return _resolve_dma_allocation_intent(
            snapshot,
            dma_overextension_threshold=self.dma_overextension_threshold,
            fgi_slope_reversal_threshold=self.fgi_slope_reversal_threshold,
            fgi_slope_recovery_threshold=self.fgi_slope_recovery_threshold,
            disabled_rules=self.disabled_rules,
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
            fgi_slope_recovery_threshold=resolved_params.fgi_slope_recovery_threshold,
            disabled_rules=resolved_params.disabled_rules,
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
