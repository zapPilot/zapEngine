from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest

from src.services.backtesting.lab import promotion_checks
from src.services.backtesting.lab.bundle import synthetic_bundle
from src.services.backtesting.lab.envelope import Context
from src.services.backtesting.lab.promotion_checks import own_checks, validation_events
from src.services.backtesting.lab.promotion_commands import DEFAULT_EVENTS
from src.services.backtesting.spec import load_spec, parse_spec
from src.services.backtesting.spec.loader import STRATEGIES_DIR
from src.services.backtesting.validation.event_runner import ValidationEventError
from tests.services.backtesting.spec.helpers import reference_raw

BUNDLE = "synthetic:regimes?seed=1&days=300"


def _without(rule_id: str):
    raw = reference_raw()
    raw["id"] = f"without_{rule_id}"
    raw["rules"] = [rule for rule in raw["rules"] if rule["id"] != rule_id]
    return parse_spec(raw)


def test_the_reference_passes_every_validation_event() -> None:
    checked, failures = validation_events(
        load_spec("reference/dma_fgi"), DEFAULT_EVENTS
    )

    assert (checked, failures) == (14, [])


def test_a_candidate_that_breaks_the_behavioral_contract_names_the_events() -> None:
    checked, failures = validation_events(_without("cross_down_exit"), DEFAULT_EVENTS)

    assert checked == 14
    assert "btc_cross_down_2025_03_08" in failures
    assert "spy_cross_down_2025_03_10" in failures


def test_events_for_other_strategies_prove_nothing_about_this_one(
    tmp_path: Path,
) -> None:
    events = json.loads(DEFAULT_EVENTS.read_text())
    for day in events.values():
        for event in day["events"]:
            event["applicable_strategies"] = ["dca_classic"]
    path = tmp_path / "events.json"
    path.write_text(json.dumps(events))

    assert validation_events(load_spec("reference/dma_fgi"), path) == (0, [])


def test_a_missing_events_fixture_is_an_error(tmp_path: Path) -> None:
    with pytest.raises(ValidationEventError, match="not found"):
        validation_events(load_spec("reference/dma_fgi"), tmp_path / "nope.json")


def test_the_default_events_are_the_committed_fixture() -> None:
    assert DEFAULT_EVENTS.name == "hierarchical_validation_events.json"
    assert DEFAULT_EVENTS.is_file()


@pytest.fixture()
def stubbed_slow_checks(monkeypatch: pytest.MonkeyPatch) -> dict[str, Any]:
    """Liveness and the golden check take minutes; these tests stub them."""
    calls: dict[str, Any] = {}

    def liveness(spec: Any, bundles: Any, primary: Any, config: Any) -> Any:
        calls["liveness"] = (spec.id, sorted(bundles), sorted(primary))
        return SimpleNamespace(
            leaves=[
                SimpleNamespace(pointer="/a", status="live"),
                SimpleNamespace(pointer="/b", status="dead"),
                SimpleNamespace(pointer="/c", status="dormant"),
            ]
        )

    def golden_differences(path: Path, refs: Any, context: Context) -> Any:
        calls["golden"] = (path, refs)
        return ["reference/dma_fgi"], {"reference/dma_fgi": ["digest changed"]}

    monkeypatch.setattr(promotion_checks, "liveness", liveness)
    monkeypatch.setattr(promotion_checks, "golden_differences", golden_differences)
    return calls


def test_the_promotion_runs_its_own_checks_on_the_evidence(
    tmp_path: Path, stubbed_slow_checks: dict[str, Any]
) -> None:
    bundle = synthetic_bundle(BUNDLE)
    stress = {
        "synthetic:stress?seed=1&days=300": synthetic_bundle(
            "synthetic:stress?seed=1&days=300"
        )
    }
    context = Context(strategies_dir=STRATEGIES_DIR, lab_dir=tmp_path)

    checks = own_checks(
        load_spec("reference/dma_fgi"),
        bundle,
        stress=stress,
        events_path=DEFAULT_EVENTS,
        golden_path=tmp_path / "golden.json",
        context=context,
    )

    assert checks.bundle_source == "synthetic"
    assert checks.dead_parameters == ["/b"]
    assert checks.broken_hard_invariants == []
    assert (checks.events_checked, checks.event_failures) == (14, [])
    assert checks.golden_differences == {"reference/dma_fgi": ["digest changed"]}
    primary = f"{bundle.manifest.name}:{bundle.manifest.bundle_id}"
    assert stubbed_slow_checks["liveness"] == (
        "dma_fgi",
        sorted([primary, "synthetic:stress?seed=1&days=300"]),
        [primary],
    )
    assert stubbed_slow_checks["golden"] == (tmp_path / "golden.json", None)


def test_a_broken_hard_invariant_is_named(
    tmp_path: Path,
    stubbed_slow_checks: dict[str, Any],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    del stubbed_slow_checks

    def evaluate(spec: Any, bundle: Any, config: Any, *, git: Any) -> Any:
        return SimpleNamespace(
            body={
                "invariants": [
                    {"name": "weights_valid", "hard": True, "count": 2},
                    {"name": "held_below_dma_days", "hard": False, "count": 40},
                    {"name": "never_broken", "hard": True, "count": 0},
                ]
            }
        )

    monkeypatch.setattr(promotion_checks, "evaluate", evaluate)

    checks = own_checks(
        load_spec("reference/dma_fgi"),
        synthetic_bundle(BUNDLE),
        stress={},
        events_path=DEFAULT_EVENTS,
        golden_path=tmp_path / "golden.json",
        context=Context(strategies_dir=STRATEGIES_DIR, lab_dir=tmp_path),
    )

    assert checks.broken_hard_invariants == ["weights_valid"]
