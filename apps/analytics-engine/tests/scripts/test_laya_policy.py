from __future__ import annotations

from typing import cast

from scripts.research.laya.fakes import FakeLayaClient
from scripts.research.laya.policy import LayaDecisionPolicy
from src.services.backtesting.domain import ExecutionOutcome
from src.services.backtesting.signals.flat_minimum import FlatMinimumState
from src.services.backtesting.strategies.base import StrategyContext
from tests.services.backtesting.helpers import state


def _flat_state() -> FlatMinimumState:
    return FlatMinimumState(
        spy_dma_state=state(symbol="SPY", macro_fear_greed_value=55.0),
        btc_dma_state=state(symbol="BTC", fgi_value=45.0),
        eth_dma_state=state(symbol="ETH", fgi_value=45.0),
        current_asset_allocation={
            "stable": 1.0,
            "spy": 0.0,
            "btc": 0.0,
            "eth": 0.0,
            "alt": 0.0,
        },
    )


def _score_answers() -> dict[str, object]:
    return {
        bucket: {
            "type": "score",
            "score": score,
            "probabilities": {str(score): 1.0},
            "confidence": 0.8,
        }
        for bucket, score in zip(
            ("stable", "spy", "btc", "eth"),
            (0, 1, 2, 3),
            strict=True,
        )
    }


def _record(policy: LayaDecisionPolicy, intent) -> None:
    policy.record_execution(
        context=cast(StrategyContext, None),
        intent=intent,
        execution=ExecutionOutcome(event=None),
    )


def test_first_decision_emits_research_target_then_same_target_holds() -> None:
    fake = FakeLayaClient(
        mode="scripted", scripted=[_score_answers(), _score_answers()]
    )
    policy = LayaDecisionPolicy(encoding="per_bucket_score", client=fake)
    first = policy.decide(_flat_state())
    assert first.target_allocation is not None
    assert first.rule_group == "none"
    assert first.immediate is True
    assert first.allocation_name == "laya_per_bucket_score"
    assert first.diagnostics is not None and "laya" in first.diagnostics
    _record(policy, first)

    second = policy.decide(_flat_state())
    assert second.action == "hold"
    assert second.target_allocation is None
    assert second.reason == "laya_target_unchanged"


def test_cadence_skips_model_calls_on_intermediate_days() -> None:
    fake = FakeLayaClient(mode="hashed")
    policy = LayaDecisionPolicy(
        encoding="per_bucket_score",
        client=fake,
        decision_cadence_days=3,
    )
    first = policy.decide(_flat_state())
    _record(policy, first)
    assert policy.decide(_flat_state()).reason == "laya_cadence_hold"
    assert policy.decide(_flat_state()).reason == "laya_cadence_hold"
    policy.decide(_flat_state())
    assert fake.calls == 2


def test_record_execution_only_advances_prior_for_target_intent_and_reset_clears_state() -> (
    None
):
    fake = FakeLayaClient(
        mode="scripted", scripted=[_score_answers(), _score_answers()]
    )
    policy = LayaDecisionPolicy(encoding="per_bucket_score", client=fake)
    first = policy.decide(_flat_state())
    hold = policy._hold("test_hold")
    _record(policy, hold)
    assert policy._prior is None
    _record(policy, first)
    assert policy._prior is not None
    policy.reset()
    assert policy._prior is None
    assert policy.decision_log == []


def test_static_control_never_calls_client_and_then_holds() -> None:
    fake = FakeLayaClient()
    policy = LayaDecisionPolicy(encoding="static_equal_weight", client=fake)
    first = policy.decide(_flat_state())
    assert first.target_allocation == {
        "btc": 0.25,
        "eth": 0.25,
        "spy": 0.25,
        "stable": 0.25,
        "alt": 0.0,
    }
    _record(policy, first)
    assert policy.decide(_flat_state()).reason == "laya_target_unchanged"
    assert fake.calls == 0


def test_missing_dma_state_holds_without_model_call() -> None:
    fake = FakeLayaClient()
    policy = LayaDecisionPolicy(encoding="per_bucket_score", client=fake)
    empty = FlatMinimumState(
        spy_dma_state=None,
        btc_dma_state=None,
        eth_dma_state=None,
        current_asset_allocation={"stable": 1.0},
    )
    intent = policy.decide(empty)
    assert intent.reason == "laya_no_dma_state"
    assert intent.target_allocation is None
    assert fake.calls == 0
