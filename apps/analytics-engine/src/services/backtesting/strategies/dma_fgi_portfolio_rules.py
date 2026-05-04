"""Flat portfolio-level DMA/FGI rule strategy.

Rules are evaluated first-match-wins by explicit priority:
cross-down exit, cross-up equal-weight, extreme-fear DCA buy, DMA
overextension DCA sell, then FGI downshift DCA sell. If different assets emit
cross-up and cross-down on the same day, cross-down exits win and the cross-up
rebalance can be reconsidered on the next eligible day.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field, replace
from typing import Any

from pydantic import JsonValue

from src.services.backtesting.composition_types import DecisionPolicy
from src.services.backtesting.constants import (
    STRATEGY_DISPLAY_NAMES,
    STRATEGY_DMA_FGI_PORTFOLIO_RULES,
)
from src.services.backtesting.decision import AllocationIntent
from src.services.backtesting.execution.allocation_intent_executor import (
    AllocationIntentExecutor,
)
from src.services.backtesting.portfolio_rules import (
    DEFAULT_PORTFOLIO_RULES,
    RULE_NAMES,
)
from src.services.backtesting.portfolio_rules.base import (
    PortfolioRule,
    PortfolioRuleConfig,
    PortfolioSnapshot,
    current_fgi_regime_for_symbol,
    current_target,
    symbols_for_snapshot,
)
from src.services.backtesting.public_params import runtime_params_to_public_params
from src.services.backtesting.signals.dma_gated_fgi.types import DmaMarketState
from src.services.backtesting.strategies.base import StrategyContext
from src.services.backtesting.strategies.composed_signal import ComposedSignalStrategy
from src.services.backtesting.strategies.dma_gated_fgi import DmaGatedFgiParams
from src.services.backtesting.strategies.minimum import (
    FlatMinimumSignalComponent,
    FlatMinimumState,
    build_initial_flat_minimum_asset_allocation,
)

PORTFOLIO_RULES_SIGNAL_ID = "dma_fgi_portfolio_rules_signal"


@dataclass
class DmaFgiPortfolioRulesDecisionPolicy(DecisionPolicy):
    """Decision policy that evaluates whole-portfolio rules."""

    decision_policy_id: str = "dma_fgi_portfolio_rules_policy"
    rules: tuple[PortfolioRule, ...] = DEFAULT_PORTFOLIO_RULES
    config: PortfolioRuleConfig = field(default_factory=PortfolioRuleConfig)
    disabled_rules: frozenset[str] = frozenset()
    _previous_fgi_regime: dict[str, str] = field(default_factory=dict, init=False)
    _cycle_open_per_symbol: dict[str, bool] = field(default_factory=dict, init=False)

    def __post_init__(self) -> None:
        invalid_rules = sorted(self.disabled_rules - RULE_NAMES)
        if invalid_rules:
            joined = ", ".join(invalid_rules)
            raise ValueError(f"Unsupported portfolio rule names: {joined}")

    def reset(self) -> None:
        self._previous_fgi_regime = {}
        self._cycle_open_per_symbol = {}

    def decide(self, snapshot: FlatMinimumState) -> AllocationIntent:
        portfolio_snapshot = build_portfolio_snapshot(
            snapshot,
            previous_fgi_regime=self._previous_fgi_regime,
            cycle_open_per_symbol=self._cycle_open_per_symbol,
        )
        intent = resolve_portfolio_rules_intent(
            portfolio_snapshot,
            rules=self.rules,
            config=self.config,
            disabled_rules=self.disabled_rules,
        )
        self._previous_fgi_regime = _current_fgi_regime_by_symbol(portfolio_snapshot)
        self._cycle_open_per_symbol = _update_cycle_state(
            self._cycle_open_per_symbol,
            portfolio_snapshot,
        )
        return intent


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
    execution_engine: AllocationIntentExecutor = field(init=False, repr=False)
    public_params: dict[str, Any] = field(default_factory=dict)
    strategy_id: str = STRATEGY_DMA_FGI_PORTFOLIO_RULES
    display_name: str = STRATEGY_DISPLAY_NAMES[STRATEGY_DMA_FGI_PORTFOLIO_RULES]
    canonical_strategy_id: str = STRATEGY_DMA_FGI_PORTFOLIO_RULES
    disabled_rules: frozenset[str] = frozenset()
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
        self.signal_component = FlatMinimumSignalComponent(
            config=resolved_params.build_signal_config(),
            signal_id=self.signal_id,
        )
        self.decision_policy = DmaFgiPortfolioRulesDecisionPolicy(
            disabled_rules=self.disabled_rules
        )
        self.execution_engine = AllocationIntentExecutor(
            pacing_policy=resolved_params.build_pacing_policy(),
            plugins=resolved_params.build_execution_plugins(),
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
    )


def resolve_portfolio_rules_intent(
    snapshot: PortfolioSnapshot,
    *,
    rules: tuple[PortfolioRule, ...] = DEFAULT_PORTFOLIO_RULES,
    config: PortfolioRuleConfig | None = None,
    disabled_rules: frozenset[str] = frozenset(),
) -> AllocationIntent:
    resolved_config = config or PortfolioRuleConfig()
    for rule in rules:
        if rule.name in disabled_rules:
            continue
        if rule.matches(snapshot, config=resolved_config):
            intent = rule.build_intent(snapshot, config=resolved_config)
            diagnostics = dict(intent.diagnostics or {})
            diagnostics.setdefault("matched_rule_name", rule.name)
            return replace(intent, diagnostics=diagnostics)
    return AllocationIntent(
        action="hold",
        target_allocation=current_target(snapshot),
        allocation_name=None,
        immediate=False,
        reason="regime_no_signal",
        rule_group="none",
        decision_score=0.0,
        diagnostics={"matched_rule_name": "regime_no_signal_hold"},
    )


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
    "build_initial_portfolio_rules_asset_allocation",
    "build_portfolio_snapshot",
    "default_dma_fgi_portfolio_rules_params",
    "resolve_portfolio_rules_intent",
]
