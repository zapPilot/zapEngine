"""``promote``: weigh a candidate against the promotion policy and write the record."""

from __future__ import annotations

import argparse
import json
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any

from src.models.backtesting import BacktestAssumptions
from src.services.backtesting.constants import MODEL_TOTAL_CAPITAL
from src.services.backtesting.lab import evaluation_commands, golden
from src.services.backtesting.lab.bundle import Bundle
from src.services.backtesting.lab.diff import compare_on_bundle, spec_diff
from src.services.backtesting.lab.envelope import (
    EXIT_DATA,
    EXIT_GATE,
    EXIT_NOT_APPLICABLE,
    CliError,
    Context,
    Outcome,
    load_bundle_or_fail,
    load_spec_or_fail,
)
from src.services.backtesting.lab.ledger import Ledger, LedgerCorruptError
from src.services.backtesting.lab.liveness import NoDaysError
from src.services.backtesting.lab.policy import (
    POLICY_PATH,
    LoadedPolicy,
    PolicyError,
    load_policy,
)
from src.services.backtesting.lab.promotion import (
    INSUFFICIENT_EVIDENCE,
    PROMOTABLE,
    Evidence,
    evaluate_gates,
    verdict,
)
from src.services.backtesting.lab.promotion_checks import own_checks
from src.services.backtesting.lab.promotion_record import build_record, log_entry
from src.services.backtesting.lab.report import git_state, hash_of, normalize
from src.services.backtesting.lab.research_commands import (
    DEFAULT_STRESS,
    REFERENCE_REF,
)
from src.services.backtesting.lab.runner import EvalConfig
from src.services.backtesting.spec import behavior_hash
from src.services.backtesting.validation.event_runner import ValidationEventError

SPEC_HELP = evaluation_commands.SPEC_HELP
BUNDLE_HELP = evaluation_commands.BUNDLE_HELP
DEFAULT_EVENTS = golden.APP_ROOT / "tests/fixtures/hierarchical_validation_events.json"


def add_commands(commands: Any) -> None:
    promote = commands.add_parser(
        "promote",
        help="Weigh a candidate against the promotion policy (exit 1: a gate fails; "
        "exit 4: evidence is missing).",
    )
    promote.add_argument("--spec", required=True, help="The candidate. " + SPEC_HELP)
    promote.add_argument(
        "--bundle",
        required=True,
        help="The evidence data the candidate is checked on. " + BUNDLE_HELP,
    )
    promote.add_argument(
        "--sweep",
        help="The sweep that judged the candidate against the reference: its id, "
        "or the path of its sweep.json.",
    )
    promote.add_argument(
        "--lineage", help="The holdout lineage whose single look judged the candidate."
    )
    promote.add_argument(
        "--reference",
        default=REFERENCE_REF,
        help="The spec the candidate would replace. " + SPEC_HELP,
    )
    promote.add_argument(
        "--events",
        default=str(DEFAULT_EVENTS),
        help="The validation events fixture (default: the committed one).",
    )
    promote.add_argument(
        "--stress",
        action="append",
        help="A history where rare conditions occur, for the dead-parameter check "
        "(default: six synthetic stress seeds).",
    )
    promote.add_argument("--policy", help=argparse.SUPPRESS)
    promote.set_defaults(handler=promote_command, command_path=["promote"])


def _today() -> date:
    return datetime.now(UTC).date()


def _policy(args: argparse.Namespace) -> LoadedPolicy:
    try:
        return load_policy(Path(args.policy) if args.policy else POLICY_PATH)
    except PolicyError as error:
        raise CliError(EXIT_NOT_APPLICABLE, "invalid_policy", str(error)) from error


def _read_json(path: Path, what: str) -> dict[str, Any]:
    try:
        document = json.loads(path.read_text())
    except (FileNotFoundError, json.JSONDecodeError) as error:
        raise CliError(EXIT_DATA, f"{what}_unreadable", f"{path}: {error}") from error
    if not isinstance(document, dict):
        raise CliError(EXIT_DATA, f"{what}_unreadable", f"{path} is not an object")
    return document


def _sweep_path(value: str, context: Context) -> Path:
    path = Path(value)
    if path.suffix == ".json":
        return path
    return context.runs_dir / f"sweep-{value}" / "sweep.json"


def _evidence_files(
    args: argparse.Namespace, context: Context
) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    sweep = (
        None
        if args.sweep is None
        else _read_json(_sweep_path(args.sweep, context), "sweep")
    )
    look = None
    if args.lineage is not None:
        path = context.holdouts_dir / f"{args.lineage}.look.json"
        # No file is not an error: the lineage may simply not have looked yet.
        look = _read_json(path, "holdout_look") if path.is_file() else None
    return sweep, look


def _trials(ledger: Ledger, sweep: dict[str, Any] | None) -> frozenset[str]:
    if sweep is None:
        return frozenset()
    return frozenset(
        entry["spec"]["behavior_hash"]
        for entry in ledger.entries("sweep_trial")
        if entry.get("sweep") == sweep["sweep_id"]
    )


def _stress(args: argparse.Namespace, context: Context) -> dict[str, Bundle]:
    """The stress histories, without the evidence history itself if it is one."""
    return {
        ref: load_bundle_or_fail(ref, context)
        for ref in (args.stress or DEFAULT_STRESS)
        if ref != args.bundle
    }


def promote_command(args: argparse.Namespace, context: Context) -> Outcome:
    _, candidate = load_spec_or_fail(args.spec, context)
    _, reference = load_spec_or_fail(args.reference, context)
    if behavior_hash(candidate) == behavior_hash(reference):
        raise CliError(
            EXIT_NOT_APPLICABLE,
            "nothing_to_promote",
            "The candidate behaves exactly like the reference it would replace.",
        )
    bundle = load_bundle_or_fail(args.bundle, context)
    loaded = _policy(args)
    sweep, look = _evidence_files(args, context)
    ledger = Ledger(context.ledger_path)
    try:
        trials = _trials(ledger, sweep)
        candidates = ledger.distinct_candidates()
    except LedgerCorruptError as error:
        raise CliError(EXIT_DATA, "ledger_corrupt", str(error)) from error
    try:
        own = own_checks(
            candidate,
            bundle,
            stress=_stress(args, context),
            events_path=Path(args.events),
            golden_path=golden.GOLDEN_PATH,
            context=context,
        )
    except NoDaysError as error:
        raise CliError(EXIT_DATA, "no_days_in_window", str(error)) from error
    except ValidationEventError as error:
        raise CliError(EXIT_NOT_APPLICABLE, "invalid_events", str(error)) from error
    canonical = EvalConfig()
    gates = evaluate_gates(
        loaded.policy,
        Evidence(
            candidate_hash=behavior_hash(candidate),
            reference_hash=behavior_hash(reference),
            own=own,
            canonical_eval_config_hash=hash_of(normalize(canonical.as_dict())),
            canonical_assumptions=BacktestAssumptions().model_dump(),
            canonical_capital=MODEL_TOTAL_CAPITAL,
            sweep=sweep,
            sweep_trials=trials,
            look=look,
        ),
    )
    decision = verdict(gates)
    record = build_record(
        candidate=candidate,
        reference=reference,
        policy=loaded,
        changes=spec_diff(reference, candidate),
        bundle={
            "ref": f"{bundle.manifest.name}:{bundle.manifest.bundle_id}",
            "content_sha256": bundle.manifest.content_sha256,
            "source": bundle.manifest.source,
        },
        sweep=sweep,
        look=look,
        comparison=compare_on_bundle(reference, candidate, bundle, canonical),
        ledger_candidates=candidates,
        gates=gates,
        verdict=decision,
        git=git_state(),
    )
    path = context.lab_dir / "promotions" / f"{record['promotion_id']}.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(record, indent=2, sort_keys=True) + "\n")
    ledger.append(
        "promotion",
        promotion=record["promotion_id"],
        verdict=decision,
        spec={
            "ref": record["candidate"]["ref"],
            "behavior_hash": record["candidate"]["behavior_hash"],
        },
        policy=loaded.policy_hash,
    )
    problems = [gate for gate in gates if gate.status != "pass"]
    return Outcome(
        {**record, "log_entry": log_entry(record, today=_today())},
        artifacts=[str(path)],
        warnings=[f"{gate.name}: {gate.status}, {gate.detail}" for gate in problems],
        exit_code=_exit_code(decision),
    )


def _exit_code(decision: str) -> int:
    if decision == PROMOTABLE:
        return 0
    return EXIT_DATA if decision == INSUFFICIENT_EVIDENCE else EXIT_GATE


__all__ = ["DEFAULT_EVENTS", "add_commands", "promote_command"]
