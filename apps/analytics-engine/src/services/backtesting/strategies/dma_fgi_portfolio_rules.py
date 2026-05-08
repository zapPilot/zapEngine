"""Flat portfolio-level DMA/FGI rule strategy.

Rules are evaluated first-match-wins by explicit priority:
cross-down exit, cross-up equal-weight, ETH/BTC ratio rotation,
DMA overextension DCA sell, extreme-fear DCA buy, then FGI downshift DCA sell.
If different assets emit cross-up and cross-down on the same day, cross-down
exits win and the cross-up rebalance can be reconsidered on the next eligible
day.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping
from dataclasses import dataclass, field, replace
from datetime import date
from typing import Any, TypeVar

from pydantic import JsonValue

from src.services.backtesting.composition_types import DecisionPolicy
from src.services.backtesting.constants import (
    STRATEGY_DISPLAY_NAMES,
    STRATEGY_DMA_FGI_PORTFOLIO_RULES,
)
from src.services.backtesting.decision import AllocationIntent
from src.services.backtesting.execution.rule_based.allocation_executor import (
    RuleBasedAllocationExecutor,
)
from src.services.backtesting.portfolio_rules import (
    DEFAULT_PORTFOLIO_RULES,
    RULE_NAMES,
)
from src.services.backtesting.portfolio_rules.base import (
    PORTFOLIO_RULE_SYMBOLS,
    PortfolioRule,
    PortfolioRuleConfig,
    PortfolioSnapshot,
    current_fgi_regime_for_symbol,
    current_target,
    rule_cooldown_remaining_days,
    signals_consulted_for_symbols,
    symbols_for_snapshot,
)
from src.services.backtesting.portfolio_rules.cross_down_exit import CrossDownExitRule
from src.services.backtesting.portfolio_rules.eth_btc_ratio_rotation import (
    EthBtcRatioRotationRule,
)
from src.services.backtesting.portfolio_rules.extreme_fear_dca_buy import (
    ExtremeFearDcaBuyRule,
)
from src.services.backtesting.public_params import runtime_params_to_public_params
from src.services.backtesting.risk import (
    RiskGuard,
    RiskGuardResult,
    TradeQuotaGuard,
)
from src.services.backtesting.signals.dma_gated_fgi.types import DmaMarketState
from src.services.backtesting.sizing import FgiExponentialSizing
from src.services.backtesting.strategies.base import StrategyContext
from src.services.backtesting.strategies.composed_signal import ComposedSignalStrategy
from src.services.backtesting.strategies.dma_gated_fgi import DmaGatedFgiParams
from src.services.backtesting.strategies.minimum import (
    FlatMinimumSignalComponent,
    FlatMinimumState,
    build_initial_flat_minimum_asset_allocation,
)

PORTFOLIO_RULES_SIGNAL_ID = "dma_fgi_portfolio_rules_signal"
_RULE_PRIORITY_BY_NAME = {rule.name: rule.priority for rule in DEFAULT_PORTFOLIO_RULES}
_RuleT = TypeVar("_RuleT", bound=PortfolioRule)


@dataclass(frozen=True)
class RuleExecutionState:
    last_trade_date: date | None = None
    trade_dates: tuple[date, ...] = ()


@dataclass
class DmaFgiPortfolioRulesDecisionPolicy(DecisionPolicy):
    """Decision policy that evaluates whole-portfolio rules."""

    decision_policy_id: str = "dma_fgi_portfolio_rules_policy"
    rules: tuple[PortfolioRule, ...] = DEFAULT_PORTFOLIO_RULES
    risk_guards: tuple[RiskGuard, ...] = ()
    config: PortfolioRuleConfig = field(default_factory=PortfolioRuleConfig)
    disabled_rules: frozenset[str] = frozenset()
    execution_state_provider: Callable[[], RuleExecutionState] | None = None
    _previous_fgi_regime: dict[str, str] = field(default_factory=dict, init=False)
    _cycle_open_per_symbol: dict[str, bool] = field(default_factory=dict, init=False)
    _rule_last_executed_at: dict[str, date] = field(default_factory=dict, init=False)
    _last_trade_date: date | None = field(default=None, init=False)
    _trade_dates: list[date] = field(default_factory=list, init=False)

    def __post_init__(self) -> None:
        invalid_rules = sorted(self.disabled_rules - RULE_NAMES)
        if invalid_rules:
            joined = ", ".join(invalid_rules)
            raise ValueError(f"Unsupported portfolio rule names: {joined}")

    def reset(self) -> None:
        self._previous_fgi_regime = {}
        self._cycle_open_per_symbol = {}
        self._rule_last_executed_at = {}
        self._last_trade_date = None
        self._trade_dates = []
        for component in (*self.rules, *self.risk_guards):
            reset = getattr(component, "reset", None)
            if callable(reset):
                reset()

    def decide(self, snapshot: FlatMinimumState) -> AllocationIntent:
        execution_state = self._resolve_execution_state()
        portfolio_snapshot = build_portfolio_snapshot(
            snapshot,
            previous_fgi_regime=self._previous_fgi_regime,
            cycle_open_per_symbol=self._cycle_open_per_symbol,
            last_trade_date=execution_state.last_trade_date,
            trade_dates=execution_state.trade_dates,
        )
        self._observe_components(portfolio_snapshot)
        intent = resolve_portfolio_rules_intent(
            portfolio_snapshot,
            rules=self.rules,
            config=self.config,
            disabled_rules=self.disabled_rules,
            rule_last_executed_at=self._rule_last_executed_at,
        )
        risk_result = _apply_risk_guards(
            intent,
            portfolio_snapshot,
            risk_guards=self.risk_guards,
            config=self.config,
        )
        intent = risk_result.intent
        self._previous_fgi_regime = _current_fgi_regime_by_symbol(portfolio_snapshot)
        self._cycle_open_per_symbol = _update_cycle_state(
            self._cycle_open_per_symbol,
            portfolio_snapshot,
        )
        self._record_intent(intent)
        if self.execution_state_provider is None and intent.action != "hold":
            self._last_trade_date = snapshot.current_date
            if snapshot.current_date is not None:
                self._trade_dates.append(snapshot.current_date)
        return intent

    def _resolve_execution_state(self) -> RuleExecutionState:
        if self.execution_state_provider is not None:
            return self.execution_state_provider()
        return RuleExecutionState(
            last_trade_date=self._last_trade_date,
            trade_dates=tuple(self._trade_dates),
        )

    def _observe_components(self, snapshot: PortfolioSnapshot) -> None:
        for component in (*self.rules, *self.risk_guards):
            observe = getattr(component, "observe", None)
            if callable(observe):
                observe(snapshot, config=self.config)

    def _record_intent(self, intent: AllocationIntent) -> None:
        for component in (*self.rules, *self.risk_guards):
            record_intent = getattr(component, "record_intent", None)
            if callable(record_intent):
                record_intent(intent)

    def record_execution(
        self,
        *,
        context: StrategyContext,
        intent: AllocationIntent,
        execution: Any,
    ) -> None:
        if not getattr(execution, "transfers", ()):
            return
        matched_rule = _matched_rule_name(intent)
        if matched_rule is None:
            return
        if matched_rule not in {rule.name for rule in self.rules}:
            return
        self._rule_last_executed_at[matched_rule] = context.date


@dataclass
class DmaFgiPortfolioRulesStrategy(ComposedSignalStrategy):
    """Canonical flat SPY/BTC/ETH portfolio-rule strategy."""

    total_capital: float
    signal_id: str = PORTFOLIO_RULES_SIGNAL_ID
    summary_signal_id: str | None = PORTFOLIO_RULES_SIGNAL_ID
    params: DmaGatedFgiParams | dict[str, Any] = field(
        default_factory=DmaGatedFgiParams
    )
    signal_component: FlatMinimumSignalComponent = field(init=False, repr=False)
    decision_policy: DmaFgiPortfolioRulesDecisionPolicy = field(
        init=False,
        repr=False,
    )
    execution_engine: RuleBasedAllocationExecutor = field(init=False, repr=False)
    public_params: dict[str, Any] = field(default_factory=dict)
    strategy_id: str = STRATEGY_DMA_FGI_PORTFOLIO_RULES
    display_name: str = STRATEGY_DISPLAY_NAMES[STRATEGY_DMA_FGI_PORTFOLIO_RULES]
    canonical_strategy_id: str = STRATEGY_DMA_FGI_PORTFOLIO_RULES
    disabled_rules: frozenset[str] = frozenset()
    use_adaptive_sizing: bool = True
    initial_spot_asset: str = "BTC"
    initial_asset_allocation: dict[str, float] | None = None

    def __post_init__(self) -> None:
        resolved_params = (
            self.params
            if isinstance(self.params, DmaGatedFgiParams)
            else DmaGatedFgiParams.from_public_params(self.params)
        )
        invalid_rules = sorted(self.disabled_rules - RULE_NAMES)
        if invalid_rules:
            joined = ", ".join(invalid_rules)
            raise ValueError(f"Unsupported portfolio rule names: {joined}")

        self.params = resolved_params
        self.execution_engine = RuleBasedAllocationExecutor()
        rules = build_portfolio_rules_for_params(resolved_params)
        if self.use_adaptive_sizing:
            rules = _with_adaptive_extreme_fear_sizing(rules)
        self.decision_policy = DmaFgiPortfolioRulesDecisionPolicy(
            disabled_rules=self.disabled_rules,
            rules=rules,
            risk_guards=build_risk_guards_for_params(resolved_params),
            config=PortfolioRuleConfig(emit_signals_consulted=True),
            execution_state_provider=lambda: RuleExecutionState(
                last_trade_date=self.execution_engine.last_trade_date,
                trade_dates=tuple(self.execution_engine.trade_dates),
            ),
        )
        cross_down_rule = _required_rule(rules, CrossDownExitRule)
        ratio_rule = _required_rule(rules, EthBtcRatioRotationRule)
        self.signal_component = FlatMinimumSignalComponent(
            config=resolved_params.build_signal_config(),
            signal_id=self.signal_id,
            ratio_cross_cooldown_days=ratio_rule.cooldown_days,
            cross_down_cooldown_days_by_symbol={
                symbol: cross_down_rule.cooldown_days_for(symbol)
                for symbol in PORTFOLIO_RULE_SYMBOLS
            },
        )
        self.public_params = {
            "signal_id": self.signal_id,
            **runtime_params_to_public_params(
                STRATEGY_DMA_FGI_PORTFOLIO_RULES,
                resolved_params.to_public_params(),
            ),
        }

    def initialize(
        self,
        portfolio: Any,
        config: Any,
        context: StrategyContext,
    ) -> None:
        self.decision_policy.reset()
        super().initialize(portfolio, config, context)

    def feature_summary(self) -> dict[str, Any]:
        return {
            "policy": "DmaFgiPortfolioRulesStrategy",
            "active_features": [
                "portfolio_level_rules",
                "cross_down_asset_exit",
                "eth_btc_ratio_rotation",
                "cross_up_equal_weight",
                "extreme_fear_dca_buy",
                "dma_overextension_dca_sell",
                "fgi_downshift_dca_sell",
            ],
            "hierarchical_layers": False,
            "ratio_rotation": True,
            "research_only": True,
        }

    def parameters(self) -> dict[str, Any]:
        return {
            **self.public_params,
            "disabled_rules": sorted(self.disabled_rules),
            "use_adaptive_sizing": self.use_adaptive_sizing,
            "feature_summary": self.feature_summary(),
        }


def build_initial_portfolio_rules_asset_allocation(
    *,
    aggregate_allocation: Mapping[str, float],
    extra_data: Mapping[str, Any] | None,
    price_map: Mapping[str, float] | None,
    primary_price: float | None = None,
) -> dict[str, float]:
    return build_initial_flat_minimum_asset_allocation(
        aggregate_allocation=aggregate_allocation,
        extra_data=extra_data,
        price_map=price_map,
        primary_price=primary_price,
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


def build_portfolio_rules_for_params(
    params: DmaGatedFgiParams,
) -> tuple[PortfolioRule, ...]:
    del params
    rules: list[PortfolioRule] = list(DEFAULT_PORTFOLIO_RULES)
    return tuple(sorted(rules, key=lambda rule: rule.priority))


def _with_adaptive_extreme_fear_sizing(
    rules: tuple[PortfolioRule, ...],
) -> tuple[PortfolioRule, ...]:
    return tuple(
        replace(rule, sizing=FgiExponentialSizing(max_multiplier=1.1))
        if isinstance(rule, ExtremeFearDcaBuyRule)
        else rule
        for rule in rules
    )


def _required_rule(
    rules: tuple[PortfolioRule, ...],
    rule_type: type[_RuleT],
) -> _RuleT:
    for rule in rules:
        if isinstance(rule, rule_type):
            return rule
    raise ValueError(f"Missing required portfolio rule: {rule_type.__name__}")


def build_risk_guards_for_params(
    params: DmaGatedFgiParams,
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
            return RiskGuardResult(intent=replacement, blocked_by=guard.name)
    return RiskGuardResult(intent=intent)


def _matched_rule_priority(intent: AllocationIntent) -> int | None:
    matched_rule = _matched_rule_name(intent)
    if matched_rule is None:
        return None
    return _RULE_PRIORITY_BY_NAME.get(matched_rule)


def _matched_rule_name(intent: AllocationIntent) -> str | None:
    diagnostics = intent.diagnostics or {}
    matched_rule = diagnostics.get("matched_rule_name")
    return matched_rule if isinstance(matched_rule, str) else None


def resolve_portfolio_rules_intent(
    snapshot: PortfolioSnapshot,
    *,
    rules: tuple[PortfolioRule, ...] = DEFAULT_PORTFOLIO_RULES,
    config: PortfolioRuleConfig | None = None,
    disabled_rules: frozenset[str] = frozenset(),
    rule_last_executed_at: Mapping[str, date] | None = None,
) -> AllocationIntent:
    resolved_config = config or PortfolioRuleConfig()
    last_executed = dict(rule_last_executed_at or {})
    cooldown_skipped_rules: list[dict[str, object]] = []
    for rule in rules:
        if rule.name in disabled_rules:
            continue
        if rule.matches(snapshot, config=resolved_config):
            cooldown = _rule_cooldown_diagnostic(
                rule,
                snapshot=snapshot,
                last_executed_at=last_executed.get(rule.name),
            )
            if cooldown is not None:
                cooldown_skipped_rules.append(cooldown)
                continue
            intent = rule.build_intent(snapshot, config=resolved_config)
            diagnostics = dict(intent.diagnostics or {})
            diagnostics.setdefault("matched_rule_name", rule.name)
            if cooldown_skipped_rules:
                diagnostics["cooldown_skipped_rules"] = cooldown_skipped_rules
            return replace(intent, diagnostics=diagnostics)
    return AllocationIntent(
        action="hold",
        target_allocation=current_target(snapshot),
        allocation_name=None,
        immediate=False,
        reason="regime_no_signal",
        rule_group="none",
        decision_score=0.0,
        diagnostics={
            "matched_rule_name": "regime_no_signal_hold",
            **(
                {"cooldown_skipped_rules": cooldown_skipped_rules}
                if cooldown_skipped_rules
                else {}
            ),
            **(
                {
                    "signals_consulted": signals_consulted_for_symbols(
                        snapshot,
                        tuple(symbols_for_snapshot(snapshot)),
                    )
                }
                if resolved_config.emit_signals_consulted
                else {}
            ),
        },
    )


def _rule_cooldown_diagnostic(
    rule: PortfolioRule,
    *,
    snapshot: PortfolioSnapshot,
    last_executed_at: date | None,
) -> dict[str, object] | None:
    remaining_days = rule_cooldown_remaining_days(
        cooldown_days=rule.cooldown_days,
        last_executed_at=last_executed_at,
        current_date=snapshot.current_date,
    )
    if remaining_days <= 0 or last_executed_at is None:
        return None
    return {
        "rule": rule.name,
        "last_executed_at": last_executed_at.isoformat(),
        "cooldown_days": max(0, int(rule.cooldown_days)),
        "remaining_days": remaining_days,
    }


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
    for symbol, state in snapshot.assets.items():
        event = state.actionable_cross_event
        if event == "cross_down":
            updated[symbol] = True
        elif event == "cross_up":
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


def default_dma_fgi_portfolio_rules_params() -> dict[str, JsonValue]:
    return DmaGatedFgiParams().to_public_params()


__all__ = [
    "PORTFOLIO_RULES_SIGNAL_ID",
    "DmaFgiPortfolioRulesDecisionPolicy",
    "DmaFgiPortfolioRulesStrategy",
    "RuleExecutionState",
    "build_initial_portfolio_rules_asset_allocation",
    "build_portfolio_snapshot",
    "build_portfolio_rules_for_params",
    "build_risk_guards_for_params",
    "default_dma_fgi_portfolio_rules_params",
    "resolve_portfolio_rules_intent",
]
