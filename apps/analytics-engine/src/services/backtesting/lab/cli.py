"""strategy-lab: the command line of the strategy lab.

Every command prints exactly one JSON object on stdout, so a script or an
agent can read the outcome without parsing prose. Exit codes:

- 0: done;
- 1: the spec or the arguments are invalid (``error.issues`` points at each fault);
- 2: usage error (argparse);
- 3: a generated artifact or a locked reference is out of date;
- 4: a file was not found;
- 5: the request was refused (a lock that would hide a behavior change).
"""

from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any

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

EXIT_OK = 0
EXIT_INVALID = 1
EXIT_DRIFT = 3
EXIT_NOT_FOUND = 4
EXIT_REFUSED = 5


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
        payload = args.handler(args, directory)
    except CliError as error:
        _emit(
            {
                "ok": False,
                "command": command,
                "error": {
                    "code": error.code,
                    "message": error.message,
                    "issues": [issue.as_dict() for issue in error.issues],
                },
            }
        )
        return error.exit_code
    _emit({"ok": True, "command": command, **payload})
    return EXIT_OK


def _emit(payload: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(payload, indent=2) + "\n")


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
    commands = parser.add_subparsers(dest="command", required=True)

    schema = commands.add_parser(
        "schema",
        help="Write the JSON Schema and the vocabulary guide, or check them.",
    )
    schema.add_argument(
        "--check",
        action="store_true",
        help="Fail with exit code 3 instead of writing when a file is out of date.",
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
    return parser


def _schema(args: argparse.Namespace, directory: Path) -> dict[str, Any]:
    artifacts = {
        SCHEMA_FILENAME: render_schema("llm"),
        VOCABULARY_FILENAME: render_vocabulary(),
    }
    stale = [
        name
        for name, content in artifacts.items()
        if not (directory / name).is_file() or (directory / name).read_text() != content
    ]
    if args.check:
        if stale:
            raise CliError(
                EXIT_DRIFT,
                "generated_artifacts_out_of_date",
                f"Run `pnpm strategy-lab schema` to refresh: {', '.join(stale)}",
            )
        return {"checked": sorted(artifacts), "stale": []}
    for name in stale:
        (directory / name).write_text(artifacts[name])
    return {"written": sorted(stale), "unchanged": sorted(set(artifacts) - set(stale))}


def _load(ref: str, directory: Path) -> tuple[Path, Any]:
    path = resolve_spec_path(ref, directory)
    try:
        return path, load_spec(ref, directory)
    except FileNotFoundError as error:
        raise CliError(
            EXIT_NOT_FOUND, "spec_not_found", f"No spec at {path}"
        ) from error
    except SpecError as error:
        raise CliError(
            EXIT_INVALID, "invalid_spec", "The spec is invalid", error.issues
        ) from error


def _lock_path(directory: Path) -> Path:
    return directory / LOCK_FILENAME


def _validate(args: argparse.Namespace, directory: Path) -> dict[str, Any]:
    path, spec = _load(args.ref, directory)
    key = lock_key(path, directory)
    if key is not None:
        issues = lock_issues(key, spec, read_lock(_lock_path(directory)))
        if issues:
            raise CliError(
                EXIT_DRIFT,
                "lock_out_of_date",
                f"{key} does not match its entry in {LOCK_FILENAME}",
                tuple(issues),
            )
    return {
        "id": spec.id,
        "version": spec.version,
        "behavior_hash": behavior_hash(spec),
        "rules": [rule.id for rule in spec.rules],
        "locked": key is not None,
    }


def _hash(args: argparse.Namespace, directory: Path) -> dict[str, Any]:
    _, spec = _load(args.ref, directory)
    payload: dict[str, Any] = {
        "id": spec.id,
        "version": spec.version,
        "behavior_hash": behavior_hash(spec),
    }
    if args.canonical:
        payload["canonical"] = canonical_json(spec)
    return payload


def _lock(args: argparse.Namespace, directory: Path) -> dict[str, Any]:
    path, spec = _load(args.ref, directory)
    key = lock_key(path, directory)
    if key is None:
        raise CliError(
            EXIT_INVALID,
            "not_lockable",
            "Only specs under reference/ are locked",
        )
    lock_path = _lock_path(directory)
    entries: dict[str, LockEntry] = read_lock(lock_path) if lock_path.is_file() else {}
    try:
        updated = lock_spec(key, spec, entries)
    except ValueError as error:
        raise CliError(EXIT_REFUSED, "lock_refused", str(error)) from error
    changed = updated != entries
    if changed:
        lock_path.write_text(render_lock(updated))
    return {
        "key": key,
        "version": updated[key].version,
        "behavior_hash": updated[key].behavior_hash,
        "changed": changed,
    }


__all__ = ["CliError", "main"]
