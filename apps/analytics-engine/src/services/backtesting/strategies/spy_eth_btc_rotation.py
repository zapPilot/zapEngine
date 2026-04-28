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

from src.services.backtesting.composition_types import (
    DecisionPolicy,
    StatefulSignalComponent,
)
from src.services.backtesting.constants import (
    STRATEGY_DISPLAY_NAMES,
    STRATEGY_SPY_ETH_BTC_ROTATION,
)
from src.services.backtesting.decision import AllocationIntent
from src.services.backtesting.domain import SignalObservation
from src.services.backtesting.execution.allocation_intent_executor import (
    AllocationIntentExecutor,
)
from src.services.backtesting.execution.contracts import ExecutionHints
from src.services.backtesting.features import (
    DMA_200_FEATURE,
    ETH_BTC_RELATIVE_STRENGTH_AUX_SERIES,
    SPY_AUX_SERIES,
    SPY_DMA_200_FEATURE,
    SPY_PRICE_FEATURE,
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
    ETH_BTC_ROTATION_PUBLIC_PARAM_KEYS,
    EthBtcRelativeStrengthSignalComponent,
    EthBtcRotationDecisionPolicy,
    EthBtcRotationParams,
    EthBtcRotationState,
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
    # DmaGatedFgiDecisionPolicy emits a 2-bucket allocation: {spot, stable}.
    spot = float(allocation.get("spot", 0.0))
    stable = float(allocation.get("stable", 0.0))
    total = spot + stable
    if total <= 0.0:
        return 0.0
    return max(0.0, min(1.0, spot / total))


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
        return {"spy": 0.0, "btc": 0.0, "eth": 0.0, "stable": 1.0}
    return {
        "spy": spy / total,
        "btc": btc / total,
        "eth": eth / total,
        "stable": stable / total,
    }


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
    if raw is None:
        return {"spy": 0.0, "btc": 0.0, "eth": 0.0, "stable": 1.0}
    return _normalize_4bucket_allocation(
        spy_share=float(raw.get("spy", 0.0)),
        btc_share=float(raw.get("btc", 0.0)),
        eth_share=float(raw.get("eth", 0.0)),
        stable_share=float(raw.get("stable", 0.0)),
    )


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


@dataclass
class SpyEthBtcRotationSignalComponent(StatefulSignalComponent):
    """Compose the existing crypto signal with a SPY DMA gate (neutral FGI)."""

    params: SpyEthBtcRotationParams = field(default_factory=SpyEthBtcRotationParams)
    signal_id: str = "spy_eth_btc_rs_signal"
    market_data_requirements: MarketDataRequirements = field(
        default_factory=lambda: MarketDataRequirements(
            requires_sentiment=True,
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
    _spy_dma_signal: DmaGatedFgiSignalComponent = field(init=False, repr=False)

    def __post_init__(self) -> None:
        self._crypto_signal = EthBtcRelativeStrengthSignalComponent(
            config=self.params.build_signal_config(),
            ratio_cross_cooldown_days=self.params.ratio_cross_cooldown_days,
            rotation_neutral_band=self.params.rotation_neutral_band,
            rotation_max_deviation=self.params.rotation_max_deviation,
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
        self._spy_dma_signal.reset()

    def initialize(self, context: StrategyContext) -> None:
        self._crypto_signal.initialize(context)
        spy_context = _build_spy_dma_context(context)
        if spy_context is not context:
            self._spy_dma_signal.initialize(spy_context)

    def warmup(self, context: StrategyContext) -> None:
        self._crypto_signal.warmup(context)
        spy_context = _build_spy_dma_context(context)
        if spy_context is not context:
            self._spy_dma_signal.warmup(spy_context)

    def observe(self, context: StrategyContext) -> SpyEthBtcRotationState:
        crypto_state = self._crypto_signal.observe(context)
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
        committed_spy = snapshot.spy_dma_state
        if snapshot.spy_dma_state is not None:
            committed_spy = self._spy_dma_signal.apply_intent(
                current_date=current_date,
                snapshot=snapshot.spy_dma_state,
                intent=intent,
            )
        return replace(
            snapshot,
            crypto_state=committed_crypto,
            spy_dma_state=committed_spy,
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
        return replace(observation, signal_id=self.signal_id)

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
        # Pick the dominant risk-on bucket so the executor's rotate_spot_asset
        # actually buys the right asset. SPY wins ties (>=) to surface SPY
        # behavior — the only way executor.target_spot_asset can ever land on
        # "SPY" is for this strategy to emit it explicitly here.
        target = intent.target_allocation or {}
        spy_share = float(target.get("spy", 0.0))
        btc_share = float(target.get("btc", 0.0))
        eth_share = float(target.get("eth", 0.0))
        target_spot: str | None
        if spy_share > 0.0 and spy_share >= max(btc_share, eth_share):
            target_spot = "SPY"
        elif eth_share > btc_share:
            target_spot = "ETH"
        elif btc_share > 0.0:
            target_spot = "BTC"
        else:
            target_spot = None
        return replace(hints, signal_id=self.signal_id, target_spot_asset=target_spot)


@dataclass(frozen=True)
class SpyEthBtcRotationDecisionPolicy(DecisionPolicy):
    """Compose crypto + SPY DMA intents into a 4-bucket target allocation."""

    decision_policy_id: str = "spy_eth_btc_rotation_policy"
    rotation_drift_threshold: float = 0.03
    _crypto_policy: EthBtcRotationDecisionPolicy = field(
        default_factory=EthBtcRotationDecisionPolicy
    )
    _spy_policy: DmaGatedFgiDecisionPolicy = field(
        default_factory=DmaGatedFgiDecisionPolicy
    )

    def decide(self, snapshot: SpyEthBtcRotationState) -> AllocationIntent:
        crypto_intent = self._crypto_policy.decide(snapshot.crypto_state)
        spy_intent = (
            self._spy_policy.decide(snapshot.spy_dma_state)
            if snapshot.spy_dma_state is not None
            else None
        )

        crypto_alloc = crypto_intent.target_allocation
        spy_alloc = spy_intent.target_allocation if spy_intent is not None else None

        crypto_risk_on = _crypto_risk_on_share(crypto_alloc)
        eth_share = _eth_share_within_crypto(crypto_alloc)
        # Preserve current SPY share when DMA gate is in hold state, matching
        # ETH/BTC's behavior at eth_btc_rotation.py:559-575. Without this, SPY
        # would zero out every day no DMA cross/overextension event fires.
        if spy_alloc is not None:
            spy_risk_on = _spy_risk_on_share(spy_alloc)
        else:
            spy_risk_on = float(snapshot.current_asset_allocation.get("spy", 0.0))

        target_allocation = _compose_4bucket_target(
            spy_risk_on=spy_risk_on,
            crypto_risk_on=crypto_risk_on,
            eth_share_in_crypto=eth_share,
        )

        action = crypto_intent.action
        immediate = crypto_intent.immediate
        reason = crypto_intent.reason
        rule_group = crypto_intent.rule_group
        allocation_name = crypto_intent.allocation_name

        if spy_intent is not None and spy_intent.action != "hold" and action == "hold":
            # SPY signaled a real action while crypto is idle: adopt the SPY
            # action so the executor doesn't sit on a stale hold. Reuse the SPY
            # intent's rule_group verbatim (it's already a valid RuleGroup).
            action = spy_intent.action
            immediate = spy_intent.immediate
            reason = f"spy_{spy_intent.reason}"
            rule_group = spy_intent.rule_group
            allocation_name = (
                f"spy_{spy_intent.allocation_name}"
                if spy_intent.allocation_name is not None
                else None
            )

        # Pick the dominant risk-on bucket so the engine's rotate_spot_asset
        # actually buys the right asset. Engine reads decision.target_spot_asset
        # (composed_signal.py:152) — NOT hints.target_spot_asset — so this must
        # be set here, not just in build_execution_hints. SPY wins ties (>=) to
        # surface SPY behavior; without that, executor never picks SPY.
        spy_share = float(target_allocation.get("spy", 0.0))
        btc_share = float(target_allocation.get("btc", 0.0))
        eth_share = float(target_allocation.get("eth", 0.0))
        target_spot_asset: str | None
        if spy_share > 0.0 and spy_share >= max(btc_share, eth_share):
            target_spot_asset = "SPY"
        elif eth_share > btc_share:
            target_spot_asset = "ETH"
        elif btc_share > 0.0:
            target_spot_asset = "BTC"
        else:
            target_spot_asset = None

        return AllocationIntent(
            action=action,
            target_allocation=target_allocation,
            allocation_name=allocation_name,
            immediate=immediate,
            reason=reason,
            rule_group=rule_group,
            decision_score=max(
                crypto_intent.decision_score,
                spy_intent.decision_score if spy_intent is not None else 0.0,
            ),
            target_spot_asset=target_spot_asset,
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
            _spy_policy=DmaGatedFgiDecisionPolicy(
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
    "SPY_ETH_BTC_ROTATION_PUBLIC_PARAM_KEYS",
    "SpyEthBtcRotationDecisionPolicy",
    "SpyEthBtcRotationParams",
    "SpyEthBtcRotationSignalComponent",
    "SpyEthBtcRotationState",
    "SpyEthBtcRotationStrategy",
    "default_spy_eth_btc_rotation_params",
]
