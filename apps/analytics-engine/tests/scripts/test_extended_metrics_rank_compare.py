"""Unit tests for scripts/attribution/extended_metrics_rank_compare.py.

DB-independent: tiny inline fixture, no fixture file on disk, no DB.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pytest

from scripts.attribution.extended_metrics_rank_compare import (
    DUPLICATE_CUTOFF,
    EXISTING_METRICS,
    NEW_INFO_CUTOFF,
    NEW_METRICS,
    ProbeArgs,
    StrategyUniverse,
    _average_ranks,
    classify,
    extract_metric_vectors,
    load_universe,
    parse_args,
    run,
    spearman_rho,
)

# ---------------------------------------------------------------------------
# _average_ranks — ties and ordering
# ---------------------------------------------------------------------------


def test_average_ranks_no_ties() -> None:
    ranks = _average_ranks(np.array([10.0, 30.0, 20.0]))
    np.testing.assert_array_equal(ranks, np.array([1.0, 3.0, 2.0]))


def test_average_ranks_with_ties() -> None:
    # Two values tied for ranks 2 and 3 -> both get 2.5
    ranks = _average_ranks(np.array([10.0, 20.0, 20.0, 40.0]))
    np.testing.assert_array_equal(ranks, np.array([1.0, 2.5, 2.5, 4.0]))


# ---------------------------------------------------------------------------
# spearman_rho — known cases
# ---------------------------------------------------------------------------


def test_spearman_rho_perfect_positive() -> None:
    left = np.array([1.0, 2.0, 3.0, 4.0, 5.0])
    right = np.array([10.0, 20.0, 30.0, 40.0, 50.0])
    cell = spearman_rho(left, right)
    assert cell.rho == pytest.approx(1.0)
    assert cell.is_undefined is False


def test_spearman_rho_perfect_negative() -> None:
    left = np.array([1.0, 2.0, 3.0, 4.0, 5.0])
    right = np.array([50.0, 40.0, 30.0, 20.0, 10.0])
    cell = spearman_rho(left, right)
    assert cell.rho == pytest.approx(-1.0)


def test_spearman_rho_monotonic_nonlinear_is_perfect() -> None:
    # Spearman cares about rank, not linearity: x and x^3 are perfectly ranked.
    left = np.array([1.0, 2.0, 3.0, 4.0, 5.0])
    right = left**3
    cell = spearman_rho(left, right)
    assert cell.rho == pytest.approx(1.0)


def test_spearman_rho_constant_input_is_undefined() -> None:
    left = np.array([1.0, 2.0, 3.0, 4.0])
    right = np.array([7.0, 7.0, 7.0, 7.0])
    cell = spearman_rho(left, right)
    assert cell.is_undefined is True
    assert cell.rho == 0.0


def test_spearman_rho_too_small_is_undefined() -> None:
    cell = spearman_rho(np.array([1.0]), np.array([2.0]))
    assert cell.is_undefined is True


# ---------------------------------------------------------------------------
# classify — boundary semantics
# ---------------------------------------------------------------------------


def test_classify_just_below_new_info_cutoff() -> None:
    assert classify(NEW_INFO_CUTOFF - 0.0001) == "NEW INFO"


def test_classify_at_new_info_cutoff_is_partial_overlap() -> None:
    # 0.7 belongs to [0.7, 0.9] PARTIAL OVERLAP band per the README.
    assert classify(NEW_INFO_CUTOFF) == "PARTIAL OVERLAP"


def test_classify_at_duplicate_cutoff_is_partial_overlap() -> None:
    # 0.9 is the upper bound of PARTIAL OVERLAP, not yet DUPLICATE.
    assert classify(DUPLICATE_CUTOFF) == "PARTIAL OVERLAP"


def test_classify_just_above_duplicate_cutoff() -> None:
    assert classify(DUPLICATE_CUTOFF + 0.0001) == "DUPLICATE"


# ---------------------------------------------------------------------------
# load_universe — deprecated handling
# ---------------------------------------------------------------------------


def _make_snapshot(strategy_ids: list[str], deprecated: list[str]) -> dict[str, object]:
    metrics = dict.fromkeys((*NEW_METRICS, *EXISTING_METRICS), 0.0)
    strategies = {sid: dict(metrics) for sid in strategy_ids}
    return {"strategies": strategies, "deprecated_strategies": deprecated}


def test_load_universe_includes_deprecated_by_default() -> None:
    payload = _make_snapshot(["a", "b", "c"], deprecated=["b"])
    universe = load_universe(payload, exclude_deprecated=False)
    assert universe.strategies == ["a", "b", "c"]
    assert universe.deprecated == frozenset({"b"})


def test_load_universe_excludes_deprecated_on_request() -> None:
    payload = _make_snapshot(["a", "b", "c"], deprecated=["b"])
    universe = load_universe(payload, exclude_deprecated=True)
    assert universe.strategies == ["a", "c"]


# ---------------------------------------------------------------------------
# extract_metric_vectors — alignment + missing-key error
# ---------------------------------------------------------------------------


def test_extract_metric_vectors_aligns_with_universe_order() -> None:
    payload: dict[str, object] = {
        "strategies": {
            "a": {"omega_ratio": 1.1, "sharpe_ratio": 0.5},
            "b": {"omega_ratio": 2.2, "sharpe_ratio": 1.5},
            "c": {"omega_ratio": 3.3, "sharpe_ratio": 2.5},
        },
        "deprecated_strategies": [],
    }
    universe = StrategyUniverse(strategies=["a", "b", "c"], deprecated=frozenset())
    vectors = extract_metric_vectors(payload, universe, ("omega_ratio", "sharpe_ratio"))
    np.testing.assert_array_equal(vectors["omega_ratio"], [1.1, 2.2, 3.3])
    np.testing.assert_array_equal(vectors["sharpe_ratio"], [0.5, 1.5, 2.5])


def test_extract_metric_vectors_raises_on_missing_key() -> None:
    payload: dict[str, object] = {
        "strategies": {
            "a": {"omega_ratio": 1.0},
        },
        "deprecated_strategies": [],
    }
    universe = StrategyUniverse(strategies=["a"], deprecated=frozenset())
    with pytest.raises(ValueError, match="missing numeric metric"):
        extract_metric_vectors(payload, universe, ("sharpe_ratio",))


# ---------------------------------------------------------------------------
# run() end-to-end on an inline fixture
# ---------------------------------------------------------------------------


def _inline_fixture(tmp_path: Path) -> Path:
    """Three strategies with hand-crafted metric vectors.

    - Strategy A is the worst across the board.
    - Strategy B is middle.
    - Strategy C is best.

    All 6 new metrics rank perfectly with all 6 existing metrics (A < B < C),
    so the verdict for every new metric should be DUPLICATE.
    """
    metric_values_by_rank = {
        "omega_ratio": (1.0, 1.5, 2.0),
        "tail_ratio": (0.9, 1.0, 1.2),
        "skewness": (-0.5, 0.0, 0.5),
        "excess_kurtosis": (-1.0, 0.5, 2.0),
        "pain_index": (0.20, 0.15, 0.10),  # lower is better for ranking,
        # but we still pass through abs(rho); monotonic ordering matters.
        "max_drawdown_recovery_days": (60.0, 30.0, 10.0),
        "sharpe_ratio": (0.5, 1.0, 1.5),
        "sortino_ratio": (0.6, 1.1, 1.7),
        "calmar_ratio": (0.3, 0.6, 1.2),
        "max_drawdown_percent": (-30.0, -20.0, -10.0),
        "volatility": (0.40, 0.30, 0.20),
        "ulcer_index": (0.15, 0.10, 0.05),
    }
    fixture = {
        "strategies": {
            sid: {
                metric: values[idx] for metric, values in metric_values_by_rank.items()
            }
            for idx, sid in enumerate(("a", "b", "c"))
        },
        "deprecated_strategies": [],
    }
    path = tmp_path / "fixture.json"
    path.write_text(json.dumps(fixture))
    return path


def test_run_writes_report_with_verdict_table(tmp_path: Path) -> None:
    input_path = _inline_fixture(tmp_path)
    output_path = tmp_path / "report.md"
    args = ProbeArgs(
        input_path=input_path,
        output_path=output_path,
        exclude_deprecated=False,
    )
    report = run(args)
    # Report file written.
    assert output_path.exists()
    assert output_path.read_text() == report
    # Verdict section present.
    assert "## Verdict Summary" in report
    # Every new metric appears in the verdict block.
    for new_metric in NEW_METRICS:
        assert f"`{new_metric}`" in report
    # 6x6 internal matrix present.
    assert "## Internal Redundancy (new × new)" in report


def test_run_yields_duplicate_verdict_on_monotonic_fixture(
    tmp_path: Path,
) -> None:
    """Every new metric correlates +1 or -1 with at least one existing metric,
    so all 6 verdicts should be DUPLICATE on this hand-crafted dataset."""
    input_path = _inline_fixture(tmp_path)
    output_path = tmp_path / "report.md"
    args = ProbeArgs(
        input_path=input_path,
        output_path=output_path,
        exclude_deprecated=False,
    )
    report = run(args)
    # Each new metric line in the verdict table should end with **DUPLICATE** |.
    for new_metric in NEW_METRICS:
        verdict_lines = [
            line
            for line in report.splitlines()
            if line.startswith(f"| `{new_metric}` |") and "Verdict" not in line
        ]
        assert verdict_lines, f"verdict row missing for {new_metric}"
        # The verdict row appears once in the verdict summary table.
        verdict_row = verdict_lines[0]
        assert "**DUPLICATE**" in verdict_row


def test_run_raises_when_universe_too_small(tmp_path: Path) -> None:
    fixture = {
        "strategies": {
            "a": dict.fromkeys((*NEW_METRICS, *EXISTING_METRICS), 0.0),
            "b": dict.fromkeys((*NEW_METRICS, *EXISTING_METRICS), 0.0),
        },
        "deprecated_strategies": [],
    }
    input_path = tmp_path / "tiny.json"
    input_path.write_text(json.dumps(fixture))
    args = ProbeArgs(
        input_path=input_path,
        output_path=tmp_path / "out.md",
        exclude_deprecated=False,
    )
    with pytest.raises(ValueError, match="at least 3 strategies"):
        run(args)


# ---------------------------------------------------------------------------
# Internal matrix symmetry on a small real-shape fixture
# ---------------------------------------------------------------------------


def test_internal_matrix_is_symmetric_and_unit_diagonal(
    tmp_path: Path,
) -> None:
    input_path = _inline_fixture(tmp_path)
    output_path = tmp_path / "report.md"
    args = ProbeArgs(
        input_path=input_path,
        output_path=output_path,
        exclude_deprecated=False,
    )
    payload = json.loads(input_path.read_text())
    universe = load_universe(payload, exclude_deprecated=False)
    vectors = extract_metric_vectors(payload, universe, NEW_METRICS)
    for a in NEW_METRICS:
        diag = spearman_rho(vectors[a], vectors[a])
        assert diag.rho == pytest.approx(1.0)
        for b in NEW_METRICS:
            ab = spearman_rho(vectors[a], vectors[b])
            ba = spearman_rho(vectors[b], vectors[a])
            assert ab.rho == pytest.approx(ba.rho)
    # Exercise run() to confirm no exception.
    run(args)


# ---------------------------------------------------------------------------
# parse_args round-trip
# ---------------------------------------------------------------------------


def test_parse_args_defaults() -> None:
    args = parse_args([])
    assert args.exclude_deprecated is False
    assert args.input_path.name == "strategy_performance_snapshot_500d.json"
    assert args.output_path.name == "extended_metrics_rank_correlation.md"


def test_parse_args_exclude_deprecated_flag() -> None:
    args = parse_args(["--exclude-deprecated"])
    assert args.exclude_deprecated is True
