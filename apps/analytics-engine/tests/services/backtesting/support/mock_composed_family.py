from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Any

from src.models.strategy_config import (
    SavedStrategyConfig,
    StrategyComponentRef,
    StrategyComposition,
)
from src.services.backtesting.capabilities import map_portfolio_to_two_buckets
from src.services.backtesting.composition_catalog import (
    CompositionCatalog,
    StrategyFamilySpec,
    get_default_composition_catalog,
)
from src.services.backtesting.composition_types import DecisionPolicy
from src.services.backtesting.decision import AllocationIntent
from src.services.backtesting.domain import SignalObservation
from src.services.backtesting.execution.contracts import ExecutionHints
from src.services.backtesting.execution.pacing.base import (
    RebalancePacingInputs,
    RebalancePacingPolicy,
)
from src.services.backtesting.features import MarketDataRequirements
from src.services.backtesting.strategies.base import StrategyContext

MOCK_COMPOSED_STRATEGY_ID = "mock_signal_family"
MOCK_SIGNAL_COMPONENT_ID = "mock_signal_component"
MOCK_DECISION_POLICY_ID = "mock_decision_policy"
MOCK_PACING_POLICY_ID = "mock_pacing_policy"
MOCK_EXECUTION_PROFILE_ID = "mock_execution_profile"
MOCK_BUCKET_MAPPER_ID = "two_bucket_spot_stable"


@dataclass(frozen=True)
class _MockSignalSnapshot:
    regime: str
    confidence: float
    raw_value: float


class MockSignalComponent:
    signal_id = "mock_signal"
    market_data_requirements = MarketDataRequirements()
    warmup_lookback_days = 0

    def reset(self) -> None:
        return None

    def initialize(self, context: StrategyContext) -> None:
        del context

    def warmup(self, context: StrategyContext) -> None:
        del context

    def observe(self, context: StrategyContext) -> _MockSignalSnapshot:
        return _MockSignalSnapshot(
            regime="neutral",
            confidence=0.6,
            raw_value=float(context.price),
        )

    def apply_intent(
        self,
        *,
        current_date: date,
        snapshot: _MockSignalSnapshot,
        intent: AllocationIntent,
    ) -> _MockSignalSnapshot:
        del current_date, intent
        return snapshot

    def build_signal_observation(
        self,
        *,
        snapshot: _MockSignalSnapshot,
        intent: AllocationIntent,
    ) -> SignalObservation:
        del intent
        return SignalObservation(
            signal_id=self.signal_id,
            regime=snapshot.regime,
            confidence=snapshot.confidence,
            raw_value=snapshot.raw_value,
        )

    def build_execution_hints(
        self,
        *,
        snapshot: _MockSignalSnapshot,
        intent: AllocationIntent,
        signal_confidence: float,
    ) -> ExecutionHints:
        return ExecutionHints(
            signal_id=self.signal_id,
            current_regime=snapshot.regime,
            signal_value=snapshot.raw_value,
            signal_confidence=signal_confidence,
            decision_score=intent.decision_score,
            decision_action=intent.action,
        )


class MockDecisionPolicy:
    decision_policy_id = MOCK_DECISION_POLICY_ID

    def decide(self, snapshot: _MockSignalSnapshot) -> AllocationIntent:
        del snapshot
        return AllocationIntent(
            action="hold",
            target_allocation={"spot": 0.5, "stable": 0.5},
            allocation_name="balanced",
            immediate=False,
            reason="mock family hold",
            rule_group="none",
            decision_score=0.5,
        )


class MockPacingPolicy(RebalancePacingPolicy):
    @property
    def name(self) -> str:
        return MOCK_PACING_POLICY_ID

    def interval_days(self, inputs: RebalancePacingInputs) -> int:
        del inputs
        return 1

    def step_count(self, inputs: RebalancePacingInputs) -> int:
        del inputs
        return 1

    def step_weights(
        self,
        inputs: RebalancePacingInputs,
        step_count: int,
    ) -> list[float]:
        del inputs
        return [1.0] * max(step_count, 1)


def _build_mock_signal_component(params: dict[str, Any]) -> MockSignalComponent:
    if params:
        raise ValueError("mock_signal_component does not accept params")
    return MockSignalComponent()


def _build_mock_decision_policy(params: dict[str, Any]) -> DecisionPolicy:
    if params:
        raise ValueError("mock_decision_policy does not accept params")
    return MockDecisionPolicy()


def _build_mock_pacing_policy(params: dict[str, Any]) -> MockPacingPolicy:
    if params:
        raise ValueError("mock_pacing_policy does not accept params")
    return MockPacingPolicy()


def _build_mock_execution_profile(params: dict[str, Any]) -> None:
    if params:
        raise ValueError("mock_execution_profile does not accept params")
    return None


def build_mock_composed_catalog() -> CompositionCatalog:
    return get_default_composition_catalog().with_extensions(
        signal_components={
            MOCK_SIGNAL_COMPONENT_ID: _build_mock_signal_component,
        },
        decision_policies={
            MOCK_DECISION_POLICY_ID: _build_mock_decision_policy,
        },
        pacing_policies={
            MOCK_PACING_POLICY_ID: _build_mock_pacing_policy,
        },
        execution_profiles={
            MOCK_EXECUTION_PROFILE_ID: _build_mock_execution_profile,
        },
        bucket_mappers={
            MOCK_BUCKET_MAPPER_ID: map_portfolio_to_two_buckets,
        },
        strategy_families={
            MOCK_COMPOSED_STRATEGY_ID: StrategyFamilySpec(
                strategy_id=MOCK_COMPOSED_STRATEGY_ID,
                composition_kind="composed",
                mutable_via_admin=True,
                required_slots=frozenset(
                    {"signal", "decision_policy", "pacing_policy", "execution_profile"}
                ),
            )
        },
    )


def build_mock_saved_config(
    *,
    config_id: str = "mock_signal_family_default",
    supports_daily_suggestion: bool = True,
) -> SavedStrategyConfig:
    return SavedStrategyConfig(
        config_id=config_id,
        display_name="Mock Signal Family",
        description="Test-only composed strategy family.",
        strategy_id=MOCK_COMPOSED_STRATEGY_ID,
        primary_asset="BTC",
        params={},
        composition=StrategyComposition(
            kind="composed",
            bucket_mapper_id=MOCK_BUCKET_MAPPER_ID,
            signal=StrategyComponentRef(component_id=MOCK_SIGNAL_COMPONENT_ID),
            decision_policy=StrategyComponentRef(component_id=MOCK_DECISION_POLICY_ID),
            pacing_policy=StrategyComponentRef(component_id=MOCK_PACING_POLICY_ID),
            execution_profile=StrategyComponentRef(
                component_id=MOCK_EXECUTION_PROFILE_ID
            ),
            plugins=[],
        ),
        supports_daily_suggestion=supports_daily_suggestion,
        is_default=False,
        is_benchmark=False,
    )


__all__ = [
    "MOCK_COMPOSED_STRATEGY_ID",
    "build_mock_composed_catalog",
    "build_mock_saved_config",
]
