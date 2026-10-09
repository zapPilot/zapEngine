"""Decide, gate by gate, whether a candidate may replace the reference.

Every gate reads evidence: numbers the lab already wrote (a sweep, a holdout
look) or checks the promotion ran itself on the evidence data. A gate says
``pass``, ``fail`` or ``insufficient`` (the evidence to decide is not there), and
the verdict follows: any failed gate rejects the candidate; with none failed, any
insufficient gate means more evidence is needed; otherwise it is promotable.

Nothing here knows how a number was produced. That keeps the bar in one place,
``PROMOTION_POLICY.json``, and keeps this module a pure function of its inputs.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from typing import Any

from src.services.backtesting.lab.bundle import SYNTHETIC_SOURCE as SYNTHETIC
from src.services.backtesting.lab.policy import (
    HoldoutBar,
    Prerequisites,
    PromotionPolicy,
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


def evaluate_gates(policy: PromotionPolicy, evidence: Evidence) -> list[Gate]:
    return [
        *_prerequisites(policy.prerequisites, evidence),
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


def _fold_drawdown(bar: WalkForward, folds: Sequence[Mapping[str, Any]]) -> Gate:
    name = "fold_drawdown"
    if any("max_drawdown_pp" not in fold["oos"] for fold in folds):
        return Gate(
            "walk_forward",
            name,
            INSUFFICIENT,
            "The sweep does not report drawdowns per fold; run it again",
        )
    worst = min(fold["oos"]["max_drawdown_pp"] for fold in folds)
    allowed = bar.fold_drawdown_worse_by_at_most_pp
    return Gate(
        "walk_forward",
        name,
        PASS if worst >= -allowed else FAIL,
        f"Deepest fold drawdown against the reference: {worst:.4g} pp, "
        f"may be worse by at most {allowed:.4g} pp",
        worst,
        -allowed,
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
    allowed_roi = bar.roi_shortfall_at_most_pp
    allowed_dd = bar.drawdown_worse_by_at_most_pp
    return [
        Gate(
            "holdout",
            "holdout_look",
            PASS,
            f"The lineage's single look, on {look['window']['days']} new days",
            look["lineage"],
        ),
        Gate(
            "holdout",
            "holdout_roi",
            PASS if edge["roi_pp"] >= -allowed_roi else FAIL,
            f"ROI against the reference on the new data: {edge['roi_pp']:.4g} pp, "
            f"may fall short by at most {allowed_roi:.4g} pp",
            edge["roi_pp"],
            -allowed_roi,
        ),
        Gate(
            "holdout",
            "holdout_drawdown",
            PASS if edge["max_drawdown_pp"] >= -allowed_dd else FAIL,
            f"Drawdown against the reference on the new data: "
            f"{edge['max_drawdown_pp']:.4g} pp, may be worse by at most {allowed_dd:.4g} pp",
            edge["max_drawdown_pp"],
            -allowed_dd,
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
    "SWEEP_OK",
    "SYNTHETIC",
    "evaluate_gates",
    "verdict",
]
