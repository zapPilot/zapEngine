"""Research-only flat SPY/BTC/ETH minimum DMA baseline."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field, replace
from datetime import date
from typing import Any

from src.services.backtesting.composition_types import (
    DecisionPolicy,
    StatefulSignalComponent,
)
from src.services.backtesting.constants import (
    STRATEGY_DISPLAY_NAMES,
    STRATEGY_DMA_FGI_FLAT_MINIMUM,
)
from src.services.backtesting.decision import (
    AllocationIntent,
    RuleGroup,
)
from src.services.backtesting.domain import (
    DmaSignalDiagnostics,
    RatioSignalDiagnostics,
    SignalObservation,
)
from src.services.backtesting.execution.allocation_intent_executor import (
    AllocationIntentExecutor,
)
from src.services.backtesting.execution.contracts import ExecutionHints
from src.services.backtesting.execution.pacing.base import compute_dma_buy_strength
from src.services.backtesting.features import (
    DMA_200_FEATURE,
    DMA_ASSET_FEATURE,
    ETH_BTC_RATIO_DMA_200_FEATURE,
    ETH_BTC_RATIO_FEATURE,
    ETH_DMA_200_FEATURE,
    SPY_DMA_200_FEATURE,
    MarketDataRequirements,
)
from src.services.backtesting.public_params import runtime_params_to_public_params
from src.services.backtesting.signals.dma_gated_fgi.config import DmaGatedFgiConfig
from src.services.backtesting.signals.dma_gated_fgi.types import (
    BlockedZone,
    DmaCooldownState,
    DmaMarketState,
    Zone,
)
from src.services.backtesting.signals.ratio_state import (
    EthBtcRatioState,
    classify_ratio_zone,
    detect_ratio_cross,
)
from src.services.backtesting.strategies.base import StrategyContext
from src.services.backtesting.strategies.composed_signal import ComposedSignalStrategy
from src.services.backtesting.strategies.dma_gated_fgi import (
    DmaGatedFgiDecisionPolicy,
    DmaGatedFgiParams,
    DmaGatedFgiSignalComponent,
)
from src.services.backtesting.target_allocation import (
    normalize_target_allocation,
    target_from_current_allocation,
)

FLAT_MINIMUM_SIGNAL_ID = "dma_fgi_flat_minimum_signal"
_MINIMUM_DISABLED_RULES = frozenset({"above_greed_sell", "below_fear_recovering_buy"})
_DMA_SELL_RULE_GROUPS: frozenset[RuleGroup] = frozenset({"cross", "dma_fgi", "ath"})
_DMA_BUY_RULE_GROUPS: frozenset[RuleGroup] = frozenset({"cross", "dma_fgi"})
_RATIO_ROTATION_ALLOCATION_PREFIX = "portfolio_eth_btc_ratio_rotation_"
_EPSILON = 1e-9


@dataclass(frozen=True)
class FlatMinimumAssetSpec:
    symbol: str
    allocation_key: str
    price_key: str
    dma_feature_key: str


_ASSET_SPECS: tuple[FlatMinimumAssetSpec, ...] = (
    FlatMinimumAssetSpec(
        symbol="SPY",
        allocation_key="spy",
        price_key="spy",
        dma_feature_key=SPY_DMA_200_FEATURE,
    ),
    FlatMinimumAssetSpec(
        symbol="BTC",
        allocation_key="btc",
        price_key="btc",
        dma_feature_key=DMA_200_FEATURE,
    ),
    FlatMinimumAssetSpec(
        symbol="ETH",
        allocation_key="eth",
        price_key="eth",
        dma_feature_key=ETH_DMA_200_FEATURE,
    ),
)


@dataclass(frozen=True)
class FlatMinimumState:
    spy_dma_state: DmaMarketState | None
    btc_dma_state: DmaMarketState | None
    eth_dma_state: DmaMarketState | None
    current_asset_allocation: dict[str, float]
    eth_btc_ratio_state: EthBtcRatioState | None = None

    def dma_state_for(self, allocation_key: str) -> DmaMarketState | None:
        if allocation_key == "spy":
            return self.spy_dma_state
        if allocation_key == "btc":
            return self.btc_dma_state
        if allocation_key == "eth":
            return self.eth_dma_state
        raise ValueError(f"Unsupported flat-minimum asset '{allocation_key}'")


@dataclass
class FlatMinimumSignalComponent(StatefulSignalComponent):
    """Three independent DMA signals for the flat minimum baseline."""

    config: DmaGatedFgiConfig = field(default_factory=DmaGatedFgiConfig)
    ratio_cross_cooldown_days: int = 30
    signal_id: str = FLAT_MINIMUM_SIGNAL_ID
    market_data_requirements: MarketDataRequirements = field(
        default_factory=lambda: MarketDataRequirements(
            requires_sentiment=True,
            required_price_features=frozenset(
                {
                    DMA_200_FEATURE,
                    ETH_BTC_RATIO_DMA_200_FEATURE,
                    ETH_BTC_RATIO_FEATURE,
                    ETH_DMA_200_FEATURE,
                    SPY_DMA_200_FEATURE,
                }
            ),
        )
    )
    warmup_lookback_days: int = 14
    _spy_dma_signal: DmaGatedFgiSignalComponent = field(init=False, repr=False)
    _btc_dma_signal: DmaGatedFgiSignalComponent = field(init=False, repr=False)
    _eth_dma_signal: DmaGatedFgiSignalComponent = field(init=False, repr=False)
    _last_ratio_zone: Zone | None = field(default=None, init=False, repr=False)
    _ratio_cooldown_remaining: int = field(default=0, init=False, repr=False)
    _ratio_cooldown_blocked_zone: BlockedZone | None = field(
        default=None,
        init=False,
        repr=False,
    )

    def __post_init__(self) -> None:
        self._spy_dma_signal = self._build_dma_signal()
        self._btc_dma_signal = self._build_dma_signal()
        self._eth_dma_signal = self._build_dma_signal()

    def reset(self) -> None:
        self._spy_dma_signal.reset()
        self._btc_dma_signal.reset()
        self._eth_dma_signal.reset()
        self._last_ratio_zone = None
        self._ratio_cooldown_remaining = 0
        self._ratio_cooldown_blocked_zone = None

    def initialize(self, context: StrategyContext) -> None:
        for spec in _ASSET_SPECS:
            asset_context = _build_asset_dma_context(context, spec)
            if asset_context is not None:
                self._signal_for(spec.allocation_key).initialize(asset_context)
        self._last_ratio_zone = _ratio_zone_from_context(context)

    def warmup(self, context: StrategyContext) -> None:
        for spec in _ASSET_SPECS:
            asset_context = _build_asset_dma_context(context, spec)
            if asset_context is not None:
                self._signal_for(spec.allocation_key).warmup(asset_context)
        self._last_ratio_zone = _ratio_zone_from_context(context)

    def observe(self, context: StrategyContext) -> FlatMinimumState:
        ratio_state = self._observe_ratio_state(context)
        snapshot = FlatMinimumState(
            spy_dma_state=self._observe_asset(context, _ASSET_SPECS[0]),
            btc_dma_state=self._observe_asset(context, _ASSET_SPECS[1]),
            eth_dma_state=self._observe_asset(context, _ASSET_SPECS[2]),
            current_asset_allocation=target_from_current_allocation(
                context.portfolio.asset_allocation_percentages(context.portfolio_price)
            ),
            eth_btc_ratio_state=ratio_state,
        )
        self._decrement_ratio_cooldown()
        return snapshot

    def apply_intent(
        self,
        *,
        current_date: date,
        snapshot: FlatMinimumState,
        intent: AllocationIntent,
    ) -> FlatMinimumState:
        selected_assets = _selected_dma_assets(intent)
        committed: dict[str, DmaMarketState | None] = {}
        for spec in _ASSET_SPECS:
            state = snapshot.dma_state_for(spec.allocation_key)
            if state is None:
                committed[spec.allocation_key] = None
                continue
            commit_intent = (
                intent
                if spec.symbol in selected_assets
                else _hold_commit_intent(intent)
            )
            committed[spec.allocation_key] = self._signal_for(
                spec.allocation_key
            ).apply_intent(
                current_date=current_date,
                snapshot=state,
                intent=commit_intent,
            )
        ratio_state = snapshot.eth_btc_ratio_state
        if ratio_state is not None:
            self._last_ratio_zone = ratio_state.zone
        updated_snapshot = replace(
            snapshot,
            spy_dma_state=committed["spy"],
            btc_dma_state=committed["btc"],
            eth_dma_state=committed["eth"],
        )
        if _is_ratio_rotation_intent(intent) and ratio_state is not None:
            self._start_ratio_cooldown(ratio_state.cross_event)
            updated_snapshot = replace(
                updated_snapshot,
                eth_btc_ratio_state=replace(
                    ratio_state,
                    cooldown_state=self._ratio_cooldown_state(),
                ),
            )
        return updated_snapshot

    def build_signal_observation(
        self,
        *,
        snapshot: FlatMinimumState,
        intent: AllocationIntent,
    ) -> SignalObservation:
        selected = _select_observation_state(snapshot, intent)
        selected_state = selected[1]
        return SignalObservation(
            signal_id=self.signal_id,
            regime="neutral" if selected_state is None else selected_state.fgi_regime,
            confidence=1.0,
            raw_value=None if selected_state is None else selected_state.fgi_value,
            ath_event=None if selected_state is None else selected_state.ath_event,
            dma=_convert_dma_to_diagnostics(selected_state, selected[0]),
            spy_dma=_convert_dma_to_diagnostics(snapshot.spy_dma_state, "SPY"),
            ratio=_convert_ratio_to_diagnostics(snapshot.eth_btc_ratio_state),
        )

    def build_execution_hints(
        self,
        *,
        snapshot: FlatMinimumState,
        intent: AllocationIntent,
        signal_confidence: float,
    ) -> ExecutionHints:
        _symbol, selected_state = _select_observation_state(snapshot, intent)
        enable_buy_gate = intent.action == "buy" and selected_state is not None
        return ExecutionHints(
            signal_id=self.signal_id,
            current_regime=(
                "neutral" if selected_state is None else selected_state.fgi_regime
            ),
            signal_value=None if selected_state is None else selected_state.fgi_value,
            signal_confidence=float(signal_confidence),
            decision_score=intent.decision_score,
            decision_action=intent.action,
            dma_distance=(
                None if selected_state is None else selected_state.dma_distance
            ),
            fgi_slope=None if selected_state is None else selected_state.fgi_slope,
            buy_strength=(
                None
                if not enable_buy_gate or selected_state is None
                else compute_dma_buy_strength(selected_state.dma_distance)
            ),
            enable_buy_gate=enable_buy_gate,
            reset_buy_gate=intent.rule_group == "cross",
        )

    def _build_dma_signal(self) -> DmaGatedFgiSignalComponent:
        return DmaGatedFgiSignalComponent(
            config=self.config,
            market_data_requirements=MarketDataRequirements(
                requires_sentiment=True,
                required_price_features=frozenset({DMA_200_FEATURE}),
            ),
            warmup_lookback_days=self.warmup_lookback_days,
        )

    def _observe_ratio_state(
        self,
        context: StrategyContext,
    ) -> EthBtcRatioState | None:
        ratio, ratio_dma_200 = _ratio_values_from_context(context)
        ratio_zone = classify_ratio_zone(ratio=ratio, ratio_dma=ratio_dma_200)
        if ratio is None or ratio_dma_200 is None or ratio_zone is None:
            return None
        cross_event = detect_ratio_cross(
            prev_zone=self._last_ratio_zone,
            current_zone=ratio_zone,
            cross_on_touch=self.config.cross_on_touch,
        )
        cooldown_state = self._ratio_cooldown_state()
        return EthBtcRatioState(
            ratio=ratio,
            ratio_dma_200=ratio_dma_200,
            zone=ratio_zone,
            cross_event=cross_event,
            actionable_cross_event=None if cooldown_state.active else cross_event,
            cooldown_state=cooldown_state,
        )

    def _ratio_cooldown_state(self) -> DmaCooldownState:
        active = (
            self._ratio_cooldown_remaining > 0
            and self._ratio_cooldown_blocked_zone is not None
        )
        return DmaCooldownState(
            active=active,
            remaining_days=self._ratio_cooldown_remaining if active else 0,
            blocked_zone=self._ratio_cooldown_blocked_zone if active else None,
        )

    def _decrement_ratio_cooldown(self) -> None:
        if self._ratio_cooldown_remaining <= 0:
            self._ratio_cooldown_remaining = 0
            self._ratio_cooldown_blocked_zone = None
            return
        self._ratio_cooldown_remaining -= 1
        if self._ratio_cooldown_remaining <= 0:
            self._ratio_cooldown_blocked_zone = None

    def _start_ratio_cooldown(self, cross_event: str | None) -> None:
        if cross_event is None:
            return
        self._ratio_cooldown_remaining = max(0, int(self.ratio_cross_cooldown_days))
        self._ratio_cooldown_blocked_zone = (
            "above" if cross_event == "cross_up" else "below"
        )

    def _signal_for(self, allocation_key: str) -> DmaGatedFgiSignalComponent:
        if allocation_key == "spy":
            return self._spy_dma_signal
        if allocation_key == "btc":
            return self._btc_dma_signal
        if allocation_key == "eth":
            return self._eth_dma_signal
        raise ValueError(f"Unsupported flat-minimum asset '{allocation_key}'")

    def _observe_asset(
        self,
        context: StrategyContext,
        spec: FlatMinimumAssetSpec,
    ) -> DmaMarketState | None:
        asset_context = _build_asset_dma_context(context, spec)
        if asset_context is None:
            return None
        return self._signal_for(spec.allocation_key).observe(asset_context)


@dataclass(frozen=True)
class FlatMinimumDecisionPolicy(DecisionPolicy):
    """Flat event-driven DMA policy across SPY, BTC, and ETH."""

    decision_policy_id: str = "flat_minimum_policy"
    dma_policy: DmaGatedFgiDecisionPolicy = field(
        default_factory=lambda: DmaGatedFgiDecisionPolicy(
            disabled_rules=_MINIMUM_DISABLED_RULES
        )
    )

    def decide(self, snapshot: FlatMinimumState) -> AllocationIntent:
        current = target_from_current_allocation(snapshot.current_asset_allocation)
        asset_intents = _resolve_asset_dma_intents(
            snapshot=snapshot,
            dma_policy=self.dma_policy,
        )
        sell_specs = [
            (spec, intent)
            for spec, intent in asset_intents
            if _is_flat_dma_sell_intent(intent)
        ]
        if sell_specs:
            return _build_flat_dma_intent(
                specs=sell_specs,
                target_allocation=_zero_sold_assets_to_stable(
                    current_allocation=current,
                    specs=sell_specs,
                ),
            )

        buy_specs = [
            (spec, intent)
            for spec, intent in asset_intents
            if _is_flat_dma_buy_intent(intent)
        ]
        if buy_specs:
            return _build_flat_dma_intent(
                specs=buy_specs,
                target_allocation=_redeploy_stable_to_buy_assets(
                    current_allocation=current,
                    specs=buy_specs,
                ),
            )

        return AllocationIntent(
            action="hold",
            target_allocation=current,
            allocation_name=None,
            immediate=False,
            reason="regime_no_signal",
            rule_group="none",
            decision_score=0.0,
            diagnostics={"flat_dma_assets": []},
        )


@dataclass
class FlatMinimumStrategy(ComposedSignalStrategy):
    """Flat event-driven DMA baseline across SPY, BTC, ETH, and stable."""

    total_capital: float
    signal_id: str = FLAT_MINIMUM_SIGNAL_ID
    summary_signal_id: str | None = FLAT_MINIMUM_SIGNAL_ID
    params: DmaGatedFgiParams | dict[str, Any] = field(
        default_factory=DmaGatedFgiParams
    )
    signal_component: StatefulSignalComponent = field(init=False, repr=False)
    decision_policy: DecisionPolicy = field(init=False, repr=False)
    execution_engine: AllocationIntentExecutor = field(init=False, repr=False)
    public_params: dict[str, Any] = field(default_factory=dict)
    strategy_id: str = STRATEGY_DMA_FGI_FLAT_MINIMUM
    display_name: str = STRATEGY_DISPLAY_NAMES[STRATEGY_DMA_FGI_FLAT_MINIMUM]
    canonical_strategy_id: str = STRATEGY_DMA_FGI_FLAT_MINIMUM
    initial_spot_asset: str = "BTC"
    initial_asset_allocation: dict[str, float] | None = None

    def __post_init__(self) -> None:
        if self.signal_id != FLAT_MINIMUM_SIGNAL_ID:
            raise ValueError(f"signal_id must be '{FLAT_MINIMUM_SIGNAL_ID}'")
        resolved_params = (
            self.params
            if isinstance(self.params, DmaGatedFgiParams)
            else DmaGatedFgiParams.from_public_params(self.params)
        )
        self.params = resolved_params
        self.signal_component = FlatMinimumSignalComponent(
            config=resolved_params.build_signal_config()
        )
        self.decision_policy = FlatMinimumDecisionPolicy()
        self.execution_engine = AllocationIntentExecutor(
            pacing_policy=resolved_params.build_pacing_policy(),
            plugins=resolved_params.build_execution_plugins(),
        )
        self.public_params = {
            "signal_id": self.signal_id,
            **runtime_params_to_public_params(
                STRATEGY_DMA_FGI_FLAT_MINIMUM,
                resolved_params.to_public_params(),
            ),
        }

    def feature_summary(self) -> dict[str, Any]:
        return {
            "policy": "FlatMinimumStrategy",
            "active_features": [
                "per_asset_dma_stable_gating",
                "greed_sell_suppression",
                "extreme_fear_stable_redeployment",
            ],
            "hierarchical_layers": False,
            "ratio_rotation": False,
            "research_only": True,
        }

    def parameters(self) -> dict[str, Any]:
        return {
            **self.public_params,
            "feature_summary": self.feature_summary(),
        }


def build_initial_flat_minimum_asset_allocation(
    *,
    aggregate_allocation: Mapping[str, float],
    extra_data: Mapping[str, Any] | None,
    price_map: Mapping[str, float] | None,
    primary_price: float | None = None,
) -> dict[str, float]:
    spot_share = max(0.0, float(aggregate_allocation.get("spot", 0.0)))
    stable_share = max(0.0, float(aggregate_allocation.get("stable", 0.0)))
    total = spot_share + stable_share
    if total <= 0.0:
        spot_share = 0.0
        stable_share = 1.0
    else:
        spot_share /= total
        stable_share /= total

    above_assets = [
        spec
        for spec in _ASSET_SPECS
        if _price_above_dma(
            spec=spec,
            extra_data={} if extra_data is None else extra_data,
            price_map={} if price_map is None else price_map,
            primary_price=primary_price,
        )
    ]
    if not above_assets:
        return normalize_target_allocation(
            {"btc": 0.0, "eth": 0.0, "spy": 0.0, "stable": 1.0, "alt": 0.0}
        )
    per_asset_share = spot_share / len(above_assets)
    target = {"btc": 0.0, "eth": 0.0, "spy": 0.0, "stable": stable_share, "alt": 0.0}
    for spec in above_assets:
        target[spec.allocation_key] = per_asset_share
    return normalize_target_allocation(target)


def _build_asset_dma_context(
    context: StrategyContext,
    spec: FlatMinimumAssetSpec,
) -> StrategyContext | None:
    price = _resolve_asset_price(context=context, spec=spec)
    if price is None or price <= 0.0:
        return None
    dma_value = context.extra_data.get(spec.dma_feature_key)
    if not isinstance(dma_value, int | float) or float(dma_value) <= 0.0:
        return None
    return replace(
        context,
        price=float(price),
        extra_data={
            **context.extra_data,
            DMA_200_FEATURE: float(dma_value),
            DMA_ASSET_FEATURE: spec.symbol,
        },
    )


def _resolve_asset_price(
    *,
    context: StrategyContext,
    spec: FlatMinimumAssetSpec,
) -> float | None:
    price = context.price_map.get(spec.price_key)
    if isinstance(price, int | float) and float(price) > 0.0:
        return float(price)
    if spec.price_key == "btc" and context.price > 0.0:
        return float(context.price)
    return None


def _price_above_dma(
    *,
    spec: FlatMinimumAssetSpec,
    extra_data: Mapping[str, Any],
    price_map: Mapping[str, float],
    primary_price: float | None,
) -> bool:
    price = price_map.get(spec.price_key)
    if not isinstance(price, int | float) and spec.price_key == "btc":
        price = primary_price
    dma_value = extra_data.get(spec.dma_feature_key)
    return (
        isinstance(price, int | float)
        and float(price) > 0.0
        and isinstance(dma_value, int | float)
        and float(dma_value) > 0.0
        and float(price) > float(dma_value)
    )


def _ratio_values_from_context(
    context: StrategyContext,
) -> tuple[float | None, float | None]:
    return (
        _coerce_optional_float(context.extra_data.get(ETH_BTC_RATIO_FEATURE)),
        _coerce_optional_float(context.extra_data.get(ETH_BTC_RATIO_DMA_200_FEATURE)),
    )


def _ratio_zone_from_context(context: StrategyContext) -> Zone | None:
    ratio, ratio_dma_200 = _ratio_values_from_context(context)
    return classify_ratio_zone(ratio=ratio, ratio_dma=ratio_dma_200)


def _coerce_optional_float(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, int | float):
        return float(value)
    return None


def _resolve_asset_dma_intents(
    *,
    snapshot: FlatMinimumState,
    dma_policy: DmaGatedFgiDecisionPolicy,
) -> list[tuple[FlatMinimumAssetSpec, AllocationIntent]]:
    resolved: list[tuple[FlatMinimumAssetSpec, AllocationIntent]] = []
    for spec in _ASSET_SPECS:
        state = snapshot.dma_state_for(spec.allocation_key)
        if state is None:
            continue
        resolved.append(
            (
                spec,
                _suppress_ath_sell_intent(
                    intent=dma_policy.decide(state),
                    snapshot=state,
                ),
            )
        )
    return resolved


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


def _is_flat_dma_sell_intent(intent: AllocationIntent) -> bool:
    return (
        intent.action == "sell"
        and intent.target_allocation is not None
        and intent.rule_group in _DMA_SELL_RULE_GROUPS
    )


def _is_flat_dma_buy_intent(intent: AllocationIntent) -> bool:
    return (
        intent.action == "buy"
        and intent.target_allocation is not None
        and intent.rule_group in _DMA_BUY_RULE_GROUPS
    )


def _zero_sold_assets_to_stable(
    *,
    current_allocation: Mapping[str, float],
    specs: list[tuple[FlatMinimumAssetSpec, AllocationIntent]],
) -> dict[str, float]:
    target = normalize_target_allocation(current_allocation)
    for spec, _intent in specs:
        released_share = max(0.0, float(target.get(spec.allocation_key, 0.0)))
        target[spec.allocation_key] = 0.0
        target["stable"] = max(0.0, float(target.get("stable", 0.0))) + released_share
    return normalize_target_allocation(target)


def _redeploy_stable_to_buy_assets(
    *,
    current_allocation: Mapping[str, float],
    specs: list[tuple[FlatMinimumAssetSpec, AllocationIntent]],
) -> dict[str, float]:
    target = normalize_target_allocation(current_allocation)
    if not specs:
        return target
    stable_share = max(0.0, float(target.get("stable", 0.0)))
    if stable_share <= _EPSILON:
        return target
    per_asset_share = stable_share / len(specs)
    for spec, _intent in specs:
        target[spec.allocation_key] = (
            max(0.0, float(target.get(spec.allocation_key, 0.0))) + per_asset_share
        )
    target["stable"] = 0.0
    return normalize_target_allocation(target)


def _build_flat_dma_intent(
    *,
    specs: list[tuple[FlatMinimumAssetSpec, AllocationIntent]],
    target_allocation: Mapping[str, float],
) -> AllocationIntent:
    primary_spec, primary_intent = min(
        specs,
        key=lambda spec: _dma_rule_priority(spec[1].rule_group),
    )
    reason = (
        primary_intent.reason
        if len(specs) == 1
        else "+".join(_asset_dma_reason(spec, intent) for spec, intent in specs)
    )
    allocation_name = (
        primary_intent.allocation_name
        if len(specs) == 1
        else "+".join(
            _asset_dma_allocation_name(spec, intent) for spec, intent in specs
        )
    )
    diagnostics: dict[str, Any] = {
        "flat_dma_asset": primary_spec.symbol,
        "flat_dma_assets": [spec.symbol for spec, _intent in specs],
        "flat_dma_asset_reasons": {
            spec.symbol: intent.reason for spec, intent in specs
        },
        "flat_dma_matched_rules": {
            spec.symbol: (intent.diagnostics or {}).get("matched_rule_name")
            for spec, intent in specs
        },
    }
    return AllocationIntent(
        action=primary_intent.action,
        target_allocation=normalize_target_allocation(target_allocation),
        allocation_name=allocation_name,
        immediate=any(intent.immediate for _spec, intent in specs),
        reason=reason,
        rule_group=primary_intent.rule_group,
        decision_score=primary_intent.decision_score,
        diagnostics=diagnostics,
    )


def _dma_rule_priority(rule_group: RuleGroup) -> int:
    if rule_group == "cross":
        return 0
    if rule_group == "dma_fgi":
        return 1
    if rule_group == "ath":
        return 2
    return 3


def _asset_dma_reason(
    spec: FlatMinimumAssetSpec,
    intent: AllocationIntent,
) -> str:
    return f"{spec.symbol.lower()}_{intent.reason}"


def _asset_dma_allocation_name(
    spec: FlatMinimumAssetSpec,
    intent: AllocationIntent,
) -> str:
    allocation_name = intent.allocation_name or intent.reason
    return f"{spec.symbol.lower()}_{allocation_name}"


def _selected_dma_assets(intent: AllocationIntent) -> frozenset[str]:
    diagnostics = intent.diagnostics or {}
    for key in ("flat_dma_assets", "portfolio_rule_assets"):
        assets = diagnostics.get(key)
        if isinstance(assets, list):
            return frozenset(asset for asset in assets if isinstance(asset, str))
    return frozenset()


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


def _is_ratio_rotation_intent(intent: AllocationIntent) -> bool:
    allocation_name = intent.allocation_name
    return isinstance(allocation_name, str) and allocation_name.startswith(
        _RATIO_ROTATION_ALLOCATION_PREFIX
    )


def _select_observation_state(
    snapshot: FlatMinimumState,
    intent: AllocationIntent,
) -> tuple[str, DmaMarketState | None]:
    selected_assets = _selected_dma_assets(intent)
    for spec in _ASSET_SPECS:
        if spec.symbol in selected_assets:
            return spec.symbol, snapshot.dma_state_for(spec.allocation_key)
    for spec in (_ASSET_SPECS[1], _ASSET_SPECS[0], _ASSET_SPECS[2]):
        state = snapshot.dma_state_for(spec.allocation_key)
        if state is not None:
            return spec.symbol, state
    return "BTC", None


def _convert_dma_to_diagnostics(
    dma_state: DmaMarketState | None,
    symbol: str,
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
        outer_dma_asset=symbol,
        outer_dma_action_unit=symbol,
        outer_dma_reference_asset=symbol,
    )


def _convert_ratio_to_diagnostics(
    ratio_state: EthBtcRatioState | None,
) -> RatioSignalDiagnostics | None:
    if ratio_state is None:
        return None
    distance = (
        None
        if ratio_state.ratio_dma_200 <= 0.0
        else (ratio_state.ratio - ratio_state.ratio_dma_200) / ratio_state.ratio_dma_200
    )
    return RatioSignalDiagnostics(
        ratio=ratio_state.ratio,
        ratio_dma_200=ratio_state.ratio_dma_200,
        distance=distance,
        zone=ratio_state.zone,
        cross_event=ratio_state.cross_event,
        cooldown_active=ratio_state.cooldown_state.active,
        cooldown_remaining_days=ratio_state.cooldown_state.remaining_days,
        cooldown_blocked_zone=ratio_state.cooldown_state.blocked_zone,
    )


__all__ = [
    "FLAT_MINIMUM_SIGNAL_ID",
    "FlatMinimumDecisionPolicy",
    "FlatMinimumSignalComponent",
    "FlatMinimumState",
    "FlatMinimumStrategy",
    "build_initial_flat_minimum_asset_allocation",
]
