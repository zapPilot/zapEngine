"""Deterministic fake Laya client for offline tests and smoke runs."""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from typing import Any, Literal

FakeMode = Literal["scripted", "hashed"]


@dataclass
class FakeLayaClient:
    model_id: str = "fake-laya"
    mode: FakeMode = "hashed"
    scripted: list[dict[str, Any]] = field(default_factory=list)
    calls: int = field(default=0, init=False)

    @property
    def device_tag(self) -> str:
        return "fake"

    def predict(
        self,
        observation: dict[str, Any],
        questions: dict[str, dict[str, Any]],
    ) -> dict[str, Any]:
        self.calls += 1
        if self.mode == "scripted":
            if not self.scripted:
                raise AssertionError("FakeLayaClient scripted queue exhausted")
            answers = self.scripted.pop(0)
        else:
            answers = self._hashed_answers(observation, questions)
        return {
            "answers": answers,
            "usage": {"input_tokens": 0, "output_tokens": 0},
            "cache_hit": False,
        }

    @staticmethod
    def _hashed_answers(
        observation: dict[str, Any],
        questions: dict[str, dict[str, Any]],
    ) -> dict[str, Any]:
        seed = json.dumps(observation, sort_keys=True, separators=(",", ":"))
        results: dict[str, Any] = {}
        for question_id, question in questions.items():
            digest = hashlib.sha256(f"{seed}:{question_id}".encode()).digest()
            qtype = question["type"]
            criteria = question.get("criteria")
            if qtype == "score":
                if not isinstance(criteria, list):
                    raise ValueError("score question criteria must be a list")
                count = len(criteria)
                index = digest[0] % count
                probabilities = dict.fromkeys((str(i) for i in range(count)), 0.0)
                probabilities[str(index)] = 1.0
                results[question_id] = {
                    "type": "score",
                    "score": float(index),
                    "probabilities": probabilities,
                    "confidence": 1.0,
                }
            elif qtype == "choice":
                if not isinstance(criteria, dict):
                    raise ValueError("choice question criteria must be a mapping")
                keys = list(criteria)
                choice = keys[digest[0] % len(keys)]
                probabilities = dict.fromkeys(keys, 0.0)
                probabilities[choice] = 1.0
                results[question_id] = {
                    "type": "choice",
                    "choice": choice,
                    "probabilities": probabilities,
                    "confidence": 1.0,
                }
            else:
                results[question_id] = {
                    "type": "noul",
                    "noul": float(digest[0] % 2),
                    "confidence": 1.0,
                }
        return results


__all__ = ["FakeLayaClient"]
