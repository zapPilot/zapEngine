"""``eval``, ``ablate`` and ``diff``: run specs on a bundle and read the result."""

from __future__ import annotations

import argparse
import json
from datetime import date
from typing import Any

from pydantic import ValidationError

from src.models.backtesting import BacktestAssumptions
from src.services.backtesting.lab.diff import (
    behavior_changed,
    compare_on_bundle,
    spec_diff,
)
from src.services.backtesting.lab.envelope import (
    EXIT_GATE,
    EXIT_NOT_APPLICABLE,
    CliError,
    Context,
    Outcome,
    load_bundle_or_fail,
    load_spec_or_fail,
)
from src.services.backtesting.lab.evaluate import (
    EvalConfig,
    evaluate,
    spec_ref,
)
from src.services.backtesting.spec import behavior_hash

REPORT_FILENAME = "report.json"
SUMMARY_FILENAME = "summary.txt"
RUN_ID_LENGTH = 16
SPEC_HELP = "A reference such as reference/dma_fgi, or a path to a .json file."
BUNDLE_HELP = "name:latest, name:<id>, a bundle path or synthetic:<scenario>."


def add_evaluation_options(parser: argparse.ArgumentParser) -> None:
    """The window and assumptions every evaluation command accepts."""
    parser.add_argument(
        "--start",
        type=date.fromisoformat,
        help="First user day (default: the bundle's).",
    )
    parser.add_argument(
        "--end", type=date.fromisoformat, help="Last day (default: the bundle's)."
    )
    parser.add_argument(
        "--fill-lag", type=int, help="Bars between a decision and its fill: 0 or 1."
    )
    parser.add_argument(
        "--slippage", type=float, help="Loss on every transfer, 0 to 0.05."
    )
    parser.add_argument(
        "--stable-apr", type=float, help="Yield on stablecoins, 0 to 0.5."
    )
    parser.add_argument("--capital", type=float, help="Starting capital in USD.")


def add_commands(commands: Any) -> None:
    evaluation = commands.add_parser(
        "eval", help="Evaluate a spec on a bundle and write a report."
    )
    evaluation.add_argument("--spec", required=True, help=SPEC_HELP)
    evaluation.add_argument("--bundle", required=True, help=BUNDLE_HELP)
    evaluation.add_argument(
        "--no-leave-one-out",
        action="store_true",
        help="Skip the leave-one-out runs (faster, no per-rule contribution).",
    )
    add_evaluation_options(evaluation)
    evaluation.set_defaults(handler=eval_command, command_path=["eval"])

    ablation = commands.add_parser(
        "ablate", help="What the strategy loses when each rule is left out."
    )
    ablation.add_argument("--spec", required=True, help=SPEC_HELP)
    ablation.add_argument("--bundle", required=True, help=BUNDLE_HELP)
    add_evaluation_options(ablation)
    ablation.set_defaults(handler=ablate_command, command_path=["ablate"])

    difference = commands.add_parser(
        "diff", help="What changed between two specs, and where it first shows."
    )
    difference.add_argument("--base", required=True, help=SPEC_HELP)
    difference.add_argument("--candidate", required=True, help=SPEC_HELP)
    difference.add_argument(
        "--bundle", help="Also run both on this bundle: " + BUNDLE_HELP
    )
    add_evaluation_options(difference)
    difference.set_defaults(handler=diff_command, command_path=["diff"])


def eval_config(args: argparse.Namespace, **overrides: Any) -> EvalConfig:
    """The evaluation settings the arguments name; unset ones keep the defaults."""
    given = {
        "fill_lag_days": args.fill_lag,
        "slippage_rate": args.slippage,
        "stable_apr": args.stable_apr,
    }
    try:
        assumptions = BacktestAssumptions(
            **{key: value for key, value in given.items() if value is not None}
        )
    except ValidationError as error:
        raise CliError(
            EXIT_NOT_APPLICABLE, "invalid_assumptions", error.errors()[0]["msg"]
        ) from error
    settings: dict[str, Any] = {
        "assumptions": assumptions,
        "start": args.start,
        "end": args.end,
        **overrides,
    }
    if args.capital is not None:
        settings["total_capital"] = args.capital
    return EvalConfig(**settings)


def eval_command(args: argparse.Namespace, context: Context) -> Outcome:
    _, spec = load_spec_or_fail(args.spec, context)
    bundle = load_bundle_or_fail(args.bundle, context)
    config = eval_config(args, leave_one_out=not args.no_leave_one_out)
    report = evaluate(spec, bundle, config)
    run_dir = context.runs_dir / report.report_hash.split(":")[1][:RUN_ID_LENGTH]
    run_dir.mkdir(parents=True, exist_ok=True)
    report_path = run_dir / REPORT_FILENAME
    summary_path = run_dir / SUMMARY_FILENAME
    summary = report.summary_lines()
    report_path.write_text(
        json.dumps(report.as_dict(), indent=2, sort_keys=True) + "\n"
    )
    summary_path.write_text("\n".join(summary) + "\n")
    body = {key: value for key, value in report.as_dict().items() if key != "trace"}
    hard = [
        item["name"]
        for item in report.body["invariants"]
        if item["hard"] and item["count"]
    ]
    return Outcome(
        {**body, "summary": summary, "run": str(run_dir)},
        artifacts=[str(report_path), str(summary_path)],
        warnings=[f"Hard invariant broken: {name}" for name in hard],
        exit_code=EXIT_GATE if hard else 0,
    )


def ablate_command(args: argparse.Namespace, context: Context) -> Outcome:
    _, spec = load_spec_or_fail(args.spec, context)
    bundle = load_bundle_or_fail(args.bundle, context)
    report = evaluate(spec, bundle, eval_config(args, benchmarks=()))
    body = report.body
    return Outcome(
        {
            "fingerprint": body["fingerprint"],
            "window": body["window"],
            "strategy": body["strategies"]["strategy"],
            "rules": body["attribution"]["rules"],
            "leave_one_out": body["attribution"]["leave_one_out"],
            "report_hash": report.report_hash,
        },
        warnings=body["warnings"],
    )


def diff_command(args: argparse.Namespace, context: Context) -> Outcome:
    _, base = load_spec_or_fail(args.base, context)
    _, candidate = load_spec_or_fail(args.candidate, context)
    result: dict[str, Any] = {
        "behavior_changed": behavior_changed(base, candidate),
        "base": {"ref": spec_ref(base), "behavior_hash": behavior_hash(base)},
        "candidate": {
            "ref": spec_ref(candidate),
            "behavior_hash": behavior_hash(candidate),
        },
        "changes": [change.as_dict() for change in spec_diff(base, candidate)],
        "comparison": None,
    }
    if args.bundle is not None:
        bundle = load_bundle_or_fail(args.bundle, context)
        result["comparison"] = compare_on_bundle(
            base, candidate, bundle, eval_config(args)
        )
    return Outcome(result)


__all__ = [
    "add_commands",
    "add_evaluation_options",
    "eval_command",
    "eval_config",
]
