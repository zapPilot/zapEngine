"""``golden``: pin a spec's behavior on synthetic histories, or check the pin."""

from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any

from src.services.backtesting.lab import golden
from src.services.backtesting.lab.envelope import (
    EXIT_GATE,
    CliError,
    Context,
    Outcome,
    load_spec_or_fail,
)


def add_commands(commands: Any) -> None:
    command = commands.add_parser(
        "golden",
        help="Pin the behavior of specs on synthetic histories, or check the pin.",
    )
    command.add_argument(
        "--check",
        action="store_true",
        help="Fail with exit code 1 instead of writing when a spec no longer "
        "reproduces its golden.",
    )
    command.add_argument(
        "--spec",
        action="append",
        help="A spec to pin or check; repeat for several. Default: every spec the "
        "golden file records when checking, the default specs when writing.",
    )
    command.add_argument(
        "--file",
        default=str(golden.GOLDEN_PATH),
        help="The golden file (default: tests/fixtures/strategy_specs/"
        "golden_traces.json in the app).",
    )
    command.set_defaults(handler=golden_command, command_path=["golden"])


def _spec_arg(ref: str) -> str:
    """A path ref is read relative to the app, wherever the command runs."""
    if ref.endswith(".json") and not Path(ref).is_absolute():
        return str(golden.APP_ROOT / ref)
    return ref


def _entries_for(refs: list[str], context: Context) -> dict[str, dict[str, Any]]:
    entries = {}
    for ref in refs:
        _, spec = load_spec_or_fail(_spec_arg(ref), context)
        entries[ref] = golden.entry_for(spec)
    return entries


def _recorded(path: Path) -> dict[str, dict[str, Any]]:
    try:
        return golden.read(path)
    except golden.GoldenError as error:
        raise CliError(EXIT_GATE, "golden_unusable", str(error)) from error


def golden_command(args: argparse.Namespace, context: Context) -> Outcome:
    path = Path(args.file)
    if args.check:
        return _check(path, args.spec, context)
    return _write(path, args.spec or list(golden.DEFAULT_SPECS), context)


def golden_differences(
    path: Path,
    refs: list[str] | None,
    context: Context,
) -> tuple[list[str], dict[str, list[str]]]:
    """The specs a golden file checks, and how each differs from its pin."""
    recorded = _recorded(path)
    wanted = refs or list(recorded)
    missing = [ref for ref in wanted if ref not in recorded]
    if missing:
        raise CliError(
            EXIT_GATE,
            "golden_not_recorded",
            f"{path.name} records no golden for: {', '.join(missing)}. Run "
            "`pnpm strategy-lab golden` to pin them.",
        )
    current = _entries_for(wanted, context)
    changed = {
        ref: problems
        for ref, entry in current.items()
        if (problems := golden.differences(recorded[ref], entry))
    }
    return wanted, changed


def _check(path: Path, refs: list[str] | None, context: Context) -> Outcome:
    wanted, changed = golden_differences(path, refs, context)
    return Outcome(
        {"checked": wanted, "differences": changed},
        warnings=[
            f"{ref}: {problem}" for ref, items in changed.items() for problem in items
        ],
        exit_code=EXIT_GATE if changed else 0,
    )


def _write(path: Path, refs: list[str], context: Context) -> Outcome:
    entries = _entries_for(refs, context)
    existing = _recorded(path) if path.exists() else {}
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(golden.render({**existing, **entries}))
    return Outcome({"written": sorted(entries)}, artifacts=[str(path)])


__all__ = ["add_commands", "golden_command", "golden_differences"]
