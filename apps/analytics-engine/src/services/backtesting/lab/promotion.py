"""Decide, gate by gate, whether a candidate may replace the reference.

Every gate reads evidence: numbers the lab already wrote (a sweep, a holdout
look) or checks the promotion ran itself on the evidence data. A gate says
``pass``, ``fail`` or ``insufficient`` (the evidence to decide is not there), and
the verdict follows: any failed gate rejects the candidate; with none failed, any
insufficient gate means more evidence is needed; otherwise it is promotable.

Nothing here knows how a number was produced. That keeps the bar in one place,
``PROMOTION_POLICY.json``, and keeps this module a pure function of its inputs.

A candidate on the search track is judged by its walk-forward folds and its
lineage's holdout look. A candidate on the structural track brings neither: it
is judged by whether its change is a simplification at all and by how far it
trails the reference on the evidence data and on the policy's synthetic suite.
The prerequisites are the same on both tracks.
"""

from __future__ import annotations

import statistics
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from typing import Any

from src.services.backtesting.lab.bundle import SYNTHETIC_SOURCE as SYNTHETIC
from src.services.backtesting.lab.policy import (
    HoldoutBar,
    Prerequisites,
    PromotionPolicy,
    StructuralBar,
    WalkForward,
)

PASS = "pass"
FAIL = "fail"
INSUFFICIENT = "insufficient"
PROMOTABLE = "promotable"
REJECTED = "rejected"
INSUFFICIENT_EVIDENCE = "insufficient_evidence"
# The sweep reports this when it had too few folds to say anything.
SWEEP_OK = "ok"
SEARCH = "search"
STRUCTURAL = "structural"
TRACKS = (SEARCH, STRUCTURAL)


@dataclass(frozen=True)
class Gate:
    group: str
    name: str
    status: str
    detail: str
    value: Any = None
    threshold: Any = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "group": self.group,
            "name": self.name,
            "status": self.status,
            "detail": self.detail,
            "value": self.value,
            "threshold": self.threshold,
        }


@dataclass(frozen=True)
class OwnChecks:
    """What the promotion computed itself, on the evidence bundle."""

    bundle_source: str
    dead_parameters: Sequence[str]
    broken_hard_invariants: Sequence[str]
    events_checked: int
    event_failures: Sequence[str]
    golden_differences: Mapping[str, Any]


@dataclass(frozen=True)
class StructuralEvidence:
    """What a structural promotion measured itself, with both specs on the same bars."""

    # Why the change is more than a simplification; empty when it is one.
    issues: Sequence[Mapping[str, str]]
    eval_config_hash: str
    # ``compare_on_bundle`` of the reference and the candidate on the evidence data.
    real: Mapping[str, Any]
    # Per history of the suite: ``roi_percent``, ``max_drawdown_percent`` and
    # ``trade_count`` of the reference (``base``) and of the candidate.
    stress: Mapping[str, Mapping[str, Mapping[str, float]]]


@dataclass(frozen=True)
class Evidence:
    candidate_hash: str
    reference_hash: str
    own: OwnChecks
    canonical_eval_config_hash: str
    canonical_assumptions: Mapping[str, Any]
    canonical_capital: float
    sweep: Mapping[str, Any] | None = None
    # Behavior hashes of every trial the ledger recorded for that sweep.
    sweep_trials: frozenset[str] = field(default_factory=frozenset)
    look: Mapping[str, Any] | None = None
    # Present exactly when the candidate takes the structural track.
    structural: StructuralEvidence | None = None


def evaluate_gates(policy: PromotionPolicy, evidence: Evidence) -> list[Gate]:
    prerequisites = _prerequisites(policy.prerequisites, evidence)
    if evidence.structural is not None:
        return [*prerequisites, *_structural(policy.structural, evidence.structural)]
    return [
        *prerequisites,
        *_walk_forward(policy.walk_forward, evidence),
        *_holdout(policy.holdout, evidence),
    ]


def verdict(gates: Sequence[Gate]) -> str:
    statuses = {gate.status for gate in gates}
    if FAIL in statuses:
        return REJECTED
    if INSUFFICIENT in statuses:
        return INSUFFICIENT_EVIDENCE
    return PROMOTABLE


def _prerequisites(bar: Prerequisites, evidence: Evidence) -> list[Gate]:
    gates: list[Gate] = []
    if bar.real_data_only:
        gates.append(_real_data(evidence))
    if bar.canonical_assumptions:
        gates.append(_canonical_assumptions(evidence))
    own = evidence.own
    if bar.no_dead_parameters:
        gates.append(
            _listed(
                "no_dead_parameters",
                own.dead_parameters,
                "Every tunable parameter changes a decision somewhere",
                "Parameters that change no decision",
            )
        )
    if bar.hard_invariants:
        gates.append(
            _listed(
                "hard_invariants",
                own.broken_hard_invariants,
                "No hard invariant is broken",
                "Hard invariants broken",
            )
        )
    if bar.validation_events:
        gates.append(_validation_events(own))
    if bar.golden_unaffected:
        gates.append(
            _listed(
                "golden_unaffected",
                sorted(own.golden_differences),
                "The pinned golden traces still reproduce",
                "Pinned specs that no longer reproduce",
            )
        )
    return gates


def _listed(name: str, offenders: Sequence[str], clean: str, dirty: str) -> Gate:
    if offenders:
        return Gate(
            "prerequisite",
            name,
            FAIL,
            f"{dirty}: {', '.join(offenders)}",
            list(offenders),
        )
    return Gate("prerequisite", name, PASS, clean, [])


def _real_data(evidence: Evidence) -> Gate:
    sources = {"promotion": evidence.own.bundle_source}
    if evidence.sweep is not None:
        sources["sweep"] = str(evidence.sweep["fingerprint"]["bundle"]["source"])
    if evidence.look is not None:
        sources["holdout"] = str(evidence.look["bundle"]["source"])
    synthetic = sorted(name for name, source in sources.items() if source == SYNTHETIC)
    if synthetic:
        return Gate(
            "prerequisite",
            "real_data_only",
            FAIL,
            "Synthetic data is not evidence about real markets: "
            + ", ".join(synthetic),
            sources,
        )
    return Gate(
        "prerequisite",
        "real_data_only",
        PASS,
        "Every piece of evidence is real data",
        sources,
    )


def _canonical_assumptions(evidence: Evidence) -> Gate:
    checked: list[str] = []
    wrong: list[str] = []
    if evidence.structural is not None:
        checked.append(STRUCTURAL)
        if evidence.structural.eval_config_hash != evidence.canonical_eval_config_hash:
            wrong.append(STRUCTURAL)
    if evidence.sweep is not None and evidence.sweep["status"] == SWEEP_OK:
        checked.append("sweep")
        if (
            evidence.sweep["fingerprint"]["eval_config_hash"]
            != evidence.canonical_eval_config_hash
        ):
            wrong.append("sweep")
    if evidence.look is not None:
        checked.append("holdout")
        if (
            evidence.look["assumptions"] != evidence.canonical_assumptions
            or evidence.look["total_capital"] != evidence.canonical_capital
        ):
            wrong.append("holdout")
    if wrong:
        return Gate(
            "prerequisite",
            "canonical_assumptions",
            FAIL,
            "Not run under the default assumptions and capital: " + ", ".join(wrong),
            wrong,
        )
    if not checked:
        return Gate(
            "prerequisite",
            "canonical_assumptions",
            INSUFFICIENT,
            "There is no sweep or holdout look whose assumptions could be checked",
        )
    return Gate(
        "prerequisite",
        "canonical_assumptions",
        PASS,
        "The default assumptions and capital: " + ", ".join(checked),
        checked,
    )


def _validation_events(own: OwnChecks) -> Gate:
    if own.event_failures:
        return Gate(
            "prerequisite",
            "validation_events",
            FAIL,
            f"{len(own.event_failures)} of {own.events_checked} events fail: "
            + ", ".join(own.event_failures),
            list(own.event_failures),
        )
    if own.events_checked == 0:
        return Gate(
            "prerequisite",
            "validation_events",
            INSUFFICIENT,
            "No validation event applies to the strategy, so none proved anything",
            0,
        )
    return Gate(
        "prerequisite",
        "validation_events",
        PASS,
        f"All {own.events_checked} validation events pass",
        own.events_checked,
    )


def _walk_forward(bar: WalkForward, evidence: Evidence) -> list[Gate]:
    sweep = evidence.sweep
    if sweep is None:
        return [
            Gate(
                "walk_forward",
                "sweep",
                INSUFFICIENT,
                "No sweep was given: run `strategy-lab sweep` against the "
                "production reference and pass its id",
            )
        ]
    if sweep["status"] != SWEEP_OK:
        return [
            Gate(
                "walk_forward",
                "sweep",
                INSUFFICIENT,
                "The sweep is insufficient evidence: " + " ".join(sweep["reasons"]),
            )
        ]
    gates = [_judged_against_the_reference(sweep, evidence), _searched(sweep, evidence)]
    folds = sweep["folds"]
    gates.append(
        _threshold(
            "walk_forward",
            "folds",
            len(folds),
            bar.min_folds,
            len(folds) >= bar.min_folds,
            "walk-forward folds",
            "at least",
        )
    )
    aggregate = sweep["aggregate"]
    gates.append(
        _threshold(
            "walk_forward",
            "fold_win_rate",
            aggregate["fold_win_rate"],
            bar.fold_win_rate_at_least,
            aggregate["fold_win_rate"] >= bar.fold_win_rate_at_least,
            "share of folds won",
            "at least",
        )
    )
    gates.append(
        _threshold(
            "walk_forward",
            "mean_oos_edge_pp",
            aggregate["mean_oos_edge_pp"],
            bar.mean_oos_edge_above_pp,
            aggregate["mean_oos_edge_pp"] > bar.mean_oos_edge_above_pp,
            "mean out-of-sample edge (pp)",
            "above",
        )
    )
    p_value = aggregate["oos_edge_annualized_pp"]["p_not_positive"]
    gates.append(
        _threshold(
            "walk_forward",
            "bootstrap_p",
            p_value,
            bar.bootstrap_p_below,
            p_value < bar.bootstrap_p_below,
            "bootstrap p-value that the edge is not positive",
            "below",
        )
    )
    gates.append(_fold_drawdown(bar, folds))
    gates.append(_deflated_sharpe(bar, sweep["deflated_sharpe"]))
    return gates


def _threshold(
    group: str,
    name: str,
    value: float,
    threshold: float,
    passed: bool,
    what: str,
    relation: str,
) -> Gate:
    sentence = f"{what}: {value:.4g}, needs to be {relation} {threshold:.4g}"
    return Gate(group, name, PASS if passed else FAIL, sentence, value, threshold)


def _judged_against_the_reference(sweep: Mapping[str, Any], evidence: Evidence) -> Gate:
    fingerprint = sweep["fingerprint"]
    # A sweep that named no reference judged its folds against its own spec.
    judged_spec = fingerprint.get("reference") or fingerprint["spec"]
    judged = judged_spec["behavior_hash"]
    if judged == evidence.reference_hash:
        return Gate(
            "walk_forward",
            "judged_against_reference",
            PASS,
            "The folds were judged against the production reference",
            judged,
        )
    return Gate(
        "walk_forward",
        "judged_against_reference",
        FAIL,
        f"The folds were judged against another spec, {judged_spec['ref']}, "
        "not the production reference",
        judged,
        evidence.reference_hash,
    )


def _searched(sweep: Mapping[str, Any], evidence: Evidence) -> Gate:
    base = sweep["fingerprint"]["spec"]["behavior_hash"]
    if (
        evidence.candidate_hash == base
        or evidence.candidate_hash in evidence.sweep_trials
    ):
        return Gate(
            "walk_forward",
            "candidate_was_searched",
            PASS,
            "The candidate is the spec of the sweep or one of its trials",
            evidence.candidate_hash,
        )
    return Gate(
        "walk_forward",
        "candidate_was_searched",
        FAIL,
        "The candidate is neither the spec of the sweep nor one of its trials, "
        "so the folds say nothing about it",
        evidence.candidate_hash,
    )


def _margin(
    group: str,
    name: str,
    value: float,
    allowed: float,
    what: str,
    relation: str,
) -> Gate:
    """``value`` (pp, positive = ahead of the reference) may trail by ``allowed``."""
    return Gate(
        group,
        name,
        PASS if value >= -allowed else FAIL,
        f"{what}: {value:.4g} pp, {relation} by at most {allowed:.4g} pp",
        value,
        -allowed,
    )


def _fold_drawdown(bar: WalkForward, folds: Sequence[Mapping[str, Any]]) -> Gate:
    name = "fold_drawdown"
    if any("max_drawdown_pp" not in fold["oos"] for fold in folds):
        return Gate(
            "walk_forward",
            name,
            INSUFFICIENT,
            "The sweep does not report drawdowns per fold; run it again",
        )
    return _margin(
        "walk_forward",
        name,
        min(fold["oos"]["max_drawdown_pp"] for fold in folds),
        bar.fold_drawdown_worse_by_at_most_pp,
        "Deepest fold drawdown against the reference",
        "may be worse",
    )


def _deflated_sharpe(bar: WalkForward, deflated: Mapping[str, Any]) -> Gate:
    value = deflated["value"]
    if value is None:
        return Gate(
            "walk_forward",
            "deflated_sharpe",
            INSUFFICIENT,
            "The deflated Sharpe cannot be computed for this sweep",
        )
    return _threshold(
        "walk_forward",
        "deflated_sharpe",
        value,
        bar.deflated_sharpe_above,
        value > bar.deflated_sharpe_above,
        f"deflated Sharpe over {deflated['trials']} candidates",
        "above",
    )


def _holdout(bar: HoldoutBar, evidence: Evidence) -> list[Gate]:
    look = evidence.look
    if look is None:
        if not bar.required:
            return []
        return [
            Gate(
                "holdout",
                "holdout_look",
                INSUFFICIENT,
                "The lineage has not had its look, or none was given: "
                "`strategy-lab holdout look` takes it once",
            )
        ]
    wrong = _wrong_look(look, evidence)
    if wrong is not None:
        return [wrong]
    edge = look["edge"]
    return [
        Gate(
            "holdout",
            "holdout_look",
            PASS,
            f"The lineage's single look, on {look['window']['days']} new days",
            look["lineage"],
        ),
        _margin(
            "holdout",
            "holdout_roi",
            edge["roi_pp"],
            bar.roi_shortfall_at_most_pp,
            "ROI against the reference on the new data",
            "may fall short",
        ),
        _margin(
            "holdout",
            "holdout_drawdown",
            edge["max_drawdown_pp"],
            bar.drawdown_worse_by_at_most_pp,
            "Drawdown against the reference on the new data",
            "may be worse",
        ),
    ]


def _wrong_look(look: Mapping[str, Any], evidence: Evidence) -> Gate | None:
    if look["candidate"]["behavior_hash"] != evidence.candidate_hash:
        return Gate(
            "holdout",
            "holdout_look",
            FAIL,
            f"The look was of {look['candidate']['ref']}, not this candidate: a "
            "candidate that changed after its look needs a new lineage",
            look["candidate"]["behavior_hash"],
            evidence.candidate_hash,
        )
    if look["reference"]["behavior_hash"] != evidence.reference_hash:
        return Gate(
            "holdout",
            "holdout_look",
            FAIL,
            f"The look compared with {look['reference']['ref']}, not the "
            "production reference",
            look["reference"]["behavior_hash"],
            evidence.reference_hash,
        )
    return None


def _structural(bar: StructuralBar, evidence: StructuralEvidence) -> list[Gate]:
    real = evidence.real
    return [
        _structural_change(evidence.issues),
        _margin(
            STRUCTURAL,
            "real_roi",
            real["roi_pp"],
            bar.real_bundle.roi_shortfall_at_most_pp,
            "ROI against the reference on the evidence data",
            "may fall short",
        ),
        _margin(
            STRUCTURAL,
            "real_drawdown",
            real["max_drawdown_pp"],
            bar.real_bundle.drawdown_worse_by_at_most_pp,
            "Drawdown against the reference on the evidence data",
            "may be worse",
        ),
        *_stress_suite(bar, evidence.stress),
    ]


def _structural_change(issues: Sequence[Mapping[str, str]]) -> Gate:
    if issues:
        return Gate(
            STRUCTURAL,
            "structural_change",
            FAIL,
            "Not a structural change: "
            + "; ".join(issue["message"] for issue in issues),
            [issue["pointer"] for issue in issues],
        )
    return Gate(
        STRUCTURAL,
        "structural_change",
        PASS,
        "The candidate only removes pieces or changes a categorical choice; "
        "no number moved",
        [],
    )


def _stress_suite(
    bar: StructuralBar,
    stress: Mapping[str, Mapping[str, Mapping[str, float]]],
) -> list[Gate]:
    suite = bar.stress_suite.bundles
    missing = [ref for ref in suite if ref not in stress]
    if missing:
        return [
            Gate(
                STRUCTURAL,
                "stress_suite",
                INSUFFICIENT,
                "The synthetic suite was not run on: " + ", ".join(missing),
                missing,
            )
        ]

    def median_edge(metric: str) -> float:
        own = statistics.median(stress[ref]["candidate"][metric] for ref in suite)
        base = statistics.median(stress[ref]["base"][metric] for ref in suite)
        return own - base

    histories = f"the {len(suite)} synthetic histories"
    return [
        _margin(
            STRUCTURAL,
            "stress_median_roi",
            median_edge("roi_percent"),
            bar.stress_suite.median_roi_shortfall_at_most_pp,
            f"Median ROI over {histories} against the reference's",
            "may fall short",
        ),
        _margin(
            STRUCTURAL,
            "stress_median_drawdown",
            median_edge("max_drawdown_percent"),
            bar.stress_suite.median_drawdown_worse_by_at_most_pp,
            f"Median drawdown over {histories} against the reference's",
            "may be worse",
        ),
    ]


__all__ = [
    "FAIL",
    "Evidence",
    "Gate",
    "INSUFFICIENT",
    "INSUFFICIENT_EVIDENCE",
    "OwnChecks",
    "PASS",
    "PROMOTABLE",
    "REJECTED",
    "SEARCH",
    "STRUCTURAL",
    "SWEEP_OK",
    "SYNTHETIC",
    "StructuralEvidence",
    "TRACKS",
    "evaluate_gates",
    "verdict",
]
