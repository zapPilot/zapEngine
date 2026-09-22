"""Offline historical Laya policy used only by the research backtest runner."""

from __future__ import annotations

import statistics
from dataclasses import dataclass, field
from typing import Any

from scripts.research.laya.client import LayaDecisionClient
from scripts.research.laya.decoder import (
    ScoreDecoding,
    SnappedAllocation,
    raw_weights_from_answers,
    snap_to_grid,
    static_equal_weight,
)
from scripts.research.laya.observation import (
    OBSERVATION_VERSION,
    TrailingCloses,
    assert_within_budget,
    build_observation,
    serialize_observation,
)
from scripts.research.laya.questions import (
    BUCKETS,
    ENCODING_VERSION,
    EncodingId,
    questions_for_encoding,
)
from src.services.backtesting.decision import AllocationIntent, DecisionAction
from src.services.backtesting.domain import ExecutionOutcome
from src.services.backtesting.signals.flat_minimum import FlatMinimumState
from src.services.backtesting.strategies.base import StrategyContext


@dataclass
class LayaDecisionPolicy:
    encoding: EncodingId
    client: LayaDecisionClient
    decision_cadence_days: int = 1
    score_decoding: ScoreDecoding = "expected"
    drift_rebalance_threshold: float | None = None
    decision_policy_id: str = "laya_direct_allocation_research"
    _prior: SnappedAllocation | None = field(default=None, init=False, repr=False)
    _day_index: int = field(default=0, init=False, repr=False)
    _context: StrategyContext | None = field(default=None, init=False, repr=False)
    _model_calls: int = field(default=0, init=False, repr=False)
    _cache_hits: int = field(default=0, init=False, repr=False)
    _targets: set[tuple[int, ...]] = field(default_factory=set, init=False, repr=False)
    _target_change_days: int = field(default=0, init=False, repr=False)
    _raw_weight_history: dict[str, list[float]] = field(
        default_factory=lambda: {bucket: [] for bucket in BUCKETS},
        init=False,
        repr=False,
    )
    _confidences: list[float] = field(default_factory=list, init=False, repr=False)
    decision_log: list[dict[str, Any]] = field(default_factory=list, init=False)

    def reset(self) -> None:
        self._prior = None
        self._day_index = 0
        self._context = None
        self._model_calls = 0
        self._cache_hits = 0
        self._targets.clear()
        self._target_change_days = 0
        self._raw_weight_history = {bucket: [] for bucket in BUCKETS}
        self._confidences = []
        self.decision_log = []

    def bind_market_context(self, context: StrategyContext) -> None:
        self._context = context

    def _trailing(self) -> TrailingCloses:
        if self._context is None:
            return TrailingCloses()
        histories = self._context.price_history_map
        return TrailingCloses(
            spy=tuple(histories.get("spy", ())),
            btc=tuple(histories.get("btc", self._context.price_history)),
            eth=tuple(histories.get("eth", ())),
        )

    @staticmethod
    def _hold(reason: str) -> AllocationIntent:
        return AllocationIntent(
            action="hold",
            target_allocation=None,
            allocation_name=None,
            immediate=False,
            reason=reason,
            rule_group="none",
            decision_score=0.0,
            diagnostics={"laya": {"reason": reason}},
        )

    @staticmethod
    def _confidence(answers: dict[str, Any]) -> float:
        values = [
            float(answer["confidence"])
            for answer in answers.values()
            if isinstance(answer, dict)
            and isinstance(answer.get("confidence"), int | float)
        ]
        return statistics.fmean(values) if values else 0.0

    def decide(self, snapshot: FlatMinimumState) -> AllocationIntent:
        day_index = self._day_index
        self._day_index += 1
        if all(
            state is None
            for state in (
                snapshot.spy_dma_state,
                snapshot.btc_dma_state,
                snapshot.eth_dma_state,
            )
        ):
            return self._hold("laya_no_dma_state")
        if day_index % max(1, int(self.decision_cadence_days)) != 0:
            return self._hold("laya_cadence_hold")

        observation = build_observation(
            snapshot,
            prior_units=None if self._prior is None else self._prior.units,
            trailing=self._trailing(),
        )
        serialized = serialize_observation(observation)
        assert_within_budget(serialized)
        questions = questions_for_encoding(self.encoding)

        if self.encoding == "static_equal_weight":
            answers: dict[str, Any] = {}
            raw_weights = dict.fromkeys(BUCKETS, 0.25)
            snapped = static_equal_weight()
            cache_hit = False
            confidence = 1.0
        else:
            result = self.client.predict(observation, questions)
            answers = dict(result.get("answers", {}))
            cache_hit = bool(result.get("cache_hit", False))
            if cache_hit:
                self._cache_hits += 1
            else:
                self._model_calls += 1
            raw_weights = raw_weights_from_answers(
                self.encoding,
                answers,
                score_decoding=self.score_decoding,
            )
            snapped = snap_to_grid(raw_weights)
            confidence = self._confidence(answers)

        for bucket in BUCKETS:
            self._raw_weight_history[bucket].append(float(raw_weights[bucket]))
        self._confidences.append(confidence)

        diagnostics = {
            "encoding": self.encoding,
            "encoding_version": ENCODING_VERSION[self.encoding],
            "observation_version": OBSERVATION_VERSION,
            "cache_hit": cache_hit,
            "confidence": round(confidence, 6),
            "target_units": dict(snapped.units),
            "raw_weights": {
                key: round(float(value), 6) for key, value in raw_weights.items()
            },
        }
        self.decision_log.append(diagnostics)

        if self._prior is not None and snapped == self._prior:
            return self._hold("laya_target_unchanged")

        current_stable_units = round(
            float(snapshot.current_asset_allocation.get("stable", 0.0)) * 20
        )
        action: DecisionAction = (
            "sell" if snapped.units["stable"] > current_stable_units else "buy"
        )
        self._targets.add(tuple(snapped.units[bucket] for bucket in BUCKETS))
        self._target_change_days += 1
        return AllocationIntent(
            action=action,
            target_allocation=snapped.as_target(),
            allocation_name=f"laya_{self.encoding}",
            immediate=True,
            reason=f"laya_{self.encoding}_target",
            rule_group="none",
            decision_score=confidence,
            diagnostics={"laya": diagnostics},
        )

    def record_execution(
        self,
        *,
        context: StrategyContext,
        intent: AllocationIntent,
        execution: ExecutionOutcome,
    ) -> None:
        del context, execution
        if intent.target_allocation is None:
            return
        units = {
            bucket: int(round(float(intent.target_allocation.get(bucket, 0.0)) * 20))
            for bucket in BUCKETS
        }
        self._prior = SnappedAllocation(units=units)

    def summary_metrics(self) -> dict[str, Any]:
        raw_std = {
            bucket: (round(statistics.pstdev(values), 8) if len(values) > 1 else 0.0)
            for bucket, values in self._raw_weight_history.items()
        }
        return {
            "model_calls": self._model_calls,
            "cache_hits": self._cache_hits,
            "distinct_targets": len(self._targets),
            "target_change_days": self._target_change_days,
            "raw_weight_std": raw_std,
            "mean_confidence": (
                round(statistics.fmean(self._confidences), 8)
                if self._confidences
                else 0.0
            ),
        }


__all__ = ["LayaDecisionPolicy"]
