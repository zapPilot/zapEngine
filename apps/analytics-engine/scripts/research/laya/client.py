"""Lazy Laya client plus deterministic JSONL cache for offline research."""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Protocol


class LayaDecisionClient(Protocol):
    @property
    def model_id(self) -> str: ...

    @property
    def device_tag(self) -> str: ...

    def predict(
        self,
        observation: dict[str, Any],
        questions: dict[str, dict[str, Any]],
    ) -> dict[str, Any]: ...


def _internal_question(question: dict[str, Any]) -> dict[str, Any]:
    return {
        "t": question["type"],
        "ins": question["instructions"],
        "crit": question.get("criteria"),
    }


@dataclass
class LayaHubClient:
    """Loads torch/Laya only on the first real inference call."""

    model_id: str = "convaiinnovations/laya"
    device: str | None = None
    subfolder: str | None = None
    _agent: Any = field(default=None, init=False, repr=False)
    _resolved_device: str | None = field(default=None, init=False, repr=False)

    @property
    def device_tag(self) -> str:
        return self._resolved_device or self.device or "auto"

    def _load(self) -> Any:
        if self._agent is None:
            import laya

            self._agent = laya.load(
                self.model_id,
                device=self.device,
                subfolder=self.subfolder,
            )
            self._resolved_device = str(self._agent.device)
        return self._agent

    def assert_fits(
        self,
        observation: dict[str, Any],
        questions: dict[str, dict[str, Any]],
    ) -> None:
        agent = self._load()
        from laya.common import build_sequence

        max_len = int(agent.cfg.get("max_len", 512))
        head_max_len = int(agent.cfg.get("head_max_len", 192))
        state_text = json.dumps(observation, ensure_ascii=False)
        state_ids = agent.tok(
            state_text.replace(agent.tok.mask_token, " "),
            add_special_tokens=False,
        )["input_ids"]
        for question_id, question in questions.items():
            internal = _internal_question(question)
            empty_sequence, _markers = build_sequence(
                agent.tok,
                "",
                internal,
                max_len,
                head_max_len,
            )
            available_state_tokens = max(0, max_len - len(empty_sequence))
            if len(state_ids) > available_state_tokens:
                raise ValueError(
                    "Laya observation would be truncated for "
                    f"question '{question_id}': {len(state_ids)} state tokens > "
                    f"{available_state_tokens} available"
                )

    def predict(
        self,
        observation: dict[str, Any],
        questions: dict[str, dict[str, Any]],
    ) -> dict[str, Any]:
        agent = self._load()
        self.assert_fits(observation, questions)
        result = dict(agent.predict(observation, questions))
        return {
            "answers": dict(result.get("answers", {})),
            "usage": dict(result.get("usage", {})),
            "cache_hit": False,
        }


@dataclass
class CachedLayaClient:
    inner: LayaDecisionClient
    path: Path
    encoding_version: str
    device_tag_override: str | None = None
    _entries: dict[str, dict[str, Any]] = field(default_factory=dict, init=False)

    def __post_init__(self) -> None:
        self.path = Path(self.path)
        self._load_existing()

    @property
    def model_id(self) -> str:
        return self.inner.model_id

    @property
    def device_tag(self) -> str:
        return self.device_tag_override or self.inner.device_tag

    def _load_existing(self) -> None:
        if not self.path.exists():
            return
        for line in self.path.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            try:
                payload = json.loads(line)
            except json.JSONDecodeError:
                continue
            key = payload.get("key")
            if isinstance(key, str):
                self._entries[key] = payload

    def _key(
        self,
        observation: dict[str, Any],
        questions: dict[str, dict[str, Any]],
    ) -> str:
        subfolder = getattr(self.inner, "subfolder", None)
        payload = [
            self.model_id,
            subfolder,
            self.encoding_version,
            self.device_tag,
            observation,
            questions,
        ]
        encoded = json.dumps(
            payload,
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=True,
        ).encode("utf-8")
        return hashlib.sha256(encoded).hexdigest()

    def predict(
        self,
        observation: dict[str, Any],
        questions: dict[str, dict[str, Any]],
    ) -> dict[str, Any]:
        key = self._key(observation, questions)
        cached = self._entries.get(key)
        if cached is not None:
            return {
                "answers": dict(cached.get("answers", {})),
                "usage": dict(cached.get("usage", {})),
                "cache_hit": True,
            }

        result = self.inner.predict(observation, questions)
        entry = {
            "key": key,
            "model_id": self.model_id,
            "device": self.device_tag,
            "encoding_version": self.encoding_version,
            "answers": result.get("answers", {}),
            "usage": result.get("usage", {}),
            "created_at": datetime.now(UTC).isoformat(),
        }
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(entry, sort_keys=True, ensure_ascii=True) + "\n")
        self._entries[key] = entry
        return {
            "answers": dict(entry["answers"]),
            "usage": dict(entry["usage"]),
            "cache_hit": False,
        }


__all__ = ["CachedLayaClient", "LayaDecisionClient", "LayaHubClient"]
