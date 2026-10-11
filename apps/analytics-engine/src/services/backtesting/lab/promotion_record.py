"""The record of a promotion decision, and the log entry that goes with it.

A record is the whole decision in one file: which candidate, against which
reference and policy, on which data, with every gate's verdict and the numbers
behind it. The log entry is the same decision written the way
``ITERATION_LOG.md`` writes one, so a promotion pull request can paste it.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from datetime import date
from typing import Any

from src.services.backtesting.lab.diff import SpecChange
from src.services.backtesting.lab.policy import LoadedPolicy
from src.services.backtesting.lab.promotion import (
    FAIL,
    INSUFFICIENT,
    PASS,
    PROMOTABLE,
    STRUCTURAL,
    SYNTHETIC,
    Gate,
    StructuralEvidence,
)
from src.services.backtesting.lab.report import hash_of, normalize
from src.services.backtesting.spec import StrategySpec, behavior_hash, spec_ref

RECORD_FORMAT = "promotion-record/1"
CHANGES_SHOWN = 5
_ID_HEX = 16


def _identity(spec: StrategySpec) -> dict[str, Any]:
    return {
        "ref": spec_ref(spec),
        "id": spec.id,
        "version": spec.version,
        "behavior_hash": behavior_hash(spec),
        "description": spec.description,
    }


def build_record(
    *,
    candidate: StrategySpec,
    reference: StrategySpec,
    policy: LoadedPolicy,
    track: str,
    changes: Sequence[SpecChange],
    bundle: Mapping[str, Any],
    sweep: Mapping[str, Any] | None,
    look: Mapping[str, Any] | None,
    structural: StructuralEvidence | None,
    comparison: Mapping[str, Any],
    ledger_candidates: int,
    gates: Sequence[Gate],
    verdict: str,
    git: Mapping[str, Any],
) -> dict[str, Any]:
    evidence = {
        "bundle": dict(bundle),
        "sweep": None
        if sweep is None
        else {"sweep_id": sweep["sweep_id"], "status": sweep["status"]},
        "holdout": None
        if look is None
        else {"lineage": look["lineage"], "window": look["window"]},
        "structural": None
        if structural is None
        else {
            "issues": [dict(issue) for issue in structural.issues],
            "stress_suite": {
                ref: {side: dict(metrics) for side, metrics in sides.items()}
                for ref, sides in structural.stress.items()
            },
        },
    }
    body = {
        "record_format": RECORD_FORMAT,
        "verdict": verdict,
        "track": track,
        "candidate": _identity(candidate),
        "reference": _identity(reference),
        "policy": policy.as_dict(),
        "changes": [change.as_dict() for change in changes],
        "evidence": evidence,
        "comparison": dict(comparison),
        "ledger": {"distinct_candidates": ledger_candidates},
        "gates": [gate.as_dict() for gate in gates],
        "git": dict(git),
    }
    normalized: dict[str, Any] = normalize(body)
    promotion_id = hash_of(normalized).split(":")[1][:_ID_HEX]
    return {"promotion_id": promotion_id, **normalized}


def log_entry(record: Mapping[str, Any], *, today: date) -> str:
    """The decision as an ``ITERATION_LOG.md`` entry (see ITERATION_PLAYBOOK.md)."""
    candidate, reference = record["candidate"], record["reference"]
    gates = record["gates"]
    comparison = record["comparison"]
    verdict = record["verdict"]
    bundle = record["evidence"]["bundle"]
    lines = [
        f"### {today.isoformat()} - Promotion of {candidate['ref']}: {verdict}",
        "",
        f"- **Status**: {'active' if verdict == PROMOTABLE else verdict}",
        f"- **Commit**: pending local change (`promote {candidate['ref']}`)",
        f"- **Finding**: {_finding(record)}",
        f"- **Snapshot delta**: {_delta(comparison, reference['ref'], bundle)}",
        f"- **Validation**: {_validation(record, gates)}",
        f"- **Next**: {_next(record, gates)}",
    ]
    if bundle["source"] == SYNTHETIC:
        lines.append(
            "- **Warning**: the evidence is synthetic data. It exercises the "
            "machinery; it is not a finding about real markets."
        )
    return "\n".join(lines) + "\n"


def _finding(record: Mapping[str, Any]) -> str:
    candidate, reference = record["candidate"], record["reference"]
    changes = record["changes"]
    pointers = [change["pointer"] for change in changes if change["pointer"] != "/id"]
    shown = ", ".join(f"`{pointer}`" for pointer in pointers[:CHANGES_SHOWN])
    more = len(pointers) - CHANGES_SHOWN
    tail = f" and {more} more" if more > 0 else ""
    track = " on the structural track" if record["track"] == STRUCTURAL else ""
    return (
        f"{candidate['ref']} against {reference['ref']}{track}: {len(pointers)} "
        f"change(s) ({shown}{tail}). {candidate['description']}"
    )


def _delta(
    comparison: Mapping[str, Any], reference: str, bundle: Mapping[str, Any]
) -> str:
    own, other = comparison["candidate"], comparison["base"]
    return (
        f"ROI {comparison['roi_pp']:+.2f} pp, MaxDD {comparison['max_drawdown_pp']:+.2f} "
        f"pp, Sharpe {own['sharpe_ratio'] - other['sharpe_ratio']:+.2f}, trades "
        f"{other['trade_count']} -> {own['trade_count']} versus {reference} on "
        f"{bundle['ref']} ({comparison['days']} days)."
    )


def _validation(record: Mapping[str, Any], gates: Sequence[Mapping[str, Any]]) -> str:
    passed = sum(1 for gate in gates if gate["status"] == PASS)
    lines = [
        f"`strategy-lab promote` against policy {record['policy']['hash'][7:19]}: "
        f"{passed} of {len(gates)} gates pass, with "
        f"{record['ledger']['distinct_candidates']} distinct candidates tried in the "
        "ledger."
    ]
    lines.extend(
        f"  - {gate['name']}: {gate['status']}, {gate['detail']}" for gate in gates
    )
    return "\n".join(lines)


def _next(record: Mapping[str, Any], gates: Sequence[Mapping[str, Any]]) -> str:
    if record["verdict"] == PROMOTABLE:
        return (
            f"bump `reference/dma_fgi.json` to this behavior as version "
            f"{record['reference']['version'] + 1} and run `spec lock`; regenerate "
            "`golden_traces.json` and update the validation events and the "
            "performance snapshot (Backtest Refresh) in the same pull request; "
            "update the track-record copy."
        )
    failed = [gate["name"] for gate in gates if gate["status"] == FAIL]
    missing = [gate["name"] for gate in gates if gate["status"] == INSUFFICIENT]
    parts = []
    if failed:
        parts.append("failed: " + ", ".join(failed))
    if missing:
        parts.append("evidence missing: " + ", ".join(missing))
    return "not promotable (" + "; ".join(parts) + ")."


__all__ = ["RECORD_FORMAT", "build_record", "log_entry"]
