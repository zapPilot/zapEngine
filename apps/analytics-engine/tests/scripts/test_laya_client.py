from __future__ import annotations

import subprocess
import sys
from pathlib import Path

from scripts.research.laya.client import CachedLayaClient
from scripts.research.laya.fakes import FakeLayaClient
from scripts.research.laya.questions import questions_for_encoding


def test_cache_hit_miss_and_dict_order_stability(tmp_path: Path) -> None:
    inner = FakeLayaClient()
    path = tmp_path / "cache.jsonl"
    cached = CachedLayaClient(
        inner,
        path,
        "per_bucket_score_v1",
        device_tag_override="fake",
    )
    questions = questions_for_encoding("per_bucket_score")
    first = cached.predict({"b": 2, "a": 1}, questions)
    second = cached.predict({"a": 1, "b": 2}, questions)
    assert first["cache_hit"] is False
    assert second["cache_hit"] is True
    assert inner.calls == 1
    assert len(path.read_text(encoding="utf-8").splitlines()) == 1


def test_cache_key_is_sensitive_to_encoding_version_and_device(tmp_path: Path) -> None:
    path = tmp_path / "cache.jsonl"
    inner = FakeLayaClient()
    questions = questions_for_encoding("posture_mixture")
    observation = {"fgi": {"v": 50}}

    first = CachedLayaClient(inner, path, "v1", device_tag_override="cpu")
    second = CachedLayaClient(inner, path, "v2", device_tag_override="cpu")
    third = CachedLayaClient(inner, path, "v1", device_tag_override="mps")
    assert first.predict(observation, questions)["cache_hit"] is False
    assert second.predict(observation, questions)["cache_hit"] is False
    assert third.predict(observation, questions)["cache_hit"] is False
    assert inner.calls == 3


def test_cache_tolerates_corrupt_tail(tmp_path: Path) -> None:
    path = tmp_path / "cache.jsonl"
    inner = FakeLayaClient()
    questions = questions_for_encoding("posture_mixture")
    observation = {"macro": {"v": 40}}
    cached = CachedLayaClient(inner, path, "v1", device_tag_override="fake")
    assert cached.predict(observation, questions)["cache_hit"] is False
    with path.open("a", encoding="utf-8") as handle:
        handle.write("{corrupt-tail\n")

    reloaded = CachedLayaClient(inner, path, "v1", device_tag_override="fake")
    assert reloaded.predict(observation, questions)["cache_hit"] is True
    assert inner.calls == 1


def test_research_package_imports_do_not_load_laya_torch_or_transformers() -> None:
    code = """
import sys
import scripts.research.laya.observation
import scripts.research.laya.questions
import scripts.research.laya.decoder
import scripts.research.laya.client
import scripts.research.laya.fakes
import scripts.research.laya.policy
import scripts.research.laya.strategy
import scripts.research.laya.runner
blocked = [name for name in sys.modules if name == 'laya' or name.startswith('laya.') or name == 'torch' or name.startswith('torch.') or name == 'transformers' or name.startswith('transformers.')]
raise SystemExit(1 if blocked else 0)
"""
    completed = subprocess.run(
        [sys.executable, "-c", code],
        check=False,
        capture_output=True,
        text=True,
    )
    assert completed.returncode == 0, completed.stderr
