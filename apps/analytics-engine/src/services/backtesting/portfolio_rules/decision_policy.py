"""Portfolio-level DMA/FGI rule decision policy.

Rules are evaluated first-match-wins by explicit priority:
cross-down exit, cross-up equal-weight, ETH/BTC ratio rotation,
DMA overextension DCA sell, then FGI downshift DCA sell.
If different assets emit cross-up and cross-down on the same day, cross-down
exits win and the cross-up rebalance can be reconsidered on the next eligible
day.

Sections in this file (729 LOC — use these as a folding map):
- Protocols & types: ``_PortfolioRuleParams``, ``RuleExecutionState``,
  ``RuleMatchOutcome``, ``RuleExecutionContext``
- Rule evaluator: ``RulesEvaluator``
- Policy implementation: ``DmaFgiPortfolioRulesDecisionPolicy``
- Snapshot construction: ``build_portfolio_snapshot``, ``_advance_context``
- Rule builders: ``build_portfolio_rules_for_params``, ``fresh_portfolio_rule``,
  ``required_rule``, ``assert_known_rule_names``, ``build_risk_guards_for_params``
- Active-rule selection: ``active_rules``, ``_rule_is_active``,
  ``_apply_risk_guards``
- Intent post-processing: ``_preserve_rule_trace_diagnostics``,
  ``_apply_post_intent_adjustments``, ``_matched_rule_priority``,
  ``_matched_rule_name``, ``_apply_shadowing``
- Public resolver: ``resolve_portfolio_rules_intent``
- Cycle / regime accessors: ``_update_cycle_state``, ``_macro_regime``,
  ``_crypto_regime``, ``_macro_value``, ``_crypto_value``
- Snapshot accessors: ``_assets_from_flat_state``,
  ``_current_fgi_regime_by_symbol``, ``_rule_match_outcome_dicts``
"""

from __future__ import annotations

from collections.abc import Callable, Mapping
from copy import deepcopy
from dataclasses import dataclass, field, replace
from datetime import date
from typing import Any, Protocol, TypeVar, cast

from src.services.backtesting.decision import AllocationIntent
from src.services.backtesting.portfolio_rules import (
    ALL_PORTFOLIO_RULES,
    DEFAULT_PORTFOLIO_RULES,
    RULE_NAMES,
    RULE_PRIORITIES,
)
from src.services.backtesting.portfolio_rules.base import (
    DIAG_COOLDOWN_SKIPPED_RULES,
    DIAG_MATCHED_RULE_NAME,
    DIAG_PORTFOLIO_RULE_MATCHES,
    DIAG_SIGNALS_CONSULTED,
    DecisionPolicy,
    HasPublicParams,
    PortfolioRule,
    PortfolioRuleConfig,
    PortfolioSnapshot,
    current_fgi_regime_for_symbol,
    current_target,
    signals_consulted_for_symbols,
    symbols_for_snapshot,
)
from src.services.backtesting.portfolio_rules.cooldown_tracker import (
    RuleCooldownTracker,
)
from src.services.backtesting.risk import (
    RiskGuard,
    RiskGuardResult,
    TradeQuotaGuard,
)
from src.services.backtesting.signals.dma_gated_fgi.types import DmaMarketState
from src.services.backtesting.signals.flat_minimum import FlatMinimumState
from src.services.backtesting.strategies.base import StrategyContext

PORTFOLIO_RULES_SIGNAL_ID = "dma_fgi_portfolio_rules_signal"
_RULE_PRIORITY_BY_NAME = RULE_PRIORITIES
_CRYPTO_CYCLE_SYMBOLS = ("BTC", "ETH")
_RuleT = TypeVar("_RuleT", bound=PortfolioRule)


class _PortfolioRuleParams(Protocol):
    disabled_rules: frozenset[str]
    enabled_rules: frozenset[str] | None
    min_trade_interval_days: int | None
    max_trades_7d: int | None
    max_trades_30d: int | None
    overextension_threshold_multiplier_greed: float
    overextension_threshold_multiplier_extreme_greed: float

    def to_public_params(self) -> Mapping[str, Any]: ...


@dataclass(frozen=True)
class RuleExecutionState:
    last_trade_date: date | None = None
    trade_dates: tuple[date, ...] = ()


@dataclass(frozen=True)
class RuleMatchOutcome:
    rule_name: str
    matched: bool
    would_have_acted_action: str | None = None
    suppressed_by: str | None = None


@dataclass(frozen=True)
class RuleExecutionContext:
    previous_fgi_regime: Mapping[str, str] = field(default_factory=dict)
    cycle_open_per_symbol: Mapping[str, bool] = field(default_factory=dict)
    cooldown_tracker: RuleCooldownTracker = field(default_factory=RuleCooldownTracker)
    execution_state: RuleExecutionState = field(default_factory=RuleExecutionState)


@dataclass(frozen=True)
class RulesEvaluator:
    """Evaluate portfolio rules against an explicit execution context."""

    rules: tuple[PortfolioRule, ...] = DEFAULT_PORTFOLIO_RULES
    risk_guards: tuple[RiskGuard, ...] = ()
    config: PortfolioRuleConfig = field(default_factory=PortfolioRuleConfig)
    disabled_rules: frozenset[str] = field(default_factory=frozenset)
    enabled_rules: frozenset[str] | None = None

    def evaluate(
        self,
        snapshot: FlatMinimumState,
        ctx: RuleExecutionContext,
    ) -> AllocationIntent:
        portfolio_snapshot = build_portfolio_snapshot(
            snapshot,
            previous_fgi_regime=ctx.previous_fgi_regime,
            cycle_open_per_symbol=ctx.cycle_open_per_symbol,
            last_trade_date=ctx.execution_state.last_trade_date,
            trade_dates=ctx.execution_state.trade_dates,
        )
        self._observe_components(portfolio_snapshot)
        intent = resolve_portfolio_rules_intent(
            portfolio_snapshot,
            rules=self.rules,
            config=self.config,
            disabled_rules=self.disabled_rules,
            enabled_rules=self.enabled_rules,
            cooldown_tracker=ctx.cooldown_tracker,
        )
        risk_result = self._apply_risk_guards(intent, portfolio_snapshot)
        intent = self._apply_post_intent_adjustments(
            risk_result.intent,
            portfolio_snapshot,
        )
        self._record_intent(intent)
        return intent

    def _active_rules(self) -> tuple[PortfolioRule, ...]:
        return active_rules(
            self.rules,
            disabled_rules=self.disabled_rules,
            enabled_rules=self.enabled_rules,
        )

    def _observe_components(self, snapshot: PortfolioSnapshot) -> None:
        for component in (*self._active_rules(), *self.risk_guards):
            observe = getattr(component, "observe", None)
            if callable(observe):
                observe(snapshot, config=self.config)

    def _record_intent(self, intent: AllocationIntent) -> None:
        for component in (*self._active_rules(), *self.risk_guards):
            record_intent = getattr(component, "record_intent", None)
            if callable(record_intent):
                record_intent(intent)

    def _apply_risk_guards(
        self,
        intent: AllocationIntent,
        snapshot: PortfolioSnapshot,
    ) -> RiskGuardResult:
        return _apply_risk_guards(
            intent,
            snapshot,
            risk_guards=self.risk_guards,
            config=self.config,
        )

    def _apply_post_intent_adjustments(
        self,
        intent: AllocationIntent,
        snapshot: PortfolioSnapshot,
    ) -> AllocationIntent:
        return _apply_post_intent_adjustments(
            intent,
            snapshot,
            rules=self._active_rules(),
            config=self.config,
        )


@dataclass
class DmaFgiPortfolioRulesDecisionPolicy(DecisionPolicy):
    """Decision policy that evaluates whole-portfolio rules."""

    decision_policy_id: str = "dma_fgi_portfolio_rules_policy"
    rules: tuple[PortfolioRule, ...] = DEFAULT_PORTFOLIO_RULES
    risk_guards: tuple[RiskGuard, ...] = ()
    config: PortfolioRuleConfig = field(default_factory=PortfolioRuleConfig)
    disabled_rules: frozenset[str] = frozenset()
    enabled_rules: frozenset[str] | None = None
    execution_state_provider: Callable[[], RuleExecutionState] | None = None
    _ctx: RuleExecutionContext = field(
        default_factory=RuleExecutionContext,
        init=False,
        repr=False,
    )
    _evaluator: RulesEvaluator = field(init=False, repr=False)

    def __post_init__(self) -> None:
        assert_known_rule_names(self.disabled_rules, field_name="disabled_rules")
        assert_known_rule_names(self.enabled_rules, field_name="enabled_rules")
        self._evaluator = self._build_evaluator()

    def reset(self) -> None:
        self._ctx = RuleExecutionContext()
        for component in (*self.rules, *self.risk_guards):
            reset = getattr(component, "reset", None)
            if callable(reset):
                reset()

    def decide(self, snapshot: FlatMinimumState) -> AllocationIntent:
        ctx = replace(
            self._ctx,
            execution_state=self._resolve_execution_state(),
        )
        self._evaluator = self._build_evaluator()
        intent = self._evaluator.evaluate(snapshot, ctx)
        self._ctx = _advance_context(
            ctx,
            intent,
            snapshot=snapshot,
            track_local_execution_state=self.execution_state_provider is None,
        )
        return intent

    def _resolve_execution_state(self) -> RuleExecutionState:
        if self.execution_state_provider is not None:
            return self.execution_state_provider()
        return self._ctx.execution_state

    def _build_evaluator(self) -> RulesEvaluator:
        return RulesEvaluator(
            rules=self.rules,
            risk_guards=self.risk_guards,
            config=self.config,
            disabled_rules=self.disabled_rules,
            enabled_rules=self.enabled_rules,
        )

    def record_execution(
        self,
        *,
        context: StrategyContext,
        intent: AllocationIntent,
        execution: Any,
    ) -> None:
        if not getattr(execution, "transfers", ()):
            return
        matched_rule_name = _matched_rule_name(intent)
        if matched_rule_name is None:
            return
        matched_rule = _rule_for_name(self.rules, matched_rule_name)
        if matched_rule is None:
            return
        self._ctx.cooldown_tracker.record_execution(
            matched_rule,
            intent=intent,
            executed_at=context.date,
        )


def build_portfolio_snapshot(
    snapshot: FlatMinimumState,
    *,
    previous_fgi_regime: Mapping[str, str],
    cycle_open_per_symbol: Mapping[str, bool] | None = None,
    last_trade_date: date | None = None,
    trade_dates: tuple[date, ...] = (),
) -> PortfolioSnapshot:
    assets = _assets_from_flat_state(snapshot)
    return PortfolioSnapshot(
        assets=assets,
        current_asset_allocation=snapshot.current_asset_allocation,
        previous_fgi_regime=dict(previous_fgi_regime),
        cycle_open_per_symbol=dict(cycle_open_per_symbol or {}),
        eth_btc_ratio_state=snapshot.eth_btc_ratio_state,
        macro_fgi_regime=_macro_regime(assets),
        crypto_fgi_regime=_crypto_regime(assets),
        macro_fgi_value=_macro_value(assets),
        crypto_fgi_value=_crypto_value(assets),
        last_trade_date=last_trade_date,
        current_date=snapshot.current_date,
        trade_dates=trade_dates,
    )


def _advance_context(
    ctx: RuleExecutionContext,
    intent: AllocationIntent,
    *,
    snapshot: FlatMinimumState,
    track_local_execution_state: bool,
) -> RuleExecutionContext:
    portfolio_snapshot = build_portfolio_snapshot(
        snapshot,
        previous_fgi_regime=ctx.previous_fgi_regime,
        cycle_open_per_symbol=ctx.cycle_open_per_symbol,
        last_trade_date=ctx.execution_state.last_trade_date,
        trade_dates=ctx.execution_state.trade_dates,
    )
    execution_state = ctx.execution_state
    if track_local_execution_state and intent.action != "hold":
        trade_dates = list(execution_state.trade_dates)
        if snapshot.current_date is not None:
            trade_dates.append(snapshot.current_date)
        execution_state = RuleExecutionState(
            last_trade_date=snapshot.current_date,
            trade_dates=tuple(trade_dates),
        )
    return RuleExecutionContext(
        previous_fgi_regime=_current_fgi_regime_by_symbol(portfolio_snapshot),
        cycle_open_per_symbol=_update_cycle_state(
            dict(ctx.cycle_open_per_symbol),
            portfolio_snapshot,
        ),
        cooldown_tracker=ctx.cooldown_tracker,
        execution_state=execution_state,
    )


def build_portfolio_rules_for_params(
    params: _PortfolioRuleParams,
    *,
    include_inactive: bool = False,
) -> tuple[PortfolioRule, ...]:
    assert_known_rule_names(params.disabled_rules, field_name="disabled_rules")
    assert_known_rule_names(params.enabled_rules, field_name="enabled_rules")
    rule_universe = ALL_PORTFOLIO_RULES if include_inactive else DEFAULT_PORTFOLIO_RULES
    nested_params = _nested_public_params_for(params)
    rules = [
        _rule_with_public_params(fresh_portfolio_rule(rule), nested_params)
        for rule in rule_universe
        if include_inactive or rule.name not in params.disabled_rules
    ]
    return tuple(sorted(rules, key=lambda rule: rule.priority))


def _nested_public_params_for(params: _PortfolioRuleParams) -> Any:
    from src.services.backtesting.constants import STRATEGY_DMA_FGI_PORTFOLIO_RULES
    from src.services.backtesting.public_params import (
        DmaGatedFgiPublicParams,
        runtime_params_to_public_params,
    )

    nested = runtime_params_to_public_params(
        STRATEGY_DMA_FGI_PORTFOLIO_RULES,
        params.to_public_params(),
    )
    return DmaGatedFgiPublicParams.model_validate(nested)


def _rule_with_public_params(rule: _RuleT, nested_params: Any) -> _RuleT:
    if not isinstance(rule, HasPublicParams):
        return rule
    section_name = rule.public_params_section()
    if section_name is None:
        return rule
    section = getattr(nested_params, section_name)
    return cast(_RuleT, rule.with_public_params(section))


def fresh_portfolio_rule(rule: _RuleT) -> _RuleT:
    return deepcopy(rule)


def required_rule(
    rules: tuple[PortfolioRule, ...],
    rule_type: type[_RuleT],
) -> _RuleT:
    for rule in rules:
        if isinstance(rule, rule_type):
            return rule
    raise ValueError(f"Missing required portfolio rule: {rule_type.__name__}")


def assert_known_rule_names(
    rule_names: frozenset[str] | None,
    *,
    field_name: str,
) -> None:
    if rule_names is None:
        return
    invalid_rules = sorted(rule_names - RULE_NAMES)
    if invalid_rules:
        joined = ", ".join(invalid_rules)
        raise ValueError(f"Unsupported portfolio rule names in {field_name}: {joined}")


def build_risk_guards_for_params(
    params: _PortfolioRuleParams,
) -> tuple[RiskGuard, ...]:
    guards: list[RiskGuard] = []
    if (
        params.min_trade_interval_days is not None
        or params.max_trades_7d is not None
        or params.max_trades_30d is not None
    ):
        guards.append(
            TradeQuotaGuard(
                min_trade_interval_days=params.min_trade_interval_days,
                max_trades_7d=params.max_trades_7d,
                max_trades_30d=params.max_trades_30d,
            )
        )
    return tuple(sorted(guards, key=lambda guard: guard.priority))


def active_rules(
    rules: tuple[PortfolioRule, ...],
    *,
    disabled_rules: frozenset[str],
    enabled_rules: frozenset[str] | None,
) -> tuple[PortfolioRule, ...]:
    return tuple(
        rule
        for rule in rules
        if _rule_is_active(
            rule,
            disabled_rules=disabled_rules,
            enabled_rules=enabled_rules,
        )
    )


def _rule_is_active(
    rule: PortfolioRule,
    *,
    disabled_rules: frozenset[str],
    enabled_rules: frozenset[str] | None,
) -> bool:
    if rule.name in disabled_rules:
        return False
    return enabled_rules is None or rule.name in enabled_rules


def _apply_risk_guards(
    intent: AllocationIntent,
    snapshot: PortfolioSnapshot,
    *,
    risk_guards: tuple[RiskGuard, ...],
    config: PortfolioRuleConfig,
) -> RiskGuardResult:
    matched_rule_priority = _matched_rule_priority(intent)
    for guard in risk_guards:
        if (
            matched_rule_priority is not None
            and guard.priority >= matched_rule_priority
        ):
            continue
        replacement = guard.allow(intent, snapshot, config=config)
        if replacement is not None:
            return RiskGuardResult(
                intent=_preserve_rule_trace_diagnostics(replacement, original=intent),
                blocked_by=guard.name,
            )
    return RiskGuardResult(intent=intent)


def _preserve_rule_trace_diagnostics(
    replacement: AllocationIntent,
    *,
    original: AllocationIntent,
) -> AllocationIntent:
    original_diagnostics = original.diagnostics or {}
    replacement_diagnostics = dict(replacement.diagnostics or {})
    for key in (DIAG_PORTFOLIO_RULE_MATCHES, DIAG_COOLDOWN_SKIPPED_RULES):
        if key in original_diagnostics and key not in replacement_diagnostics:
            replacement_diagnostics[key] = original_diagnostics[key]
    return replace(replacement, diagnostics=replacement_diagnostics)


def _apply_post_intent_adjustments(
    intent: AllocationIntent,
    snapshot: PortfolioSnapshot,
    *,
    rules: tuple[PortfolioRule, ...],
    config: PortfolioRuleConfig,
) -> AllocationIntent:
    adjusted = intent
    for rule in rules:
        hook = getattr(rule, "apply_post_intent_adjustments", None)
        if callable(hook):
            adjusted = hook(intent=adjusted, snapshot=snapshot, config=config)
    return adjusted


def _matched_rule_priority(intent: AllocationIntent) -> int | None:
    matched_rule = _matched_rule_name(intent)
    if matched_rule is None:
        return None
    return _RULE_PRIORITY_BY_NAME.get(matched_rule)


def _matched_rule_name(intent: AllocationIntent) -> str | None:
    diagnostics = intent.diagnostics or {}
    matched_rule = diagnostics.get(DIAG_MATCHED_RULE_NAME)
    return matched_rule if isinstance(matched_rule, str) else None


def _rule_for_name(
    rules: tuple[PortfolioRule, ...],
    name: str,
) -> PortfolioRule | None:
    for rule in rules:
        if rule.name == name:
            return rule
    return None


def resolve_portfolio_rules_intent(
    snapshot: PortfolioSnapshot,
    *,
    rules: tuple[PortfolioRule, ...] = DEFAULT_PORTFOLIO_RULES,
    config: PortfolioRuleConfig | None = None,
    disabled_rules: frozenset[str] = frozenset(),
    enabled_rules: frozenset[str] | None = None,
    cooldown_tracker: RuleCooldownTracker | None = None,
) -> AllocationIntent:
    resolved_config = config or PortfolioRuleConfig()
    resolved_cooldown_tracker = cooldown_tracker or RuleCooldownTracker()
    cooldown_skipped_rules: list[dict[str, object]] = []
    raw_outcomes: list[RuleMatchOutcome] = []
    winning_rule_name: str | None = None
    winning_intent: AllocationIntent | None = None

    for rule in rules:
        matched = rule.matches(snapshot, config=resolved_config)
        candidate_intent: AllocationIntent | None = None
        would_have_acted_action: str | None = None
        if matched:
            candidate_intent = rule.build_intent(snapshot, config=resolved_config)
            would_have_acted_action = candidate_intent.action
        raw_outcomes.append(
            RuleMatchOutcome(
                rule_name=rule.name,
                matched=matched,
                would_have_acted_action=would_have_acted_action,
            )
        )
        if not matched or winning_intent is not None:
            continue
        if not _rule_is_active(
            rule,
            disabled_rules=disabled_rules,
            enabled_rules=enabled_rules,
        ):
            continue
        cooldown = resolved_cooldown_tracker.is_cooled_off(
            rule,
            snapshot=snapshot,
            config=resolved_config,
        )
        if cooldown is not None:
            cooldown_skipped_rules.append(cooldown)
            continue
        winning_rule_name = rule.name
        winning_intent = candidate_intent

    rule_trace = _rule_match_outcome_dicts(
        _apply_shadowing(raw_outcomes, winner_name=winning_rule_name)
    )
    if winning_intent is not None and winning_rule_name is not None:
        diagnostics = dict(winning_intent.diagnostics or {})
        diagnostics.setdefault(DIAG_MATCHED_RULE_NAME, winning_rule_name)
        diagnostics[DIAG_PORTFOLIO_RULE_MATCHES] = rule_trace
        if cooldown_skipped_rules:
            diagnostics[DIAG_COOLDOWN_SKIPPED_RULES] = cooldown_skipped_rules
        return replace(winning_intent, diagnostics=diagnostics)

    return AllocationIntent(
        action="hold",
        target_allocation=current_target(snapshot),
        allocation_name=None,
        immediate=False,
        reason="regime_no_signal",
        rule_group="none",
        decision_score=0.0,
        diagnostics={
            DIAG_MATCHED_RULE_NAME: "regime_no_signal_hold",
            DIAG_PORTFOLIO_RULE_MATCHES: rule_trace,
            **(
                {DIAG_COOLDOWN_SKIPPED_RULES: cooldown_skipped_rules}
                if cooldown_skipped_rules
                else {}
            ),
            **(
                {
                    DIAG_SIGNALS_CONSULTED: signals_consulted_for_symbols(
                        snapshot,
                        tuple(symbols_for_snapshot(snapshot)),
                    )
                }
                if resolved_config.emit_signals_consulted
                else {}
            ),
        },
    )


def _apply_shadowing(
    outcomes: list[RuleMatchOutcome],
    *,
    winner_name: str | None,
) -> list[RuleMatchOutcome]:
    if winner_name is None:
        return outcomes
    winner_priority = _RULE_PRIORITY_BY_NAME.get(winner_name)
    if winner_priority is None:
        return outcomes
    shadowed: list[RuleMatchOutcome] = []
    for outcome in outcomes:
        suppressed_by = outcome.suppressed_by
        if (
            outcome.matched
            and outcome.rule_name != winner_name
            and _RULE_PRIORITY_BY_NAME.get(outcome.rule_name, winner_priority)
            > winner_priority
        ):
            suppressed_by = winner_name
        shadowed.append(replace(outcome, suppressed_by=suppressed_by))
    return shadowed


def _rule_match_outcome_dicts(
    outcomes: list[RuleMatchOutcome],
) -> list[dict[str, object]]:
    return [
        {
            "rule_name": outcome.rule_name,
            "matched": outcome.matched,
            "would_have_acted_action": outcome.would_have_acted_action,
            "suppressed_by": outcome.suppressed_by,
        }
        for outcome in outcomes
    ]


def _assets_from_flat_state(snapshot: FlatMinimumState) -> dict[str, DmaMarketState]:
    assets: dict[str, DmaMarketState] = {}
    if snapshot.spy_dma_state is not None:
        assets["SPY"] = snapshot.spy_dma_state
    if snapshot.btc_dma_state is not None:
        assets["BTC"] = snapshot.btc_dma_state
    if snapshot.eth_dma_state is not None:
        assets["ETH"] = snapshot.eth_dma_state
    return assets


def _current_fgi_regime_by_symbol(snapshot: PortfolioSnapshot) -> dict[str, str]:
    regimes: dict[str, str] = {}
    for symbol in symbols_for_snapshot(snapshot):
        regime = current_fgi_regime_for_symbol(snapshot, symbol)
        if regime is not None:
            regimes[symbol] = regime
    return regimes


def _update_cycle_state(
    previous: dict[str, bool],
    snapshot: PortfolioSnapshot,
) -> dict[str, bool]:
    updated = dict(previous)
    crypto_crossed_down = any(
        snapshot.assets.get(symbol) is not None
        and snapshot.assets[symbol].cross_event == "cross_down"
        for symbol in _CRYPTO_CYCLE_SYMBOLS
    )
    crypto_crossed_up = any(
        snapshot.assets.get(symbol) is not None
        and snapshot.assets[symbol].actionable_cross_event == "cross_up"
        for symbol in _CRYPTO_CYCLE_SYMBOLS
    )
    for symbol, state in snapshot.assets.items():
        event = state.actionable_cross_event
        if symbol in _CRYPTO_CYCLE_SYMBOLS:
            continue
        if event == "cross_down":
            updated[symbol] = True
        elif event == "cross_up":
            updated[symbol] = False
    if crypto_crossed_down:
        for symbol in _CRYPTO_CYCLE_SYMBOLS:
            updated[symbol] = True
    elif crypto_crossed_up:
        for symbol in _CRYPTO_CYCLE_SYMBOLS:
            updated[symbol] = False
    return updated


def _macro_regime(assets: Mapping[str, DmaMarketState]) -> str | None:
    spy_state = assets.get("SPY")
    if spy_state is None:
        return None
    return spy_state.macro_fear_greed_regime


def _crypto_regime(assets: Mapping[str, DmaMarketState]) -> str | None:
    for symbol in ("BTC", "ETH"):
        state = assets.get(symbol)
        if state is not None:
            return state.fgi_regime
    return None


def _macro_value(assets: Mapping[str, DmaMarketState]) -> float | None:
    spy_state = assets.get("SPY")
    if spy_state is None:
        return None
    return spy_state.macro_fear_greed_value


def _crypto_value(assets: Mapping[str, DmaMarketState]) -> float | None:
    for symbol in ("BTC", "ETH"):
        state = assets.get(symbol)
        if state is not None:
            return state.fgi_value
    return None


__all__ = [
    "PORTFOLIO_RULES_SIGNAL_ID",
    "DmaFgiPortfolioRulesDecisionPolicy",
    "RuleExecutionContext",
    "RuleExecutionState",
    "RulesEvaluator",
    "active_rules",
    "assert_known_rule_names",
    "build_portfolio_rules_for_params",
    "build_portfolio_snapshot",
    "build_risk_guards_for_params",
    "fresh_portfolio_rule",
    "required_rule",
    "resolve_portfolio_rules_intent",
]
