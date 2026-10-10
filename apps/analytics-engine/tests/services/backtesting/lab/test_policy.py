from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any

import pytest

from src.services.backtesting.lab.folds import MIN_FOLDS
from src.services.backtesting.lab.policy import (
    POLICY_FILENAME,
    POLICY_FORMAT,
    POLICY_PATH,
    PolicyError,
    load_policy,
)
from src.services.backtesting.spec.loader import STRATEGIES_DIR


def _raw() -> dict[str, Any]:
    raw: dict[str, Any] = json.loads(POLICY_PATH.read_text())
    return copy.deepcopy(raw)


def _write(tmp_path: Path, raw: Any) -> Path:
    path = tmp_path / POLICY_FILENAME
    path.write_text(raw if isinstance(raw, str) else json.dumps(raw))
    return path


def test_the_committed_policy_lives_next_to_the_references() -> None:
    assert POLICY_PATH == STRATEGIES_DIR / POLICY_FILENAME
    assert POLICY_PATH.is_file()


def test_the_committed_policy_is_the_reviews_proposal() -> None:
    policy = load_policy().policy

    assert policy.format == POLICY_FORMAT
    assert policy.prerequisites.model_dump() == {
        "real_data_only": True,
        "canonical_assumptions": True,
        "no_dead_parameters": True,
        "hard_invariants": True,
        "validation_events": True,
        "golden_unaffected": True,
    }
    assert policy.walk_forward.model_dump() == {
        "min_folds": 3,
        "fold_win_rate_at_least": 0.6,
        "mean_oos_edge_above_pp": 0.0,
        "bootstrap_p_below": 0.1,
        "fold_drawdown_worse_by_at_most_pp": 3.0,
        "deflated_sharpe_above": 0.9,
    }
    assert policy.holdout.required is True


def test_the_committed_structural_bar_is_the_plans() -> None:
    structural = load_policy().policy.structural

    assert structural.real_bundle.model_dump() == {
        "roi_shortfall_at_most_pp": 2.0,
        "drawdown_worse_by_at_most_pp": 3.0,
    }
    suite = structural.stress_suite
    assert suite.bundles == (
        *(f"synthetic:regimes?seed={seed}&days=500" for seed in (1, 2, 3)),
        *(f"synthetic:stress?seed={seed}&days=500" for seed in range(1, 7)),
    )
    assert (
        suite.median_roi_shortfall_at_most_pp,
        suite.median_drawdown_worse_by_at_most_pp,
    ) == (0.0, 0.0)


def test_a_policy_names_its_file_and_hashes_its_content(tmp_path: Path) -> None:
    loaded = load_policy()
    again = load_policy(_write(tmp_path, _raw()))

    assert loaded.path == POLICY_PATH
    assert loaded.policy_hash.startswith("sha256:")
    assert again.policy_hash == loaded.policy_hash
    assert loaded.as_dict() == {"path": str(POLICY_PATH), "hash": loaded.policy_hash}


def test_the_hash_moves_with_the_bar_and_not_with_the_formatting(
    tmp_path: Path,
) -> None:
    raw = _raw()
    reformatted = tmp_path / "reformatted.json"
    reformatted.write_text(json.dumps(raw, indent=8))
    raw["walk_forward"]["fold_win_rate_at_least"] = 0.7
    stricter = tmp_path / "stricter.json"
    stricter.write_text(json.dumps(raw))

    assert load_policy(reformatted).policy_hash == load_policy().policy_hash
    assert load_policy(stricter).policy_hash != load_policy().policy_hash


def test_a_missing_policy_is_an_error(tmp_path: Path) -> None:
    with pytest.raises(PolicyError, match="No promotion policy"):
        load_policy(tmp_path / "nope.json")


def test_a_policy_that_is_not_json_is_an_error(tmp_path: Path) -> None:
    with pytest.raises(PolicyError, match="is not JSON"):
        load_policy(_write(tmp_path, "{not json"))


@pytest.mark.parametrize(
    ("edit", "fragment"),
    [
        (lambda raw: raw.update(surprise=1), "/surprise"),
        (lambda raw: raw.update(format="promotion-policy/2"), "/format"),
        (
            lambda raw: raw["prerequisites"].pop("hard_invariants"),
            "/prerequisites/hard_invariants",
        ),
        (
            lambda raw: raw["walk_forward"].update(min_folds=MIN_FOLDS - 1),
            "/walk_forward/min_folds",
        ),
        (
            lambda raw: raw["walk_forward"].update(fold_win_rate_at_least=1.5),
            "/walk_forward/fold_win_rate_at_least",
        ),
        (
            lambda raw: raw["walk_forward"].update(bootstrap_p_below=0.0),
            "/walk_forward/bootstrap_p_below",
        ),
        (
            lambda raw: raw["walk_forward"].update(deflated_sharpe_above=-0.1),
            "/walk_forward/deflated_sharpe_above",
        ),
        (
            lambda raw: raw["holdout"].update(roi_shortfall_at_most_pp=-1),
            "/holdout/roi_shortfall_at_most_pp",
        ),
        (lambda raw: raw.update(description=""), "/description"),
        (lambda raw: raw.pop("structural"), "/structural"),
        (
            lambda raw: raw["structural"]["real_bundle"].update(
                roi_shortfall_at_most_pp=-1
            ),
            "/structural/real_bundle/roi_shortfall_at_most_pp",
        ),
        (
            lambda raw: raw["structural"]["stress_suite"].update(bundles=[]),
            "/structural/stress_suite/bundles",
        ),
        (
            lambda raw: raw["structural"]["stress_suite"]["bundles"].append(
                "prod:latest"
            ),
            "/structural/stress_suite/bundles",
        ),
        (
            lambda raw: raw["structural"]["stress_suite"]["bundles"].append(
                raw["structural"]["stress_suite"]["bundles"][0]
            ),
            "/structural/stress_suite/bundles",
        ),
    ],
)
def test_a_policy_that_does_not_say_what_it_must_points_at_the_fault(
    tmp_path: Path, edit: Any, fragment: str
) -> None:
    raw = _raw()
    edit(raw)

    with pytest.raises(PolicyError) as caught:
        load_policy(_write(tmp_path, raw))

    assert fragment in str(caught.value)
