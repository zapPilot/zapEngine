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
- 1: a gate failed (a generated artifact or a lock is out of date, or a lock
  would hide a behavior change);
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
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Any

from src.services.backtesting.lab.bundle import (
    BUNDLES_DIR,
    Bundle,
    BundleCorruptError,
    BundleError,
    BundleExistsError,
    BundleReferenceError,
    check_bundle_name,
    load_bundle,
)
from src.services.backtesting.lab.coverage import coverage_of
from src.services.backtesting.lab.record import (
    RecordRefused,
    database_service,
    ensure_read_only,
    record_bundle,
)
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
    load_spec,
    lock_key,
    resolve_spec_path,
)
from src.services.backtesting.spec.schema_export import (
    SCHEMA_FILENAME,
    VOCABULARY_FILENAME,
    render_schema,
    render_vocabulary,
)
from src.services.backtesting.spec.validation import SpecError, SpecIssue
from src.services.exceptions import MarketDataUnavailableError

EXIT_OK = 0
EXIT_GATE = 1
EXIT_NOT_APPLICABLE = 2
EXIT_SPEC = 3
EXIT_DATA = 4


@dataclass
class Outcome:
    """What a successful command reports."""

    result: dict[str, Any]
    artifacts: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


@dataclass
class CliError(Exception):
    exit_code: int
    code: str
    message: str
    issues: tuple[SpecIssue, ...] = ()


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    directory = Path(args.strategies_dir)
    command = " ".join(args.command_path)
    try:
        outcome = args.handler(args, directory)
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
        exit_code=EXIT_OK,
        result=outcome.result,
        warnings=outcome.warnings,
        artifacts=outcome.artifacts,
    )
    return EXIT_OK


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
        description="Validate, hash and lock strategy specs; export their schema.",
    )
    parser.add_argument(
        "--strategies-dir",
        default=str(STRATEGIES_DIR),
        help=argparse.SUPPRESS,
    )
    parser.add_argument(
        "--bundles-dir",
        default=str(BUNDLES_DIR),
        help=argparse.SUPPRESS,
    )
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
        command.add_argument(
            "ref",
            help="A reference such as reference/dma_fgi, or a path to a .json file.",
        )
        if name == "hash":
            command.add_argument(
                "--canonical",
                action="store_true",
                help="Also print the canonical JSON the hash is taken over.",
            )
        command.set_defaults(handler=handler, command_path=["spec", name])

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
    return parser


def _schema(args: argparse.Namespace, directory: Path) -> Outcome:
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


def _load(ref: str, directory: Path) -> tuple[Path, Any]:
    path = resolve_spec_path(ref, directory)
    try:
        return path, load_spec(ref, directory)
    except FileNotFoundError as error:
        raise CliError(EXIT_SPEC, "spec_not_found", f"No spec at {path}") from error
    except SpecError as error:
        raise CliError(
            EXIT_SPEC, "invalid_spec", "The spec is invalid", error.issues
        ) from error


def _lock_path(directory: Path) -> Path:
    return directory / LOCK_FILENAME


def _validate(args: argparse.Namespace, directory: Path) -> Outcome:
    path, spec = _load(args.ref, directory)
    key = lock_key(path, directory)
    if key is not None:
        issues = lock_issues(key, spec, read_lock(_lock_path(directory)))
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


def _hash(args: argparse.Namespace, directory: Path) -> Outcome:
    _, spec = _load(args.ref, directory)
    result: dict[str, Any] = {
        "id": spec.id,
        "version": spec.version,
        "behavior_hash": behavior_hash(spec),
    }
    if args.canonical:
        result["canonical"] = canonical_json(spec)
    return Outcome(result)


def _lock(args: argparse.Namespace, directory: Path) -> Outcome:
    path, spec = _load(args.ref, directory)
    key = lock_key(path, directory)
    if key is None:
        raise CliError(
            EXIT_NOT_APPLICABLE,
            "not_lockable",
            "Only specs under reference/ are locked",
        )
    lock_path = _lock_path(directory)
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


def _bundle_error(error: BundleError) -> CliError:
    if isinstance(error, BundleReferenceError):
        return CliError(EXIT_NOT_APPLICABLE, "invalid_bundle_reference", str(error))
    if isinstance(error, BundleExistsError):
        return CliError(EXIT_GATE, "bundle_exists", str(error))
    if isinstance(error, BundleCorruptError):
        return CliError(EXIT_DATA, "bundle_corrupt", str(error))
    return CliError(EXIT_DATA, "bundle_not_found", str(error))


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


def _bundle_record(args: argparse.Namespace, directory: Path) -> Outcome:
    del directory
    end = args.end or datetime.now(UTC).date() - timedelta(days=1)
    try:
        check_bundle_name(args.name)
        ensure_read_only()
    except BundleError as error:
        raise _bundle_error(error) from error
    except RecordRefused as error:
        raise CliError(EXIT_GATE, "recording_refused", str(error)) from error
    try:
        with database_service() as service:
            recording = record_bundle(
                service,
                name=args.name,
                start=args.start,
                end=end,
                bundles_dir=Path(args.bundles_dir),
                dry_run=args.dry_run,
            )
    except MarketDataUnavailableError as error:
        raise CliError(EXIT_DATA, "data_unavailable", str(error)) from error
    except BundleError as error:
        raise _bundle_error(error) from error
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


def _bundle_coverage(args: argparse.Namespace, directory: Path) -> Outcome:
    del directory
    try:
        bundle = load_bundle(args.ref, Path(args.bundles_dir))
    except BundleError as error:
        raise _bundle_error(error) from error
    return Outcome(
        {
            "bundle": _bundle_summary(bundle),
            "coverage": coverage_of(bundle.prices, bundle.sentiments).as_dict(),
        }
    )


__all__ = ["CliError", "Outcome", "main"]
