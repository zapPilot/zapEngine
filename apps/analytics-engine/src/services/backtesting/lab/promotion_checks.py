"""The checks a promotion runs itself on the evidence data.

A sweep and a holdout look arrive as files. These checks are not files: they are
questions about the candidate that only the lab can answer by running it (or, for
the structural track, by reading it next to the reference), so the promotion
asks them rather than taking anyone's word.
"""

from __future__ import annotations

from collections.abc import Collection, Mapping
from pathlib import Path
from typing import Any

from src.models.backtesting import BacktestCompareConfigV3, BacktestCompareRequestV3
from src.services.backtesting.constants import STRATEGY_DMA_FGI_PORTFOLIO_RULES
from src.services.backtesting.execution.compare import run_compare_v3_on_data
from src.services.backtesting.lab.bundle import Bundle
from src.services.backtesting.lab.diff import (
    BASE,
    CANDIDATE,
    SpecChange,
    compare_on_bundle,
    spec_diff,
)
from src.services.backtesting.lab.envelope import Context
from src.services.backtesting.lab.evaluate import evaluate
from src.services.backtesting.lab.golden_commands import golden_differences
from src.services.backtesting.lab.liveness import DEAD, liveness, tunable_leaves
from src.services.backtesting.lab.promotion import OwnChecks, StructuralEvidence
from src.services.backtesting.lab.report import hash_of, normalize
from src.services.backtesting.lab.runner import EvalConfig
from src.services.backtesting.spec import SpecIssue, StrategySpec
from src.services.backtesting.strategy_registry import resolve_spec_strategy_config
from src.services.backtesting.validation.event_histories import (
    strategy_timeline,
    synthetic_event_history,
)
from src.services.backtesting.validation.event_runner import (
    evaluate_event,
    load_validation_events,
)

CANDIDATE_KEY = "candidate"
TOTAL_CAPITAL = 10_000.0
# Fields that name a spec rather than say what it does.
_IDENTITY = frozenset({"/id", "/version", "/description"})
# What the structural track compares on each history of its suite.
_SUITE_METRICS = ("roi_percent", "max_drawdown_percent", "trade_count")


def validation_events(spec: StrategySpec, events_path: Path) -> tuple[int, list[str]]:
    """How many events apply to the rule strategy, and the ones ``spec`` fails.

    Each event is a short synthetic market shaped to produce one situation (a
    cross, a ratio move, a fear spike) with assertions about what the strategy
    must decide there. They are the behavioral contract the production reference
    keeps, so a candidate that breaks one is changing that contract, and the
    promotion that makes it the reference updates the fixture with it.
    """
    events = [
        event
        for event in load_validation_events(events_path)
        if event.applies_to(STRATEGY_DMA_FGI_PORTFOLIO_RULES)
    ]
    failures: list[str] = []
    for event in events:
        prices, sentiments, start, end = synthetic_event_history(event)
        response = run_compare_v3_on_data(
            prices=prices,
            sentiments=sentiments,
            request=BacktestCompareRequestV3(
                token_symbol="BTC",
                start_date=start,
                end_date=end,
                total_capital=TOTAL_CAPITAL,
                configs=[
                    BacktestCompareConfigV3(
                        config_id=CANDIDATE_KEY,
                        strategy_id=STRATEGY_DMA_FGI_PORTFOLIO_RULES,
                    )
                ],
            ),
            user_start_date=start,
            resolved_configs=[
                resolve_spec_strategy_config(spec, config_id=CANDIDATE_KEY)
            ],
        )
        timeline = strategy_timeline(response.model_dump(mode="json"), CANDIDATE_KEY)
        if not evaluate_event(event, timeline).passed:
            failures.append(event.id)
    return len(events), failures


def own_checks(
    spec: StrategySpec,
    bundle: Bundle,
    *,
    stress: Mapping[str, Bundle],
    events_path: Path,
    golden_path: Path,
    context: Context,
) -> OwnChecks:
    report = evaluate(
        spec, bundle, EvalConfig(leave_one_out=False, benchmarks=()), git=None
    )
    broken = [
        item["name"]
        for item in report.body["invariants"]
        if item["hard"] and item["count"] > 0
    ]
    primary = f"{bundle.manifest.name}:{bundle.manifest.bundle_id}"
    found = liveness(spec, {primary: bundle, **stress}, {primary}, EvalConfig())
    checked, failures = validation_events(spec, events_path)
    _, changed = golden_differences(golden_path, None, context)
    return OwnChecks(
        bundle_source=bundle.manifest.source,
        dead_parameters=[leaf.pointer for leaf in found.leaves if leaf.status == DEAD],
        broken_hard_invariants=broken,
        events_checked=checked,
        event_failures=failures,
        golden_differences=changed,
    )


def structural_issues(
    reference: StrategySpec, candidate: StrategySpec
) -> list[SpecIssue]:
    """What makes ``candidate`` more than a simplification of ``reference``.

    A structural change removes rules, overlays, optional parameters or list
    entries, or changes a categorical choice (an exit's cooldown scope, the
    holdings a rotation sweeps, where proceeds go). It never adds a piece,
    changes a rule's kind or the order of what remains, and never moves a
    number: a tunable parameter on both sides keeps its value, and so does every
    other number. Entries of a list addressed by position (a deviation tier, a
    proceeds share) are compared by position, so removing one that others follow
    reads as moving their numbers: the check refuses rather than guesses.
    Empty when the change is structural.
    """
    before = {leaf.pointer: leaf.value for leaf in tunable_leaves(reference)}
    after = {leaf.pointer: leaf.value for leaf in tunable_leaves(candidate)}
    issues = [
        issue
        for change in spec_diff(reference, candidate)
        if (issue := _change_issue(change, before.keys() | after.keys())) is not None
    ]
    issues.extend(
        SpecIssue(pointer, "added_parameter", f"{pointer} is a new parameter")
        for pointer in sorted(after.keys() - before.keys())
    )
    issues.extend(
        SpecIssue(
            pointer,
            "tuned_parameter",
            f"{pointer} moves from {before[pointer]} to {after[pointer]}",
        )
        for pointer in sorted(before.keys() & after.keys())
        if before[pointer] != after[pointer]
    )
    return _one_issue_per_new_piece(issues)


def _change_issue(change: SpecChange, tunable: Collection[str]) -> SpecIssue | None:
    pointer = change.pointer
    # A name says nothing about behavior, and a parameter is judged by its value.
    if pointer in _IDENTITY or pointer in tunable:
        return None
    if change.kind == "reordered":
        return SpecIssue(
            pointer, "reordered", f"What remains of {pointer} changed order"
        )
    if pointer.endswith("/kind"):
        return SpecIssue(
            pointer,
            "changed_kind",
            f"{pointer} changes from {change.before} to {change.after}",
        )
    if change.kind == "added" or (change.kind == "changed" and change.before is None):
        return SpecIssue(pointer, "added_piece", f"{pointer} is new")
    if _is_number(change.before) and _is_number(change.after):
        return SpecIssue(
            pointer,
            "changed_number",
            f"{pointer} moves from {change.before} to {change.after}",
        )
    return None


def _is_number(value: Any) -> bool:
    return isinstance(value, int | float) and not isinstance(value, bool)


def _one_issue_per_new_piece(issues: list[SpecIssue]) -> list[SpecIssue]:
    """A new piece, or a rule whose kind changed, is one issue, not one per field."""
    new = [
        issue.pointer.removesuffix("/kind")
        for issue in issues
        if issue.code in {"added_piece", "changed_kind"}
    ]
    return [
        issue
        for issue in issues
        if not any(issue.pointer.startswith(f"{prefix}/") for prefix in new)
        or issue.code == "changed_kind"
    ]


def structural_checks(
    reference: StrategySpec,
    candidate: StrategySpec,
    *,
    real: Mapping[str, Any],
    suite: Mapping[str, Bundle],
    config: EvalConfig,
) -> StructuralEvidence:
    """The structural track's evidence: what changed, and both specs on the suite.

    ``real`` is the comparison the promotion already ran on its evidence data.
    """
    stress: dict[str, dict[str, dict[str, float]]] = {}
    for ref, history in suite.items():
        compared = compare_on_bundle(reference, candidate, history, config)
        stress[ref] = {
            side: {metric: compared[side][metric] for metric in _SUITE_METRICS}
            for side in (BASE, CANDIDATE)
        }
    return StructuralEvidence(
        issues=[issue.as_dict() for issue in structural_issues(reference, candidate)],
        eval_config_hash=hash_of(normalize(config.as_dict())),
        real=real,
        stress=stress,
    )


__all__ = [
    "CANDIDATE_KEY",
    "own_checks",
    "structural_checks",
    "structural_issues",
    "validation_events",
]
