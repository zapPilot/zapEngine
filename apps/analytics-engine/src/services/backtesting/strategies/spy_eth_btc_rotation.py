"""SPY/ETH/BTC multi-asset rotation built on eth_btc_rotation + a SPY DMA gate.

SPY flows through the existing DMA-gated FGI machinery using a neutral FGI
placeholder. With ``regime="neutral"``, none of the FGI conditional branches in
``DmaGatedFgiDecisionPolicy`` fire, so SPY is driven by DMA cross + overextension
only. When real S&P-500 sentiment becomes available, dropping it into the SPY
DMA context is a single-line change.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field, replace
from datetime import date
from typing import Any

from pydantic import JsonValue

from src.services.backtesting.asset_class_allocator import allocate_stock_crypto_target
from src.services.backtesting.composition_types import (
    DecisionPolicy,
    StatefulSignalComponent,
)
from src.services.backtesting.constants import (
    STRATEGY_DISPLAY_NAMES,
    STRATEGY_SPY_ETH_BTC_ROTATION,
)
from src.services.backtesting.decision import AllocationIntent, DecisionAction
from src.services.backtesting.domain import DmaSignalDiagnostics, SignalObservation
from src.services.backtesting.execution.allocation_intent_executor import (
    AllocationIntentExecutor,
)
from src.services.backtesting.execution.contracts import ExecutionHints
from src.services.backtesting.features import (
    DMA_200_FEATURE,
    ETH_BTC_RELATIVE_STRENGTH_AUX_SERIES,
    MACRO_FEAR_GREED_FEATURE,
    SPY_AUX_SERIES,
    SPY_DMA_200_FEATURE,
    SPY_PRICE_FEATURE,
    MarketDataRequirements,
)
from src.services.backtesting.signals.dma_gated_fgi.types import (
    CrossEvent,
    DmaMarketState,
)
from src.services.backtesting.strategies.base import StrategyContext
from src.services.backtesting.strategies.composed_signal import ComposedSignalStrategy
from src.services.backtesting.strategies.dma_gated_fgi import (
    DmaGatedFgiDecisionPolicy,
    DmaGatedFgiSignalComponent,
)
from src.services.backtesting.strategies.eth_btc_rotation import (
    ETH_BTC_ROTATION_PUBLIC_PARAM_KEYS,
    EthBtcRelativeStrengthSignalComponent,
    EthBtcRotationDecisionPolicy,
    EthBtcRotationParams,
    EthBtcRotationState,
)
from src.services.backtesting.target_allocation import (
    normalize_target_allocation,
    target_from_current_allocation,
)

SPY_ETH_BTC_ROTATION_PUBLIC_PARAM_KEYS = ETH_BTC_ROTATION_PUBLIC_PARAM_KEYS

_NEUTRAL_SPY_SENTIMENT: dict[str, str | int | float] = {
    "label": "neutral",
    "value": 50.0,
}


def _build_spy_dma_context(context: StrategyContext) -> StrategyContext:
    """Adapt the strategy context so DmaGatedFgiSignalComponent sees SPY data.

    Replaces the primary ``price`` and ``dma_200`` slots with SPY equivalents and
    swaps in a neutral FGI placeholder. Returns the original context unchanged
    when SPY data is missing — the inner signal will gracefully report no DMA
    state in that case.
    """
    spy_price = context.extra_data.get(SPY_PRICE_FEATURE)
    spy_dma = context.extra_data.get(SPY_DMA_200_FEATURE)
    if not isinstance(spy_price, int | float) or float(spy_price) <= 0.0:
        return context
    if not isinstance(spy_dma, int | float) or float(spy_dma) <= 0.0:
        return context
    new_extra = {**context.extra_data, DMA_200_FEATURE: float(spy_dma)}
    return replace(
        context,
        price=float(spy_price),
        extra_data=new_extra,
        sentiment=dict(_NEUTRAL_SPY_SENTIMENT),
    )


def _build_crypto_dma_context(context: StrategyContext) -> StrategyContext:
    """Force the crypto asset-class DMA gate to use BTC price vs BTC DMA."""
    btc_price = context.price_map.get("btc")
    btc_dma = context.extra_data.get(DMA_200_FEATURE)
    if not isinstance(btc_price, int | float) or float(btc_price) <= 0.0:
        return context
    if not isinstance(btc_dma, int | float) or float(btc_dma) <= 0.0:
        return context
    return replace(context, price=float(btc_price))


def _extract_macro_fear_greed_score(extra_data: Mapping[str, Any]) -> int | None:
    raw = extra_data.get(MACRO_FEAR_GREED_FEATURE)
    if not isinstance(raw, Mapping):
        return None
    score = raw.get("score")
    if score is None:
        score = raw.get("value")
    if not isinstance(score, int | float):
        return None
    return max(0, min(100, int(round(float(score)))))


def _crypto_risk_on_share(allocation: Mapping[str, float] | None) -> float:
    if allocation is None:
        return 0.0
    return max(
        0.0,
        float(allocation.get("btc", 0.0)) + float(allocation.get("eth", 0.0)),
    )


def _eth_share_within_crypto(allocation: Mapping[str, float] | None) -> float:
    if allocation is None:
        return 0.0
    risk_on = _crypto_risk_on_share(allocation)
    if risk_on <= 0.0:
        return 0.0
    return max(0.0, min(1.0, float(allocation.get("eth", 0.0)) / risk_on))


def _spy_risk_on_share(allocation: Mapping[str, float] | None) -> float:
    if allocation is None:
        return 0.0
    spy = float(allocation.get("spy", 0.0))
    stable = float(allocation.get("stable", 0.0))
    total = spy + stable
    if total <= 0.0:
        return 0.0
    return max(0.0, min(1.0, spy / total))


def _get_spy_cross_event(dma_state: DmaMarketState | None) -> CrossEvent | None:
    if dma_state is None:
        return None
    return dma_state.cross_event


def _get_crypto_cross_event(dma_state: DmaMarketState | None) -> CrossEvent | None:
    if dma_state is None:
        return None
    return dma_state.cross_event


def _apply_asset_class_dma_gates(
    *,
    target_allocation: dict[str, float],
    spy_cross_event: CrossEvent | None,
    crypto_cross_event: CrossEvent | None,
) -> tuple[dict[str, float], str | None, bool]:
    """Apply asset-class DMA gate overrides.

    Returns:
        tuple of (modified_target_allocation, reason_label, is_immediate)
    """
    is_immediate = False
    modified = dict(target_allocation)
    reasons: list[str] = []

    if spy_cross_event == "cross_down":
        spy_share = max(0.0, float(modified.get("spy", 0.0)))
        modified["spy"] = 0.0
        modified["stable"] = float(modified.get("stable", 0.0)) + spy_share
        reasons.append("spy_dma_cross_down")
    elif spy_cross_event == "cross_up":
        is_immediate = True
        reasons.append("spy_dma_cross_up")

    if crypto_cross_event == "cross_down":
        crypto_share = max(
            0.0,
            float(modified.get("btc", 0.0)) + float(modified.get("eth", 0.0)),
        )
        modified["btc"] = 0.0
        modified["eth"] = 0.0
        modified["stable"] = float(modified.get("stable", 0.0)) + crypto_share
        reasons.append("crypto_dma_cross_down")
    elif crypto_cross_event == "cross_up":
        is_immediate = True
        reasons.append("crypto_dma_cross_up")

    if not reasons:
        return modified, None, is_immediate

    if "spy_dma_cross_down" in reasons or "crypto_dma_cross_down" in reasons:
        modified = _normalize_4bucket_allocation(
            spy_share=modified.get("spy", 0.0),
            btc_share=modified.get("btc", 0.0),
            eth_share=modified.get("eth", 0.0),
            stable_share=modified.get("stable", 0.0),
        )

    return modified, "+".join(reasons), is_immediate


def _convert_spy_dma_to_diagnostics(
    dma_state: DmaMarketState | None,
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
    )


def _normalize_4bucket_allocation(
    *,
    spy_share: float,
    btc_share: float,
    eth_share: float,
    stable_share: float,
) -> dict[str, float]:
    spy = max(0.0, float(spy_share))
    btc = max(0.0, float(btc_share))
    eth = max(0.0, float(eth_share))
    stable = max(0.0, float(stable_share))
    total = spy + btc + eth + stable
    if total <= 0.0:
        return normalize_target_allocation(None)
    return normalize_target_allocation(
        {
            "spy": spy / total,
            "btc": btc / total,
            "eth": eth / total,
            "stable": stable / total,
            "alt": 0.0,
        }
    )


def _compose_4bucket_target(
    *,
    spy_risk_on: float,
    crypto_risk_on: float,
    eth_share_in_crypto: float,
) -> dict[str, float]:
    spy = max(0.0, min(1.0, float(spy_risk_on)))
    crypto = max(0.0, min(1.0, float(crypto_risk_on)))
    eth_share = max(0.0, min(1.0, float(eth_share_in_crypto)))
    raw_stable = max(0.0, 1.0 - spy - crypto)
    return _normalize_4bucket_allocation(
        spy_share=spy,
        btc_share=crypto * (1.0 - eth_share),
        eth_share=crypto * eth_share,
        stable_share=raw_stable,
    )


def _normalize_current_4bucket(
    raw: Mapping[str, float] | None,
) -> dict[str, float]:
    return target_from_current_allocation(raw)


class SpyEthBtcRotationParams(EthBtcRotationParams):
    """Public params currently match eth_btc_rotation; SPY shares the gating knobs."""

    @classmethod
    def from_public_params(
        cls, params: Mapping[str, Any] | None = None
    ) -> SpyEthBtcRotationParams:
        normalized = EthBtcRotationParams.from_public_params(params).model_dump()
        return cls(**normalized)


def default_spy_eth_btc_rotation_params() -> dict[str, JsonValue]:
    return SpyEthBtcRotationParams().to_public_params()


@dataclass(frozen=True)
class SpyEthBtcRotationState:
    crypto_state: EthBtcRotationState
    spy_dma_state: DmaMarketState | None
    current_asset_allocation: dict[str, float]
    macro_fear_greed_score: int | None = None
    stock_has_crossed_up: bool = False
    crypto_has_crossed_up: bool = False


@dataclass
class SpyEthBtcRotationSignalComponent(StatefulSignalComponent):
    """Compose the existing crypto signal with a SPY DMA gate (neutral FGI)."""

    params: SpyEthBtcRotationParams = field(default_factory=SpyEthBtcRotationParams)
    signal_id: str = "spy_eth_btc_rs_signal"
    market_data_requirements: MarketDataRequirements = field(
        default_factory=lambda: MarketDataRequirements(
            requires_sentiment=True,
            requires_macro_fear_greed=True,
            required_price_features=frozenset({DMA_200_FEATURE}),
            required_aux_series=frozenset(
                {ETH_BTC_RELATIVE_STRENGTH_AUX_SERIES, SPY_AUX_SERIES}
            ),
        )
    )
    warmup_lookback_days: int = 14
    _crypto_signal: EthBtcRelativeStrengthSignalComponent = field(
        init=False, repr=False
    )
    _btc_dma_signal: DmaGatedFgiSignalComponent = field(init=False, repr=False)
    _spy_dma_signal: DmaGatedFgiSignalComponent = field(init=False, repr=False)
    _stock_has_crossed_up: bool = field(default=False, init=False, repr=False)
    _crypto_has_crossed_up: bool = field(default=False, init=False, repr=False)

    def __post_init__(self) -> None:
        self._crypto_signal = EthBtcRelativeStrengthSignalComponent(
            config=self.params.build_signal_config(),
            ratio_cross_cooldown_days=self.params.ratio_cross_cooldown_days,
            rotation_neutral_band=self.params.rotation_neutral_band,
            rotation_max_deviation=self.params.rotation_max_deviation,
            warmup_lookback_days=self.warmup_lookback_days,
        )
        self._btc_dma_signal = DmaGatedFgiSignalComponent(
            config=self.params.build_signal_config(),
            market_data_requirements=MarketDataRequirements(
                requires_sentiment=True,
                required_price_features=frozenset({DMA_200_FEATURE}),
            ),
            warmup_lookback_days=self.warmup_lookback_days,
        )
        self._spy_dma_signal = DmaGatedFgiSignalComponent(
            config=self.params.build_signal_config(),
            market_data_requirements=MarketDataRequirements(
                requires_sentiment=True,
                required_price_features=frozenset({DMA_200_FEATURE}),
            ),
            warmup_lookback_days=self.warmup_lookback_days,
        )

    def reset(self) -> None:
        self._crypto_signal.reset()
        self._btc_dma_signal.reset()
        self._spy_dma_signal.reset()
        self._stock_has_crossed_up = False
        self._crypto_has_crossed_up = False

    def initialize(self, context: StrategyContext) -> None:
        self._crypto_signal.initialize(context)
        self._btc_dma_signal.initialize(_build_crypto_dma_context(context))
        spy_context = _build_spy_dma_context(context)
        if spy_context is not context:
            self._spy_dma_signal.initialize(spy_context)

    def warmup(self, context: StrategyContext) -> None:
        self._crypto_signal.warmup(context)
        self._btc_dma_signal.warmup(_build_crypto_dma_context(context))
        spy_context = _build_spy_dma_context(context)
        if spy_context is not context:
            self._spy_dma_signal.warmup(spy_context)

    def observe(self, context: StrategyContext) -> SpyEthBtcRotationState:
        crypto_state = self._crypto_signal.observe(context)
        btc_dma_state = self._btc_dma_signal.observe(_build_crypto_dma_context(context))
        crypto_state = replace(crypto_state, dma_state=btc_dma_state)
        spy_context = _build_spy_dma_context(context)
        spy_state: DmaMarketState | None
        if spy_context is context:
            spy_state = None
        else:
            spy_state = self._spy_dma_signal.observe(spy_context)
        return SpyEthBtcRotationState(
            crypto_state=crypto_state,
            spy_dma_state=spy_state,
            current_asset_allocation=_normalize_current_4bucket(
                context.portfolio.asset_allocation_percentages(context.portfolio_price)
            ),
            macro_fear_greed_score=_extract_macro_fear_greed_score(context.extra_data),
            stock_has_crossed_up=self._stock_has_crossed_up
            or (spy_state is not None and spy_state.cross_event == "cross_up"),
            crypto_has_crossed_up=self._crypto_has_crossed_up
            or crypto_state.dma_state.cross_event == "cross_up",
        )

    def apply_intent(
        self,
        *,
        current_date: date,
        snapshot: SpyEthBtcRotationState,
        intent: AllocationIntent,
    ) -> SpyEthBtcRotationState:
        committed_crypto = self._crypto_signal.apply_intent(
            current_date=current_date,
            snapshot=snapshot.crypto_state,
            intent=intent,
        )
        committed_btc_dma = self._btc_dma_signal.apply_intent(
            current_date=current_date,
            snapshot=snapshot.crypto_state.dma_state,
            intent=intent,
        )
        committed_crypto = replace(committed_crypto, dma_state=committed_btc_dma)
        committed_spy = snapshot.spy_dma_state
        if snapshot.spy_dma_state is not None:
            committed_spy = self._spy_dma_signal.apply_intent(
                current_date=current_date,
                snapshot=snapshot.spy_dma_state,
                intent=intent,
            )
            if snapshot.spy_dma_state.cross_event == "cross_up":
                self._stock_has_crossed_up = True
            elif snapshot.spy_dma_state.cross_event == "cross_down":
                self._stock_has_crossed_up = False
        if snapshot.crypto_state.dma_state.cross_event == "cross_up":
            self._crypto_has_crossed_up = True
        elif snapshot.crypto_state.dma_state.cross_event == "cross_down":
            self._crypto_has_crossed_up = False
        return replace(
            snapshot,
            crypto_state=committed_crypto,
            spy_dma_state=committed_spy,
            stock_has_crossed_up=self._stock_has_crossed_up,
            crypto_has_crossed_up=self._crypto_has_crossed_up,
        )

    def build_signal_observation(
        self,
        *,
        snapshot: SpyEthBtcRotationState,
        intent: AllocationIntent,
    ) -> SignalObservation:
        observation = self._crypto_signal.build_signal_observation(
            snapshot=snapshot.crypto_state,
            intent=intent,
        )
        return replace(
            observation,
            signal_id=self.signal_id,
            dma=(
                None
                if observation.dma is None
                else replace(observation.dma, outer_dma_asset="BTC")
            ),
            spy_dma=_convert_spy_dma_to_diagnostics(snapshot.spy_dma_state),
        )

    def build_execution_hints(
        self,
        *,
        snapshot: SpyEthBtcRotationState,
        intent: AllocationIntent,
        signal_confidence: float,
    ) -> ExecutionHints:
        hints = self._crypto_signal.build_execution_hints(
            snapshot=snapshot.crypto_state,
            intent=intent,
            signal_confidence=signal_confidence,
        )
        return replace(hints, signal_id=self.signal_id)


@dataclass(frozen=True)
class SpyEthBtcRotationDecisionPolicy(DecisionPolicy):
    """Compose crypto + SPY scores into a canonical asset target allocation."""

    decision_policy_id: str = "spy_eth_btc_rotation_policy"
    rotation_drift_threshold: float = 0.03
    _crypto_policy: EthBtcRotationDecisionPolicy = field(
        default_factory=EthBtcRotationDecisionPolicy
    )

    def decide(self, snapshot: SpyEthBtcRotationState) -> AllocationIntent:
        crypto_intent = self._crypto_policy.decide(snapshot.crypto_state)

        crypto_alloc = crypto_intent.target_allocation
        eth_share = (
            _eth_share_within_crypto(crypto_alloc)
            if crypto_alloc is not None
            else _eth_share_within_crypto(snapshot.current_asset_allocation)
        )
        allocation_result = allocate_stock_crypto_target(
            stock_dma_distance=(
                None
                if snapshot.spy_dma_state is None
                else snapshot.spy_dma_state.dma_distance
            ),
            crypto_dma_distance=snapshot.crypto_state.dma_state.dma_distance,
            crypto_fgi_regime=snapshot.crypto_state.dma_state.fgi_regime,
            eth_share_in_crypto=eth_share,
            current_allocation=snapshot.current_asset_allocation,
            stock_macro_fgi_score=snapshot.macro_fear_greed_score,
            stock_cross_event=_get_spy_cross_event(snapshot.spy_dma_state),
            crypto_cross_event=_get_crypto_cross_event(snapshot.crypto_state.dma_state),
            stock_has_crossed_up=snapshot.stock_has_crossed_up,
            crypto_has_crossed_up=snapshot.crypto_has_crossed_up,
        )
        target_allocation = allocation_result.allocation

        spy_cross_event = _get_spy_cross_event(snapshot.spy_dma_state)
        crypto_cross_event = _get_crypto_cross_event(snapshot.crypto_state.dma_state)
        cross_reasons: list[str] = []
        if spy_cross_event is not None:
            cross_reasons.append(f"spy_dma_{spy_cross_event}")
        if crypto_cross_event is not None:
            cross_reasons.append(f"crypto_dma_{crypto_cross_event}")
        dma_gate_reason = "+".join(cross_reasons) if cross_reasons else None
        is_immediate = spy_cross_event == "cross_up" or crypto_cross_event == "cross_up"
        diagnostics = {
            "stock_score": allocation_result.stock_score,
            "crypto_score": allocation_result.crypto_score,
            "stock_gate_state": allocation_result.stock_gate_state,
            "crypto_gate_state": allocation_result.crypto_gate_state,
            "overextension_pressure": allocation_result.overextension_pressure,
            "stable_reason": allocation_result.stable_reason,
        }

        if dma_gate_reason is not None:
            return AllocationIntent(
                action="buy" if "cross_up" in dma_gate_reason else "sell",
                target_allocation=target_allocation,
                allocation_name=dma_gate_reason,
                immediate=is_immediate,
                reason=dma_gate_reason,
                rule_group="cross",
                decision_score=max(
                    allocation_result.stock_score or 0.0,
                    allocation_result.crypto_score or 0.0,
                    crypto_intent.decision_score,
                ),
                diagnostics=diagnostics,
            )

        current_allocation = target_from_current_allocation(
            snapshot.current_asset_allocation
        )
        drift = max(
            abs(
                float(target_allocation.get(bucket, 0.0))
                - float(current_allocation.get(bucket, 0.0))
            )
            for bucket in ("btc", "eth", "spy", "stable")
        )

        current_risk = _crypto_risk_on_share(current_allocation) + float(
            current_allocation.get("spy", 0.0)
        )
        target_risk = _crypto_risk_on_share(target_allocation) + float(
            target_allocation.get("spy", 0.0)
        )
        if drift <= self.rotation_drift_threshold:
            action: DecisionAction = "hold"
            target_allocation = current_allocation
            reason = "asset_class_score_hold"
            allocation_name = None
        elif target_risk > current_risk + self.rotation_drift_threshold:
            action = "buy"
            reason = "asset_class_score_buy"
            allocation_name = "asset_class_score_buy"
        elif target_risk < current_risk - self.rotation_drift_threshold:
            action = "sell"
            reason = "asset_class_score_sell"
            allocation_name = "asset_class_score_sell"
        else:
            action = "hold"
            reason = "asset_class_score_rebalance"
            allocation_name = "asset_class_score_rebalance"

        return AllocationIntent(
            action=action,
            target_allocation=target_allocation,
            allocation_name=allocation_name,
            immediate=False,
            reason=reason,
            rule_group="rotation",
            decision_score=max(
                allocation_result.stock_score or 0.0,
                allocation_result.crypto_score or 0.0,
                crypto_intent.decision_score,
            ),
            diagnostics=diagnostics,
        )


@dataclass
class SpyEthBtcRotationStrategy(ComposedSignalStrategy):
    """4-asset rotation: SPY DMA gate + ETH/BTC rotation + stable residual."""

    total_capital: float
    signal_id: str = "spy_eth_btc_rs_signal"
    summary_signal_id: str | None = "spy_eth_btc_rs_signal"
    params: SpyEthBtcRotationParams | dict[str, Any] = field(
        default_factory=SpyEthBtcRotationParams
    )
    signal_component: StatefulSignalComponent = field(init=False, repr=False)
    decision_policy: DecisionPolicy = field(init=False, repr=False)
    execution_engine: AllocationIntentExecutor = field(init=False, repr=False)
    public_params: dict[str, Any] = field(default_factory=dict)
    strategy_id: str = STRATEGY_SPY_ETH_BTC_ROTATION
    display_name: str = STRATEGY_DISPLAY_NAMES[STRATEGY_SPY_ETH_BTC_ROTATION]
    canonical_strategy_id: str = STRATEGY_SPY_ETH_BTC_ROTATION
    initial_spot_asset: str = "BTC"
    initial_asset_allocation: dict[str, float] | None = None

    def __post_init__(self) -> None:
        if self.signal_id != "spy_eth_btc_rs_signal":
            raise ValueError("signal_id must be 'spy_eth_btc_rs_signal'")
        resolved_params = (
            self.params
            if isinstance(self.params, SpyEthBtcRotationParams)
            else SpyEthBtcRotationParams.from_public_params(self.params)
        )
        self.params = resolved_params
        self.signal_component = SpyEthBtcRotationSignalComponent(params=resolved_params)
        self.decision_policy = SpyEthBtcRotationDecisionPolicy(
            rotation_drift_threshold=resolved_params.rotation_drift_threshold,
            _crypto_policy=EthBtcRotationDecisionPolicy(
                rotation_drift_threshold=resolved_params.rotation_drift_threshold,
                _dma_policy=DmaGatedFgiDecisionPolicy(
                    dma_overextension_threshold=resolved_params.dma_overextension_threshold,
                    fgi_slope_reversal_threshold=resolved_params.fgi_slope_reversal_threshold,
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
        return dict(self.public_params)


__all__ = [
    "SPY_ETH_BTC_ROTATION_PUBLIC_PARAM_KEYS",
    "SpyEthBtcRotationDecisionPolicy",
    "SpyEthBtcRotationParams",
    "SpyEthBtcRotationSignalComponent",
    "SpyEthBtcRotationState",
    "SpyEthBtcRotationStrategy",
    "default_spy_eth_btc_rotation_params",
]
