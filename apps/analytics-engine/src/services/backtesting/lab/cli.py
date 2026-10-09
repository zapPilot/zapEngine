"""strategy-lab: the command line of the strategy lab.

Every command prints exactly one JSON object on stdout, so a script or an
agent can read the outcome without parsing prose::

    {"command": "spec validate", "ok": true, "exit_code": 0,
     "result": {...}, "warnings": [], "artifacts": []}

``result`` holds what the command found. For a failed command it holds
``code``, ``message`` and ``issues``; each issue points at the fault with a JSON
pointer. ``artifacts`` lists the files a command wrote.

Exit codes:

- 0: done;
- 1: a gate failed (a generated artifact or a lock is out of date, a lock would
  hide a behavior change, or a hard invariant is broken);
- 2: the command does not apply to what it was given (argparse usage errors
  use it too);
- 3: the spec is missing or invalid;
- 4: data or coverage is insufficient (a bundle is missing, corrupt or cannot be
  recorded);
- 5: a holdout request was refused (holdout commands, later).
"""

from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Sequence
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Any

from src.services.backtesting.lab import evaluation_commands
from src.services.backtesting.lab.bundle import (
    LAB_DIR,
    Bundle,
    BundleError,
    check_bundle_name,
    synthetic_bundle,
    write_bundle,
)
from src.services.backtesting.lab.coverage import coverage_of
from src.services.backtesting.lab.envelope import (
    EXIT_DATA,
    EXIT_GATE,
    EXIT_NOT_APPLICABLE,
    EXIT_OK,
    EXIT_SPEC,
    CliError,
    Context,
    Outcome,
    bundle_failure,
    load_bundle_or_fail,
    load_spec_or_fail,
)
from src.services.backtesting.lab.record import (
    RecordRefused,
    database_service,
    ensure_read_only,
    record_bundle,
)
from src.services.backtesting.lab.synthetic import SCENARIOS
from src.services.backtesting.spec import StrategySpec, parse_spec
from src.services.backtesting.spec.canonical import (
    LockEntry,
    behavior_hash,
    canonical_json,
    lock_issues,
    lock_spec,
    read_lock,
    render_lock,
)
from src.services.backtesting.spec.loader import (
    LOCK_FILENAME,
    STRATEGIES_DIR,
    lock_key,
)
from src.services.backtesting.spec.schema_export import (
    SCHEMA_FILENAME,
    VOCABULARY_FILENAME,
    render_schema,
    render_vocabulary,
)
from src.services.backtesting.spec.validation import SpecError
from src.services.exceptions import MarketDataUnavailableError

SPEC_REF_HELP = "A reference such as reference/dma_fgi, or a path to a .json file."


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    context = Context(Path(args.strategies_dir), Path(args.lab_dir))
    command = " ".join(args.command_path)
    try:
        outcome: Outcome = args.handler(args, context)
    except CliError as error:
        _emit(
            command,
            exit_code=error.exit_code,
            result={
                "code": error.code,
                "message": error.message,
                "issues": [issue.as_dict() for issue in error.issues],
            },
        )
        return error.exit_code
    _emit(
        command,
        exit_code=outcome.exit_code,
        result=outcome.result,
        warnings=outcome.warnings,
        artifacts=outcome.artifacts,
    )
    return outcome.exit_code


def _emit(
    command: str,
    *,
    exit_code: int,
    result: dict[str, Any],
    warnings: list[str] | None = None,
    artifacts: list[str] | None = None,
) -> None:
    envelope = {
        "command": command,
        "ok": exit_code == EXIT_OK,
        "exit_code": exit_code,
        "result": result,
        "warnings": warnings or [],
        "artifacts": artifacts or [],
    }
    sys.stdout.write(json.dumps(envelope, indent=2) + "\n")


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="strategy-lab",
        description=(
            "Validate, hash, lock and evaluate strategy specs; manage the "
            "market data bundles they are evaluated on."
        ),
    )
    parser.add_argument(
        "--strategies-dir",
        default=str(STRATEGIES_DIR),
        help=argparse.SUPPRESS,
    )
    parser.add_argument("--lab-dir", default=str(LAB_DIR), help=argparse.SUPPRESS)
    commands = parser.add_subparsers(dest="command", required=True)

    schema = commands.add_parser(
        "schema",
        help="Write the JSON Schema and the vocabulary guide, or check them.",
    )
    schema.add_argument(
        "--check",
        action="store_true",
        help="Fail with exit code 1 instead of writing when a file is out of date.",
    )
    schema.set_defaults(handler=_schema, command_path=["schema"])

    spec_commands = commands.add_parser(
        "spec", help="Work with one strategy spec."
    ).add_subparsers(dest="spec_command", required=True)
    for name, handler, help_text in (
        ("validate", _validate, "Validate a spec and report its behavior hash."),
        ("hash", _hash, "Print the behavior hash of a spec."),
        ("lock", _lock, "Pin a reference spec's behavior in the lock file."),
    ):
        command = spec_commands.add_parser(name, help=help_text)
        command.add_argument("ref", help=SPEC_REF_HELP)
        if name == "hash":
            command.add_argument(
                "--canonical",
                action="store_true",
                help="Also print the canonical JSON the hash is taken over.",
            )
        command.set_defaults(handler=handler, command_path=["spec", name])
    new = spec_commands.add_parser(
        "new", help="Start a candidate spec as a copy of another."
    )
    new.add_argument("--from", dest="source", required=True, help=SPEC_REF_HELP)
    new.add_argument("--id", required=True, help="Name of the candidate.")
    new.add_argument("--out", help="Where to write it (default: .lab/candidates/).")
    new.set_defaults(handler=_spec_new, command_path=["spec", "new"])

    bundle_commands = commands.add_parser(
        "bundle", help="Work with market data bundles."
    ).add_subparsers(dest="bundle_command", required=True)
    record = bundle_commands.add_parser(
        "record",
        help="Record a bundle from the production read-only database (operator).",
    )
    record.add_argument("--name", required=True, help="Bundle name, e.g. prod.")
    record.add_argument(
        "--start", required=True, type=date.fromisoformat, help="First day wanted."
    )
    record.add_argument(
        "--end",
        type=date.fromisoformat,
        help="Last day wanted (default: yesterday, UTC).",
    )
    record.add_argument(
        "--dry-run",
        action="store_true",
        help="Report the coverage without writing a bundle.",
    )
    record.set_defaults(handler=_bundle_record, command_path=["bundle", "record"])
    coverage = bundle_commands.add_parser(
        "coverage", help="Report what a bundle covers and what it can support."
    )
    coverage.add_argument(
        "ref", help="name:latest, name:<id>, a bundle path or synthetic:<scenario>."
    )
    coverage.set_defaults(handler=_bundle_coverage, command_path=["bundle", "coverage"])
    synth = bundle_commands.add_parser(
        "synth", help="Keep a deterministic synthetic history as a bundle."
    )
    synth.add_argument("--scenario", choices=SCENARIOS, default="regimes")
    synth.add_argument("--seed", type=int, default=1)
    synth.add_argument("--days", type=int, default=400)
    synth.set_defaults(handler=_bundle_synth, command_path=["bundle", "synth"])

    evaluation_commands.add_commands(commands)
    return parser


def _schema(args: argparse.Namespace, context: Context) -> Outcome:
    directory = context.strategies_dir
    rendered = {
        SCHEMA_FILENAME: render_schema("llm"),
        VOCABULARY_FILENAME: render_vocabulary(),
    }
    stale = [
        name
        for name, content in rendered.items()
        if not (directory / name).is_file() or (directory / name).read_text() != content
    ]
    if args.check:
        if stale:
            raise CliError(
                EXIT_GATE,
                "generated_artifacts_out_of_date",
                f"Run `pnpm strategy-lab schema` to refresh: {', '.join(stale)}",
            )
        return Outcome({"checked": sorted(rendered), "stale": []})
    for name in stale:
        (directory / name).write_text(rendered[name])
    return Outcome(
        {"written": sorted(stale), "unchanged": sorted(set(rendered) - set(stale))},
        artifacts=[str(directory / name) for name in sorted(stale)],
    )


def _lock_path(context: Context) -> Path:
    return context.strategies_dir / LOCK_FILENAME


def _validate(args: argparse.Namespace, context: Context) -> Outcome:
    path, spec = load_spec_or_fail(args.ref, context)
    key = lock_key(path, context.strategies_dir)
    if key is not None:
        issues = lock_issues(key, spec, read_lock(_lock_path(context)))
        if issues:
            raise CliError(
                EXIT_GATE,
                "lock_out_of_date",
                f"{key} does not match its entry in {LOCK_FILENAME}",
                tuple(issues),
            )
    return Outcome(
        {
            "id": spec.id,
            "version": spec.version,
            "behavior_hash": behavior_hash(spec),
            "rules": [rule.id for rule in spec.rules],
            "locked": key is not None,
        }
    )


def _hash(args: argparse.Namespace, context: Context) -> Outcome:
    _, spec = load_spec_or_fail(args.ref, context)
    result: dict[str, Any] = {
        "id": spec.id,
        "version": spec.version,
        "behavior_hash": behavior_hash(spec),
    }
    if args.canonical:
        result["canonical"] = canonical_json(spec)
    return Outcome(result)


def _lock(args: argparse.Namespace, context: Context) -> Outcome:
    path, spec = load_spec_or_fail(args.ref, context)
    key = lock_key(path, context.strategies_dir)
    if key is None:
        raise CliError(
            EXIT_NOT_APPLICABLE,
            "not_lockable",
            "Only specs under reference/ are locked",
        )
    lock_path = _lock_path(context)
    entries: dict[str, LockEntry] = read_lock(lock_path) if lock_path.is_file() else {}
    try:
        updated = lock_spec(key, spec, entries)
    except ValueError as error:
        raise CliError(EXIT_GATE, "lock_refused", str(error)) from error
    changed = updated != entries
    if changed:
        lock_path.write_text(render_lock(updated))
    return Outcome(
        {
            "key": key,
            "version": updated[key].version,
            "behavior_hash": updated[key].behavior_hash,
            "changed": changed,
        },
        artifacts=[str(lock_path)] if changed else [],
    )


def _spec_new(args: argparse.Namespace, context: Context) -> Outcome:
    path, source = load_spec_or_fail(args.source, context)
    raw = source.model_dump(mode="json")
    raw["id"] = args.id
    raw["version"] = 1
    raw["description"] = (
        f"Candidate derived from {source.id} version {source.version}. "
        "Describe what it changes."
    )
    try:
        candidate: StrategySpec = parse_spec(raw)
    except SpecError as error:
        raise CliError(
            EXIT_SPEC, "invalid_spec", "The candidate is invalid", error.issues
        ) from error
    target = (
        Path(args.out) if args.out else context.candidates_dir / f"{candidate.id}.json"
    )
    if target.exists():
        raise CliError(EXIT_GATE, "candidate_exists", f"{target} already exists")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(candidate.model_dump(mode="json"), indent=2) + "\n")
    return Outcome(
        {
            "path": str(target),
            "id": candidate.id,
            "derived_from": {
                "ref": args.source,
                "id": source.id,
                "version": source.version,
                "behavior_hash": behavior_hash(source),
            },
        },
        artifacts=[str(target)],
    )


def _bundle_summary(bundle: Bundle) -> dict[str, Any]:
    manifest = bundle.manifest
    return {
        "name": manifest.name,
        "source": manifest.source,
        "bundle_id": manifest.bundle_id,
        "window": {
            "start": manifest.start.isoformat(),
            "end": manifest.end.isoformat(),
        },
        "content_sha256": manifest.content_sha256,
        "path": None if bundle.path is None else str(bundle.path),
    }


def _bundle_record(args: argparse.Namespace, context: Context) -> Outcome:
    end = args.end or datetime.now(UTC).date() - timedelta(days=1)
    try:
        check_bundle_name(args.name)
        ensure_read_only()
    except BundleError as error:
        raise bundle_failure(error) from error
    except RecordRefused as error:
        raise CliError(EXIT_GATE, "recording_refused", str(error)) from error
    try:
        with database_service() as service:
            recording = record_bundle(
                service,
                name=args.name,
                start=args.start,
                end=end,
                bundles_dir=context.bundles_dir,
                dry_run=args.dry_run,
            )
    except MarketDataUnavailableError as error:
        raise CliError(EXIT_DATA, "data_unavailable", str(error)) from error
    except BundleError as error:
        raise bundle_failure(error) from error
    manifest = recording.manifest
    return Outcome(
        {
            "name": manifest.name,
            "bundle_id": manifest.bundle_id,
            "dry_run": args.dry_run,
            "rows": recording.rows,
            "window": {
                "start": manifest.start.isoformat(),
                "end": manifest.end.isoformat(),
            },
            "path": None if recording.path is None else str(recording.path),
            "content_sha256": manifest.content_sha256,
            "coverage": manifest.coverage,
        },
        artifacts=[] if recording.path is None else [str(recording.path)],
    )


def _bundle_coverage(args: argparse.Namespace, context: Context) -> Outcome:
    bundle = load_bundle_or_fail(args.ref, context)
    return Outcome(
        {
            "bundle": _bundle_summary(bundle),
            "coverage": coverage_of(bundle.prices, bundle.sentiments).as_dict(),
        }
    )


def _bundle_synth(args: argparse.Namespace, context: Context) -> Outcome:
    try:
        bundle = synthetic_bundle(
            f"synthetic:{args.scenario}?seed={args.seed}&days={args.days}"
        )
        path = write_bundle(
            context.bundles_dir,
            manifest=bundle.manifest,
            prices=bundle.prices,
            sentiments=bundle.sentiments,
        )
    except BundleError as error:
        raise bundle_failure(error) from error
    return Outcome(
        {"bundle": {**_bundle_summary(bundle), "path": str(path)}},
        artifacts=[str(path)],
    )


__all__ = ["CliError", "Outcome", "main"]
