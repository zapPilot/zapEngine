"""Per-asset DMA-gated FGI signal component."""

from __future__ import annotations

from dataclasses import dataclass, field, replace
from datetime import date

from src.services.backtesting.decision import (
    AllocationIntent,
    DecisionAction,
    RuleGroup,
)
from src.services.backtesting.domain import (
    DmaSignalDiagnostics,
    SignalObservation,
)
from src.services.backtesting.execution.ath_tracker import ATHTracker
from src.services.backtesting.execution.contracts import ExecutionHints
from src.services.backtesting.execution.pacing.base import compute_dma_buy_strength
from src.services.backtesting.features import DMA_200_FEATURE, MarketDataRequirements
from src.services.backtesting.signals.contracts import (
    SignalContext,
    StatefulSignalComponent,
)
from src.services.backtesting.signals.dma_gated_fgi.config import DmaGatedFgiConfig
from src.services.backtesting.signals.dma_gated_fgi.metadata import build_signal_output
from src.services.backtesting.signals.dma_gated_fgi.runtime import (
    DmaGatedFgiSignalRuntime,
)
from src.services.backtesting.signals.dma_gated_fgi.types import (
    CrossEvent,
    DmaMarketState,
    SignalId,
    Zone,
)
from src.services.backtesting.strategies.base import (
    StrategyContext,
)
from src.services.backtesting.tactics.base import (
    Rule,
    RuleConfig,
    hold_intent,
    hold_reason,
    target_intent,
)
from src.services.backtesting.tactics.rules import (
    DEFAULT_RULES,
)
from src.services.backtesting.utils import normalize_regime_label


def _hold_reason(zone: Zone) -> str:
    return hold_reason(zone)


def _hold_intent(*, reason: str, rule_group: RuleGroup) -> AllocationIntent:
    return hold_intent(reason=reason, rule_group=rule_group)


# jscpd:ignore-start
# Reason: compatibility wrapper intentionally mirrors the tactic target builder.
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


# jscpd:ignore-end


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

    # jscpd:ignore-start
    # Reason: component delegates runtime API with the same public signature.
    def apply_intent(
        self,
        *,
        current_date: date,
        snapshot: DmaMarketState,
        intent: AllocationIntent,
        forced_cross_event: CrossEvent | None = None,
    ) -> DmaMarketState:
        return self._runtime.apply_intent(
            current_date=current_date,
            snapshot=snapshot,
            intent=intent,
            forced_cross_event=forced_cross_event,
        )

    # jscpd:ignore-end

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


__all__ = [
    "DmaGatedFgiSignalComponent",
]
